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
import { hasEbaySupportBrowse, hasVintedSupport } from '../shared/countrySupport.js';

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
const KEEPALIVE_URL = process.env.KEEPALIVE_URL || null;
const KEEPALIVE_INTERVAL_MS = Number(process.env.KEEPALIVE_INTERVAL_MS || 240000); // Default: 4 minutes

// eBay Site ID mapping (https://developer.ebay.com/devzone/finding-api/callref/types/SiteCodeType.html)
function getEbaySiteId(country) {
  const siteIds = {
    au: '15',  // Australia
    at: '16',  // Austria
    be: '23',  // Belgium (Dutch)
    be_fr: '71', // Belgium (French) - use 'be' for Dutch
    ca: '2',   // Canada
    ch: '193', // Switzerland
    de: '77',  // Germany
    es: '186', // Spain
    fr: '71',  // France
    gb: '3',   // United Kingdom
    ie: '205', // Ireland
    it: '101', // Italy
    nl: '146', // Netherlands
    pl: '212', // Poland
    ru: '11',  // Russia
    sg: '216', // Singapore
    us: '0',   // United States
  };
  return siteIds[country] || '71'; // Default to France
}

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

// Helper functions for country-specific configuration
function getCountryConfig(country) {
  const configs = {
    al: { domain: 'merrjep.al', name: 'Merrjep' },
    am: { domain: 'list.am', name: 'List.am' },
    au: { domain: 'gumtree.com.au', name: 'Gumtree' },
    at: { domain: 'www.willhaben.at', name: 'Willhaben' },
    ba: { domain: 'olx.ba', name: 'OLX' },
    be: { domain: 'www.2ememain.be', name: '2ememain.be' },
    bg: { domain: 'olx.bg', name: 'OLX' },
    by: { domain: 'kufar.by', name: 'Kufar' },
    cy: { domain: 'vendora.cy', name: 'Vendora' },
    cz: { domain: 'sbazar.cz', name: 'Sbazar' },
    de: { domain: 'www.kleinanzeigen.de', name: 'Kleinanzeigen' },
    dk: { domain: 'dba.dk', name: 'DBA' },
    ee: { domain: 'osta.ee', name: 'Osta' },
    es: { domain: 'es.wallapop.com', name: 'Wallapop' },
    fi: { domain: 'huuto.net', name: 'Huuto' },
    fr: { domain: 'www.leboncoin.fr', name: 'LeBonCoin' },
    gb: { domain: 'gumtree.com', name: 'Gumtree' },
    ge: { domain: 'mymarket.ge', name: 'MyMarket' },
    gr: { domain: 'vendora.gr', name: 'Vendora' },
    hr: { domain: 'njuskalo.hr', name: 'Njuskalo' },
    hu: { domain: 'jofogas.hu', name: 'Jofogas' },
    ie: { domain: 'donedeal.ie', name: 'DoneDeal' },
    is: { domain: 'bland.is', name: 'Bland' },
    it: { domain: 'subito.it', name: 'Subito' },
    kz: { domain: 'olx.kz', name: 'OLX' },
    lt: { domain: 'skelbiu.lt', name: 'Skelbiu' },
    lv: { domain: 'ss.lv', name: 'SS.lv' },
    mk: { domain: 'pazar3.mk', name: 'Pazar3' },
    md: { domain: '999.md', name: '999.md' },
    mt: { domain: 'maltapark.com', name: 'MaltaPark' },
    nl: { domain: 'www.marktplaats.nl', name: 'Marktplaats' },
    no: { domain: 'finn.no', name: 'Finn' },
    pl: { domain: 'www.olx.pl', name: 'OLX' },
    pt: { domain: 'olx.pt', name: 'OLX' },
    ro: { domain: 'olx.ro', name: 'OLX' },
    ru: { domain: 'avito.ru', name: 'Avito' },
    rs: { domain: 'kupujemprodajem.com', name: 'Kupujem Prodajem' },
    se: { domain: 'tradera.com', name: 'Tradera' },
    si: { domain: 'bolha.com', name: 'Bolha' },
    sk: { domain: 'bazos.sk', name: 'Bazos' },
    tr: { domain: 'letgo.com', name: 'LetGo' },
    ua: { domain: 'olx.ua', name: 'OLX' },
    xk: { domain: 'merrjep.com', name: 'Merrjep' },
  };
  return configs[country] || configs.fr;
}

