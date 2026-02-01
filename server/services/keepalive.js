// Keep-alive service to prevent platform sleep (e.g., Render free tier)

import axios from 'axios';

export function startKeepAlive() {
  const KEEPALIVE_URL = process.env.KEEPALIVE_URL || null;
  const KEEPALIVE_INTERVAL_MS = Number(process.env.KEEPALIVE_INTERVAL_MS || 240000); // Default: 4 minutes
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
