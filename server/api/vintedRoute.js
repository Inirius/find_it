// Vinted scraping API routes

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { hasVintedSupport } from '../../shared/countrySupport.js';
import { getVintedDomain } from '../config/countryConfig.js';
import { getItemsPerPage, getCurrency } from '../config/scrapingConfig.js';

puppeteer.use(StealthPlugin());

async function getPuppeteerLaunchOptions(extraArgs = []) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'find-it-puppeteer-'));
  const profileDir = path.join(tempRoot, 'profile');
  const configDir = path.join(tempRoot, 'config');
  const cacheDir = path.join(tempRoot, 'cache');

  await Promise.all([
    fs.mkdir(profileDir, { recursive: true }),
    fs.mkdir(configDir, { recursive: true }),
    fs.mkdir(cacheDir, { recursive: true }),
  ]);

  return {
    options: {
      headless: true,
      userDataDir: profileDir,
      env: {
        XDG_CONFIG_HOME: configDir,
        XDG_CACHE_HOME: cacheDir,
      },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-crash-reporter',
        ...extraArgs,
      ],
    },
    cleanup: async () => {
      await fs.rm(tempRoot, { recursive: true, force: true });
    },
  };
}

export function setupVintedRoutes(app) {
  // Vinted debug endpoint - find correct selectors
  app.get('/api/vinted/debug', async (req, res) => {
    let browser;
    try {
      const { query = 'drone', country = 'fr' } = req.query;
      const domain = getVintedDomain(country);
      const searchUrl = `https://${domain}/catalog?search_text=${encodeURIComponent(query)}&catalog[]=3002`;

      const launchConfig = await getPuppeteerLaunchOptions();
      browser = await puppeteer.launch(launchConfig.options);

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
      });
      
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      const currency = getCurrency(country);
      const pageInfo = await page.evaluate((currencyInfo) => {
        const selectors = {
          'a[href*="/items/"]': document.querySelectorAll('a[href*="/items/"]').length,
          'article': document.querySelectorAll('article').length,
          '[class*="item"]': document.querySelectorAll('[class*="item"]').length,
          '[class*="product"]': document.querySelectorAll('[class*="product"]').length,
          '[data-testid*="item"]': document.querySelectorAll('[data-testid*="item"]').length,
          'li': document.querySelectorAll('li').length,
        };

        const firstArticle = document.querySelector('article');
        const firstLink = document.querySelector('a[href*="/items/"]');
        
        // Extract sample prices
        const samplePrices = [];
        const links = Array.from(document.querySelectorAll('a[href*="/items/"]')).slice(0, 5);
        links.forEach((link) => {
          const titleAttr = link.getAttribute('title');
          if (titleAttr) {
            samplePrices.push(titleAttr.substring(0, 150));
          }
        });

        return {
          title: document.title,
          url: window.location.href,
          country: currencyInfo.symbol,
          selectorCounts: selectors,
          firstArticleHTML: firstArticle?.outerHTML.substring(0, 500),
          firstLinkHTML: firstLink?.outerHTML.substring(0, 500),
          samplePrices: samplePrices,
        };
      }, currency);

      await browser.close();
      await launchConfig.cleanup();
      
      res.json({ 
        success: true,
        message: 'Vinted page structure debug',
        pageInfo
      });

    } catch (error) {
      if (browser) await browser.close();
      console.error('Vinted debug error:', error.message);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Vinted search endpoint
  app.get('/api/vinted/search', async (req, res) => {
    let browser;
    let launchConfig;
    try {
      const { query = 'drone', page = '1', country = 'fr' } = req.query;
      
      // Check if Vinted is supported in this country
      if (!hasVintedSupport(country)) {
        return res.status(400).json({ 
          success: false, 
          error: `Vinted is not available in ${country}`, 
          details: 'This country is not supported by Vinted' 
        });
      }
      
      const pageNum = Math.max(1, parseInt(page) || 1);
      const itemsPerPage = getItemsPerPage(country);

      // Calculate which Vinted page to load based on frontend page number
      // Each Vinted page has ~156 items = ~4 frontend pages (156/37 = 4.2)
      // We'll dynamically calculate after scraping
      const estimatedItemsPerVintedPage = 150; // Rough estimate
      const estimatedPagesPerVintedPage = Math.ceil(estimatedItemsPerVintedPage / itemsPerPage);
      const vintedPageToLoad = Math.ceil(pageNum / estimatedPagesPerVintedPage);

      const domain = getVintedDomain(country);
      // Vinted search URL format, category 3002 = Electronics, Video Games
      const searchUrl = `https://${domain}/catalog?search_text=${encodeURIComponent(query)}&catalog[]=3002&page=${vintedPageToLoad}`;

      console.log(`🤖 Scraping Vinted (${country}) page ${vintedPageToLoad} for: "${query}" (frontend page ${pageNum})`);

      launchConfig = await getPuppeteerLaunchOptions();
      browser = await puppeteer.launch(launchConfig.options);

      const page_obj = await browser.newPage();
      await page_obj.setViewport({ width: 1920, height: 1080 });
      await page_obj.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page_obj.setExtraHTTPHeaders({
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
      });
      
      await page_obj.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for items to load, but do not fail hard if Vinted serves a slower or different DOM on VPS.
      try {
        await page_obj.waitForFunction(
          () => document.querySelectorAll('a[href*="/items/"], a[href*="/item/"], [data-testid*="item"], [data-testid*="product"], article, li').length > 0,
          { timeout: 15000 },
        );
      } catch (waitError) {
        console.warn('Vinted item wait timed out, continuing with available DOM:', waitError.message);
      }

      const currency = getCurrency(country);
      const pageData = await page_obj.evaluate((currencyInfo) => {
        const results = [];
        const seenUrls = new Set();
        const links = document.querySelectorAll('a[href*="/items/"], a[href*="/item/"]');

        const cleanText = (value) => (value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

        const isLikelyTitleText = (value) => {
          const normalized = cleanText(value);
          if (!normalized) return false;
          if (/^(€|\d|배송|shipping|buyer protection|new|used|condition)/i.test(normalized)) return false;
          if (/^(✓|×|★|\d+[\s\S]*€)/.test(normalized)) return false;
          return normalized.length >= 3;
        };

        const extractGenericPrice = (text) => {
          const normalized = cleanText(text);
          if (!normalized) return null;

          const matches = normalized.match(/(?:€\s*\d+[.,]\d{2}|\d+[.,]\d{2}\s*€|\d+[.,]\d{2}\s*(?:лв\.?|лв|lei|zł|Ft|kr|£|₺|₴|KM|дин))/gi);
          if (!matches || matches.length === 0) return null;

          // Prefer total price (often second value: item price + buyer protection)
          return cleanText(matches.length > 1 ? matches[1] : matches[0]);
        };
        
        links.forEach((link) => {
          try {
            const url = link.getAttribute('href');
            const titleAttr = link.getAttribute('title');
            if (!url) return;

            if (seenUrls.has(url)) return;
            seenUrls.add(url);

            const card =
              link.closest('[data-testid*="item"]') ||
              link.closest('[data-testid="grid-item"]') ||
              link.closest('article') ||
              link.closest('li') ||
              link.parentElement;

            // Extract title from structured text first, then fall back to the title attribute.
            let title = null;
            const titleEl =
              card?.querySelector('[data-testid*="title"]') ||
              card?.querySelector('[data-testid$="--description-title"]') ||
              card?.querySelector('h3') ||
              card?.querySelector('h2');

            const textCandidates = [
              titleEl?.textContent,
              ...Array.from(card?.querySelectorAll('p, span, h3, h2') || []).map((element) => element.textContent)
            ]
              .map(cleanText)
              .filter(isLikelyTitleText);

            if (textCandidates.length > 0) {
              title = textCandidates[0];
            }
            if (!title && titleAttr) {
              title = cleanText(titleAttr.split(',')[0]);
            }
            if (!title) {
              title = cleanText(card?.getAttribute('aria-label'));
            }
            
            // Extract state/condition from title attribute (like price extraction)
            let shipping = null;
            const subtitleEl = card?.querySelector('[data-testid$="--description-subtitle"]');
            if (subtitleEl?.textContent) {
              shipping = cleanText(subtitleEl.textContent);
            }
            if (!shipping && titleAttr) {
              const stateMatch = titleAttr.match(/(?:état|състояние|condition):\s*([^,]+)/i);
              if (stateMatch) {
                shipping = cleanText(stateMatch[1]);
              }
            }
            
            // Extract price from structured fields first
            let price = null;
            const totalCombinedPriceEl = card?.querySelector('[data-testid="total-combined-price"]');
            const basePriceEl = card?.querySelector('[data-testid$="--price-text"]');

            if (totalCombinedPriceEl?.textContent) {
              price = cleanText(totalCombinedPriceEl.textContent);
            } else if (basePriceEl?.textContent) {
              price = cleanText(basePriceEl.textContent);
            }

            // Fallback: regex on title attr (currency-specific then generic)
            if (!price && titleAttr) {
              const priceRegex = new RegExp(currencyInfo.pattern, 'g');
              const priceMatches = titleAttr.match(priceRegex);
              if (priceMatches && priceMatches.length > 1) {
                price = cleanText(priceMatches[1]);
              } else if (priceMatches && priceMatches.length === 1) {
                price = cleanText(priceMatches[0]);
              } else {
                price = extractGenericPrice(titleAttr);
              }
            }

            // Find image - look in multiple places (boosted vs non-boosted items may have different structures)
            let image = null;
            
            // First try: image directly in the link
            let img = card?.querySelector('img[data-testid$="--image--img"]') || link.querySelector('img');
            
            // Second try: image in parent article
            if (!img) {
              const parentArticle = link.closest('article');
              if (parentArticle) {
                img = parentArticle.querySelector('img');
              }
            }
            
            // Third try: image in parent div (sometimes images are in a wrapper div)
            if (!img) {
              const parentDiv = link.closest('div');
              if (parentDiv) {
                img = parentDiv.querySelector('img');
              }
            }
            
            // Fourth try: look for image in sibling elements
            if (!img) {
              const parent = link.parentElement;
              if (parent) {
                img = parent.querySelector('img');
              }
            }
            
            if (img) {
              image = img.getAttribute('src') || img.getAttribute('data-src');
            }

            if (title && url) {
              results.push({ 
                title, 
                url, 
                image, 
                alt: title, 
                price, 
                shipping
              });
            }
          } catch (e) {
            console.warn('Vinted parse error:', e.message);
          }
        });
        
        return results;
      }, currency);

      // Normalize URLs to absolute
      const normalizedData = pageData.map((item) => {
        const absUrl = item.url?.startsWith('http') ? item.url : item.url ? `https://${domain}${item.url}` : null;
        return { ...item, url: absUrl };
      });
      
      const totalScraped = normalizedData.length;
      const pagesPerVintedPage = Math.max(1, Math.ceil(totalScraped / itemsPerPage));
      
      // Calculate which subset of the scraped items to return
      const localPageOffset = ((pageNum - 1) % pagesPerVintedPage);
      const startIdx = localPageOffset * itemsPerPage;
      const endIdx = startIdx + itemsPerPage;
      const paginatedItems = normalizedData.slice(startIdx, endIdx);

      if (paginatedItems.length === 0) {
        try {
          const dumpData = await page_obj.evaluate(() => {
            const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
            return {
              href: window.location.href,
              title: document.title,
              bodyLength: document.body?.innerText?.length || 0,
              links: document.querySelectorAll('a[href]').length,
              itemLinks: document.querySelectorAll('a[href*="/items/"], a[href*="/item/"]').length,
              articleCount: document.querySelectorAll('article').length,
              testIdCount: document.querySelectorAll('[data-testid*="item"], [data-testid*="product"]').length,
              html: document.documentElement?.outerHTML || '',
              sampleText: normalize((document.body?.innerText || '').slice(0, 1200)),
            };
          });

          const dumpDir = path.join(process.cwd(), 'debug', 'scrape-dumps');
          await fs.mkdir(dumpDir, { recursive: true });

          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          const safeQuery = String(query).trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'query';
          const baseName = `vinted-${country}-q-${safeQuery}-p-${pageNum}-${stamp}`;
          const htmlPath = path.join(dumpDir, `${baseName}.html`);
          const metaPath = path.join(dumpDir, `${baseName}.json`);

          await fs.writeFile(htmlPath, dumpData.html, 'utf8');
          await fs.writeFile(
            metaPath,
            JSON.stringify(
              {
                query,
                country,
                page: pageNum,
                searchUrl,
                finalUrl: dumpData.href,
                title: dumpData.title,
                bodyLength: dumpData.bodyLength,
                links: dumpData.links,
                itemLinks: dumpData.itemLinks,
                articleCount: dumpData.articleCount,
                testIdCount: dumpData.testIdCount,
                sampleText: dumpData.sampleText,
              },
              null,
              2
            ),
            'utf8'
          );

          console.log(`🧪 [VINTED-DEBUG] HTML dump saved: ${htmlPath}`);
          console.log(`🧪 [VINTED-DEBUG] Metadata saved: ${metaPath}`);
        } catch (dumpErr) {
          console.warn('🧪 [VINTED-DEBUG] Failed to save HTML dump:', dumpErr.message);
        }
      }

      await browser.close();
      await launchConfig.cleanup();
      
      console.log(`✅ Scraped ${totalScraped} items from Vinted page ${vintedPageToLoad}, returning items ${startIdx}-${endIdx} (frontend page ${pageNum})`);
      
      res.json({ 
        success: true, 
        count: paginatedItems.length,
        total: totalScraped,
        page: pageNum,
        totalPages: pagesPerVintedPage,
        items: paginatedItems, 
        source: `Vinted (${country.toUpperCase()})` 
      });

    } catch (error) {
      if (browser) await browser.close();
      if (launchConfig) await launchConfig.cleanup();
      console.error('Vinted Puppeteer error:', error.message);
      res.status(500).json({ 
        success: false, 
        error: error.message, 
        details: 'Failed to scrape Vinted with Puppeteer' 
      });
    }
  });
}