function getEbayMarketplace(country = 'fr') {
  const code = country.toUpperCase();
  return {
    id: `EBAY_${code}`,
    country: code,
  };
}

function getVintedDomain(country = 'fr') {
  return `www.vinted.${country}`;
}

function getSourceName(country) {
  const config = getCountryConfig(country);
  return `${config.name} (Puppeteer)`;
}

function getCurrency(country) {
  const currencies = {
    // EUR countries
    at: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    be: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    cz: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    de: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    ee: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    es: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    fi: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    fr: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    gr: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    ie: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    it: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    lt: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    lv: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    nl: { symbol: '€', pattern: '(€\\s*\\d+,\\d{2})' },  // Format NL: € 250,00
    pt: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    sk: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    si: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },
    // Non-EUR countries
    al: { symbol: 'L', pattern: '(\\d+\\s*L)' },  // Albanian Lek
    am: { symbol: '֏', pattern: '(\\d+\\s*֏)' },  // Armenian Dram
    au: { symbol: 'A\\$', pattern: '(A\\$\\s*\\d+)' },  // Australian Dollar
    ba: { symbol: 'KM', pattern: '(\\d+\\s*KM)' },  // Convertible Mark
    bg: { symbol: 'лв', pattern: '(\\d+\\s*лв)' },  // Bulgarian Lev
    by: { symbol: 'Br', pattern: '(\\d+\\s*Br)' },  // Belarusian Ruble
    cy: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },  // Cyprus Euro
    dk: { symbol: 'kr', pattern: '(\\d+\\s*kr)' },  // Danish Krone
    gb: { symbol: '£', pattern: '(£\\s*\\d+)' },  // British Pound
    ge: { symbol: '₾', pattern: '(\\d+\\s*₾)' },  // Georgian Lari
    hr: { symbol: 'kn', pattern: '(\\d+\\s*kn)' },  // Croatian Kuna
    hu: { symbol: 'Ft', pattern: '(\\d+\\s*Ft)' },  // Hungarian Forint
    is: { symbol: 'kr', pattern: '(\\d+\\s*kr)' },  // Icelandic Króna
    kz: { symbol: '₸', pattern: '(\\d+\\s*₸)' },  // Kazakhstani Tenge
    md: { symbol: 'L', pattern: '(\\d+\\s*L)' },  // Moldovan Leu
    mk: { symbol: 'ден', pattern: '(\\d+\\s*ден)' },  // Macedonian Denar
    mt: { symbol: '€', pattern: '(\\d+,\\d{2}\\s*€)' },  // Malta Euro
    no: { symbol: 'kr', pattern: '(\\d+\\s*kr)' },  // Norwegian Krone
    pl: { symbol: 'zł', pattern: '(\\d+(?:\\s|,)\\d{2}\\s*zł)' },  // Polish Zloty
    ro: { symbol: 'lei', pattern: '(\\d+\\s*lei)' },  // Romanian Leu
    ru: { symbol: '₽', pattern: '(\\d+\\s*₽)' },  // Russian Ruble
    rs: { symbol: 'дин', pattern: '(\\d+\\s*дин)' },  // Serbian Dinar
    se: { symbol: 'kr', pattern: '(\\d+\\s*kr)' },  // Swedish Krona
    tr: { symbol: '₺', pattern: '(\\d+\\s*₺)' },  // Turkish Lira
    ua: { symbol: '₴', pattern: '(\\d+\\s*₴)' },  // Ukrainian Hryvnia
    xk: { symbol: 'L', pattern: '(\\d+\\s*L)' },  // Kosovo Lek
  };
  return currencies[country] || currencies.fr;
}

