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

function getVintedProxyConfig() {
  return {
    server: process.env.VINTED_PROXY_SERVER || '',
    username: process.env.VINTED_PROXY_USERNAME || '',
    password: process.env.VINTED_PROXY_PASSWORD || '',
  };
}

async function authenticateVintedProxy(page, proxyConfig) {
  if (!proxyConfig.server || !proxyConfig.username || !proxyConfig.password) {
    return;
  }

  await page.authenticate({
    username: proxyConfig.username,
    password: proxyConfig.password,
  });
}

async function detectVintedBlock(page, documentResponse) {
  const documentStatus = documentResponse?.status() ?? null;

  return await page.evaluate((status) => {
    const title = (document.title || '').trim().toLowerCase();
    const visibleText = (document.body?.innerText || '').toLowerCase().replace(/\s+/g, ' ');
    const blockedPatterns = [
      ['access denied', /\baccess denied\b/],
      ['banned your access', /\bbanned your access\b/],
      ['your access has been blocked', /\byour access (?:has been|is) blocked\b/],
      ['unusual traffic', /\bunusual traffic\b/],
      ['verify you are human', /\bverify (?:that )?you are human\b/],
      ['checking your browser', /\bchecking your browser\b/],
      ['security verification', /\bsecurity verification\b/],
      ['complete security check', /\bcomplete (?:the )?security check\b/],
      ['forbidden title', /^forbidden$/],
    ];

    const matchedPattern = blockedPatterns.find(([pattern, expression]) =>
      pattern === 'forbidden title' ? expression.test(title) : expression.test(visibleText),
    )?.[0];
    const blockedStatus = [403, 429].includes(status);

    if (!matchedPattern && !blockedStatus) {
      return null;
    }

    return {
      matchedPattern: matchedPattern || `http-${status}`,
      documentStatus: status,
      title: document.title || null,
      href: window.location.href,
      sampleText: (document.body?.innerText || '').slice(0, 500),
    };
  }, documentStatus);
}

const sensitiveDebugKey = /access[_-]?token|refresh[_-]?token|authorization|cookie|session|password|secret|signature|csrf/i;
const sensitiveDebugParam = /access[_-]?token|refresh[_-]?token|authorization|cookie|session|password|secret|signature|csrf/i;
const MAX_DEBUG_RESPONSE_BYTES = 1024 * 1024;
const MAX_DEBUG_TOTAL_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_DEBUG_REQUEST_BODY_BYTES = 64 * 1024;

function redactDebugValue(value, key = '') {
  if (sensitiveDebugKey.test(key)) {
    return '[REDACTED]';
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactDebugValue(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactDebugValue(entryValue, entryKey),
      ]),
    );
  }

  if (typeof value === 'string') {
    return value
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
      .replace(/([?&](?:access[_-]?token|refresh[_-]?token|authorization|cookie|session|password|secret|signature|csrf)=[^&\s]*)/gi, '[REDACTED]');
  }

  return value;
}

function sanitizeDebugUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    for (const key of url.searchParams.keys()) {
      if (sensitiveDebugParam.test(key)) {
        url.searchParams.set(key, '[REDACTED]');
      }
    }
    return url.toString();
  } catch {
    return String(rawUrl || '').replace(/([?&](?:access[_-]?token|refresh[_-]?token|authorization|cookie|session|password|secret|signature|csrf)=[^&\s]*)/gi, '[REDACTED]');
  }
}

function captureSafeRequestBody(request) {
  const rawBody = request.postData();
  if (!rawBody) return null;

  if (Buffer.byteLength(rawBody, 'utf8') > MAX_DEBUG_REQUEST_BODY_BYTES) {
    return { omitted: 'Request body exceeded the 64 KiB debug limit' };
  }

  try {
    return redactDebugValue(JSON.parse(rawBody));
  } catch {
    if (!rawBody.includes('=')) {
      return { omitted: 'Non-JSON request body was not captured' };
    }

    return Object.fromEntries(
      Array.from(new URLSearchParams(rawBody).entries()).map(([key, value]) => [
        key,
        sensitiveDebugKey.test(key) ? '[REDACTED]' : redactDebugValue(value),
      ]),
    );
  }
}

