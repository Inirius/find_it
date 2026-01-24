import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Configure puppeteer-extra with stealth plugin for DataDome bypass
puppeteerExtra.use(StealthPlugin());

// Load environment variables from server/.env regardless of working directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

// eBay API Configuration
const EBAY_APP_ID = process.env.EBAY_APP_ID || 'DEMO_MODE';
const EBAY_SANDBOX = process.env.EBAY_SANDBOX === 'true';
const EBAY_SITE_ID = process.env.EBAY_SITE_ID || '71'; // 71 = France
const EBAY_NOTIFICATION_TOKEN = process.env.EBAY_NOTIFICATION_TOKEN || null;
const EBAY_NOTIFICATION_ENDPOINT = process.env.EBAY_NOTIFICATION_ENDPOINT || null; // Full HTTPS URL configured in eBay portal
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || null;
// Rakuten Advertising Product Search API credentials (official API)
const RAKUTEN_CLIENT_ID = process.env.RAKUTEN_CLIENT_ID || null;
const RAKUTEN_CLIENT_SECRET = process.env.RAKUTEN_CLIENT_SECRET || null;
const RAKUTEN_COUNTRY = process.env.RAKUTEN_COUNTRY || 'fr';
const KEEPALIVE_URL = process.env.KEEPALIVE_URL || null;
const KEEPALIVE_INTERVAL_MS = Number(process.env.KEEPALIVE_INTERVAL_MS || 240000); // Default: 4 minutes
// Optional proxy for Rakuten scraping (e.g., http://user:pass@host:port)
const RAKUTEN_PROXY = process.env.RAKUTEN_PROXY || null;
const RAKUTEN_PROXY_USERNAME = process.env.RAKUTEN_PROXY_USERNAME || null;
const RAKUTEN_PROXY_PASSWORD = process.env.RAKUTEN_PROXY_PASSWORD || null;
const SCRAPERAPI_KEY = process.env.SCRAPERAPI_KEY || null;

// Simple in-memory token cache for Browse API
let browseToken = null;
let browseTokenExp = 0;
let rakutenToken = null;
let rakutenTokenExp = 0;

async function getBrowseOAuthToken() {
  if (browseToken && Date.now() < browseTokenExp - 60_000) {
    return browseToken;
  }
  if (!EBAY_APP_ID || !EBAY_CLIENT_SECRET) {
    throw new Error('Missing EBAY_APP_ID or EBAY_CLIENT_SECRET for OAuth');
  }
  const tokenUrl = EBAY_SANDBOX
    ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
    : 'https://api.ebay.com/identity/v1/oauth2/token';

  const basic = Buffer.from(`${EBAY_APP_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('scope', 'https://api.ebay.com/oauth/api_scope');

  const res = await axios.post(tokenUrl, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    timeout: 12000,
  });

  browseToken = res.data.access_token;
  browseTokenExp = Date.now() + (res.data.expires_in || 7200) * 1000;
  return browseToken;
}

// Optional keep-alive ping to prevent platform sleep (e.g., Render free tier)
function startKeepAlive() {
  if (!KEEPALIVE_URL) return;
  const ping = async () => {
    try {
      await axios.get(KEEPALIVE_URL, { timeout: 4000 });
      console.log('♻️ Keep-alive ping OK ->', KEEPALIVE_URL);
    } catch (err) {
      console.warn('♻️ Keep-alive ping failed:', err.message);
    }
  };
  // Initial ping immediately, then every KEEPALIVE_INTERVAL_MS
  ping();
  setInterval(ping, KEEPALIVE_INTERVAL_MS);
}

async function getRakutenToken() {
  if (rakutenToken && Date.now() < rakutenTokenExp - 60_000) {
    return rakutenToken;
  }
  if (!RAKUTEN_CLIENT_ID || !RAKUTEN_CLIENT_SECRET) {
    throw new Error('Missing RAKUTEN_CLIENT_ID or RAKUTEN_CLIENT_SECRET');
  }

  const tokenUrl = 'https://api.rakutenmarketing.com/token';
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  // Scope per docs: productsearch is sufficient; fallback to "affiliate" if needed
  params.append('scope', 'productsearch');

  const basic = Buffer.from(`${RAKUTEN_CLIENT_ID}:${RAKUTEN_CLIENT_SECRET}`).toString('base64');

  const res = await axios.post(tokenUrl, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    timeout: 12000,
  });

  rakutenToken = res.data.access_token;
  rakutenTokenExp = Date.now() + (res.data.expires_in || 3600) * 1000;
  return rakutenToken;
}

// Enable CORS for the frontend
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Set request timeout for notification endpoint (eBay expects response within ~3 seconds)
app.use('/api/ebay/notifications/', express.json({ limit: '10kb' }));

// Simple ping endpoint for health and external reachability checks
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Root endpoint used as a public, verifiable landing page
app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Find-it API</title></head>
<body>
  <h1>Find-it API</h1>
  <p>Status: OK</p>
  <p>Primary channel: https://find-it-server.onrender.com</p>
  <ul>
    <li>Health: /health</li>
    <li>eBay: /api/ebay/browse?query=drone</li>
    <li>LeBonCoin: /api/leboncoin/search?query=drone</li>
    <li>Vinted: /api/vinted/search?query=drone</li>
    <li>Rakuten: /api/rakuten/search?query=drone</li>
  </ul>
</body>
</html>`);
});