function getItemsPerPage(country) {
  const itemsPerPage = {
    al: 50, de: 50, // Merrjep, Kleinanzeigen
    am: 50, at: 30, // List.am, Willhaben
    au: 50, ba: 50, // Gumtree, OLX
    be: 50, bg: 50, // 2ememain.be, OLX
    by: 50, cy: 50, // Kufar, Vendora
    cz: 50, dk: 50, // Sbazar, DBA
    ee: 50, es: 40, // Osta, Wallapop
    fi: 50, fr: 37, // Huuto, LeBonCoin
    gb: 50, ge: 50, // Gumtree, MyMarket
    gr: 50, hr: 50, // Vendora, Njuskalo
    hu: 50, ie: 50, // Jofogas, DoneDeal
    is: 50, it: 50, // Bland, Subito
    kz: 50, lt: 50, // OLX, Skelbiu
    lv: 50, mk: 50, // SS.lv, Pazar3
    md: 50, mt: 50, // 999.md, MaltaPark
    nl: 50, no: 50, // Marktplaats, Finn
    pl: 50, pt: 50, // OLX, OLX
    ro: 50, ru: 50, // OLX, Avito
    rs: 50, se: 50, // Kupujem Prodajem, Tradera
    si: 50, sk: 50, // Bolha, Bazos
    tr: 50, ua: 50, // LetGo, OLX
    xk: 50, // Merrjep
  };
  return itemsPerPage[country] || 50;
}

function getSelector(country) {
  const selectors = {
    fr: '[data-test-id="ad"]',
    de: '[data-testid="listing"], [data-testid*="listing"], a[href*="/s-anzeige/"], article',
    be: 'li.hz-Listing, .hz-Listing-coverLink-new',
    at: 'a[href*="/iad/kaufen-und-verkaufen/d/"], div[id*="search-result-entry"]',
    es: 'a[href*="/item/"]',
    nl: 'li.hz-Listing, .hz-Listing-coverLink-new',
    pl: 'div[data-cy="l-card"]',
  };
  return selectors[country] || selectors.fr;
}

function getSearchUrl(country, config, query, pageNum) {
  if (country === 'de') {
    const slug = String(query)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'anzeigen';
    return `https://${config.domain}/s-seite:${pageNum}/${slug}/k0`;
  }
  
  if (country === 'be') {
    const searchTerm = String(query).trim().replace(/\s+/g, '+');
    const pageSuffix = pageNum > 1 ? `p/${pageNum}/` : '';
    return `https://${config.domain}/q/${searchTerm}/${pageSuffix}`;
  }
  
  if (country === 'at') {
    const searchTerm = encodeURIComponent(String(query).trim());
    return `https://${config.domain}/iad/kaufen-und-verkaufen/marktplatz?keyword=${searchTerm}&page=${pageNum}`;
  }
  
  if (country === 'es') {
    const searchTerm = String(query).trim().replace(/\s+/g, '+');
    // Wallapop uses infinite scroll with "Cargar más" button, no page parameter
    return `https://${config.domain}/search?keywords=${searchTerm}`;
  }
  
  if (country === 'nl') {
    const searchTerm = String(query).trim().replace(/\s+/g, '+');
    const pageSuffix = pageNum > 1 ? `p/${pageNum}/` : '';
    return `https://${config.domain}/q/${searchTerm}/${pageSuffix}`;
  }
  
  if (country === 'pl') {
    const searchTerm = String(query).trim().replace(/\s+/g, '-');
    const pageSuffix = pageNum > 1 ? `?page=${pageNum}` : '';
    return `https://${config.domain}/oferty/q-${searchTerm}/${pageSuffix}`;
  }
  
  // Default: France
  return `https://${config.domain}/recherche?text=${encodeURIComponent(query)}&page=${pageNum}`;
}

function getExtractor(country) {
  const extractors = {
    fr: extractLeBonCoinData,
    de: extractEbayKleinanzeigenData,
    be: extract2ememainData,
    at: extractWillhabenData, // Willhaben
    es: extractWallapopData, // Wallapop
    nl: extract2ememainData, // Marktplaats.nl - même structure que 2ememain.be
    pl: extractOlxData, // OLX.pl
  };
  return extractors[country] || extractors.fr;
}

