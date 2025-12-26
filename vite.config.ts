import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0',
    cors: true,
    hmr: true,
    proxy: {
      // Proxy désactivé temporairement pour tester HMR
      '/api/wiki': {
        target: 'https://www.ebay.fr/sch/i.html?_nkw=cabela+2013+wii+u&_sacat=0&_from=R40&LH_TitleDesc=0&rt=nc&LH_PrefLoc=1',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/wiki/, ''),
        // Remove Set-Cookie headers from proxied responses so the browser
        // won't attempt to set cookies for the wrong domain (e.g. .google.com)
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes && proxyRes.headers && proxyRes.headers['set-cookie']) {
              delete proxyRes.headers['set-cookie'];
            }
          });
        },
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [],
      },
    }),
  ],
})
