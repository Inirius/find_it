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
    ee: 120, es: 40, // Osta, Wallapop
    fi: 24, fr: 37, // Huuto, LeBonCoin
    gb: 25, ge: 50, // Gumtree, MyMarket
    gr: 36, hr: 32, // Vendora, Njuskalo
    hu: 36, ie: 30, // Jofogas, DoneDeal
    is: 50, it: 30, // Bland, Subito
    kz: 50, lt: 24, // OLX, Skelbiu
    lv: 30, mk: 50, // SS.lv, Pazar3
    md: 78, mt: 52, // 999.md, MaltaPark
    nl: 50, no: 54, // Marktplaats, Finn
    pl: 52, pt: 50, // OLX, OLX
    ro: 52, ru: 50, // OLX, Avito
    rs: 30, se: 80, // Kupujem Prodajem, Tradera
    si: 31, sk: 20, // Bolha, Bazos
    tr: 24, ua: 52, // LetGo, OLX
    xk: 50, // Merrjep
  };
  return itemsPerPage[country] || 50;
}

const defaultLazyScrollConfig = {
  enabled: false,
  maxPasses: 50,
  scrollDelayMs: 30,
  stableThreshold: 3,
  scrollStepDivisor: 2,
  decodeDelayMs: 3250,
};

const lazyScrollByCountry = {
  pl: { enabled: true },
  at: { enabled: true },
  bg: { enabled: true },
  ee: { enabled: true },
  fi: { enabled: true },
  ge: { enabled: true },
  hr: { enabled: true },
  kz: { enabled: true },
  pt: { enabled: true },
  ro: { enabled: true },
  ua: { enabled: true },
  ru: {
    enabled: true,
    maxPasses: 500,
    scrollDelayMs: 500,
    stableThreshold: 10,
    scrollStepDivisor: 4,
    decodeDelayMs: 5000,
  },
};

export function getLazyScrollConfig(country) {
  return {
    ...defaultLazyScrollConfig,
    ...(lazyScrollByCountry[country] || {}),
  };
}

