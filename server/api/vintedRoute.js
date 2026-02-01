// Vinted scraping API routes

import puppeteer from 'puppeteer';
import { hasVintedSupport } from '../../shared/countrySupport.js';
import { getVintedDomain } from '../config/countryConfig.js';
import { getItemsPerPage, getCurrency } from '../config/scrapingConfig.js';

export function setupVintedRoutes(app) {
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

  // Vinted search endpoint
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
}