// Helper functions to extract data from different sites
async function extractLeBonCoinData(page_obj) {
  return await page_obj.evaluate(() => {
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
}

async function extractEbayKleinanzeigenData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const listingCards = document.querySelectorAll('li.ad-listitem article.aditem');

    listingCards.forEach((card) => {
      try {
        // URL from data-href or link
        const dataHref = card.getAttribute('data-href');
        const linkEl = card.querySelector('a[href*="/s-anzeige/"]') || card.querySelector('a[href]');
        const href = dataHref || linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.kleinanzeigen.de${href}`) : null;

        // Title
        const titleEl = card.querySelector('h2 a') || card.querySelector('h2') || card.querySelector('.text-module-begin a');
        const title = titleEl?.textContent?.trim();

        // Image
        let image = card.querySelector('img')?.getAttribute('src');
        if (!image) {
          const imgAlt = card.querySelector('img')?.getAttribute('data-src');
          if (imgAlt) image = imgAlt;
        }

        // Price
        let price = null;
        const priceEl = card.querySelector('.aditem-main--middle--price-shipping--price') || card.querySelector('[class*="price"]');
        if (priceEl?.textContent) {
          const match = priceEl.textContent.match(/([\d.,]+\s*€)/);
          if (match) price = match[1].trim();
        } else {
          const textMatch = card.textContent.match(/([\d.,]+\s*€)/);
          if (textMatch) price = textMatch[1].trim();
        }

        // Shipping
        let shipping = null;
        if (card.textContent.includes('Versand')) {
          shipping = 'Versand möglich';
        }

        if (title && url) {
          results.push({ title, url, image, alt: title, price, shipping });
        }
      } catch (e) {
        console.warn('Parse error:', e.message);
      }
    });

    return results;
  });
}

async function extract2ememainData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    // 2ememain.be structure
    const listingCards = document.querySelectorAll('li.hz-Listing');

    listingCards.forEach((card) => {
      try {
        // URL
        const linkEl = card.querySelector('a.hz-Listing-coverLink-new, a[href*="/v/"]');
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.2ememain.be${href}`) : null;

        // Title
        const titleEl = card.querySelector('strong.hz-Text--bodyLarge');
        const title = titleEl?.textContent?.trim();

        // Image
        let image = card.querySelector('img.hz-Image')?.getAttribute('src');
        if (!image || image.includes('placeholder')) {
          image = card.querySelector('img.hz-Image')?.getAttribute('data-src');
        }

        // Price
        let price = null;
        const priceEl = card.querySelector('.hz-Listing-price, h5.hz-Title--title5');
        if (priceEl?.textContent) {
          // Remove &nbsp; and normalize
          const priceText = priceEl.textContent.replace(/\s+/g, ' ').trim();
          const match = priceText.match(/€\s*([\d.,]+)/);
          if (match) price = `€ ${match[1]}`;
        }

        // Shipping - check attributes for "Envoi" or "Enlèvement ou Envoi"
        let shipping = null;
        const attributes = card.querySelectorAll('.hz-Attribute-new span.hz-Text');
        attributes.forEach((attr) => {
          if (attr.textContent.includes('Envoi')) {
            shipping = attr.textContent.trim();
          }
        });

        if (title && url) {
          results.push({ title, url, image, alt: title, price, shipping });
        }
      } catch (e) {
        console.warn('Parse error:', e.message);
      }
    });

    return results;
  });
}

