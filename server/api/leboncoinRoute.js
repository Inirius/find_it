// LeBonCoin scraping API route

import puppeteer from 'puppeteer';
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

export function setupLeboncoinRoute(app) {
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
}
