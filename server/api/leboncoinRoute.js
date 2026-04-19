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
      await page_obj.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36');

      const acceptLanguageByCountry = {
        au: 'en-AU,en;q=0.9',
        ie: 'en-IE,en;q=0.9',
      };

      await page_obj.setExtraHTTPHeaders({
        'accept-language': acceptLanguageByCountry[country] || 'en-US,en;q=0.9',
        'upgrade-insecure-requests': '1',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'accept-encoding': 'gzip, deflate, br',
        'cache-control': 'no-cache',
        'pragma': 'no-cache',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
      });

      if (country === 'ru') {
        // Avito-specific stealth strategy
        console.log('🔐 [AVITO] Applying stealth strategy for Avito.ru...');
        
        // Use Russian browser user agents for better authenticity
        const avitoUserAgents = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
        ];
        
        const randomUA = avitoUserAgents[Math.floor(Math.random() * avitoUserAgents.length)];
        await page_obj.setUserAgent(randomUA);
        console.log('🔐 [AVITO] User-Agent set to:', randomUA);
        
        // Update headers for Russian locale
        await page_obj.setExtraHTTPHeaders({
          'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8',
          'referer': 'https://www.google.com/',
        });

        // Warm-up: Visit main page first (like a real user browsing)
        try {
          console.log('🔐 [AVITO] Warm-up navigation to main page...');
          await page_obj.goto('https://www.avito.ru/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          
          // Random delay between 2-4 seconds (human-like behavior)
          const warmupDelay = 2000 + Math.random() * 2000;
          console.log(`🔐 [AVITO] Warm-up delay: ${Math.round(warmupDelay)}ms`);
          await new Promise(resolve => setTimeout(resolve, warmupDelay));
        } catch (warmupErr) {
          console.warn('🔐 [AVITO] Warm-up failed, continuing anyway:', warmupErr.message);
        }
      }

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

      if (country === 'ie') {
        const detectIeChallenge = async () => {
          return page_obj.evaluate(() => {
            const title = (document.title || '').toLowerCase();
            const bodyText = (document.body?.innerText || '').toLowerCase();

            const hasChallengeSignal =
              title.includes('just a moment') ||
              title.includes('attention required') ||
              bodyText.includes('just a moment') ||
              bodyText.includes('checking your browser') ||
              bodyText.includes('verify you are human') ||
              bodyText.includes('challenge') ||
              bodyText.includes('cloudflare') ||
              bodyText.includes('cf-challenge');

            return {
              href: window.location.href,
              title: document.title,
              bodyLength: document.body?.innerText?.length || 0,
              hasChallengeSignal,
            };
          });
        };

        let ieChallengeState = await detectIeChallenge();
        if (ieChallengeState.hasChallengeSignal) {
          console.warn('🪵 [DONEDEAL] Challenge detected after first load, retrying once...');
          await new Promise((resolve) => setTimeout(resolve, 4500));

          try {
            await page_obj.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
            await new Promise((resolve) => setTimeout(resolve, 4500));
            ieChallengeState = await detectIeChallenge();
          } catch (reloadErr) {
            console.warn('🪵 [DONEDEAL] Reload failed during challenge recovery:', reloadErr.message);
          }
        }

        if (ieChallengeState.hasChallengeSignal) {
          console.warn('🪵 [DONEDEAL] Challenge persists, returning explicit 503 instead of empty results.');
          if (browser) {
            await browser.close();
            browser = null;
          }

          return res.status(503).json({
            success: false,
            blocked: true,
            error: 'DoneDeal is currently blocking automated access (challenge page detected).',
            details: 'Cloudflare challenge detected on DoneDeal. Retry later, use a residential proxy, or run from an IP with better reputation.',
            country,
            page: pageNum,
            searchUrl,
            source: getSourceName(country),
          });
        }
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

      if (country === 'ie') {
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

        if (country === 'ie') {
          const selectorDebug = await page_obj.evaluate(() => {
            const selectors = [
              'li[data-testid^="listing-card-index-"]',
              'li[data-testid*="listing-card"]',
              'a[href*="/games-for-sale/"]',
              'a[href*="/for-sale/"]',
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
              hasAccessDeniedWord: bodyText.includes('access denied'),
              hasJustMomentWord: bodyText.includes('just a moment'),
              hasChallengeWord: bodyText.includes('challenge'),
            };
          });
          console.log('🪵 [DONEDEAL] Selector timeout debug:', selectorDebug);
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      if (country === 'ie') {
        try {
          await page_obj.waitForFunction(
            () => {
              const cardCount = document.querySelectorAll('li[data-testid^="listing-card-index-"], li[data-testid*="listing-card"]').length;
              const linkCount = document.querySelectorAll('a[href*="/games-for-sale/"], a[href*="/for-sale/"]').length;
              return cardCount > 0 || linkCount > 0;
            },
            { timeout: 12000 }
          );
        } catch (_ieWaitErr) {
          // We keep going so extractor fallback can still attempt recovery.
        }
      }

      if (country === 'ru') {
        // Check if Avito blocked the page
        const avitoBlockCheck = await page_obj.evaluate(() => {
          const title = (document.title || '').toLowerCase();
          const bodyText = (document.body?.innerText || '').toLowerCase();

          return {
            title: document.title,
            bodyLength: document.body?.innerText?.length || 0,
            isBlocked:
              title.includes('доступ ограничен') ||
              bodyText.includes('доступ ограничен') ||
              bodyText.includes('проблема с ip') ||
              bodyText.includes('access denied') ||
              bodyText.includes('access restricted'),
            hasItems: document.querySelectorAll('div[data-marker="item"]').length > 0,
          };
        });

        console.log('🔐 [AVITO] Block check - Title:', avitoBlockCheck.title, '| Items found:', avitoBlockCheck.hasItems, '| Blocked:', avitoBlockCheck.isBlocked);

        if (avitoBlockCheck.isBlocked) {
          console.error('🔐 [AVITO] Page is blocked - IP detection or rate limiting triggered');
          if (browser) {
            await browser.close();
            browser = null;
          }

          return res.status(503).json({
            success: false,
            blocked: true,
            error: 'Avito is blocking automated access (IP detection).',
            details: 'Avito has detected the scraper and blocked the request. Retry later, use a residential proxy, or increase delays.',
            country,
            page: pageNum,
            searchUrl,
            source: getSourceName(country),
          });
        }
      }

      // Scroll to load lazy-loaded images (especially for OLX.pl, OLX.bg, OLX.pt, OLX.ro, Kufar.by, Willhaben, Osta.ee, Huuto, MyMarket, Avito.ru and Njuskalo)
      if (country === 'pl' || country === 'at' || country === 'bg' || country === 'ee' || country === 'fi' || country === 'ge' || country === 'hr' || country === 'kz' || country === 'pt' || country === 'ro' || country === 'ru') {
        console.log(`📜 Scrolling to load lazy-loaded content for ${config.name}...`);
        const isAvito = country === 'ru';
        await page_obj.evaluate(async (avitoMode) => {
          const forceLazyImages = () => {
            const imgs = Array.from(document.querySelectorAll('img'));
            imgs.forEach((img) => {
              const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-original');
              const dataSrcset = img.getAttribute('data-srcset') || img.getAttribute('data-original-srcset');

              if (dataSrc && !img.getAttribute('src')) {
                img.setAttribute('src', dataSrc);
              }

              if (dataSrcset && !img.getAttribute('srcset')) {
                img.setAttribute('srcset', dataSrcset);
              }

              img.setAttribute('loading', 'eager');
              img.setAttribute('decoding', 'sync');
            });
          };

          forceLazyImages();

          let lastHeight = 0;
          let lastScrollY = -1;
          let stablePasses = 0;
          // Avito-specific aggressive settings
          const maxPasses = avitoMode ? 500 : 50;
          const scrollDelayMs = avitoMode ? 500 : 30;
          const stableThreshold = avitoMode ? 10 : 3;
          const scroll_nb = avitoMode ? 4 : 2;
          const scrollStep = Math.floor(window.innerHeight / scroll_nb);

          for (let i = 0; i < maxPasses && stablePasses < stableThreshold; i += 1) {
            window.scrollBy(0, scrollStep);
            await new Promise((resolve) => setTimeout(resolve, scrollDelayMs));
            forceLazyImages();

            const newHeight = document.body.scrollHeight;
            const newScrollY = window.scrollY;
            if (newHeight === lastHeight && newScrollY === lastScrollY) {
              stablePasses += 1;
            } else {
              stablePasses = 0;
              lastHeight = newHeight;
              lastScrollY = newScrollY;
            }
          }

          // Return to top once all cards/images are hydrated.
          window.scrollTo(0, 0);
        }, isAvito);

        // Give browser time to decode images after the forced lazy-load pass.
        const decodeDelay = isAvito ? 5000 : 3250;
        await new Promise(resolve => setTimeout(resolve, decodeDelay));
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

      if (country === 'ie') {
        const preExtractDebug = await page_obj.evaluate(() => ({
          cards: document.querySelectorAll('li[data-testid^="listing-card-index-"], li[data-testid*="listing-card"]').length,
          links: document.querySelectorAll('a[href*="/games-for-sale/"], a[href*="/for-sale/"]').length,
          href: window.location.href,
          title: document.title,
        }));
        console.log(`🪵 [${config.name.toUpperCase()}] Pre-extract debug:`, preExtractDebug);
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