function captureVintedNetwork(page) {
  const requests = [];
  const responses = [];
  const responseTasks = [];
  let capturedResponseBytes = 0;

  page.on('request', (request) => {
    const resourceType = request.resourceType();
    if (!['document', 'xhr', 'fetch'].includes(resourceType)) return;

    const requestInfo = {
      method: request.method(),
      resourceType,
      url: sanitizeDebugUrl(request.url()),
    };

    if (['xhr', 'fetch'].includes(resourceType)) {
      const body = captureSafeRequestBody(request);
      if (body !== null) requestInfo.body = body;
    }

    requests.push(requestInfo);
  });

  page.on('response', (response) => {
    responseTasks.push((async () => {
      const request = response.request();
      const resourceType = request.resourceType();
      const responseUrl = response.url();
      const safeEntry = {
        method: request.method(),
        resourceType,
        url: sanitizeDebugUrl(responseUrl),
        status: response.status(),
        contentType: response.headers()['content-type'] || null,
      };
      let responsePath = '';
      try {
        responsePath = new URL(responseUrl).pathname;
      } catch {
        // Keep the response metadata even if its URL is not parseable.
      }

      const isSearchDataResponse = ['xhr', 'fetch'].includes(resourceType);
      const isJsonResponse = /(?:application|text)\/[^;]*json/i.test(safeEntry.contentType || '');

      if (isSearchDataResponse && isJsonResponse) {
        try {
          const contentLength = Number(response.headers()['content-length']);
          if (Number.isFinite(contentLength) && contentLength > MAX_DEBUG_RESPONSE_BYTES) {
            safeEntry.bodyOmitted = 'Response exceeded the 1 MiB per-response debug limit';
          } else {
            const body = await response.buffer();
            if (body.length > MAX_DEBUG_RESPONSE_BYTES) {
              safeEntry.bodyOmitted = 'Response exceeded the 1 MiB per-response debug limit';
            } else if (capturedResponseBytes + body.length > MAX_DEBUG_TOTAL_RESPONSE_BYTES) {
              safeEntry.bodyOmitted = 'Reached the 5 MiB total debug response limit';
            } else {
              capturedResponseBytes += body.length;
              safeEntry.body = redactDebugValue(JSON.parse(body.toString('utf8')));
            }
          }
        } catch (error) {
          safeEntry.bodyOmitted = redactDebugValue(`Could not parse JSON response: ${String(error.message).slice(0, 200)}`);
        }
      }

      responses.push(safeEntry);
    })().catch((error) => {
      responses.push({ error: redactDebugValue(String(error.message).slice(0, 200)) });
    }));
  });

  return {
    requests,
    responses,
    async flush(timeoutMs = 5000) {
      let completed = 0;
      const deadline = Date.now() + timeoutMs;
      while (completed < responseTasks.length) {
        const pending = responseTasks.slice(completed);
        completed += pending.length;
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) break;

        let timeoutHandle;
        const finished = await Promise.race([
          Promise.allSettled(pending).then(() => true),
          new Promise((resolve) => {
            timeoutHandle = setTimeout(() => resolve(false), remainingMs);
          }),
        ]);
        clearTimeout(timeoutHandle);
        if (!finished) break;
      }
    },
  };
}

async function saveVintedDebugDump({ page, query, country, searchUrl, documentResponse, pageInfo, network, error }) {
  const renderedPage = await page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script').forEach((script) => script.remove());

    clone.querySelectorAll('meta').forEach((meta) => {
      if (/token|csrf|session|auth/i.test(meta.getAttribute('name') || '')) {
        meta.removeAttribute('content');
      }
    });

    clone.querySelectorAll('input').forEach((input) => {
      const inputName = `${input.name || ''} ${input.id || ''} ${input.autocomplete || ''}`;
      if (/token|csrf|session|auth|password/i.test(inputName)) {
        input.removeAttribute('value');
        input.value = '';
      }
    });

    return {
      html: `<!doctype html>\n${clone.outerHTML}`,
      title: document.title || null,
      finalUrl: window.location.href,
      text: (document.body?.innerText || '').slice(0, 20000),
    };
  });

  const dumpDir = path.join(process.cwd(), 'debug', 'scrape-dumps');
  await fs.mkdir(dumpDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeCountry = String(country).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 12) || 'unknown';
  const safeQuery = String(query).trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'query';
  const baseName = `vinted-debug-${safeCountry}-q-${safeQuery}-${stamp}`;
  const htmlPath = path.join(dumpDir, `${baseName}.html`);
  const metadataPath = path.join(dumpDir, `${baseName}.json`);

  await fs.writeFile(htmlPath, redactDebugValue(renderedPage.html), 'utf8');
  await fs.writeFile(metadataPath, JSON.stringify({
    capturedAt: new Date().toISOString(),
    query,
    country,
    requestedUrl: sanitizeDebugUrl(searchUrl),
    finalUrl: sanitizeDebugUrl(renderedPage.finalUrl),
    pageTitle: renderedPage.title,
    pageText: redactDebugValue(renderedPage.text),
    mainDocumentResponse: documentResponse ? {
      status: documentResponse.status(),
      url: sanitizeDebugUrl(documentResponse.url()),
      headers: Object.fromEntries(
        Object.entries(documentResponse.headers())
          .filter(([name]) => ['content-type', 'content-length', 'cache-control'].includes(name.toLowerCase())),
      ),
    } : null,
    pageInfo: redactDebugValue(pageInfo),
    network: {
      requests: network.requests,
      responses: network.responses,
    },
    error: error ? redactDebugValue(String(error.message || error).slice(0, 1000)) : null,
    notes: [
      'HTML is a rendered DOM snapshot with script elements removed.',
      'Request headers and cookies are not saved.',
      'XHR/fetch request bodies are redacted and limited to 64 KiB each.',
      'XHR/fetch JSON responses are redacted and limited to 1 MiB each and 5 MiB total.',
    ],
  }, null, 2), 'utf8');

  return {
    html: path.relative(process.cwd(), htmlPath),
    metadata: path.relative(process.cwd(), metadataPath),
  };
}

