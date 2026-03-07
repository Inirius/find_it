// Configuration centralisée du support des pays par plateforme

export const EBAY_BROWSE_SUPPORTED_COUNTRIES = {
  gb: true,
  de: true,
  us: true,
  au: true,
  it: true,
  ca: true,
  es: true,
  fr: true,
  hk: true,
  sg: true,
  ie: true,
  pl: true,
  nl: true,
  at: true,
  ch: true,
  be: true,
};

export const VINTED_SUPPORTED_COUNTRIES = {
  at: true,
  be: true,
  bg: true,
  cz: true,
  de: true,
  dk: true,
  ee: true,
  es: true,
  fi: true,
  fr: true,
  gb: true,
  gr: true,
  hr: true,
  hu: true,
  ie: true,
  it: true,
  lt: true,
  lv: true,
  nl: true,
  pl: true,
  pt: true,
  ro: true,
  se: true,
  si: true,
  sk: true,
};

export const GUMTREE_SUPPORTED_COUNTRIES = {
  au: true,
  gb: true,
};

export function hasEbaySupportBrowse(country) {
  return EBAY_BROWSE_SUPPORTED_COUNTRIES[country] || false;
}

export function hasVintedSupport(country) {
  return VINTED_SUPPORTED_COUNTRIES[country] || false;
}

export function hasGumtreeSupport(country) {
  return GUMTREE_SUPPORTED_COUNTRIES[country] || false;
}
