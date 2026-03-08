// Scraping configurations: selectors, URLs, items per page

import { getCurrency } from './currencyConfig.js';

export function getItemsPerPage(country) {
  const itemsPerPage = {
    al: 50, de: 50, // Merrjep, Kleinanzeigen
    am: 50, at: 30, // List.am, Willhaben
    au: 50, ba: 50, // Gumtree, OLX
    be: 50, bg: 42, // 2ememain.be, OLX
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

export function getSelector(country) {
  const selectors = {
    au: 'a[href*="/s-ad/"], a.user-ad-row-new-design, .user-ad-row-new-design__title-span',
    ba: 'div.cardd a[href*="/artikal/"], a[href*="/artikal/"]',
    bg: 'div[data-cy="l-card"], a[href*="/d/ad/"]',
    by: 'section > a[data-testid="kufar-ad"]',
    cy: 'div.grid-items-col a.card-product, a.card.vCard.card-product',
    cz: 'li[data-offer-id]',
    dk: 'article.sf-search-ad, article[class*="sf-search-ad"]',
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

// Utility for URL normalization
const normalize = {
  slug: (q, fallback = '') =>
    String(q)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '') || fallback,

  plus: (q) => String(q).trim().replace(/\s+/g, '+'),
  dash: (q) => String(q).trim().replace(/\s+/g, '-'),
  encoded: (q) => encodeURIComponent(String(q).trim()),
};

// Country-specific search URL builders
const searchUrlByCountry = {
  au: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return page > 1
      ? `https://${domain}/s-${term}/page-${page}/k0`
      : `https://${domain}/s-${term}/k0`;
  },

  ba: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/pretraga?attr=&attr_encoded=1&q=${term}&page=${page}`;
  },

  bg: ({ query, page }) => {
    const term = normalize.dash(query);
    return `https://www.olx.bg/ads/q-${term}/?page=${page}`;
  },

  by: ({ query, page }) => {
    const term = normalize.dash(query);
    // Kufar uses cursor-based pagination with predictable structure
    if (page > 1) {
      // Cursor format: {"t":"abs","f":true,"p":<page>,"pit":"29548706"}
      // We generate it dynamically for each page
      const cursorObj = JSON.stringify({
        t: "abs",
        f: true,
        p: page,
        pit: "29548706"
      });
      const cursor = Buffer.from(cursorObj).toString('base64');
      return `https://www.kufar.by/l/igry-i-pristavki?cursor=${encodeURIComponent(cursor)}&ot=1&page=${page}&query=${term}&rgn=all&sort=lst.d`;
    }
    return `https://www.kufar.by/l/igry-i-pristavki?query=${term}&ot=1&rgn=all&sort=lst.d`;
  },

  cy: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/items?q=${term}&page=${page}`;
  },

  cz: ({ domain, query, page }) => {
    const term = normalize.encoded(query);
    return `https://${domain}/hledej/${term}/${page}`;
  },

  dk: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/recommerce/forsale/search?page=${page}&q=${term}`;
  },

  de: ({ domain, query, page }) => {
    const slug = normalize.slug(query, 'anzeigen');
    return `https://${domain}/s-seite:${page}/${slug}/k0`;
  },

  be: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    const p = page > 1 ? `p/${page}/` : '';
    return `https://${domain}/q/${term}/${p}`;
  },

  at: ({ domain, query, page }) => {
    const term = normalize.encoded(query);
    return `https://${domain}/iad/kaufen-und-verkaufen/marktplatz?keyword=${term}&page=${page}`;
  },

  es: ({ domain, query }) => {
    const term = normalize.plus(query);
    return `https://${domain}/search?keywords=${term}`;
  },

  nl: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    const p = page > 1 ? `p/${page}/` : '';
    return `https://${domain}/q/${term}/${p}`;
  },

  pl: ({ domain, query, page }) => {
    const term = normalize.dash(query);
    const p = page > 1 ? `?page=${page}` : '';
    return `https://${domain}/oferty/q-${term}/${p}`;
  },
};

export function getSearchUrl(country, config, query, pageNum) {
  const builder = searchUrlByCountry[country];

  if (builder) {
    return builder({
      domain: config.domain,
      query,
      page: pageNum,
    });
  }

  // Default: France
  return `https://${config.domain}/recherche?text=${encodeURIComponent(
    query
  )}&page=${pageNum}`;
}

// Re-export getCurrency from currencyConfig
export { getCurrency };