export function setupVintedRoutes(app) {
  // Vinted debug endpoint - find correct selectors
  app.get('/api/vinted/debug', async (req, res) => {
    let browser;
    let launchConfig;
    let page;
    let network;
    let documentResponse;
    let pageInfo;
    let query = 'drone';
    let country = 'fr';
    let searchUrl;

    try {
      query = String(req.query.query || query);
      country = String(req.query.country || country).toLowerCase();

      if (!hasVintedSupport(country)) {
        return res.status(400).json({
          success: false,
          error: `Vinted is not available in ${country}`,
        });
      }

      const domain = getVintedDomain(country);
      searchUrl = `https://${domain}/catalog?search_text=${encodeURIComponent(query)}&catalog[]=3002`;
      const proxyConfig = getVintedProxyConfig();
      const launchArgs = [];

      if (proxyConfig.server) {
        launchArgs.push(`--proxy-server=${proxyConfig.server}`);
        console.log('Vinted proxy enabled for debug scraping.');
      }


      launchConfig = await getPuppeteerLaunchOptions(launchArgs);
      browser = await puppeteer.launch(launchConfig.options);

      page = await browser.newPage();
      await authenticateVintedProxy(page, proxyConfig);
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
      });

      network = captureVintedNetwork(page);
      documentResponse = await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await network.flush();

      const blockedPage = await detectVintedBlock(page, documentResponse);
      if (blockedPage) {
        const dumpFiles = await saveVintedDebugDump({
          page,
          query,
          country,
          searchUrl,
          documentResponse,
          pageInfo: { blockedPage },
          network,
        });
        await browser.close();
        browser = null;
        await launchConfig.cleanup();
        launchConfig = null;
        return res.status(403).json({
          success: false,
          error: 'Vinted access denied on this environment',
          details: 'Vinted returned a block page instead of search results',
          blockedPage,
          dumpFiles,
        });
      }

      const currency = getCurrency(country);
      pageInfo = await page.evaluate((currencyInfo) => {
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

      const dumpFiles = await saveVintedDebugDump({
        page,
        query,
        country,
        searchUrl,
        documentResponse,
        pageInfo,
        network,
      });

      await browser.close();
      browser = null;
      await launchConfig.cleanup();
      launchConfig = null;
      
      res.json({ 
        success: true,
        message: 'Vinted page structure debug',
        pageInfo,
        dumpFiles,
      });

    } catch (error) {
      let dumpFiles = null;
      if (page && !page.isClosed() && network) {
        try {
          await network.flush();
          dumpFiles = await saveVintedDebugDump({
            page,
            query,
            country,
            searchUrl,
            documentResponse,
            pageInfo,
            network,
            error,
          });
        } catch (dumpError) {
          console.warn('Vinted debug dump failed:', dumpError.message);
        }
      }

      if (browser) await browser.close();
      if (launchConfig) await launchConfig.cleanup();
      console.error('Vinted debug error:', error.message);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        dumpFiles,
      });
    }
  });

  // Vinted search endpoint
  app.get('/api/vinted/search', async (req, res) => {
    let browser;
    let launchConfig;
    let page_obj;
    let network;
    let documentResponse;
    let searchUrl;
    let query = 'drone';
    let country = 'fr';
    let pageNum = 1;
    let vintedPageToLoad = 1;
    let waitTimedOut = false;
    const debugRequested = ['1', 'true', 'yes'].includes(String(req.query.debug || '').toLowerCase());
    try {
      query = String(req.query.query || query);
      country = String(req.query.country || country).toLowerCase();
      const { page = '1' } = req.query;
      
      // Check if Vinted is supported in this country
      if (!hasVintedSupport(country)) {
        return res.status(400).json({ 
          success: false, 
          error: `Vinted is not available in ${country}`, 
          details: 'This country is not supported by Vinted' 
        });
      }
      
      pageNum = Math.max(1, parseInt(page) || 1);
      const itemsPerPage = getItemsPerPage(country);

      // Calculate which Vinted page to load based on frontend page number
      // Each Vinted page has ~156 items = ~4 frontend pages (156/37 = 4.2)
      // We'll dynamically calculate after scraping
      const estimatedItemsPerVintedPage = 150; // Rough estimate
      const estimatedPagesPerVintedPage = Math.ceil(estimatedItemsPerVintedPage / itemsPerPage);
      vintedPageToLoad = Math.ceil(pageNum / estimatedPagesPerVintedPage);

      const domain = getVintedDomain(country);
      // Vinted search URL format, category 3002 = Electronics, Video Games
      searchUrl = `https://${domain}/catalog?search_text=${encodeURIComponent(query)}&catalog[]=3002&page=${vintedPageToLoad}`;
      const proxyConfig = getVintedProxyConfig();
      const launchArgs = [];

      if (proxyConfig.server) {
        launchArgs.push(`--proxy-server=${proxyConfig.server}`);
        console.log('Vinted proxy enabled for scraping.');
      }


      console.log(`🤖 Scraping Vinted (${country}) page ${vintedPageToLoad} for: "${query}" (frontend page ${pageNum})`);

      launchConfig = await getPuppeteerLaunchOptions(launchArgs);
      browser = await puppeteer.launch(launchConfig.options);

      page_obj = await browser.newPage();
      await authenticateVintedProxy(page_obj, proxyConfig);
      await page_obj.setViewport({ width: 1920, height: 1080 });
      await page_obj.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page_obj.setExtraHTTPHeaders({
        'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
      });
      
      network = captureVintedNetwork(page_obj);
      documentResponse = await page_obj.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await network.flush();

      const blockedPage = await detectVintedBlock(page_obj, documentResponse);
      if (blockedPage) {
        const dumpFiles = await saveVintedDebugDump({
          page: page_obj,
          query,
          country,
          searchUrl,
          documentResponse,
          pageInfo: { blockedPage, page: pageNum, vintedPage: vintedPageToLoad },
          network,
        });
        console.warn('Vinted debug dump saved after block:', dumpFiles);
        await browser.close();
        browser = null;
        await launchConfig.cleanup();
        launchConfig = null;
        return res.status(403).json({
          success: false,
          error: 'Vinted access denied on this environment',
          details: 'Vinted returned a block page instead of search results',
          blockedPage,
          dumpFiles,
        });
      }
      
      // Wait for items to load, but do not fail hard if Vinted serves a slower or different DOM on VPS.
      try {
        await page_obj.waitForFunction(
          () => document.querySelectorAll('a[href*="/items/"], a[href*="/item/"], [data-testid*="item"], [data-testid*="product"], article, li').length > 0,
          { timeout: 15000 },
        );
      } catch (waitError) {
        waitTimedOut = true;
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

      let dumpFiles = null;
      if (debugRequested || waitTimedOut || paginatedItems.length === 0) {
        try {
          await network.flush();
          dumpFiles = await saveVintedDebugDump({
            page: page_obj,
            query,
            country,
            searchUrl,
            documentResponse,
            pageInfo: {
              page: pageNum,
              vintedPage: vintedPageToLoad,
              waitTimedOut,
              scrapedItems: totalScraped,
              returnedItems: paginatedItems.length,
              selectors: await page_obj.evaluate(() => ({
                itemLinks: document.querySelectorAll('a[href*="/items/"], a[href*="/item/"]').length,
                articles: document.querySelectorAll('article').length,
                testIds: document.querySelectorAll('[data-testid*="item"], [data-testid*="product"]').length,
              })),
            },
            network,
          });
          console.warn('Vinted debug dump saved:', dumpFiles);
        } catch (dumpError) {
          console.warn('Failed to save Vinted debug dump:', dumpError.message);
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
        source: `Vinted (${country.toUpperCase()})`,
        ...(dumpFiles ? { dumpFiles } : {}),
      });

    } catch (error) {
      let dumpFiles = null;
      if (page_obj && !page_obj.isClosed() && network) {
        try {
          await network.flush();
          dumpFiles = await saveVintedDebugDump({
            page: page_obj,
            query,
            country,
            searchUrl,
            documentResponse,
            pageInfo: { page: pageNum, vintedPage: vintedPageToLoad, waitTimedOut },
            network,
            error,
          });
          console.warn('Vinted debug dump saved after search error:', dumpFiles);
        } catch (dumpError) {
          console.warn('Failed to save Vinted debug dump after search error:', dumpError.message);
        }
      }
      if (browser) await browser.close();
      if (launchConfig) await launchConfig.cleanup();
      console.error('Vinted Puppeteer error:', error.message);
      res.status(500).json({ 
        success: false, 
        error: error.message, 
        details: 'Failed to scrape Vinted with Puppeteer',
        dumpFiles,
      });
    }
  });
}
