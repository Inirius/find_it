// Get the appropriate extractor function for a country

import {
  extractLeBonCoinData,
  extractEbayKleinanzeigenData,
  extract2ememainData,
  extractWillhabenData,
  extractWallapopData,
  extractOlxData,
} from './extractors.js';

export function getExtractor(country) {
  const extractors = {
    fr: extractLeBonCoinData,
    de: extractEbayKleinanzeigenData,
    be: extract2ememainData,
    at: extractWillhabenData,
    es: extractWallapopData,
    nl: extract2ememainData,
    pl: extractOlxData,
  };
  return extractors[country] || extractors.fr;
}
