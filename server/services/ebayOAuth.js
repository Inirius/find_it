// eBay OAuth token management for Browse API

import axios from 'axios';

// Simple in-memory token cache for Browse API
let browseToken = null;
let browseTokenExp = 0;

export async function getBrowseOAuthToken() {
  const EBAY_APP_ID = process.env.EBAY_APP_ID || 'DEMO_MODE';
  const EBAY_SANDBOX = process.env.EBAY_SANDBOX === 'true';
  const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || null;
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
