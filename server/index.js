// Main Express server - refactored for modularity

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// API Routes
import { setupLeboncoinRoute } from './api/leboncoinRoute.js';
import { setupVintedRoutes } from './api/vintedRoute.js';
import { setupEbayRoutes } from './api/ebayRoute.js';

// Services
import { startKeepAlive } from './services/keepalive.js';

// Configure puppeteer-extra with stealth plugin for DataDome bypass
puppeteerExtra.use(StealthPlugin());

// Load environment variables from server/.env regardless of working directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

// eBay Notification Configuration
const EBAY_NOTIFICATION_TOKEN = process.env.EBAY_NOTIFICATION_TOKEN || null;
const EBAY_NOTIFICATION_ENDPOINT = process.env.EBAY_NOTIFICATION_ENDPOINT || null;
const EBAY_APP_ID = process.env.EBAY_APP_ID || 'DEMO_MODE';

// Enable CORS for the frontend
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Set request timeout for notification endpoint (eBay expects response within ~3 seconds)
app.use('/api/ebay/notifications/', express.json({ limit: '10kb' }));

// ============================================================================
// PUBLIC ENDPOINTS (Health, Root, etc.)
// ============================================================================

app.use(express.static('public'));

// Simple ping endpoint for health and external reachability checks
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Proxy image endpoint to avoid client-side hotlink/display issues on some marketplaces.
app.get('/api/image-proxy', async (req, res) => {
  try {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      return res.status(400).json({ error: 'Missing url query parameter' });
    }

    let imageUrl;
    try {
      imageUrl = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid image url' });
    }

    const allowedHosts = new Set(['img.tradera.net']);
    if (!allowedHosts.has(imageUrl.hostname)) {
      return res.status(403).json({ error: 'Image host not allowed' });
    }

    const response = await fetch(imageUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
        Referer: 'https://www.tradera.com/',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch image (${response.status})` });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('Image proxy error:', error.message);
    return res.status(500).json({ error: 'Image proxy failed' });
  }
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

// ============================================================================
// API ROUTE SETUP
// ============================================================================

setupLeboncoinRoute(app);
setupVintedRoutes(app);
setupEbayRoutes(app);

// ============================================================================
// ERROR HANDLING
// ============================================================================

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

// ============================================================================
// SERVER STARTUP
// ============================================================================

app.listen(PORT, () => {
  console.log(`✅ eBay API server running on http://localhost:${PORT}`);
  console.log(`   Mode: ${EBAY_APP_ID === 'DEMO_MODE' ? '🎭 DEMO (no API key)' : process.env.EBAY_SANDBOX === 'true' ? '🧪 SANDBOX' : '🚀 PRODUCTION'}`);
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