async function extractOlxData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const listingCards = document.querySelectorAll('div[data-cy="l-card"]');

    listingCards.forEach((card) => {
      try {
        // URL from the link with /d/oferta/
        const linkEl = card.querySelector('a[href*="/d/oferta/"]');
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.olx.pl${href}`) : null;

        // Title
        const titleEl = card.querySelector('[data-testid="ad-card-title"] h4');
        const title = titleEl?.textContent?.trim();

        // Image
        let image = card.querySelector('img')?.getAttribute('src');
        if (!image) {
          const imgAttr = card.querySelector('img')?.getAttribute('data-src');
          if (imgAttr) image = imgAttr;
        }

        // Price - look for text with "zł" 
        let price = null;
        const priceEl = card.querySelector('[data-testid="ad-price"]');
        if (priceEl?.textContent) {
          const priceText = priceEl.textContent.trim();
          const match = priceText.match(/([\d\s.,]+\s*zł)/);
          if (match) price = match[1].trim();
        }

        // Shipping - look for "Pakietem Ochronnym" or similar badges
        let shipping = null;
        const badgeText = card.textContent;
        if (badgeText.includes('Pakietem Ochronnym')) {
          shipping = 'Pakiet Ochronny';
        }

        if (title && url) {
          results.push({ title, url, image, alt: title, price, shipping });
        }
      } catch (e) {
        console.warn('Parse error:', e.message);
      }
    });

    return results;
  });
}

// Willhaben (Austria) extractor
async function extractWillhabenData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    // Willhaben uses multiple container selectors
    const listingCards = document.querySelectorAll('div[id*="search-result-entry"], article[data-testid*="ad"], a[href*="/iad/kaufen-und-verkaufen/d/"]');

    listingCards.forEach((card) => {
      try {
        // URL from link element
        let linkEl = card;
        if (card.tagName !== 'A') {
          linkEl = card.querySelector('a[href*="/iad/kaufen-und-verkaufen/d/"]');
        }
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.willhaben.at${href}`) : null;

        // Title from h3 element
        const titleEl = card.querySelector('h3') || (card.tagName === 'A' ? card.querySelector('h3') : null);
        const title = titleEl?.textContent?.trim();

        // Image
        let image = card.querySelector('img')?.getAttribute('src');
        if (!image) {
          image = card.querySelector('img')?.getAttribute('data-src');
        }

        // Price from span with data-testid="search-result-entry-price-*" or aria-label
        let price = null;
        const priceEl = card.querySelector('[data-testid*="search-result-entry-price"], span[aria-label*="€"]');
        if (priceEl) {
          const ariaLabel = priceEl.getAttribute('aria-label');
          price = ariaLabel || priceEl.textContent.trim();
        }

        // Date from p element with aria-label containing "veröffentlicht"
        let date = null;
        const dateEl = card.querySelector('p[aria-label*="veröffentlicht"]');
        if (dateEl) {
          const ariaLabel = dateEl.getAttribute('aria-label');
          date = ariaLabel ? ariaLabel.replace('veröffentlicht ', '') : dateEl.textContent.trim();
        }

        // Location from span with aria-label containing "Wird verkauft in"
        let location = null;
        const locationEl = card.querySelector('[data-testid*="search-result-entry-subheader"] span, span[aria-label*="Wird verkauft in"]');
        if (locationEl) {
          const ariaLabel = locationEl.getAttribute('aria-label');
          location = ariaLabel ? ariaLabel.replace('Wird verkauft in ', '') : locationEl.textContent.trim();
        }

        if (title && url) {
          results.push({ 
            title, 
            url, 
            image, 
            alt: title, 
            price: price || 'N/A', 
            shipping: location || date || null 
          });
        }
      } catch (e) {
        console.warn('Parse error:', e.message);
      }
    });

    return results;
  });
}

// Wallapop (Spain) extractor
function extractWallapopData(page) {
  return page.evaluate(() => {
    const results = [];
    const selector = 'a[href*="/item/"]';
    const items = document.querySelectorAll(selector);

    items.forEach((item) => {
      try {
        // Title from aria-label or title attribute
        const title = item.getAttribute('aria-label') || item.getAttribute('title') || '';
        
        // First image
        const imgEl = item.querySelector('img');
        const image = imgEl ? imgEl.src : '';
        
        // Price from strong element
        const priceEl = item.querySelector('strong[aria-label="Item price"], strong.item-card_ItemCard__price');
        let price = priceEl ? priceEl.textContent.trim() : '';
        // Remove &nbsp; and normalize spaces
        price = price.replace(/\s+/g, ' ').trim();
        
        // URL
        const url = item.href || '';
        
        // Shipping: look for wallapop-badge with shipping text
        const shippingBadge = item.querySelector('wallapop-badge[badge-type="shippingAvailable"]');
        const shipping = shippingBadge ? shippingBadge.getAttribute('text') || 'Envío disponible' : '';

        if (title && url) {
          results.push({
            title: title.trim(),
            price: price || 'N/A',
            image: image || '',
            url: url.startsWith('http') ? url : `https://es.wallapop.com${url}`,
            shipping: shipping || ''
          });
        }
      } catch (err) {
        console.error('Error extracting Wallapop item:', err);
      }
    });

    return results;
  });
}

