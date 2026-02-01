// eBay API routes (Finding API and Browse API)

import axios from 'axios';
import { hasEbaySupportBrowse } from '../../shared/countrySupport.js';
import { getEbayMarketplace } from '../config/countryConfig.js';
import { getItemsPerPage } from '../config/scrapingConfig.js';
import { getBrowseOAuthToken } from '../services/ebayOAuth.js';

export function setupEbayRoutes(app) {
  // eBay Finding API endpoint (legacy, but still works)
  app.get('/api/ebay/search', async (req, res) => {
    try {
      const EBAY_APP_ID = process.env.EBAY_APP_ID || 'DEMO_MODE';
      const EBAY_SANDBOX = process.env.EBAY_SANDBOX === 'true';
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

  // eBay Browse API endpoint (OAuth, production-ready)
  app.get('/api/ebay/browse', async (req, res) => {
    try {
      const EBAY_APP_ID = process.env.EBAY_APP_ID || 'DEMO_MODE';
      const EBAY_SANDBOX = process.env.EBAY_SANDBOX === 'true';
      const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || null;
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
        return res.status(500).json({ success: false, error: 'Missing eBay credentials' });
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
}

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
