// LeBonCoin scraping API route

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import {
  getCountryConfig,
  getSourceName,
} from '../config/countryConfig.js';
import {
  getItemsPerPage,
  getSelector,
  getSearchUrl,
} from '../config/scrapingConfig.js';
import { getExtractor } from '../scrapers/extractors.js';

puppeteer.use(StealthPlugin());

export function setupLeboncoinRoute(app) {
  app.get('/api/leboncoin/search', async (req, res) => {
    let browser;
    try {
      const { query = 'drone', page = '1', country = 'fr' } = req.query;
      const pageNum = Math.max(1, parseInt(page) || 1);

      // Temporary deactivation: Gumtree (AU) and Sbazar (CZ) require proxy setup
      if (country === 'au' || country === 'cz') {
        const isGumtree = country === 'au';
        return res.status(503).json({
          success: false,
          error: isGumtree
            ? 'Gumtree temporairement désactivé (proxy requis).'
            : 'Sbazar temporairement désactivé (proxy requis).',
          details: isGumtree
            ? 'Configure a proxy before re-enabling Gumtree scraping.'
            : 'Configure a proxy before re-enabling Sbazar scraping.',
          source: isGumtree ? 'Gumtree' : 'Sbazar',
          country,
          page: pageNum,
          items: [],
          count: 0,
        });
      }

      const config = getCountryConfig(country);
      const searchUrl = getSearchUrl(country, config, query, pageNum);
      const gumtreeProxyServer = process.env.GUMTREE_PROXY_SERVER || '';
      const gumtreeProxyUsername = process.env.GUMTREE_PROXY_USERNAME || '';
      const gumtreeProxyPassword = process.env.GUMTREE_PROXY_PASSWORD || '';

      console.log(`🤖 Scraping ${config.name} with Puppeteer for: "${query}" (country: ${country}, page ${pageNum})`);

      const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ];

      if (country === 'au' && gumtreeProxyServer) {
        launchArgs.push(`--proxy-server=${gumtreeProxyServer}`);
        console.log('🪵 [GUMTREE] Proxy enabled for scraping.');
      }

      browser = await puppeteer.launch({
        headless: true,
        args: launchArgs,
      });

      const page_obj = await browser.newPage();

      // Set realistic viewport and user agent
      await page_obj.setViewport({ width: 1920, height: 1080 });
      await page_obj.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page_obj.setExtraHTTPHeaders({
        'accept-language': 'en-AU,en;q=0.9,fr;q=0.8',
        'upgrade-insecure-requests': '1',
      });

      if (country === 'au') {
        await page_obj.setJavaScriptEnabled(true);

        if (gumtreeProxyServer && gumtreeProxyUsername && gumtreeProxyPassword) {
          await page_obj.authenticate({
            username: gumtreeProxyUsername,
            password: gumtreeProxyPassword,
          });
        }

        // Warm-up navigation to reduce immediate anti-bot suspension on direct search landing
        try {
          await page_obj.goto('https://www.gumtree.com.au/', { waitUntil: 'domcontentloaded', timeout: 45000 });
          await new Promise(resolve => setTimeout(resolve, 1800));
        } catch (warmupErr) {
          console.warn('Gumtree warm-up navigation failed:', warmupErr.message);
        }
      }

      // Navigate with higher timeout (Kleinanzeigen can be slow) and fall back to domcontentloaded
      try {
        await page_obj.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      } catch (navErr) {
        console.warn('Primary goto timed out, retrying with domcontentloaded:', navErr.message);
        await page_obj.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      }

      // Note: Sbazar (CZ) is temporarily deactivated above.

      if (country === 'au') {
        const navDebug = await page_obj.evaluate(() => ({
          href: window.location.href,
          title: document.title,
          readyState: document.readyState,
          hasCaptchaWord: document.body?.innerText?.toLowerCase?.().includes('captcha') || false,
          hasRobotWord: document.body?.innerText?.toLowerCase?.().includes('robot') || false,
          hasBlockedWord: document.body?.innerText?.toLowerCase?.().includes('blocked') || false,
          hasAccessDeniedWord: document.body?.innerText?.toLowerCase?.().includes('access denied') || false,
        }));
        console.log('🪵 [GUMTREE] Navigation debug:', navDebug);

        const normalizedTitle = (navDebug.title || '').toLowerCase();
        if (
          normalizedTitle.includes('temporarily suspended') ||
          normalizedTitle.includes('access denied') ||
          navDebug.hasAccessDeniedWord
        ) {
          throw new Error('Gumtree blocked this request (access denied / temporarily suspended). Use a different IP or configure GUMTREE_PROXY_SERVER.');
        }
      }

      // Wait for ads/listings to load (different selectors FR vs DE vs BE)
      const selector = getSelector(country);

      if (country === 'au') {
        console.log(`🪵 [${config.name.toUpperCase()}] Waiting for selector:`, selector);
        console.log(`🪵 [${config.name.toUpperCase()}] Search URL:`, searchUrl);
      }

      try {
        await page_obj.waitForSelector(selector, { timeout: 25000 });
      } catch (waitErr) {
        console.warn('Selector wait timed out, waiting extra 3s before proceeding:', waitErr.message);

        if (country === 'au') {
          const selectorDebug = await page_obj.evaluate(() => {
            const selectors = [
              'a[href*="/s-ad/"]',
              'a.user-ad-row-new-design',
              '.user-ad-row-new-design__title-span',
              '.user-ad-row-new-design',
            ];

            const counts = {};
            selectors.forEach((s) => {
              counts[s] = document.querySelectorAll(s).length;
            });

            const bodyText = (document.body?.innerText || '').toLowerCase();
            return {
              href: window.location.href,
              title: document.title,
              readyState: document.readyState,
              counts,
              bodyLength: document.body?.innerText?.length || 0,
              hasCaptchaWord: bodyText.includes('captcha'),
              hasRobotWord: bodyText.includes('robot'),
              hasBlockedWord: bodyText.includes('blocked'),
              hasVerifyWord: bodyText.includes('verify'),
              hasAccessDeniedWord: bodyText.includes('access denied'),
            };
          });
          console.log('🪵 [GUMTREE] Selector timeout debug:', selectorDebug);
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Scroll to load lazy-loaded images (especially for OLX.pl, OLX.bg, Kufar.by, Willhaben, Osta.ee, Huuto and MyMarket)
      if (country === 'pl' || country === 'at' || country === 'bg' || country === 'ee' || country === 'fi' || country === 'ge') {
        console.log(`📜 Scrolling to load lazy-loaded content for ${config.name}...`);
        await page_obj.evaluate(() => {
          return new Promise((resolve) => {
            let scrolls = 0;
            const maxScrolls = 18;
            const scrollInterval = setInterval(() => {
              window.scrollBy(0, window.innerHeight);
              scrolls++;
              if (scrolls >= maxScrolls) {
                clearInterval(scrollInterval);
                // Scroll back to top to load all images
                window.scrollTo(0, 0);
                resolve();
              }
            }, 325); 
          });
        });

        // Give browser more time for images/srcset to populate after scrolling
        await new Promise(resolve => setTimeout(resolve, country === 'bg' || country === 'by' ? 5200 : country === 'ee' ? 7000 : country === 'fi' ? 4500 : country === 'ge' ? 4200 : 3250));
      }

      if (country === 'ee') {
        // Osta.ee thumbnails often settle after the first render pass, so wait a bit longer before extraction.
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Load more results for Wallapop (Spain) by clicking "Cargar más" button once, then scrolling
      if (country === 'es') {
        console.log('📜 Loading more Wallapop results...');
        const itemsPerPage = getItemsPerPage(country);
        const totalItemsNeeded = pageNum * itemsPerPage;
        
        try {
          // Scroll to bottom to make button appear
          await page_obj.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await new Promise(resolve => setTimeout(resolve, 2500));
          
          // Web components with shadow DOM require special handling
          let buttonClicked = false;
          try {
            // Access shadow DOM and click the real button inside
            buttonClicked = await page_obj.evaluate(() => {
              const wallaButton = document.querySelector('walla-button[text="Cargar más"]');
              if (!wallaButton) return false;
              
              const shadowRoot = wallaButton.shadowRoot;
              if (!shadowRoot) {
                wallaButton.click();
                return true;
              }
              
              const realButton = shadowRoot.querySelector('button');
              if (realButton) {
                realButton.click();
                realButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                realButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                realButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                return true;
              }
              
              wallaButton.click();
              return true;
            });
            
            if (buttonClicked) {
              // Wait for network activity to confirm click worked
              await new Promise(resolve => {
                const timeout = setTimeout(() => resolve(), 8000);
                const responseHandler = (response) => {
                  const url = response.url();
                  if (url.includes('wallapop.com') && (url.includes('/api/') || url.includes('/search'))) {
                    clearTimeout(timeout);
                    page_obj.off('response', responseHandler);
                    resolve();
                  }
                };
                page_obj.on('response', responseHandler);
              });
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          } catch (err) {
            console.log('  ⚠️ Button click error:', err.message);
          }
          
          if (buttonClicked) {
            await new Promise(resolve => setTimeout(resolve, 4000));
            
            let currentItemCount = await page_obj.evaluate(() => {
              return document.querySelectorAll('a[href*="/item/"]').length;
            });
            
            const maxAttempts = 3;
            let attempt = 0;
            let stagnantAttempts = 0;
            let previousCount = currentItemCount;
            
            while (attempt < maxAttempts && currentItemCount < totalItemsNeeded) {
              attempt++;
              
              await page_obj.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              currentItemCount = await page_obj.evaluate(() => {
                return document.querySelectorAll('a[href*="/item/"]').length;
              });
              
              const newItems = currentItemCount - previousCount;
              
              if (newItems === 0) {
                stagnantAttempts++;
                if (stagnantAttempts >= 3) break;
              } else {
                stagnantAttempts = 0;
              }
              
              previousCount = currentItemCount;
            }
          } else {
            console.warn('  ⚠️ Button "Cargar más" not found - will use initial items only');
          }
        } catch (err) {
          console.warn('  ⚠️ Could not activate Wallapop infinite scroll:', err.message);
        }
      }

      // Extract data from the page
      const extractor = getExtractor(country);

      if (country === 'au') {
        const preExtractCount = await page_obj.evaluate((sel) => document.querySelectorAll(sel).length, selector);
        console.log(`🪵 [${config.name.toUpperCase()}] Pre-extract element count (${selector}):`, preExtractCount);
      }

      let pageData = await extractor(page_obj);

      if (country === 'au') {
        console.log(`🪵 [${config.name.toUpperCase()}] Extracted item count:`, pageData.length);
        if (pageData.length > 0) {
          console.log(`🪵 [${config.name.toUpperCase()}] First extracted item preview:`, {
            title: pageData[0]?.title,
            url: pageData[0]?.url,
            price: pageData[0]?.price,
          });
        }
      }

      // For Wallapop (Spain), slice results to only return the current page
      let items = pageData;
      if (country === 'es' && pageNum > 1) {
        const itemsPerPage = getItemsPerPage(country);
        const startIndex = (pageNum - 1) * itemsPerPage;
        const endIndex = pageNum * itemsPerPage;
        items = pageData.slice(startIndex, endIndex);
        console.log(`📄 Wallapop: Extracted items ${startIndex}-${endIndex - 1} from ${pageData.length} total loaded items`);
      }

      await browser.close();
      console.log(`✅ Found ${items.length} items on ${config.name} page ${pageNum}`);

      res.json({
        success: true,
        count: items.length,
        page: pageNum,
        items,
        source: getSourceName(country),
      });
    } catch (error) {
      if (browser) await browser.close();
      console.error('LeBonCoin Puppeteer error:', error.message);
      res.status(500).json({
        success: false,
        error: error.message,
        details: 'Failed to scrape LeBonCoin with Puppeteer',
      });
    }
  });
}
