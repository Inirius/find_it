// Déclarations TypeScript pour countrySupport.js

export const EBAY_BROWSE_SUPPORTED_COUNTRIES: {
  readonly [key: string]: boolean;
};

export const VINTED_SUPPORTED_COUNTRIES: {
  readonly [key: string]: boolean;
};

export function hasEbaySupportBrowse(country: string): boolean;
export function hasVintedSupport(country: string): boolean;