export function getSelector(country) {
  const selectors = {
    au: 'a[href*="/s-ad/"], a.user-ad-row-new-design, .user-ad-row-new-design__title-span',
    gb: 'article[data-q="search-result"], a[data-q="search-result-anchor"]',
    ba: 'div.cardd a[href*="/artikal/"], a[href*="/artikal/"]',
    bg: 'div[data-cy="l-card"], a[href*="/d/ad/"]',
    by: 'section > a[data-testid="kufar-ad"]',
    cy: 'div.grid-items-col a.card-product, a.card.vCard.card-product',
    gr: 'div.grid-items-col a.card-product, a.card.vCard.card-product',
    hr: 'li.EntityList-item article.entity-body, li.EntityList-item a.entity-title, li.EntityList-item a.link',
    rs: 'section.AdItem_adOuterHolder__hb5N_, section[id][data-scrolled]',
    hu: '[data-testid="ad-card-general"]',
    it: 'article.index-module_card__dW0sY, article:has(a[href*="subito.it/videogiochi/"]), article:has(a[href*="subito.it/"])',
    is: 'div.classifiedentry, div[data-page], div.searchList',
    ie: 'li[data-testid^="listing-card-index-"], li[data-testid*="listing-card"], a[href*="/games-for-sale/"]',
    kz: 'div[data-cy="l-card"], div[data-testid="l-card"]',
    cz: 'li[data-offer-id]',
    dk: 'article.sf-search-ad, article[class*="sf-search-ad"]',
    fr: '[data-test-id="ad"]',
    de: '[data-testid="listing"], [data-testid*="listing"], a[href*="/s-anzeige/"], article',
    be: 'li.hz-Listing, .hz-Listing-coverLink-new',
    at: 'a[href*="/iad/kaufen-und-verkaufen/d/"], div[id*="search-result-entry"]',
    ee: 'li.col-md-3.mb-custom-thumb-fancy, figure.offer-thumb.offer-thumb__fancy',
    es: 'a[href*="/item/"]',
    fi: 'a[href*="/kohteet/"]',
    ge: 'a[href*="/pr/"] article[data-testid="product-card"], article[data-testid="product-card"]',
    no: 'article.sf-search-ad, article[class*="sf-search-ad"]',
    se: 'div[id^="item-card-"][data-item-loaded="true"], div[id^="item-card-"][data-item-type], .item-card-module-scss-module__IIyH5q__itemCard',
    si: 'li.EntityList-item, li.EntityList-item article.entity-body, h3.entity-title a.link[href*="/oglas-"], li.EntityList-item a.link',
    sk: 'div.inzeraty.inzeratyflex, div.inzeraty.inzeratyflex .inzeratynadpis a, div.inzeraty.inzeratyflex .inzeratycena',
    tr: 'div[data-testid="item-card"], div[data-testid="item-card"] a[href*="/item/"]',
    ua: 'div[data-cy="l-card"], div[data-testid="l-card"]',
    nl: 'li.hz-Listing, .hz-Listing-coverLink-new',
    al: 'div.new.row.row-listing[data-product-id]',
    pl: 'div[data-cy="l-card"]',
    pt: 'div[data-cy="l-card"], div[data-testid="l-card"]',
    ro: 'div[data-cy="l-card"], div[data-testid="l-card"]',
    md: 'a.styles_advert__photo__link__SnL_t[href^="/ro/"]',
    mt: 'div.item.e3.e2, div.item[data-itemid]',
    lv: 'tr[id^="tr_"]',
    mk: 'div.new.row.row-listing',
    lt: 'a.js-cfuser-link.standard-list-item, a.standard-list-item',
    ru: 'div[data-marker="item"]',
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

  gb: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/search?search_category=game-consoles&search_location=uk&q=${term}&page=${page}`;
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

  gr: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/items?q=${term}&page=${page}`;
  },

  hr: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/search/?keywords=${term}&page=${page}`;
  },

  hu: ({ domain, query, page }) => {
    const term = normalize.encoded(query);
    const pagination = page > 1 ? `&o=${page}` : '';
    return `https://${domain}/magyarorszag?q=${term}${pagination}`;
  },

  it: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    const pagination = page > 1 ? `&o=${page}` : '';
    return `https://${domain}/annunci-italia/vendita/usato/?q=${term}${pagination}`;
  },

  kz: ({ domain, query, page }) => {
    const term = normalize.dash(query);
    return `https://${domain}/list/q-${term}/?page=${page}`;
  },

  is: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/classified/?q=${term}&page=${page}`;
  },

  ie: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    const start = Math.max(0, (page - 1) * 30);
    return `https://${domain}/all?words=${term}&start=${start}`;
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

  al: ({ domain, query, page }) => {
    const term = normalize.dash(query);
    return `https://${domain}/njoftime/q-${term}?Page=${page}`;
  },

  ee: ({ query, page }) => {
    const term = normalize.plus(query);
    const start = ((page - 1) * 120) + 1;
    return `https://osta.ee/?fuseaction=search.search&q[q]=${term}&start=${start}`;
  },

  fi: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/haku?q=${term}&page=${page}`;
  },

  ge: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/search/?Keyword=${term}&Page=${page}`;
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

  no: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/recommerce/forsale/search?page=${page}&q=${term}`;
  },

  pl: ({ domain, query, page }) => {
    const term = normalize.dash(query);
    const p = page > 1 ? `?page=${page}` : '';
    return `https://${domain}/oferty/q-${term}/${p}`;
  },

  pt: ({ domain, query, page }) => {
    const term = normalize.dash(query);
    return `https://${domain}/ads/q-${term}/?page=${page}`;
  },

  ro: ({ domain, query, page }) => {
    const term = normalize.dash(query);
    return `https://${domain}/oferte/q-${term}/?page=${page}`;
  },

  ua: ({ domain, query, page }) => {
    const term = normalize.dash(query);
    return `https://${domain}/uk/list/q-${term}/?page=${page}`;
  },

  lt: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/skelbimai/${page}?keywords=${term}`;
  },

  lv: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/lv/search-result/page${page}.html?q=${term}`;
  },

  mk: ({ domain, query, page }) => {
    const term = normalize.dash(query);
    return `https://${domain}/ads/q-${term}?Page=${page}`;
  },

  md: ({ domain, query, page }) => {
    const term = normalize.encoded(query);
    return `https://${domain}/ro/search?query=${term}&page=${page}`;
  },

  mt: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/search/?c=s1&search=${term}&page=${page}`;
  },

  rs: ({ domain, query, page }) => {
    const term = normalize.encoded(query);
    return `https://${domain}/pretraga?keywords=${term}&page=${page}`;
  },

  se: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/search?q=${term}&paging=${page}`;
  },

  si: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/search/?keywords=${term}&page=${page}`;
  },

  sk: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    const crz = page > 1 ? `&crz=${(page - 1) * 20}` : '';
    return `https://${domain}/search.php?hledat=${term}${crz}`;
  },

  tr: ({ domain, query }) => {
    const term = normalize.encoded(query);
    const host = domain.startsWith('www.') ? domain : `www.${domain}`;
    return `https://${host}/arama?query_text=${term}&isSearchCall=true`;
  },

  ru: ({ domain, query, page }) => {
    const term = normalize.plus(query);
    return `https://${domain}/all/bytovaya_elektronika?p=${page}&q=${term}`;
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
