// LeBonCoin scraping API route

import { promises as fs } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import {
  getCountryConfig,
  getSourceName,
} from '../config/countryConfig.js';
import {
  getItemsPerPage,
  getLazyScrollConfig,
  getSelector,
  getSearchUrl,
} from '../config/scrapingConfig.js';
import { getExtractor } from '../scrapers/extractors.js';

puppeteer.use(StealthPlugin());

export function setupLeboncoinRoute(app) {
  app.get('/api/leboncoin/search', async (req, res) => {
    let browser;
    try {
      const { query = 'drone', page = '1', country = 'fr', debugHtml = '1', trExcludeSponsored = '0' } = req.query;
      const pageNum = Math.max(1, parseInt(page) || 1);
      const shouldExcludeTrSponsored = ['1', 'true', 'yes'].includes(String(trExcludeSponsored).toLowerCase());

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
      const letgoApiPayloads = [];

      if (country === 'tr') {
        page_obj.on('response', (response) => {
          try {
            const url = response.url();
            if (!url.includes('letgo.com')) return;

            if (url.includes('/api/search/items') && response.status() === 200) {
              response.text().then((rawText) => {
                if (!rawText) return;

                if (letgoApiPayloads.length >= 16) {
                  letgoApiPayloads.shift();
                }

                let parsed = null;
                try {
                  parsed = JSON.parse(rawText);
                } catch {
                  parsed = null;
                }

                const normalizedQuery = String(query || '').trim().toLowerCase();
                const decodedUrl = decodeURIComponent(url).toLowerCase();
                const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
                const queryMatch = queryTokens.length > 0 && queryTokens.every((token) => decodedUrl.includes(token));

                letgoApiPayloads.push({
                  url,
                  status: response.status(),
                  capturedAt: new Date().toISOString(),
                  queryMatch,
                  body: parsed || rawText,
                });
              }).catch(() => {
                // Ignore payload capture errors.
              });
            }
          } catch {
            // Ignore response-trace failures.
          }
        });
      }

      const resolveTurkeyConsent = async (page, stageLabel) => {
        const clickConsentInFrame = async (frame) => {
          try {
            return await frame.evaluate(() => {
              const normalize = (value) => (value || '').toLowerCase().replace(/\s+/g, ' ').trim();
              const labels = [
                't\u00fcm\u00fcn\u00fc kabul et',
                'kabul et',
                'izin ver',
                'accept all',
                'agree',
                'allow all',
              ];

              const selectorHints = [
                '#cmpwelcomebtnyes',
                '#cmpbntyestxt',
                '.cmpboxbtnyes',
                '[id*="accept"]',
                '[class*="accept"]',
                '[aria-label*="accept" i]',
                '[data-testid*="accept" i]',
              ];

              for (const selector of selectorHints) {
                const directEl = document.querySelector(selector);
                if (directEl) {
                  directEl.click();
                  return `selector:${selector}`;
                }
              }

              const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'));
              for (const el of candidates) {
                const text = normalize(el.textContent || el.getAttribute('value') || el.getAttribute('aria-label'));
                if (!text) continue;
                if (labels.some((label) => text.includes(label))) {
                  el.click();
                  return `text:${text.slice(0, 80)}`;
                }
              }

              return null;
            });
          } catch {
            return null;
          }
        };

        let clickedAny = false;
        const actions = [];

        for (let attempt = 1; attempt <= 4; attempt += 1) {
          const mainAction = await clickConsentInFrame(page.mainFrame());
          if (mainAction) {
            clickedAny = true;
            actions.push(`main:${mainAction}`);
          }

          const frames = page.frames();
          for (const frame of frames) {
            if (frame === page.mainFrame()) continue;
            const frameAction = await clickConsentInFrame(frame);
            if (frameAction) {
              clickedAny = true;
              const frameUrl = frame.url() || 'about:blank';
              actions.push(`frame:${frameUrl}:${frameAction}`);
            }
          }

          if (clickedAny) {
            await new Promise((resolve) => setTimeout(resolve, 1400));
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 900));
        }

        const consentState = await page.evaluate(() => {
          const hasCmpIframe = document.querySelectorAll('iframe[name*="cmp" i], iframe[src*="consentmanager" i], iframe[src*="cmp" i]').length > 0;
          const bodyText = (document.body?.innerText || '').toLowerCase();
          const consentPromptVisible =
            bodyText.includes('çerez') ||
            bodyText.includes('kabul et') ||
            bodyText.includes('consent') ||
            bodyText.includes('privacy');

          return {
            href: window.location.href,
            title: document.title,
            hasCmpIframe,
            consentPromptVisible,
          };
        });

        console.log(`🔐 [LETGO] Consent ${stageLabel}:`, {
          clickedAny,
          actions,
          ...consentState,
        });
      };

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

      await page_obj.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'languages', { get: () => ['sl-SI', 'sl', 'en-US', 'en'] });
        Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

        window.chrome = window.chrome || {
          runtime: {},
          app: { isInstalled: false },
        };

        const originalQuery = window.navigator.permissions?.query;
        if (originalQuery) {
          window.navigator.permissions.query = (parameters) => (
            parameters?.name === 'notifications'
              ? Promise.resolve({ state: Notification.permission })
              : originalQuery(parameters)
          );
        }
      });

      if (country === 'si') {
        console.log('🔐 [BOLHA] Applying stealth strategy for Bolha.si...');
        await page_obj.setExtraHTTPHeaders({
          'accept-language': 'sl-SI,sl;q=0.9,en-US;q=0.8,en;q=0.7',
          'upgrade-insecure-requests': '1',
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'accept-encoding': 'gzip, deflate, br',
          'cache-control': 'no-cache',
          'pragma': 'no-cache',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'none',
          'sec-fetch-user': '?1',
          'referer': 'https://www.google.com/',
        });

        try {
          console.log('🔐 [BOLHA] Warm-up navigation to homepage...');
          await page_obj.goto('https://www.bolha.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
          });

          const warmupDelay = 1800 + Math.random() * 1200;
          console.log(`🔐 [BOLHA] Warm-up delay: ${Math.round(warmupDelay)}ms`);
          await new Promise((resolve) => setTimeout(resolve, warmupDelay));
        } catch (warmupErr) {
          console.warn('🔐 [BOLHA] Warm-up failed, continuing anyway:', warmupErr.message);
        }
      }

      if (country === 'tr') {
        console.log('🔐 [LETGO] Applying stealth strategy for Letgo Turkey...');

        const letgoUserAgents = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
        ];

        const randomUA = letgoUserAgents[Math.floor(Math.random() * letgoUserAgents.length)];
        await page_obj.setUserAgent(randomUA);

        await page_obj.setExtraHTTPHeaders({
          'accept-language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'upgrade-insecure-requests': '1',
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'cache-control': 'no-cache',
          'pragma': 'no-cache',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'none',
          'sec-fetch-user': '?1',
          'referer': 'https://www.google.com/',
        });

        try {
          console.log('🔐 [LETGO] Warm-up navigation to homepage...');
          await page_obj.goto('https://www.letgo.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
          });

          await resolveTurkeyConsent(page_obj, 'warmup');

          const warmupDelay = 1700 + Math.random() * 1300;
          console.log(`🔐 [LETGO] Warm-up delay: ${Math.round(warmupDelay)}ms`);
          await new Promise((resolve) => setTimeout(resolve, warmupDelay));
        } catch (warmupErr) {
          console.warn('🔐 [LETGO] Warm-up failed, continuing anyway:', warmupErr.message);
        }
      }

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

      if (country === 'tr') {
        await resolveTurkeyConsent(page_obj, 'search');
      }

      if (country === 'se') {
        // Tradera often shows a consent management panel that can block interactions/render timing.
        try {
          const cookieAction = await page_obj.evaluate(() => {
            const clickIfVisible = (selector) => {
              const el = document.querySelector(selector);
              if (!el) return false;
              const style = window.getComputedStyle(el);
              const hidden = style.display === 'none' || style.visibility === 'hidden';
              if (hidden) return false;
              el.click();
              return true;
            };

            const textMatchers = ['acceptera', 'godkänn', 'godkann', 'accept all', 'acceptera alla'];

            const clickByText = () => {
              const candidates = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"]'));
              for (const el of candidates) {
                const label = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase().trim();
                if (!label) continue;
                if (textMatchers.some((m) => label.includes(m))) {
                  el.click();
                  return true;
                }
              }
              return false;
            };

            const selectorCandidates = [
              '#onetrust-accept-btn-handler',
              '[id*="accept"][id*="cookie"]',
              '[data-testid*="accept"]',
              '[aria-label*="accept" i]',
              '[aria-label*="acceptera" i]',
              'button[class*="accept" i]',
            ];

            for (const selector of selectorCandidates) {
              if (clickIfVisible(selector)) {
                return `clicked:${selector}`;
              }
            }

            if (clickByText()) {
              return 'clicked:text-match';
            }

            return 'none';
          });

          console.log(`🪵 [TRADERA] Cookie panel action: ${cookieAction}`);
          if (cookieAction !== 'none') {
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
        } catch (cookieErr) {
          console.warn('🪵 [TRADERA] Cookie handling failed, continuing anyway:', cookieErr.message);
        }
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

      if (country === 'si') {
        const bolhaChallenge = await page_obj.evaluate(() => {
          const bodyText = (document.body?.innerText || '').toLowerCase();
          const href = window.location.href;
          const title = document.title || '';

          return {
            href,
            title,
            bodyLength: document.body?.innerText?.length || 0,
            hasCaptchaWord: bodyText.includes('captcha'),
            hasRobotWord: bodyText.includes('robot'),
            hasValidateDomain: href.includes('validate.perfdrive.com'),
            sampleText: (document.body?.innerText || '').slice(0, 1200),
          };
        });

        console.log('🪵 [BOLHA] Navigation debug:', bolhaChallenge);

        if (bolhaChallenge.hasCaptchaWord || bolhaChallenge.hasRobotWord || bolhaChallenge.hasValidateDomain) {
          console.error('🪵 [BOLHA] CAPTCHA / bot challenge detected. Scrape cannot continue without unblocking.');

          if (browser) {
            await browser.close();
            browser = null;
          }

          return res.status(503).json({
            success: false,
            blocked: true,
            error: 'Bolha is blocking automated access (CAPTCHA).',
            details: 'Bolha redirected the scraper to Radware Bot Manager. The current request cannot be scraped reliably without a proxy, a whitelisted IP, or a manual challenge solve.',
            country,
            page: pageNum,
            searchUrl,
            source: getSourceName(country),
            debug: bolhaChallenge,
          });
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

      if (country === 'se') {
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

        if (country === 'se') {
          const selectorDebug = await page_obj.evaluate(() => {
            const selectors = [
              'div[id^="item-card-"][data-item-loaded="true"]',
              'div[id^="item-card-"][data-item-type]',
              '.item-card-module-scss-module__IIyH5q__itemCard',
              'a[href*="/item/"]',
              '[data-testid="price"]',
              'picture',
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
              hasCloudflareWord: bodyText.includes('cloudflare'),
              hasAccessDeniedWord: bodyText.includes('access denied'),
            };
          });
          console.log('🪵 [TRADERA] Selector timeout debug:', selectorDebug);
        }

        if (country === 'si') {
          const selectorDebug = await page_obj.evaluate(() => {
            const selectors = [
              'li.EntityList-item',
              'li.EntityList-item article.entity-body',
              'h3.entity-title a.link[href*="/oglas-"]',
              'li.EntityList-item a.link',
              '.entity-thumbnail img',
              '.entity-prices .price',
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
              hasAccessDeniedWord: bodyText.includes('access denied'),
              sampleText: (document.body?.innerText || '').slice(0, 800),
            };
          });
          console.log('🪵 [BOLHA] Selector timeout debug:', selectorDebug);
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

      const lazyScrollConfig = getLazyScrollConfig(country);

      // Apply country-specific lazy scrolling strategy when enabled.
      if (lazyScrollConfig.enabled) {
        console.log(`📜 Scrolling to load lazy-loaded content for ${config.name}...`);
        await page_obj.evaluate(async (scrollConfig) => {
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
          const maxPasses = scrollConfig.maxPasses;
          const scrollDelayMs = scrollConfig.scrollDelayMs;
          const stableThreshold = scrollConfig.stableThreshold;
          const scrollStep = Math.max(1, Math.floor(window.innerHeight / scrollConfig.scrollStepDivisor));

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
        }, lazyScrollConfig);

        // Give browser time to decode images after the forced lazy-load pass.
        await new Promise(resolve => setTimeout(resolve, lazyScrollConfig.decodeDelayMs));
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

      if (country === 'tr') {
        console.log('📜 Loading more Letgo results...');
        const itemsPerPage = getItemsPerPage(country);
        const totalItemsNeeded = pageNum * itemsPerPage;

        if (pageNum === 1) {
          console.log('🪵 [LETGO] Page 1 detected: skipping load-more to preserve top sponsored/featured cards.');
        } else {
        try {
          let currentItemCount = await page_obj.evaluate(() => {
            return document.querySelectorAll('div[data-testid="item-card"]').length;
          });

          let attempts = 0;
          let stagnantAttempts = 0;
          const maxAttempts = 12;

          while (currentItemCount < totalItemsNeeded && attempts < maxAttempts) {
            attempts += 1;

            await page_obj.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise((resolve) => setTimeout(resolve, 1800));

            const clicked = await page_obj.evaluate(() => {
              const normalize = (v) => (v || '').toLowerCase().replace(/\s+/g, ' ').trim();
              const buttons = Array.from(document.querySelectorAll('button'));

              const btn = buttons.find((el) => {
                const text = normalize(el.textContent);
                const cls = normalize(el.className);
                return text.includes('daha fazla yükle') || (text.includes('daha') && text.includes('yükle')) || cls.includes('btn-outlined');
              });

              if (!btn) return false;
              btn.scrollIntoView({ block: 'center', behavior: 'instant' });
              btn.click();
              return true;
            });

            if (clicked) {
              await new Promise((resolve) => setTimeout(resolve, 2200));
            }

            const newCount = await page_obj.evaluate(() => {
              return document.querySelectorAll('div[data-testid="item-card"]').length;
            });

            if (newCount === currentItemCount) {
              stagnantAttempts += 1;
              if (stagnantAttempts >= 3) {
                break;
              }
            } else {
              stagnantAttempts = 0;
            }

            currentItemCount = newCount;
          }

          console.log(`🪵 [LETGO] Loaded ${currentItemCount} cards for requested page ${pageNum}`);
        } catch (err) {
          console.warn('  ⚠️ Could not activate Letgo infinite load:', err.message);
        }
        }
      }

      const shouldDumpHtml = String(debugHtml).toLowerCase() !== '0' && String(debugHtml).toLowerCase() !== 'false';
      if (shouldDumpHtml) {
        try {
          const dumpData = await page_obj.evaluate(() => {
            const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
            const itemCards = document.querySelectorAll('[data-testid="item-card"]').length;
            const links = document.querySelectorAll('a[href]').length;

            return {
              href: window.location.href,
              title: document.title,
              bodyLength: document.body?.innerText?.length || 0,
              itemCards,
              links,
              html: document.documentElement?.outerHTML || '',
              sampleText: normalize((document.body?.innerText || '').slice(0, 1000)),
            };
          });

          const debugDir = path.join(process.cwd(), 'debug', 'scrape-dumps');
          await fs.mkdir(debugDir, { recursive: true });

          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          const safeQuery = String(query).trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'query';
          const baseName = `${country}-q-${safeQuery}-p-${pageNum}-${stamp}`;
          const htmlPath = path.join(debugDir, `${baseName}.html`);
          const metaPath = path.join(debugDir, `${baseName}.json`);

          await fs.writeFile(htmlPath, dumpData.html, 'utf8');
          await fs.writeFile(
            metaPath,
            JSON.stringify(
              {
                query,
                country,
                page: pageNum,
                selector,
                searchUrl,
                finalUrl: dumpData.href,
                title: dumpData.title,
                bodyLength: dumpData.bodyLength,
                itemCards: dumpData.itemCards,
                links: dumpData.links,
                sampleText: dumpData.sampleText,
              },
              null,
              2
            ),
            'utf8'
          );

          console.log(`🧪 [SCRAPE-DEBUG] HTML dump saved: ${htmlPath}`);
          console.log(`🧪 [SCRAPE-DEBUG] Metadata saved: ${metaPath}`);
        } catch (dumpErr) {
          console.warn('🧪 [SCRAPE-DEBUG] Failed to save HTML dump:', dumpErr.message);
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

      if (country === 'se') {
        const preExtractDebug = await page_obj.evaluate(() => ({
          cards: document.querySelectorAll('div[id^="item-card-"][data-item-loaded="true"], div[id^="item-card-"][data-item-type], .item-card-module-scss-module__IIyH5q__itemCard').length,
          links: document.querySelectorAll('a[href*="/item/"]').length,
          prices: document.querySelectorAll('[data-testid="price"]').length,
          pictures: document.querySelectorAll('picture').length,
          href: window.location.href,
          title: document.title,
        }));
        console.log(`🪵 [${config.name.toUpperCase()}] Pre-extract debug:`, preExtractDebug);
      }

      let pageData = await extractor(page_obj);

      if (country === 'tr') {
        const domItemsPrimary = Array.isArray(pageData) ? pageData : [];
        const domItemsSnapshot = await page_obj.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('div[data-testid="item-card"]'));
          const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
          const normalizeUrl = (value) => {
            if (!value) return null;
            if (value.startsWith('http')) return value;
            if (value.startsWith('/')) return `https://www.letgo.com${value}`;
            return value;
          };

          const items = [];
          for (const card of cards) {
            const linkEl = card.querySelector('a[href*="/item/"]');
            const href = linkEl?.getAttribute('href') || null;
            const url = normalizeUrl(href);
            if (!url) continue;

            const imgEl = card.querySelector('img');
            const alt = normalize(imgEl?.getAttribute('alt')) || null;

            const titleEl = card.querySelector('[data-slot="item-card-body"] .overflow-hidden > div');
            const title = normalize(titleEl?.textContent) || alt || null;
            if (!title) continue;

            const textNodes = Array.from(card.querySelectorAll('p, div, span'))
              .map((el) => normalize(el.textContent))
              .filter(Boolean);
            const price = textNodes.find((text) => /(?:^|\s)[\d.]+\s*(?:TL|₺)(?:\s|$)/i.test(text)) || null;
            const shipping = normalize(card.querySelector('[data-slot="item-card-body"] .text-secondary-600 span')?.textContent) || null;

            items.push({
              title,
              url,
              image: imgEl?.getAttribute('src') || null,
              alt: alt || title,
              price,
              shipping,
            });
          }

          return items;
        });

        const domItems = [...domItemsPrimary, ...domItemsSnapshot];

        const slugifyLetgoTitle = (value) => {
          return String(value || '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/ı/g, 'i')
            .replace(/ş/g, 's')
            .replace(/ğ/g, 'g')
            .replace(/ü/g, 'u')
            .replace(/ö/g, 'o')
            .replace(/ç/g, 'c')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        };

        const normalizeLetgoApiItem = (item) => {
          const id = item?.id ? String(item.id) : null;
          const title = String(item?.title || '').trim() || null;
          if (!id || !title) return null;

          const slug = slugifyLetgoTitle(title) || 'item';
          const url = `https://www.letgo.com/item/${slug}-iid-${id}`;

          const image =
            item?.images?.[0]?.big?.url ||
            item?.imageUrl ||
            (item?.image?.external_id ? `https://imvm.letgo.com/v1/files/${item.image.external_id}/image;s=640x640` : null);

          const price =
            item?.price_display ||
            item?.price?.value?.display ||
            null;

          const shipping = [item?.city_name, item?.district_name].filter(Boolean).join(', ') || null;

          const isSponsored = Boolean(item?.is_highlight || item?.isHighlight || item?.is_massive || item?.isMassive || item?.vitamins?.highlight || item?.vitamins?.massive);

          return {
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
            isSponsored,
          };
        };

        const matchedApiPayloads = letgoApiPayloads.filter((payload) =>
          payload?.queryMatch && Array.isArray(payload?.body?.data)
        );

        if (matchedApiPayloads.length > 0) {
          const seenIds = new Set();
          const apiItems = [];

          matchedApiPayloads.forEach((payload) => {
            payload.body.data.forEach((rawItem) => {
              const itemId = String(rawItem?.id || '');
              if (!itemId || seenIds.has(itemId)) return;

              const normalized = normalizeLetgoApiItem(rawItem);
              if (!normalized) return;

              seenIds.add(itemId);
              apiItems.push(normalized);
            });
          });

          if (apiItems.length > 0) {
            const normalizeKey = (value) => String(value || '').trim().toLowerCase();
            const merged = [];
            const seenKeys = new Set();

            // Keep visible DOM order first (captures top cards and rich variants), then complete from API payloads.
            domItems.forEach((item) => {
              const key = normalizeKey(item?.url) || normalizeKey(item?.title);
              if (!key || seenKeys.has(key)) return;
              seenKeys.add(key);
              merged.push(item);
            });

            apiItems.forEach((item) => {
              const key = normalizeKey(item?.url) || normalizeKey(item?.title);
              if (!key || seenKeys.has(key)) return;
              seenKeys.add(key);
              merged.push(item);
            });

            pageData = merged;
            console.log(`🧭 [LETGO] Using merged DOM+API results (domPrimary=${domItemsPrimary.length}, domSnapshot=${domItemsSnapshot.length}, api=${apiItems.length}, merged=${merged.length})`);
          }
        }
      }

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

      if (country === 'se') {
        console.log(`🪵 [${config.name.toUpperCase()}] Extracted item count:`, pageData.length);
        if (pageData.length > 0) {
          console.log(`🪵 [${config.name.toUpperCase()}] First extracted item preview:`, {
            title: pageData[0]?.title,
            url: pageData[0]?.url,
            image: pageData[0]?.image,
            price: pageData[0]?.price,
          });
        } else {
          try {

      if (country === 'si') {
        console.log(`🪵 [${config.name.toUpperCase()}] Extracted item count:`, pageData.length);
        if (pageData.length > 0) {
          console.log(`🪵 [${config.name.toUpperCase()}] First extracted item preview:`, {
            title: pageData[0]?.title,
            url: pageData[0]?.url,
            image: pageData[0]?.image,
            price: pageData[0]?.price,
          });
        } else {
          try {
            const dumpData = await page_obj.evaluate(() => {
              const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
              const selectors = [
                'li.EntityList-item',
                'li.EntityList-item article.entity-body',
                'h3.entity-title a.link[href*="/oglas-"]',
                'li.EntityList-item a.link',
              ];

              const counts = {};
              selectors.forEach((s) => {
                counts[s] = document.querySelectorAll(s).length;
              });

              const links = Array.from(document.querySelectorAll('a.link[href], a.link[data-href]'))
                .map((el) => ({
                  href: el.getAttribute('href') || el.getAttribute('data-href') || null,
                  text: normalize(el.textContent).slice(0, 180) || null,
                  title: el.getAttribute('title') || null,
                }))
                .filter((item) => item.href || item.text)
                .slice(0, 25);

              return {
                href: window.location.href,
                title: document.title,
                bodyLength: document.body?.innerText?.length || 0,
                counts,
                links,
                sampleText: (document.body?.innerText || '').slice(0, 1200),
              };
            });

            console.log('🪵 [BOLHA] Empty extraction debug:', dumpData);
          } catch (dumpErr) {
            console.warn('🪵 [BOLHA] Failed to collect empty-extraction debug:', dumpErr.message);
          }
        }
      }
            const dumpData = await page_obj.evaluate(() => {
              const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
              const buttons = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"]'))
                .map((el) => ({
                  tag: el.tagName,
                  id: el.id || null,
                  className: el.className || null,
                  ariaLabel: el.getAttribute('aria-label') || null,
                  text: normalize(el.textContent).slice(0, 180) || null,
                }))
                .filter((item) => item.ariaLabel || item.text)
                .slice(0, 400);

              return {
                href: window.location.href,
                title: document.title,
                bodyLength: document.body?.innerText?.length || 0,
                cardCount: document.querySelectorAll('div[id^="item-card-"][data-item-loaded="true"], div[id^="item-card-"][data-item-type], .item-card-module-scss-module__IIyH5q__itemCard').length,
                html: document.documentElement?.outerHTML || '',
                buttons,
              };
            });

            const debugDir = path.join(process.cwd(), 'debug', 'tradera-dumps');
            await fs.mkdir(debugDir, { recursive: true });
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const baseName = `tradera-se-q-${String(query).replace(/\s+/g, '_')}-p-${pageNum}-${stamp}`;
            const htmlPath = path.join(debugDir, `${baseName}.html`);
            const metaPath = path.join(debugDir, `${baseName}.json`);

            await fs.writeFile(htmlPath, dumpData.html, 'utf8');
            await fs.writeFile(
              metaPath,
              JSON.stringify(
                {
                  query,
                  page: pageNum,
                  selector,
                  url: dumpData.href,
                  title: dumpData.title,
                  bodyLength: dumpData.bodyLength,
                  cardCount: dumpData.cardCount,
                  buttons: dumpData.buttons,
                },
                null,
                2
              ),
              'utf8'
            );

            console.log(`🪵 [TRADERA] Debug HTML dump saved: ${htmlPath}`);
            console.log(`🪵 [TRADERA] Debug metadata saved: ${metaPath}`);
          } catch (dumpErr) {
            console.warn('🪵 [TRADERA] Failed to save debug dump:', dumpErr.message);
          }
        }
      }

      // For Wallapop (Spain), slice results to only return the current page
      let items = pageData;

      if (country === 'tr' && shouldExcludeTrSponsored) {
        const beforeFilterCount = items.length;
        items = items.filter((item) => !item?.isSponsored);
        console.log(`🧹 [LETGO] Sponsored filter enabled: ${beforeFilterCount} -> ${items.length}`);
      }

      if (country === 'es' && pageNum > 1) {
        const itemsPerPage = getItemsPerPage(country);
        const startIndex = (pageNum - 1) * itemsPerPage;
        const endIndex = pageNum * itemsPerPage;
        items = pageData.slice(startIndex, endIndex);
        console.log(`📄 Wallapop: Extracted items ${startIndex}-${endIndex - 1} from ${pageData.length} total loaded items`);
      }
      if (country === 'tr' && pageNum > 1) {
        const itemsPerPage = getItemsPerPage(country);
        const startIndex = (pageNum - 1) * itemsPerPage;
        const endIndex = pageNum * itemsPerPage;
        items = pageData.slice(startIndex, endIndex);
        console.log(`📄 Letgo: Extracted items ${startIndex}-${endIndex - 1} from ${pageData.length} total loaded items`);
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
