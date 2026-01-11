import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

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

// Simple in-memory token cache for Browse API
let browseToken = null;
let browseTokenExp = 0;

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

// Enable CORS for the frontend
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Simple ping endpoint for health and external reachability checks
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Marketplace Account Deletion notification endpoint (push from eBay)
// Configure this URL in eBay Alerts & Notifications page
app.all('/api/ebay/notifications/account-deletion', (req, res) => {
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
      return res.status(500).json({ error: 'challenge-handling-error' });
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
    const itemsPerPage = 40;
    const startIdx = (pageNum - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;

    // Vinted search URL format, category 3002 = Electronics, Video Games
    const searchUrl = `https://www.vinted.fr/catalog?search_text=${encodeURIComponent(query)}&catalog[]=3002`;

    console.log(`🤖 Scraping Vinted with Puppeteer for: "${query}" (page ${pageNum})`);

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
    console.log(`✅ Found ${pageData.length} items on Vinted via Puppeteer`);
    
    const totalItems = pageData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const paginatedItems = pageData.slice(startIdx, endIdx);
    
    res.json({ 
      success: true, 
      count: paginatedItems.length,
      total: totalItems,
      page: pageNum,
      totalPages: totalPages,
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
        'paginationInput.entriesPerPage': '40',
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
    const itemsPerPage = 40;
    const offset = (pageNum - 1) * itemsPerPage;

    if (!EBAY_APP_ID || !EBAY_CLIENT_SECRET) {
      return res.status(500).json({ success: false, error: 'Missing EBAY_APP_ID or EBAY_CLIENT_SECRET' });
    }

    const token = await getBrowseOAuthToken();
    const apiUrl = EBAY_SANDBOX
      ? 'https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search'
      : 'https://api.ebay.com/buy/browse/v1/item_summary/search';

    const response = await axios.get(apiUrl, {
      params: {
        q: query,
        limit: 40,
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
});