// LeBonCoin scraping with Puppeteer (bypasses DataDome/anti-bot)
app.get('/api/leboncoin/search', async (req, res) => {
  let browser;
  try {
    const { query = 'drone', page = '1', country = 'fr' } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);

    const config = getCountryConfig(country);
    const searchUrl = getSearchUrl(country, config, query, pageNum);

    console.log(`🤖 Scraping ${config.name} with Puppeteer for: "${query}" (country: ${country}, page ${pageNum})`);


    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const page_obj = await browser.newPage();

    // Set realistic viewport and user agent
    await page_obj.setViewport({ width: 1920, height: 1080 });
    await page_obj.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate with higher timeout (Kleinanzeigen can be slow) and fall back to domcontentloaded
    try {
      await page_obj.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (navErr) {
      console.warn('Primary goto timed out, retrying with domcontentloaded:', navErr.message);
      await page_obj.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    // Wait for ads/listings to load (different selectors FR vs DE vs BE)
    const selector = getSelector(country);

    try {
      await page_obj.waitForSelector(selector, { timeout: 25000 });
    } catch (waitErr) {
      console.warn('Selector wait timed out, waiting extra 3s before proceeding:', waitErr.message);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Scroll to load lazy-loaded images (especially for OLX.pl and Willhaben)
    if (country === 'pl' || country === 'at') {
      console.log(`📜 Scrolling to load lazy-loaded content for ${config.name}...`);
      await page_obj.evaluate(() => {
        return new Promise((resolve) => {
          let scrolls = 0;
          const maxScrolls = 10;
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
      await new Promise(resolve => setTimeout(resolve, 3250));
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
    let pageData = await extractor(page_obj);

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

// Vinted debug endpoint - find correct selectors
app.get('/api/vinted/debug', async (req, res) => {
  let browser;
  try {
    const { query = 'drone', country = 'fr' } = req.query;
    const domain = getVintedDomain(country);
    const searchUrl = `https://${domain}/catalog?search_text=${encodeURIComponent(query)}&catalog[]=3002`;

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

    const currency = getCurrency(country);
    const pageData = await page_obj.evaluate((currencyInfo) => {
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
          const priceRegex = new RegExp(currencyInfo.pattern, 'g');
          const priceMatches = titleAttr.match(priceRegex);
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
    }, currency);

    // Normalize URLs to absolute
    const normalizedData = pageData.map((item) => {
      const absUrl = item.url?.startsWith('http') ? item.url : item.url ? `https://${domain}${item.url}` : null;
      return { ...item, url: absUrl };
    });

    await browser.close();
    
    const totalScraped = normalizedData.length;
    const pagesPerVintedPage = Math.max(1, Math.ceil(totalScraped / itemsPerPage));
    
    // Calculate which subset of the scraped items to return
    const localPageOffset = ((pageNum - 1) % pagesPerVintedPage);
    const startIdx = localPageOffset * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const paginatedItems = normalizedData.slice(startIdx, endIdx);
    
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
    const { query = 'cabela 2013 wii u', country = 'fr' } = req.query;
    const itemsPerPage = getItemsPerPage(country);
    
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
        'paginationInput.entriesPerPage': String(itemsPerPage),
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
    const { query = 'cabela 2013 wii u', page = '1', country = 'fr' } = req.query;
    
    // Check if eBay Browse API is supported in this country
    if (!hasEbaySupportBrowse(country)) {
      return res.status(400).json({ 
        success: false, 
        error: `eBay Browse API is not available in ${country}`, 
        details: 'Supported countries: GB, DE, US, AU, IT, CA, ES, FR, HK, SG, IE, PL, NL, AT, CH, BE' 
      });
    }
    
    const pageNum = Math.max(1, parseInt(page) || 1);
    const itemsPerPage = getItemsPerPage(country);
    const offset = (pageNum - 1) * itemsPerPage;

    if (!EBAY_APP_ID || !EBAY_CLIENT_SECRET) {
      return res.status(500).json({ success: false, error: 'Missing EBAY_APP_ID or EBAY_CLIENT_SECRET' });
    }

    const marketplace = getEbayMarketplace(country);

    console.log(`🔍 Searching eBay Browse API for: "${query}" (country: ${country}, page ${pageNum})`);

    const token = await getBrowseOAuthToken();
    const apiUrl = EBAY_SANDBOX
      ? 'https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search'
      : 'https://api.ebay.com/buy/browse/v1/item_summary/search';

    const response = await axios.get(apiUrl, {
      params: {
        q: query,
        limit: itemsPerPage,
        offset: offset,
        marketplace_id: marketplace.id,
        filter: `itemLocationCountry:${marketplace.country}`,
      },
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': marketplace.id,
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