// Marketplace Account Deletion notification endpoint (push from eBay)
// Configure this URL in eBay Alerts & Notifications page
app.all('/api/ebay/notifications/account-deletion', (req, res) => {
  try {
    // eBay validation step: compute SHA-256 of challengeCode + verificationToken + endpoint
    const challengeCode = req.query?.challenge_code || req.query?.challengeCode || req.body?.challenge_code || req.body?.challengeCode;
    if (challengeCode) {
      try {
        // Use the exact endpoint URL configured in eBay portal to avoid protocol/host mismatches behind proxies
        const endpoint = EBAY_NOTIFICATION_ENDPOINT || `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        if (!EBAY_NOTIFICATION_TOKEN) {
          console.warn('⚠️ No EBAY_NOTIFICATION_TOKEN set; cannot compute challengeResponse correctly.');
        }
        const hash = createHash('sha256');
        hash.update(String(challengeCode));
        hash.update(String(EBAY_NOTIFICATION_TOKEN || ''));
        hash.update(String(endpoint));
        const responseHash = hash.digest('hex');
        console.log('🔐 Challenge received. endpoint=', endpoint, ' hash=', responseHash.substring(0, 12) + '...');
        return res.status(200).type('application/json').send({ challengeResponse: responseHash });
      } catch (e) {
        console.error('Challenge handling error:', e);
        // CRITICAL: Return 200 even on error - eBay must receive HTTP 200 to mark endpoint as healthy
        return res.status(200).json({ error: 'challenge-handling-error', challengeResponse: 'error-recovery' });
      }
    }

    // Handle actual notification payloads
    const payload = {
      headers: req.headers,
      body: req.body,
      query: req.query,
      receivedAt: new Date().toISOString(),
    };
    console.log('📨 Received eBay notification:', JSON.stringify(payload));
    // Capture signature header for later verification using eBay Notification SDK or manual flow
    const signature = req.get('x-ebay-signature') || req.get('X-EBAY-SIGNATURE');
    if (signature) {
      console.log('🔏 x-ebay-signature header present (verify after ack)');
    } else {
      console.log('ℹ️ No x-ebay-signature header found');
    }

    // Acknowledge receipt quickly (eBay expects 200 within ~3s)
    res.status(200).json({ ok: true });
  } catch (error) {
    // CRITICAL: Return 200 even on unexpected errors - eBay must receive HTTP 200 to mark endpoint as healthy
    console.error('⚠️ Unexpected error in notification endpoint:', error);
    res.status(200).json({ ok: true, error: 'internal-error-but-acked' });
  }
});

// LeBonCoin scraping with Puppeteer (bypasses DataDome/anti-bot)
app.get('/api/leboncoin/search', async (req, res) => {
  let browser;
  try {
    const { query = 'drone', page = '1' } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);

    const searchUrl = `https://www.leboncoin.fr/recherche?text=${encodeURIComponent(query)}&page=${pageNum}`;

    console.log(`🤖 Scraping LeBonCoin with Puppeteer for: "${query}" (page ${pageNum})`);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const page_obj = await browser.newPage();
    // If proxy with auth is set, provide credentials to the page
    if (RAKUTEN_PROXY && RAKUTEN_PROXY_USERNAME && RAKUTEN_PROXY_PASSWORD) {
      await page_obj.authenticate({
        username: RAKUTEN_PROXY_USERNAME,
        password: RAKUTEN_PROXY_PASSWORD,
      });
    }
    
    // Set realistic viewport and user agent
    await page_obj.setViewport({ width: 1920, height: 1080 });
    await page_obj.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate and wait for network to be idle
    await page_obj.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for ads to load (adjust selector if needed)
    await page_obj.waitForSelector('[data-test-id="ad"]', { timeout: 15000 });

    // Extract data from the page
    const pageData = await page_obj.evaluate(() => {
      const results = [];
      const adCards = document.querySelectorAll('[data-test-id="ad"]');
      
      adCards.forEach((card) => {
        try {
          // Title from article aria-label or h3
          const article = card.querySelector('article[data-test-id="ad"]') || card;
          let title = article.getAttribute('aria-label');
          if (!title) {
            const h3 = card.querySelector('h3');
            title = h3?.textContent?.trim();
          }
          
          // URL from main link
          const linkEl = card.querySelector('a[href*="/ad/"]') || card.querySelector('a[href]');
          const href = linkEl?.getAttribute('href');
          const url = href ? (href.startsWith('http') ? href : `https://www.leboncoin.fr${href}`) : null;
          
          // Image from picture/source or img
          let image = card.querySelector('img')?.getAttribute('src');
          if (!image) {
            const source = card.querySelector('picture source[srcset]');
            if (source) {
              const srcset = source.getAttribute('srcset');
              image = srcset?.split(',')[0]?.split(' ')[0];
            }
          }

          // Price: look for explicit pattern "Prix: 465 €" in full card text
          let price = null;
          const pricePatternMatch = card.textContent.match(/Prix:\s*([\d\s.,]+\s*€)/);
          if (pricePatternMatch) {
            price = pricePatternMatch[1].trim();
          }

          // Livraison: look for explicit "Livraison possible" in full card text
          const shipping = card.textContent.includes('Livraison possible') ? 'Livraison possible' : null;

          if (title && url) {
            results.push({ title, url, image, alt: title, price, shipping });
          }
        } catch (e) {
          console.warn('Parse error:', e.message);
        }
      });
      
      return results;
    });

    // Log debug data (in Node context, not browser context)
    // if (pageData.debugData?.firstCardText) {
    //   console.log('=== FIRST CARD FULL TEXT ===');
    //   console.log(pageData.debugData.firstCardText);
    //   console.log('=== END ===');
    // }

    const items = pageData;
    await browser.close();
    console.log(`✅ Found ${items.length} items on LeBonCoin page ${pageNum}`);
    
    res.json({ 
      success: true, 
      count: items.length,
      page: pageNum,
      items: items, 
      source: 'LeBonCoin (Puppeteer)' 
    });

  } catch (error) {
    if (browser) await browser.close();
    console.error('LeBonCoin Puppeteer error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message, 
      details: 'Failed to scrape LeBonCoin with Puppeteer' 
    });
  }
});

// Vinted debug endpoint - find correct selectors
app.get('/api/vinted/debug', async (req, res) => {
  let browser;
  try {
    const { query = 'drone' } = req.query;
    const searchUrl = `https://www.vinted.fr/catalog?search_text=${encodeURIComponent(query)}`;

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    const pageInfo = await page.evaluate(() => {
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

      return {
        title: document.title,
        url: window.location.href,
        selectorCounts: selectors,
        firstArticleHTML: firstArticle?.outerHTML.substring(0, 500),
        firstLinkHTML: firstLink?.outerHTML.substring(0, 500),
      };
    });

    await browser.close();
    
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

// Vinted scraping with Puppeteer
app.get('/api/vinted/search', async (req, res) => {
  let browser;
  try {
    const { query = 'drone', page = '1' } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const itemsPerPage = 37;
    
    // Calculate which Vinted page to load based on frontend page number
    // Each Vinted page has ~156 items = ~4 frontend pages (156/37 = 4.2)
    // We'll dynamically calculate after scraping
    const estimatedItemsPerVintedPage = 150; // Rough estimate
    const estimatedPagesPerVintedPage = Math.ceil(estimatedItemsPerVintedPage / itemsPerPage);
    const vintedPageToLoad = Math.ceil(pageNum / estimatedPagesPerVintedPage);
    
    // Vinted search URL format, category 3002 = Electronics, Video Games
    const searchUrl = `https://www.vinted.fr/catalog?search_text=${encodeURIComponent(query)}&catalog[]=3002&page=${vintedPageToLoad}`;

    console.log(`🤖 Scraping Vinted page ${vintedPageToLoad} for: "${query}" (frontend page ${pageNum})`);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const page_obj = await browser.newPage();
    await page_obj.setViewport({ width: 1920, height: 1080 });
    await page_obj.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page_obj.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for items to load
    await page_obj.waitForSelector('a[href*="/items/"]', { timeout: 15000 });

    const pageData = await page_obj.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll('a[href*="/items/"]');
      
      links.forEach((link) => {
        try {
          const url = link.getAttribute('href');
          const titleAttr = link.getAttribute('title');
          
          if (!url || !titleAttr) return;

          // Extract title from the title attribute (before first comma)
          let title = titleAttr.split(',')[0]?.trim();
          
          // Extract state/condition from title attribute (like price extraction)
          let shipping = null;
          const stateMatch = titleAttr.match(/état:\s*([^,]+)/);
          if (stateMatch) {
            shipping = stateMatch[1].trim();
          }
          
          // Extract price from title attribute - get ALL prices and take the second (with fees)
          let price = null;
          const priceMatches = titleAttr.match(/(\d+,\d{2}\s*€)/g);
          if (priceMatches && priceMatches.length > 1) {
            // Second price (with fees like Protection acheteurs)
            price = priceMatches[1].trim();
          } else if (priceMatches && priceMatches.length === 1) {
            // Fallback to first price if only one exists
            price = priceMatches[0].trim();
          }

          // Find image - look in multiple places (boosted vs non-boosted items may have different structures)
          let image = null;
          
          // First try: image directly in the link
          let img = link.querySelector('img');
          
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
    });

    await browser.close();
    
    const totalScraped = pageData.length;
    const pagesPerVintedPage = Math.ceil(totalScraped / itemsPerPage);
    
    // Calculate which subset of the scraped items to return
    const localPageOffset = ((pageNum - 1) % pagesPerVintedPage);
    const startIdx = localPageOffset * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const paginatedItems = pageData.slice(startIdx, endIdx);
    
    console.log(`✅ Scraped ${totalScraped} items from Vinted page ${vintedPageToLoad}, returning items ${startIdx}-${endIdx} (frontend page ${pageNum})`);
    
    res.json({ 
      success: true, 
      count: paginatedItems.length,
      total: totalScraped,
      page: pageNum,
      totalPages: pagesPerVintedPage,
      items: paginatedItems, 
      source: 'Vinted (Puppeteer)' 
    });

  } catch (error) {
    if (browser) await browser.close();
    console.error('Vinted Puppeteer error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message, 
      details: 'Failed to scrape Vinted with Puppeteer' 
    });
  }
});

// Rakuten debug endpoint - inspect raw HTML and selectors
app.get('/api/rakuten/debug', async (req, res) => {
  let browser;
  try {
    const { query = 'drone' } = req.query;
    const searchUrl = `https://fr.shopping.rakuten.com/search/${encodeURIComponent(query)}#pa=1`;

    console.log(`🐛 Debug: Loading Rakuten page for: "${query}"`);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const page_obj = await browser.newPage();
    await page_obj.setViewport({ width: 1920, height: 1080 });
    await page_obj.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('→ Going to URL:', searchUrl);
    await page_obj.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 40000 });
    console.log('✓ Page loaded');
    
    // Check for accept button
    try {
      const acceptBtn = await page_obj.$('button[id*="accept"], button[id*="consent"]');
      if (acceptBtn) {
        await acceptBtn.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('✓ Clicked consent button');
      }
    } catch (e) {
      console.log('ℹ️ No consent button found');
    }
    
    // Scroll
    await page_obj.evaluate(() => {
      window.scrollBy(0, window.innerHeight * 3);
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✓ Scrolled and waited');

    // Get debug info
    const debugInfo = await page_obj.evaluate(() => {
      // Find first divs with data attributes
      const allDivs = Array.from(document.querySelectorAll('div'));
      const divsWithData = allDivs.filter(div => {
        return Array.from(div.attributes).some(attr => attr.name.startsWith('data-'));
      }).slice(0, 5);

      return {
        pageTitle: document.title,
        pageUrl: window.location.href,
        bodyHTML: document.body.innerHTML.substring(0, 2000),
        selectors: {
          'div[data-productid]': document.querySelectorAll('div[data-productid]').length,
          'a[href*="/mfp/"]': document.querySelectorAll('a[href*="/mfp/"]').length,
          'div[class*="product"]': document.querySelectorAll('div[class*="product"]').length,
          'article': document.querySelectorAll('article').length,
          '[data-qa="product"]': document.querySelectorAll('[data-qa="product"]').length,
          'button': document.querySelectorAll('button').length,
          'div': document.querySelectorAll('div').length,
        },
        bodyLength: document.body.innerHTML.length,
        divsWithDataAttrs: divsWithData.map(el => ({
          tag: el.tagName,
          dataAttrs: Array.from(el.attributes).filter(a => a.name.startsWith('data-')).map(a => `${a.name}=${a.value.substring(0, 30)}`),
          className: el.className,
          textSnippet: el.textContent?.substring(0, 50) || ''
        }))
      };
    });

    await browser.close();
    
    res.json({ 
      success: true,
      message: 'Rakuten page structure debug',
      debugInfo,
      htmlPreview: debugInfo.bodyHTML
    });

  } catch (error) {
    if (browser) await browser.close();
    console.error('Rakuten debug error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stack: error.stack
    });
  }
});

// ScraperAPI render test - minimal params to debug which combo triggers 500
app.get('/api/rakuten/scraperapi-render-test', async (req, res) => {
  try {
    const { query = 'drone', variant = 'minimal' } = req.query;
    const targetUrl = `https://fr.shopping.rakuten.com/search/${encodeURIComponent(query)}#pa=1`;
    if (!SCRAPERAPI_KEY) {
      return res.status(400).json({ error: 'No SCRAPERAPI_KEY configured' });
    }

    let testParams = {};
    let testName = '';

    if (variant === 'minimal') {
      // Exact ScraperAPI docs example: api_key, url, render only
      testParams = { api_key: SCRAPERAPI_KEY, url: targetUrl, render: 'true' };
      testName = 'Minimal (docs example): api_key, url, render';
    } else if (variant === 'with_country') {
      testParams = { api_key: SCRAPERAPI_KEY, url: targetUrl, render: 'true', country_code: 'fr' };
      testName = 'With country_code';
    } else if (variant === 'with_device') {
      testParams = { api_key: SCRAPERAPI_KEY, url: targetUrl, render: 'true', device_type: 'desktop' };
      testName = 'With device_type';
    } else if (variant === 'with_headers') {
      testParams = { api_key: SCRAPERAPI_KEY, url: targetUrl, render: 'true', keep_headers: 'true' };
      testName = 'With keep_headers';
    } else if (variant === 'with_session') {
      testParams = { api_key: SCRAPERAPI_KEY, url: targetUrl, render: 'true', session_number: 1 };
      testName = 'With session_number';
    } else if (variant === 'full') {
      testParams = {
        api_key: SCRAPERAPI_KEY,
        url: targetUrl,
        render: 'true',
        country_code: 'fr',
        device_type: 'desktop',
        keep_headers: 'true',
        session_number: 1
      };
      testName = 'Full params';
    }

    let statusCode = null;
    let errorDetails = null;
    let bodyLength = null;
    try {
      const response = await axios.get('https://api.scraperapi.com', { params: testParams, timeout: 60000 });
      statusCode = response.status;
      bodyLength = response.data.length;
    } catch (err) {
      statusCode = err.response?.status || 'NO_STATUS';
      errorDetails = err.response?.data || err.message;
    }

    return res.json({
      variant,
      testName,
      testParams: { ...testParams, api_key: '***redacted***' },
      statusCode,
      bodyLength,
      errorDetails
    });
  } catch (e) {
    console.error('Render test error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// Rakuten ScraperAPI debug - inspect what ScraperAPI returns
app.get('/api/rakuten/scraperapi-debug', async (req, res) => {
  try {
    const { query = 'drone', tier = 'none', wait = '6000' } = req.query;
    const searchUrl = `https://fr.shopping.rakuten.com/search/${encodeURIComponent(query)}#pa=1`;

    console.log(`🐛 ScraperAPI Debug: fetching ${searchUrl}`);

    if (!SCRAPERAPI_KEY) {
      return res.json({ error: 'No SCRAPERAPI_KEY configured' });
    }

    const params = {
      api_key: SCRAPERAPI_KEY,
      url: searchUrl,
      render: 'true',
    };
    if (tier !== 'none') {
      params.render = 'true';
      params.wait_for = Number(wait);
    }
    if (tier === 'ultra') params.ultra_premium = 'true';
    else if (tier === 'premium') params.premium = 'true';

    const response = await axios.get('https://api.scraperapi.com', {
      params,
      timeout: 60000
    });

    const statusCode = response.status;
    const html = response.data;
    const $ = cheerio.load(html);

    const selectorDebug = {
      'div[data-productid]': $('div[data-productid]').length,
      'a[href*="/mfp/"]': $('a[href*="/mfp/"]').length,
      'a[href*="/p/"]': $('a[href*="/p/"]').length,
      'div[class*="product"]': $('div[class*="product"]').length,
      'article': $('article').length,
      '[data-qa="product"]': $('[data-qa="product"]').length,
      '[data-qa]': $('[data-qa]').length,
      'li[class*="product"]': $('li[class*="product"]').length,
      'div': $('div').length,
    };

    // Get first few divs and list their data-* attributes (wildcard selector not allowed)
    const divsWithData = $('div').slice(0, 20).map((i, el) => {
      const dataAttrs = Array.from(el.attribs ? Object.entries(el.attribs) : [])
        .filter(([name]) => name.startsWith('data-'))
        .map(([name, value]) => `${name}=${(value || '').substring(0, 80)}`);
      return {
        dataAttrs,
        className: $(el).attr('class')?.substring(0, 120),
        text: $(el).text().substring(0, 120)
      };
    }).get();

    const substringHits = {
      mfp: (html.match(/\/mfp\//g) || []).length,
      p: (html.match(/\/p\//g) || []).length,
      productid: (html.match(/productid/gi) || []).length,
      dataQa: (html.match(/data-qa/gi) || []).length
    };

    res.json({
      success: true,
      statusCode,
      htmlLength: html.length,
      selectors: selectorDebug,
      substringHits,
      tierUsed: tier,
      waitMs: Number(wait),
      divsWithDataAttributes: divsWithData,
      htmlPreview: html.substring(0, 3000)
    });
  } catch (err) {
    console.error('ScraperAPI debug error:', err.message, 'status=', err.response?.status);
    res.json({ error: err.message, status: err.response?.status, details: err.response?.data });
  }
});

// ScraperAPI probe endpoint - returns request diagnostics without parsing
app.get('/api/rakuten/scraperapi-probe', async (req, res) => {
  try {
    const {
      query = 'drone',
      page = '1',
      url,
      tier = 'none',
      wait = '6000',
      country = 'fr',
      device = 'desktop'
    } = req.query;

    const targetUrl = url || `https://fr.shopping.rakuten.com/search/${encodeURIComponent(query)}#pa=${Math.max(1, parseInt(page) || 1)}`;
    if (!SCRAPERAPI_KEY) {
      return res.status(400).json({ error: 'No SCRAPERAPI_KEY configured' });
    }

    const params = {
      api_key: SCRAPERAPI_KEY,
      url: targetUrl,
      country_code: String(country),
      device_type: String(device),
      keep_headers: 'true',
      session_number: 1
    };
    if (tier !== 'none') {
      params.render = 'true';
      params.wait_for = Number(wait);
    }
    if (tier === 'ultra') params.ultra_premium = 'true';
    else if (tier === 'premium') params.premium = 'true';

    // Build redacted params for display
    const redactedParams = { ...params, api_key: '***redacted***' };

    let statusCode = null;
    let headers = null;
    let bodyPreview = null;
    let errorDetails = null;
    try {
      const response = await axios.get('https://api.scraperapi.com', { params, timeout: 60000 });
      statusCode = response.status;
      headers = response.headers;
      const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      bodyPreview = data.substring(0, 2000);
    } catch (err) {
      statusCode = err.response?.status || null;
      headers = err.response?.headers || null;
      errorDetails = err.response?.data || err.message;
    }

    return res.json({
      success: !!bodyPreview && !errorDetails,
      targetUrl,
      tierUsed: tier,
      waitMs: Number(wait),
      country,
      device,
      requestParams: redactedParams,
      statusCode,
      headers,
      bodyPreview,
      errorDetails
    });
  } catch (e) {
    console.error('Probe error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// Rakuten Product Search - using ScraperAPI HTTP API to bypass DataDome
app.get('/api/rakuten/search', async (req, res) => {
  const { query = 'drone', page = '1', tier = 'none', wait = '6000' } = req.query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const searchUrl = `https://fr.shopping.rakuten.com/search/${encodeURIComponent(query)}#pa=${pageNum}`;

  try {
    console.log(`🛒 Scraping Rakuten page ${pageNum} for: "${query}"`);

    let html = '';
    let pageData = [];

    // Try ScraperAPI HTTP API first
    if (SCRAPERAPI_KEY) {
      console.log(`🔓 Using ScraperAPI (tier=${tier}, wait=${wait}ms) to bypass DataDome`);
      try {
        const params = {
          api_key: SCRAPERAPI_KEY,
          url: searchUrl,
          country_code: 'fr',
          device_type: 'desktop',
          keep_headers: 'true',
          session_number: 1
        };
        if (tier !== 'none') {
          params.render = 'true';
          params.wait_for = Number(wait);
        }
        if (tier === 'ultra') params.ultra_premium = 'true';
        else if (tier === 'premium') params.premium = 'true';

        const response = await axios.get('https://api.scraperapi.com', {
          params,
          timeout: 60000
        });
        html = response.data;
        console.log('✓ ScraperAPI returned HTML successfully');
      } catch (apiErr) {
        console.error('⚠️ ScraperAPI failed:', apiErr.message, 'status=', apiErr.response?.status);
        // Auto-retry with ultra tier if premium fails
        if (tier === 'premium') {
          try {
            const params2 = {
              api_key: SCRAPERAPI_KEY,
              url: searchUrl,
              country_code: 'fr',
              device_type: 'desktop',
              render: 'true',
              wait_for: Number(wait),
              keep_headers: 'true',
              ultra_premium: 'true'
            };
            const response2 = await axios.get('https://api.scraperapi.com', { params: params2, timeout: 60000 });
            html = response2.data;
            console.log('✓ ScraperAPI retry with ultra_premium succeeded');
          } catch (apiErr2) {
            console.error('⚠️ ScraperAPI ultra retry failed:', apiErr2.message, 'status=', apiErr2.response?.status);
          }
        }
      }
    }

    // Parse ScraperAPI HTML
    if (html) {
      const $ = cheerio.load(html);
      let found = 0;

      // Primary: cards with explicit data-productid
      const $cards = $('div[data-productid]');
      found += $cards.length;
      console.log(`✓ Found ${$cards.length} product cards in ScraperAPI HTML`);
      $cards.each((idx, el) => {
        try {
          const $card = $(el);
          const $link = $card.find('a[href*="/mfp/"]').first();
          const hrefVal = $link.attr('href');
          const titleVal = $link.attr('title') || $link.text()?.trim();
          if (!hrefVal || !titleVal) return;
          const fullUrl = hrefVal.startsWith('http') ? hrefVal : `https://fr.shopping.rakuten.com${hrefVal}`;
          const $img = $link.find('img').first();
          const imgUrl = $img.attr('src') || $img.attr('data-src');
          const priceBlocks = $card.find('div[data-qa="used_product"], div[data-qa="new_product"]').text();
          const priceMatch = priceBlocks.match(/([\d\s.,]+\s*€)/);
          const priceVal = priceMatch ? priceMatch[1].trim() : null;
          pageData.push({ title: titleVal.trim(), url: fullUrl, image: imgUrl || null, alt: titleVal.trim(), price: priceVal, shipping: null });
        } catch {}
      });

      // Fallback: scan anchors likely to be product links
      if (pageData.length === 0) {
        const anchorPatterns = [/\/mfp\//, /\/p\//, /\/product\//, /\/catalog\//];
        const anchors = $('a[href]').filter((i, el) => {
          const href = $(el).attr('href') || '';
          return anchorPatterns.some(rx => rx.test(href));
        });
        console.log(`ℹ️ Anchor scan candidates: ${anchors.length}`);
        anchors.each((i, el) => {
          try {
            const $a = $(el);
            const hrefVal = $a.attr('href');
            const titleVal = $a.attr('title') || $a.text().trim();
            if (!hrefVal || !titleVal) return;
            const fullUrl = hrefVal.startsWith('http') ? hrefVal : `https://fr.shopping.rakuten.com${hrefVal}`;
            const $img = $a.find('img').first();
            const imgUrl = $img.attr('src') || $img.attr('data-src');
            const $near = $a.closest('[data-qa]');
            const priceText = $near.find('div[data-qa="used_product"], div[data-qa="new_product"]').text() || $near.text();
            const priceMatch = priceText.match(/([\d\s.,]+\s*€)/);
            const priceVal = priceMatch ? priceMatch[1].trim() : null;
            pageData.push({ title: titleVal.trim(), url: fullUrl, image: imgUrl || null, alt: titleVal.trim(), price: priceVal, shipping: null });
          } catch {}
        });
        console.log(`✓ Fallback anchor parsing found ${pageData.length} products`);
      }
    }

    // Fallback to Puppeteer if ScraperAPI gave no results
    if (pageData.length === 0) {
      console.log('🤖 No products from ScraperAPI, falling back to Puppeteer (stealth)');
      let browser;
      try {
        const args = [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--window-size=1920,1080'
        ];

        browser = await puppeteerExtra.launch({
          headless: true,
          args
        });

        const page_obj = await browser.newPage();
        await page_obj.setViewport({ width: 1920, height: 1080 });
        await page_obj.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
        await page_obj.setExtraHTTPHeaders({
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0'
        });

        await page_obj.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 45000 });
        console.log('✓ Page loaded, URL:', await page_obj.url());

        try {
          const acceptBtn = await page_obj.$('button[id*="accept"], button[id*="consent"], button[class*="accept"]');
          if (acceptBtn) {
            await acceptBtn.click();
            await new Promise(resolve => setTimeout(resolve, 1500));
            console.log('✓ Clicked accept button');
          }
        } catch (e) {}

        try {
          await page_obj.evaluate(() => {
            window.scrollBy(0, window.innerHeight * 3);
          });
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (e) {}

        try {
          await page_obj.waitForFunction(() => {
            const products = document.querySelectorAll('div[data-productid], a[href*="/mfp/"]');
            return products && products.length > 0;
          }, { timeout: 30000, polling: 500 });
          console.log('✓ Product elements detected');
        } catch (e) {
          console.log('⚠️ Timeout waiting for products');
        }

        const puppeteerData = await page_obj.evaluate(() => {
          const results = [];
          const abs = (href) => {
            if (!href) return null;
            return href.startsWith('http') ? href : `https://fr.shopping.rakuten.com${href}`;
          };

          const cards = Array.from(document.querySelectorAll('div[data-productid]'));
          for (const card of cards) {
            try {
              const linkEl = card.querySelector('a.layoutProduct[href]') || card.querySelector('a[href*="/mfp/"]');
              const rawUrl = linkEl?.getAttribute('href') || null;
              const url = abs(rawUrl);
              let title = card.querySelector('[data-qa="sdt_p"] p')?.textContent?.trim() || null;
              if (!title) {
                title = linkEl?.getAttribute('title') || linkEl?.textContent?.trim() || null;
              }
              let image = null;
              const imgEl = linkEl?.querySelector('img') || card.querySelector('img');
              if (imgEl) {
                image = imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || null;
              }
              const usedBlock = card.querySelector('div[data-qa="used_product"]');
              const newBlock = card.querySelector('div[data-qa="new_product"]');
              const extractPrice = (el) => {
                if (!el) return null;
                const text = el.textContent || '';
                const m = text.match(/([\d\s.,]+\s*€)/);
                return m ? m[1].trim() : null;
              };
              const price = extractPrice(usedBlock) || extractPrice(newBlock);

              if (title && url) {
                results.push({ title, url, image, alt: title, price, shipping: null });
              }
            } catch (e) {}
          }

          if (results.length === 0) {
            const anchors = Array.from(document.querySelectorAll('a[href*="/mfp/"]'));
            for (const link of anchors) {
              try {
                const rawUrl = link.getAttribute('href');
                const url = abs(rawUrl);
                const imgEl = link.querySelector('img');
                const image = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || null;
                let title = link.getAttribute('title') || link.textContent?.trim() || null;
                const card = link.closest('div[data-productid]');
                const usedBlock = card?.querySelector('div[data-qa="used_product"]') || null;
                const newBlock = card?.querySelector('div[data-qa="new_product"]') || null;
                const extractPrice = (el) => {
                  if (!el) return null;
                  const text = el.textContent || '';
                  const m = text.match(/([\d\s.,]+\s*€)/);
                  return m ? m[1].trim() : null;
                };
                const price = extractPrice(usedBlock) || extractPrice(newBlock);

                if (title && url) {
                  results.push({ title, url, image, alt: title, price, shipping: null });
                }
              } catch (e) {}
            }
          }

          return results;
        });

        pageData = puppeteerData;
        await browser.close();
      } catch (puppeteerErr) {
        if (browser) await browser.close();
        throw puppeteerErr;
      }
    }

    // Deduplicate
    const seen = new Set();
    const deduped = [];
    for (const it of pageData) {
      if (it.url && !seen.has(it.url)) {
        seen.add(it.url);
        deduped.push(it);
      }
    }

    if (deduped.length === 0) {
      return res.json({
        success: true,
        source: 'Rakuten (ScraperAPI + Puppeteer)',
        items: [{
          title: `[DEMO] Résultat Rakuten pour "${query}"`,
          url: 'https://fr.shopping.rakuten.com',
          image: 'https://via.placeholder.com/300x300.png?text=Rakuten',
          alt: 'Rakuten',
          price: '-',
          shipping: null,
        }],
        total: 1,
      });
    }

    return res.json({
      success: true,
      source: 'Rakuten (ScraperAPI + Puppeteer)',
      items: deduped.slice(0, 40),
      total: deduped.length,
    });
  } catch (error) {
    console.error('Rakuten error:', error.message);
    return res.status(200).json({
      success: false,
      error: 'rakuten-scrape-error',
      details: error.message,
    });
  }
});


// eBay scraping endpoint
app.get('/api/ebay/search', async (req, res) => {
  try {
    const { query = 'cabela 2013 wii u' } = req.query;
    
    // Check if we're in DEMO mode
    if (EBAY_APP_ID === 'DEMO_MODE') {
      console.log('⚠️ Running in DEMO mode - returning sample data');
      return res.json(getDemoData(query));
    }
    
    // Use eBay Finding API
    const apiUrl = EBAY_SANDBOX 
      ? 'https://svcs.sandbox.ebay.com/services/search/FindingService/v1'
      : 'https://svcs.ebay.com/services/search/FindingService/v1';
    
    console.log(`Calling eBay Finding API for: "${query}"`);
    
    const response = await axios.get(apiUrl, {
      params: {
        'OPERATION-NAME': 'findItemsByKeywords',
        'SERVICE-VERSION': '1.0.0',
        'SECURITY-APPNAME': EBAY_APP_ID,
        'RESPONSE-DATA-FORMAT': 'JSON',
        'REST-PAYLOAD': true,
        'keywords': query,
        'paginationInput.entriesPerPage': '37',
        'GLOBAL-ID': 'EBAY-FR',
      },
      timeout: 12000
    });

    const searchResult = response.data.findItemsByKeywordsResponse?.[0];
    const items = searchResult?.searchResult?.[0]?.item || [];

    if (items.length === 0) {
      console.log('No items found in API response');
      return res.json({
        success: true,
        count: 0,
        items: [],
        message: 'No items found for this search'
      });
    }

    // Transform eBay API response to our format
    const formattedItems = items.map(item => ({
      title: item.title?.[0] || null,
      url: item.viewItemURL?.[0] || null,
      image: item.galleryURL?.[0] || item.pictureURLLarge?.[0] || null,
      alt: item.title?.[0] || null,
      price: item.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'] 
        ? `${item.sellingStatus[0].currentPrice[0]['__value__']} ${item.sellingStatus[0].currentPrice[0]['@currencyId']}` 
        : null,
      shipping: item.shippingInfo?.[0]?.shippingServiceCost?.[0]?.['__value__'] 
        ? (item.shippingInfo[0].shippingServiceCost[0]['__value__'] === '0.0' 
          ? 'Livraison gratuite' 
          : `Livraison: ${item.shippingInfo[0].shippingServiceCost[0]['__value__']} ${item.shippingInfo[0].shippingServiceCost[0]['@currencyId']}`)
        : null
    }));

    console.log(`✅ Found ${formattedItems.length} items via eBay API`);
    
    res.json({
      success: true,
      count: formattedItems.length,
      items: formattedItems,
      source: EBAY_SANDBOX ? 'eBay Sandbox API' : 'eBay Production API'
    });

  } catch (error) {
    console.error('eBay API error:', error.message);
    console.error('Error details:', error.response?.data || error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || 'Unknown error'
    });
  }
});

// eBay Browse API endpoint (OAuth, production-ready path)
app.get('/api/ebay/browse', async (req, res) => {
  try {
    const { query = 'cabela 2013 wii u', page = '1' } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const itemsPerPage = 37;
    const offset = (pageNum - 1) * itemsPerPage;

    if (!EBAY_APP_ID || !EBAY_CLIENT_SECRET) {
      return res.status(500).json({ success: false, error: 'Missing EBAY_APP_ID or EBAY_CLIENT_SECRET' });
    }

    console.log(`🔍 Searching eBay Browse API for: "${query}" (page ${pageNum})`);

    const token = await getBrowseOAuthToken();
    const apiUrl = EBAY_SANDBOX
      ? 'https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search'
      : 'https://api.ebay.com/buy/browse/v1/item_summary/search';

    const response = await axios.get(apiUrl, {
      params: {
        q: query,
        limit: 37,
        offset: offset,
        marketplace_id: 'EBAY_FR',
        filter: 'itemLocationCountry:FR',
      },
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_FR',
        // Optional affiliate context if you have it (comma-separated values)
        ...(process.env.EBAY_ENDUSERCTX ? { 'X-EBAY-C-ENDUSERCTX': process.env.EBAY_ENDUSERCTX } : {}),
      },
      timeout: 12000,
    });

    const items = (response.data?.itemSummaries || []).map((it) => ({
      title: it?.title || null,
      url: it?.itemWebUrl || null,
      image: it?.image?.imageUrl || it?.thumbnailImages?.[0]?.imageUrl || null,
      alt: it?.title || null,
      price: it?.price ? `${it.price.value} ${it.price.currency}` : null,
      shipping: it?.shippingOptions?.[0]?.shippingCost ? `${it.shippingOptions[0].shippingCost.value} ${it.shippingOptions[0].shippingCost.currency}` : null,
    }));

    const totalItems = response.data?.total || items.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    console.log(`✅ Found ${items.length} items on eBay (${totalItems} total, page ${pageNum}/${totalPages})`);

    res.json({
      success: true,
      count: items.length,
      total: totalItems,
      page: pageNum,
      totalPages: totalPages,
      items,
      source: EBAY_SANDBOX ? 'Browse API Sandbox' : 'Browse API Production',
    });
  } catch (error) {
    console.error('Browse API error:', error?.response?.data || error?.message || error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Browse API error',
      details: error?.response?.data || null,
    });
  }
});

// Demo data function for testing without API keys
function getDemoData(query) {
  return {
    success: true,
    count: 3,
    items: [
      {
        title: `[DEMO] Cabela's Big Game Hunter 2013 - Nintendo Wii U`,
        url: 'https://www.ebay.fr',
        image: 'https://via.placeholder.com/300x300.png?text=Cabela+Wii+U',
        alt: "Cabela's Big Game Hunter 2013",
        price: '25,00 EUR',
        shipping: 'Livraison gratuite'
      },
      {
        title: `[DEMO] Cabela's Dangerous Hunts 2013 Wii U Complet`,
        url: 'https://www.ebay.fr',
        image: 'https://via.placeholder.com/300x300.png?text=Cabela+Complete',
        alt: "Cabela's Dangerous Hunts",
        price: '30,00 EUR',
        shipping: 'Livraison: 4,50 EUR'
      },
      {
        title: `[DEMO] Nintendo Wii U - Cabela's Bundle avec fusil`,
        url: 'https://www.ebay.fr',
        image: 'https://via.placeholder.com/300x300.png?text=Bundle',
        alt: 'Cabela Bundle',
        price: '89,99 EUR',
        shipping: 'Livraison gratuite'
      }
    ],
    source: 'Demo Mode - Configure your eBay API keys in server/.env',
    note: `Recherche pour: "${query}"`
  };
}

// Global error handler - catch any unhandled errors
app.use((error, req, res, next) => {
  console.error('🚨 Unhandled error in Express:', error);
  // For notification endpoints, always return 200 to avoid marking endpoint as down
  if (req.path.includes('/api/ebay/notifications/')) {
    return res.status(200).json({ ok: true, error: 'internal-error-but-acked' });
  }
  // For other endpoints, return 500
  res.status(500).json({ error: error.message || 'Internal Server Error' });
});

// Health check endpoint
app.listen(PORT, () => {
  console.log(`✅ eBay API server running on http://localhost:${PORT}`);
  console.log(`   Mode: ${EBAY_APP_ID === 'DEMO_MODE' ? '🎭 DEMO (no API key)' : EBAY_SANDBOX ? '🧪 SANDBOX' : '🚀 PRODUCTION'}`);
  console.log(`   API endpoint: http://localhost:${PORT}/api/ebay/search?query=YOUR_SEARCH`);
  if (EBAY_APP_ID === 'DEMO_MODE') {
    console.log(`   ⚠️  Configure your eBay API keys in server/.env to use real data`);
  }
  console.log('   Notification endpoint (set this in eBay):');
  console.log(`   ${EBAY_NOTIFICATION_ENDPOINT || `http://localhost:${PORT}/api/ebay/notifications/account-deletion`}`);
  if (EBAY_NOTIFICATION_TOKEN) {
    console.log('   Verification token set in .env');
  } else {
    console.log('   ⚠️  No EBAY_NOTIFICATION_TOKEN found in .env');
  }
  startKeepAlive();
});

