// Country configurations: domains, names, and marketplace info

export function getCountryConfig(country) {
  const configs = {
    al: { domain: 'merrjep.al', name: 'Merrjep' },
    am: { domain: 'list.am', name: 'List.am' },
    au: { domain: 'www.gumtree.com.au', name: 'Gumtree' },
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
    gb: { domain: 'www.gumtree.com', name: 'Gumtree' },
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
    me: { domain: 'patuljak.me', name: 'Patuljak' },
      ch: { domain: 'richardo.ch', name: 'Richardo' },
      mc: { domain: 'www.clickmonaco.com', name: 'ClickMonaco' },
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

export function getEbaySiteId(country) {
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

export function getEbayMarketplace(country = 'fr') {
  const code = country.toUpperCase();
  return {
    id: `EBAY_${code}`,
    country: code,
  };
}

export function getVintedDomain(country = 'fr') {
  if (country === 'gb') {
    return 'www.vinted.co.uk';
  }
  return `www.vinted.${country}`;
}

export function getSourceName(country) {
  const config = getCountryConfig(country);
  return `${config.name} (Puppeteer)`;
}
