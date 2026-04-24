// Data extractors for different marketplaces

export async function extractLeBonCoinData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const adCards = document.querySelectorAll('[data-test-id="ad"]');
    
    adCards.forEach((card) => {
      try {
        // Title from article aria-label or h3
        const article = card.querySelector('article[data-test-id="ad"]') || card;
        let title = article.getAttribute('aria-label');
        if (!title) {
          const h3 = card.querySelector('h3');
          title = h3?.textContent?.trim();
        }
        
        // URL from main link
        const linkEl = card.querySelector('a[href*="/ad/"]') || card.querySelector('a[href]');
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.leboncoin.fr${href}`) : null;
        
        // Image from picture/source or img
        let image = card.querySelector('img')?.getAttribute('src');
        if (!image) {
          const source = card.querySelector('picture source[srcset]');
          if (source) {
            const srcset = source.getAttribute('srcset');
            image = srcset?.split(',')[0]?.split(' ')[0];
          }
        }

        // Price: look for explicit pattern "Prix: 465 €" in full card text
        let price = null;
        const pricePatternMatch = card.textContent.match(/Prix:\s*([\d\s.,]+\s*€)/);
        if (pricePatternMatch) {
          price = pricePatternMatch[1].trim();
        }

        // Livraison: look for explicit "Livraison possible" in full card text
        const shipping = card.textContent.includes('Livraison possible') ? 'Livraison possible' : null;

        if (title && url) {
          results.push({ title, url, image, alt: title, price, shipping });
        }
      } catch (e) {
        console.warn('Parse error:', e.message);
      }
    });
    
    return results;
  });
}

export async function extractBolhaData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const listingCards = document.querySelectorAll('li.EntityList-item, li.EntityList-item article.entity-body');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://www.bolha.com${value}`;
      return value;
    };

    const uniqueUrls = new Set();

    listingCards.forEach((card) => {
      try {
        const linkEl =
          card.querySelector('h3.entity-title a.link[href]') ||
          card.querySelector('h3.entity-title a.link[data-href]') ||
          card.querySelector('a.link[data-href]') ||
          card.querySelector('a.link[href]');
        const href = linkEl?.getAttribute('href') || linkEl?.getAttribute('data-href');
        const url = normalizeUrl(href);

        const titleEl = linkEl?.querySelector('span') || card.querySelector('h3.entity-title span') || card.querySelector('h3.entity-title');
        const title = cleanText(titleEl?.textContent || linkEl?.textContent) || null;

        const imgEl = card.querySelector('.entity-thumbnail img') || card.querySelector('img');
        const image = normalizeUrl(imgEl?.getAttribute('src')) || normalizeUrl(imgEl?.getAttribute('data-src')) || null;

        let price = null;
        const priceEl = card.querySelector('.entity-prices .price, strong.price');
        if (priceEl?.textContent) {
          price = cleanText(priceEl.textContent);
        }

        const locationText = cleanText(card.querySelector('.entity-description')?.textContent || '').replace(/^Lokacija:\s*/i, '');
        const dateText = cleanText(card.querySelector('.entity-pub-date time')?.textContent || '');
        const shipping = [locationText || null, dateText || null].filter(Boolean).join(' • ') || null;

        if (title && url && !uniqueUrls.has(url)) {
          uniqueUrls.add(url);
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting Bolha item:', err.message);
      }
    });

    return results;
  });
}

export async function extractBazosData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('div.inzeraty.inzeratyflex, div.inzeraty.inzeratyflex > div.inzeratynadpis');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://www.bazos.sk${value}`;
      return value;
    };

    const seen = new Set();

    cards.forEach((card) => {
      try {
        const root = card.classList?.contains('inzeraty') ? card : card.closest('div.inzeraty.inzeratyflex') || card;
        const titleLink = root.querySelector('h2.nadpis a[href]') || root.querySelector('.inzeratynadpis a[href]') || root.querySelector('a[href*="/inzerat/"]');
        const href = titleLink?.getAttribute('href');
        const url = normalizeUrl(href);
        if (!url || seen.has(url)) return;

        const title = cleanText(titleLink?.textContent || titleLink?.getAttribute('title')) || null;

        const imgEl = root.querySelector('img.obrazek') || root.querySelector('img');
        const image = normalizeUrl(imgEl?.getAttribute('src')) || normalizeUrl(imgEl?.getAttribute('data-src')) || null;

        const priceEl = root.querySelector('div.inzeratycena span, div.inzeratycena b span, div.inzeratycena');
        const price = cleanText(priceEl?.textContent) || null;

        const locationEl = root.querySelector('div.inzeratylok');
        const location = cleanText(locationEl?.textContent) || null;

        const dateEl = root.querySelector('span.velikost10');
        const date = cleanText(dateEl?.textContent || '').replace(/^[-\s\[\]]+|[-\s\[\]]+$/g, '') || null;
        const shipping = [location, date].filter(Boolean).join(' • ') || null;

        seen.add(url);

        if (title) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting Bazos item:', err.message);
      }
    });

    return results;
  });
}

export async function extractLetgoData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('div[data-testid="item-card"]');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://www.letgo.com${value}`;
      return value;
    };

    const normalizeTitle = (value) => cleanText(value)
      .replace(/\s+/g, ' ')
      .trim();

    const isPromoLabel = (value) => {
      const v = normalizeTitle(value).toLowerCase();
      if (!v) return true;
      return (
        v === 'elden al, kartla öde!' ||
        v === 'elden al kartla öde' ||
        v.includes('cuzdanim guvende') ||
        v.includes('cüzdanım güvende') ||
        v.includes('satıcı puanı') ||
        v.includes('buyuk ilan') ||
        v.includes('büyük ilan') ||
        v.includes('öne çıkan') ||
        v.includes('one cikan')
      );
    };

    const titleFromHref = (href) => {
      if (!href) return null;
      const match = href.match(/\/item\/([^/?#]+)/i);
      if (!match?.[1]) return null;
      const slug = match[1].replace(/-iid-\d+$/i, '');
      const decoded = decodeURIComponent(slug).replace(/-/g, ' ').trim();
      return decoded || null;
    };

    const seen = new Set();

    const isLikelyPrice = (text) => /(?:^|\s)(?:[\d.]+\s*(?:TL|₺)|TL|₺)(?:\s|$)/i.test(text);
    const isLikelyInstallment = (text) => /\btaksit\b/i.test(text);
    const isSponsoredBadge = (text) => {
      const v = normalizeTitle(text).toLowerCase();
      if (!v) return false;
      return v.includes('öne çıkan') || v.includes('one cikan') || v.includes('büyük ilan') || v.includes('buyuk ilan');
    };

    cards.forEach((card) => {
      try {
        const linkEl = card.querySelector('a[href*="/item/"]') || card.querySelector('a[href]');
        const href = linkEl?.getAttribute('href');
        const url = normalizeUrl(href);
        if (!url || seen.has(url)) return;

        const imgEl = card.querySelector('img');
        const image = normalizeUrl(imgEl?.getAttribute('src')) || normalizeUrl(imgEl?.getAttribute('data-src')) || null;

        const body = card.querySelector('div[data-slot="item-card-body"]') || card;
        const cardText = normalizeTitle(card.textContent);
        const isSponsored = isSponsoredBadge(cardText);

        // Prefer the dedicated title line, then fallback to non-price line-clamp text, then image alt.
        const explicitTitle = normalizeTitle(body.querySelector('div.overflow-hidden > div')?.textContent);
        const lineClampTexts = Array.from(body.querySelectorAll('div[class*="line-clamp-1"], p[class*="line-clamp-1"], span[class*="line-clamp-1"]'))
          .map((el) => normalizeTitle(el.textContent))
          .filter(Boolean);
        const titleFromLineClamp = lineClampTexts.find((text) => !isLikelyPrice(text) && !isLikelyInstallment(text) && !isPromoLabel(text));

        const altTitle = normalizeTitle(imgEl?.getAttribute('alt'));
        const hrefTitle = normalizeTitle(titleFromHref(href));

        const titleCandidates = [
          explicitTitle,
          titleFromLineClamp,
          altTitle,
          hrefTitle,
        ].filter(Boolean);

        const title = titleCandidates.find((candidate) => !isPromoLabel(candidate)) || null;

        let price = null;
        const priceCandidates = Array.from(body.querySelectorAll('p, div, span'))
          .map((el) => cleanText(el.textContent))
          .filter(Boolean);
        const priceHit = priceCandidates.find((text) => isLikelyPrice(text));
        if (priceHit) price = priceHit;

        let shipping = null;
        const locationEl = body.querySelector('div.text-secondary-600 span') || body.querySelector('div[class*="text-secondary-600"] span');
        if (locationEl?.textContent) {
          shipping = cleanText(locationEl.textContent);
        }

        seen.add(url);
        if (title) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
            isSponsored,
          });
        }
      } catch (err) {
        console.warn('Error extracting Letgo item:', err.message);
      }
    });

    return results;
  });
}

export function getExtractor(country) {
  const extractors = {
    fr: extractLeBonCoinData,
    cz: extractSbazarData,
    dk: extractDbaData,
    de: extractEbayKleinanzeigenData,
    ba: extractOlxBaData,
    bg: extractOlxBgData,
    cy: extractVendoraData,
    gr: extractVendoraData,
    hr: extractNjuskaloData,
    rs: extractKupujemProdajemData,
    se: extractTraderaData,
    si: extractBolhaData,
    sk: extractBazosData,
    tr: extractLetgoData,
    be: extract2ememainData,
    at: extractWillhabenData,
    es: extractWallapopData,
    nl: extract2ememainData,
    pl: extractOlxData,
    pt: extractOlxPtData,
    ro: extractOlxRoData,
    ua: extractOlxUaData,
    au: extractGumtreeData,
    gb: extractGumtreeUkData,
    by: extractKufarData,
    ee: extractOstaData,
    fi: extractHuutoData,
    ge: extractMyMarketData,
    hu: extractJofogasData,
    it: extractSubitoData,
    is: extractBlandData,
    kz: extractOlxKzData,
    ie: extractDoneDealData,
    lt: extractSkelbIUData,
    lv: extractSsLvData,
    mk: extractPazar3Data,
    mc: extractClickMonacoData,
    al: extractMerrjepAlData,
    xk: extractMerrjepAlData,
    am: extractListAmData,
    md: extract999MdData,
    mt: extractMaltaParkData,
    no: extractFinnData,
    ru: extractAvitoData,
  };
  return extractors[country] || extractors.fr;
}

export async function extractEbayKleinanzeigenData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const listingCards = document.querySelectorAll('li.ad-listitem article.aditem');

    listingCards.forEach((card) => {
      try {
        // URL from data-href or link
        const dataHref = card.getAttribute('data-href');
        const linkEl = card.querySelector('a[href*="/s-anzeige/"]') || card.querySelector('a[href]');
        const href = dataHref || linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.kleinanzeigen.de${href}`) : null;

        // Title
        const titleEl = card.querySelector('h2 a') || card.querySelector('h2') || card.querySelector('.text-module-begin a');
        const title = titleEl?.textContent?.trim();

        // Image
        let image = card.querySelector('img')?.getAttribute('src');
        if (!image) {
          const imgAlt = card.querySelector('img')?.getAttribute('data-src');
          if (imgAlt) image = imgAlt;
        }

        // Price
        let price = null;
        const priceEl = card.querySelector('.aditem-main--middle--price-shipping--price') || card.querySelector('[class*="price"]');
        if (priceEl?.textContent) {
          const match = priceEl.textContent.match(/([\d.,]+\s*€)/);
          if (match) price = match[1].trim();
        } else {
          const textMatch = card.textContent.match(/([\d.,]+\s*€)/);
          if (textMatch) price = textMatch[1].trim();
        }

        // Shipping
        let shipping = null;
        if (card.textContent.includes('Versand')) {
          shipping = 'Versand möglich';
        }

        if (title && url) {
          results.push({ title, url, image, alt: title, price, shipping });
        }
      } catch (e) {
        console.warn('Parse error:', e.message);
      }
    });

    return results;
  });
}

export async function extractSbazarData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const listingCards = document.querySelectorAll('li[data-offer-id]');

    listingCards.forEach((card) => {
      try {
        const linkEl = card.querySelector('a[href*="/inzerat/"]') || card.querySelector('a[href]');
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.sbazar.cz${href}`) : null;

        const titleEl =
          card.querySelector('div.text-red.line-clamp-2') ||
          card.querySelector('[class*="text-red"][class*="line-clamp-2"]') ||
          card.querySelector('img[alt]');
        const title =
          (titleEl?.tagName?.toLowerCase?.() === 'img'
            ? titleEl.getAttribute('alt')
            : titleEl?.textContent)?.trim() || null;

        const imgEl = card.querySelector('img');
        let image = imgEl?.getAttribute('src') || null;
        if (image && image.startsWith('//')) {
          image = `https:${image}`;
        }

        let price = null;
        const priceEl = card.querySelector('b');
        if (priceEl?.textContent) {
          price = priceEl.textContent.replace(/\s+/g, ' ').trim();
        }

        let shipping = null;
        const locationEl = card.querySelector('span.whitespace-pre') || card.querySelector('span[class*="truncate"]');
        if (locationEl?.textContent) {
          shipping = locationEl.textContent.replace(/\s+/g, ' ').trim();
        }

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (e) {
        console.warn('Sbazar parse error:', e.message);
      }
    });

    return results;
  });
}

export async function extract2ememainData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    // 2ememain.be structure
    const listingCards = document.querySelectorAll('li.hz-Listing');

    listingCards.forEach((card) => {
      try {
        // URL
        const linkEl = card.querySelector('a.hz-Listing-coverLink-new, a[href*="/v/"]');
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.2ememain.be${href}`) : null;

        // Title
        const titleEl = card.querySelector('strong.hz-Text--bodyLarge');
        const title = titleEl?.textContent?.trim();

        // Image
        let image = card.querySelector('img.hz-Image')?.getAttribute('src');
        if (!image || image.includes('placeholder')) {
          image = card.querySelector('img.hz-Image')?.getAttribute('data-src');
        }

        // Price
        let price = null;
        const priceEl = card.querySelector('.hz-Listing-price, h5.hz-Title--title5');
        if (priceEl?.textContent) {
          // Remove &nbsp; and normalize
          const priceText = priceEl.textContent.replace(/\s+/g, ' ').trim();
          const match = priceText.match(/€\s*([\d.,]+)/);
          if (match) price = `€ ${match[1]}`;
        }

        // Shipping - check attributes for "Envoi" or "Enlèvement ou Envoi"
        let shipping = null;
        const attributes = card.querySelectorAll('.hz-Attribute-new span.hz-Text');
        attributes.forEach((attr) => {
          if (attr.textContent.includes('Envoi')) {
            shipping = attr.textContent.trim();
          }
        });

        if (title && url) {
          results.push({ title, url, image, alt: title, price, shipping });
        }
      } catch (e) {
        console.warn('Parse error:', e.message);
      }
    });

    return results;
  });
}

export async function extractOlxData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const listingCards = document.querySelectorAll('div[data-cy="l-card"]');

    listingCards.forEach((card) => {
      try {
        // URL from the link with /d/oferta/
        const linkEl = card.querySelector('a[href*="/d/oferta/"]');
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.olx.pl${href}`) : null;

        // Title
        const titleEl = card.querySelector('[data-testid="ad-card-title"] h4');
        const title = titleEl?.textContent?.trim();

        // Image
        let image = card.querySelector('img')?.getAttribute('src');
        if (!image) {
          const imgAttr = card.querySelector('img')?.getAttribute('data-src');
          if (imgAttr) image = imgAttr;
        }

        // Price - look for text with "zł" 
        let price = null;
        const priceEl = card.querySelector('[data-testid="ad-price"]');
        if (priceEl?.textContent) {
          const priceText = priceEl.textContent.trim();
          const match = priceText.match(/([\d\s.,]+\s*zł)/);
          if (match) price = match[1].trim();
        }

        // Shipping - look for "Pakietem Ochronnym" or similar badges
        let shipping = null;
        const badgeText = card.textContent;
        if (badgeText.includes('Pakietem Ochronnym')) {
          shipping = 'Pakiet Ochronny';
        }

        if (title && url) {
          results.push({ title, url, image, alt: title, price, shipping });
        }
      } catch (e) {
        console.warn('Parse error:', e.message);
      }
    });

    return results;
  });
}

export async function extractOlxPtData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const listingCards = document.querySelectorAll('div[data-cy="l-card"], div[data-testid="l-card"]');

    const pickBestFromSrcset = (srcset) => {
      if (!srcset) return null;
      const candidates = srcset
        .split(',')
        .map((entry) => entry.trim().split(' ')[0])
        .filter(Boolean);
      return candidates.length ? candidates[candidates.length - 1] : null;
    };

    listingCards.forEach((card) => {
      try {
        const linkEl = card.querySelector('a[href*="/d/anuncio/"]') || card.querySelector('a[href]');
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.olx.pt${href}`) : null;

        const titleEl = card.querySelector('[data-testid="ad-card-title"] h4') || card.querySelector('h4');
        const title = titleEl?.textContent?.trim() || null;

        const imgEl = card.querySelector('img');
        const image =
          pickBestFromSrcset(imgEl?.getAttribute('srcset')) ||
          pickBestFromSrcset(imgEl?.getAttribute('data-srcset')) ||
          imgEl?.getAttribute('src') ||
          imgEl?.getAttribute('data-src') ||
          null;

        let price = null;
        const priceEl = card.querySelector('[data-testid="ad-price"]');
        if (priceEl?.textContent) {
          const priceText = priceEl.textContent.replace(/\s+/g, ' ').trim();
          const match = priceText.match(/([\d\s.,]+\s*€)/i);
          price = match ? match[1].trim() : priceText;
        }

        let shipping = null;
        const locationDateEl = card.querySelector('[data-testid="location-date"]');
        if (locationDateEl?.textContent) {
          shipping = locationDateEl.textContent.replace(/\s+/g, ' ').trim();
        }

        if (title && url) {
          results.push({ title, url, image, alt: title, price, shipping });
        }
      } catch (e) {
        console.warn('Parse error (OLX.pt):', e.message);
      }
    });

    return results;
  });
}

export async function extractOlxRoData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const listingCards = document.querySelectorAll('div[data-cy="l-card"], div[data-testid="l-card"]');

    const pickBestFromSrcset = (srcset) => {
      if (!srcset) return null;
      const candidates = srcset
        .split(',')
        .map((entry) => entry.trim().split(' ')[0])
        .filter(Boolean);
      return candidates.length ? candidates[candidates.length - 1] : null;
    };

    listingCards.forEach((card) => {
      try {
        const linkEl = card.querySelector('a[href*="/d/oferta/"]') || card.querySelector('a[href]');
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.olx.ro${href}`) : null;

        const titleEl = card.querySelector('[data-testid="ad-card-title"] h4') || card.querySelector('h4');
        const title = titleEl?.textContent?.trim() || null;

        const imgEl = card.querySelector('img');
        const image =
          pickBestFromSrcset(imgEl?.getAttribute('srcset')) ||
          pickBestFromSrcset(imgEl?.getAttribute('data-srcset')) ||
          imgEl?.getAttribute('src') ||
          imgEl?.getAttribute('data-src') ||
          null;

        let price = null;
        const priceEl = card.querySelector('[data-testid="ad-price"]');
        if (priceEl?.textContent) {
          const priceText = priceEl.textContent.replace(/\s+/g, ' ').trim();
          const match = priceText.match(/([\d\s.,]+\s*lei)/i);
          price = match ? match[1].trim() : priceText;
        }

        let shipping = null;
        const locationDateEl = card.querySelector('[data-testid="location-date"]');
        if (locationDateEl?.textContent) {
          shipping = locationDateEl.textContent.replace(/\s+/g, ' ').trim();
        }

        if (title && url) {
          results.push({ title, url, image, alt: title, price, shipping });
        }
      } catch (e) {
        console.warn('Parse error (OLX.ro):', e.message);
      }
    });

    return results;
  });
}

export async function extractOlxUaData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const listingCards = document.querySelectorAll('div[data-cy="l-card"], div[data-testid="l-card"]');

    const pickBestFromSrcset = (srcset) => {
      if (!srcset) return null;
      const candidates = srcset
        .split(',')
        .map((entry) => entry.trim().split(' ')[0])
        .filter(Boolean);
      return candidates.length ? candidates[candidates.length - 1] : null;
    };

    listingCards.forEach((card) => {
      try {
        const linkEl = card.querySelector('a[href*="/d/uk/obyavlenie/"]') || card.querySelector('a[href*="/d/obyavlenie/"]') || card.querySelector('a[href]');
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.olx.ua${href}`) : null;

        const titleEl = card.querySelector('[data-testid="ad-card-title"] h4') || card.querySelector('h4');
        const title = titleEl?.textContent?.trim() || null;

        const imgEl = card.querySelector('img');
        const image =
          pickBestFromSrcset(imgEl?.getAttribute('srcset')) ||
          pickBestFromSrcset(imgEl?.getAttribute('data-srcset')) ||
          imgEl?.getAttribute('src') ||
          imgEl?.getAttribute('data-src') ||
          null;

        let price = null;
        const priceEl = card.querySelector('[data-testid="ad-price"]');
        if (priceEl?.textContent) {
          const priceText = priceEl.textContent.replace(/\s+/g, ' ').trim();
          const match = priceText.match(/([\d\s.,]+\s*(?:грн\.?|₴))/i);
          price = match ? match[1].trim() : priceText;
        }

        let shipping = null;
        const locationDateEl = card.querySelector('[data-testid="location-date"]');
        if (locationDateEl?.textContent) {
          shipping = locationDateEl.textContent.replace(/\s+/g, ' ').trim();
        }

        if (title && url) {
          results.push({ title, url, image, alt: title, price, shipping });
        }
      } catch (e) {
        console.warn('Parse error (OLX.ua):', e.message);
      }
    });

    return results;
  });
}

export async function extractOlxBgData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const listingCards = document.querySelectorAll('div[data-cy="l-card"], div[data-testid="l-card"]');

    const pickBestFromSrcset = (srcset) => {
      if (!srcset) return null;
      const candidates = srcset
        .split(',')
        .map((entry) => entry.trim().split(' ')[0])
        .filter(Boolean);
      return candidates.length ? candidates[candidates.length - 1] : null;
    };

    listingCards.forEach((card) => {
      try {
        const linkEl = card.querySelector('a[href*="/d/ad/"]') || card.querySelector('a[href]');
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.olx.bg${href}`) : null;

        const titleEl = card.querySelector('[data-testid="ad-card-title"] h4') || card.querySelector('h4');
        const title = titleEl?.textContent?.trim() || null;

        const imgEl = card.querySelector('img');
        let image =
          pickBestFromSrcset(imgEl?.getAttribute('srcset')) ||
          pickBestFromSrcset(imgEl?.getAttribute('data-srcset')) ||
          imgEl?.getAttribute('src') ||
          imgEl?.getAttribute('data-src') ||
          null;

        let price = null;
        const priceEl = card.querySelector('[data-testid="ad-price"]');
        if (priceEl?.textContent) {
          const priceText = priceEl.textContent.replace(/\s+/g, ' ').trim();
          const match = priceText.match(/([\d\s.,]+\s*лв\.?)(?:\s*\/\s*[\d\s.,]+\s*€)?/i);
          price = match ? match[1].trim() : priceText;
        }

        let shipping = null;
        const locationDateEl = card.querySelector('[data-testid="location-date"]');
        if (locationDateEl?.textContent) {
          shipping = locationDateEl.textContent.replace(/\s+/g, ' ').trim();
        }

        if (title && url) {
          results.push({ title, url, image, alt: title, price, shipping });
        }
      } catch (e) {
        console.warn('Parse error (OLX.bg):', e.message);
      }
    });

    return results;
  });
}

export async function extractOlxKzData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const listingCards = document.querySelectorAll('div[data-cy="l-card"], div[data-testid="l-card"]');

    const pickBestFromSrcset = (srcset) => {
      if (!srcset) return null;
      const candidates = srcset
        .split(',')
        .map((entry) => entry.trim().split(' ')[0])
        .filter(Boolean);
      return candidates.length ? candidates[candidates.length - 1] : null;
    };

    listingCards.forEach((card) => {
      try {
        const linkEl = card.querySelector('a[href*="/d/obyavlenie/"]') || card.querySelector('a[href]');
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.olx.kz${href}`) : null;

        const titleEl = card.querySelector('[data-testid="ad-card-title"] h4') || card.querySelector('h4');
        const title = titleEl?.textContent?.trim() || null;

        const imgEl = card.querySelector('img');
        let image =
          pickBestFromSrcset(imgEl?.getAttribute('srcset')) ||
          pickBestFromSrcset(imgEl?.getAttribute('data-srcset')) ||
          imgEl?.getAttribute('src') ||
          imgEl?.getAttribute('data-src') ||
          null;

        let price = null;
        const priceEl = card.querySelector('[data-testid="ad-price"]');
        if (priceEl?.textContent) {
          const priceText = priceEl.textContent.replace(/\s+/g, ' ').trim();
          const match = priceText.match(/([\d\s.,]+\s*(?:тг\.?|₸))/i);
          price = match ? match[1].trim() : priceText;
        }

        let shipping = null;
        const locationDateEl = card.querySelector('[data-testid="location-date"]');
        if (locationDateEl?.textContent) {
          shipping = locationDateEl.textContent.replace(/\s+/g, ' ').trim();
        }

        if (title && url) {
          results.push({ title, url, image, alt: title, price, shipping });
        }
      } catch (e) {
        console.warn('Parse error (OLX.kz):', e.message);
      }
    });

    return results;
  });
}

export async function extractOlxBaData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const listingCards = document.querySelectorAll('div.cardd, div[class*="cardd"]');

    listingCards.forEach((card) => {
      try {
        const linkEl = card.querySelector('a[href*="/artikal/"]') || card.querySelector('a[href]');
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://olx.ba${href}`) : null;

        const titleEl = card.querySelector('h1.main-heading') || card.querySelector('h1') || card.querySelector('[class*="heading"]');
        const title = titleEl?.textContent?.trim() || null;

        let image = card.querySelector('.case-slider__image img')?.getAttribute('src') || card.querySelector('img')?.getAttribute('src') || null;
        if (!image) {
          image = card.querySelector('img')?.getAttribute('data-src') || null;
        }

        let price = null;
        const priceEl = card.querySelector('.price-wrap .smaller') || card.querySelector('[class*="price"] .smaller') || card.querySelector('[class*="price"]');
        if (priceEl?.textContent) {
          const text = priceEl.textContent.replace(/\s+/g, ' ').trim();
          const match = text.match(/([\d\s.,]+\s*KM)/i);
          price = match ? match[1].trim() : text;
        }

        let shipping = null;
        const timeEl = card.querySelector('.price-wrap .text-xs') || card.querySelector('.text-xs');
        if (timeEl?.textContent) {
          shipping = timeEl.textContent.replace(/\s+/g, ' ').trim();
        }

        if (title && url) {
          results.push({ title, url, image, alt: title, price, shipping });
        }
      } catch (e) {
        console.warn('Parse error (OLX.ba):', e.message);
      }
    });

    return results;
  });
}

export async function extractWillhabenData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    // Willhaben uses multiple container selectors
    const listingCards = document.querySelectorAll('div[id*="search-result-entry"], article[data-testid*="ad"], a[href*="/iad/kaufen-und-verkaufen/d/"]');

    listingCards.forEach((card) => {
      try {
        // URL from link element
        let linkEl = card;
        if (card.tagName !== 'A') {
          linkEl = card.querySelector('a[href*="/iad/kaufen-und-verkaufen/d/"]');
        }
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.willhaben.at${href}`) : null;

        // Title from h3 element
        const titleEl = card.querySelector('h3') || (card.tagName === 'A' ? card.querySelector('h3') : null);
        const title = titleEl?.textContent?.trim();

        // Image
        let image = card.querySelector('img')?.getAttribute('src');
        if (!image) {
          image = card.querySelector('img')?.getAttribute('data-src');
        }

        // Price from span with data-testid="search-result-entry-price-*" or aria-label
        let price = null;
        const priceEl = card.querySelector('[data-testid*="search-result-entry-price"], span[aria-label*="€"]');
        if (priceEl) {
          const ariaLabel = priceEl.getAttribute('aria-label');
          price = ariaLabel || priceEl.textContent.trim();
        }

        // Date from p element with aria-label containing "veröffentlicht"
        let date = null;
        const dateEl = card.querySelector('p[aria-label*="veröffentlicht"]');
        if (dateEl) {
          const ariaLabel = dateEl.getAttribute('aria-label');
          date = ariaLabel ? ariaLabel.replace('veröffentlicht ', '') : dateEl.textContent.trim();
        }

        // Location from span with aria-label containing "Wird verkauft in"
        let location = null;
        const locationEl = card.querySelector('[data-testid*="search-result-entry-subheader"] span, span[aria-label*="Wird verkauft in"]');
        if (locationEl) {
          const ariaLabel = locationEl.getAttribute('aria-label');
          location = ariaLabel ? ariaLabel.replace('Wird verkauft in ', '') : locationEl.textContent.trim();
        }

        if (title && url) {
          results.push({ 
            title, 
            url, 
            image, 
            alt: title, 
            price: price || 'N/A', 
            shipping: location || date || null 
          });
        }
      } catch (e) {
        console.warn('Parse error:', e.message);
      }
    });

    return results;
  });
}

export async function extractDbaData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('article.sf-search-ad, article[class*="sf-search-ad"]');

    cards.forEach((card) => {
      try {
        const linkEl =
          card.querySelector('a.sf-search-ad-link[href*="/recommerce/forsale/item/"]') ||
          card.querySelector('h2 a[href*="/recommerce/forsale/item/"]') ||
          card.querySelector('a[href*="/recommerce/forsale/item/"]');

        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.dba.dk${href}`) : null;

        const titleEl = card.querySelector('h2') || card.querySelector('[id^="search-ad-"]');
        const title = titleEl?.textContent?.replace(/\s+/g, ' ').trim() || null;

        let image = card.querySelector('img')?.getAttribute('src') || null;
        if (!image) {
          const srcset = card.querySelector('img')?.getAttribute('srcset');
          if (srcset) {
            const candidates = srcset
              .split(',')
              .map((entry) => entry.trim().split(' ')[0])
              .filter(Boolean);
            image = candidates.length ? candidates[candidates.length - 1] : null;
          }
        }

        let price = null;
        const priceEl = card.querySelector('span');
        if (priceEl?.textContent) {
          const priceText = priceEl.textContent.replace(/\s+/g, ' ').trim();
          const match = priceText.match(/([\d\s.,]+\s*kr\.?)/i);
          if (match) price = match[1].trim();
        }

        const locationEl = card.querySelector('div.text-xs span:first-child');
        const dateEl = card.querySelector('div.text-xs span:last-child');
        const location = locationEl?.textContent?.replace(/\s+/g, ' ').trim() || null;
        const date = dateEl?.textContent?.replace(/\s+/g, ' ').trim() || null;
        const shipping = [location, date].filter(Boolean).join(' • ') || null;

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (e) {
        console.warn('Parse error (DBA.dk):', e.message);
      }
    });

    return results;
  });
}

export function extractWallapopData(page) {
  return page.evaluate(() => {
    const results = [];
    const selector = 'a[href*="/item/"]';
    const items = document.querySelectorAll(selector);

    items.forEach((item) => {
      try {
        // Title from aria-label or title attribute
        const title = item.getAttribute('aria-label') || item.getAttribute('title') || '';
        
        // First image
        const imgEl = item.querySelector('img');
        const image = imgEl ? imgEl.src : '';
        
        // Price from strong element
        const priceEl = item.querySelector('strong[aria-label="Item price"], strong.item-card_ItemCard__price');
        let price = priceEl ? priceEl.textContent.trim() : '';
        // Remove &nbsp; and normalize spaces
        price = price.replace(/\s+/g, ' ').trim();
        
        // URL
        const url = item.href || '';
        
        // Shipping: look for wallapop-badge with shipping text
        const shippingBadge = item.querySelector('wallapop-badge[badge-type="shippingAvailable"]');
        const shipping = shippingBadge ? shippingBadge.getAttribute('text') || 'Envío disponible' : '';

        if (title && url) {
          results.push({
            title: title.trim(),
            price: price || 'N/A',
            image: image || '',
            url: url.startsWith('http') ? url : `https://es.wallapop.com${url}`,
            shipping: shipping || ''
          });
        }
      } catch (err) {
        console.error('Error extracting Wallapop item:', err);
      }
    });

    return results;
  });
}

export async function extractVendoraData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('div.grid-items-col a.card-product, a.card.vCard.card-product');

    cards.forEach((card) => {
      try {
        const href = card.getAttribute('href');
        const url = href
          ? (href.startsWith('http') ? href : `https://vendora.cy${href}`)
          : null;

        const titleEl = card.querySelector('p.title .body-m, p.title span.body-m, p.title, .title');
        const title = titleEl?.textContent?.trim() || null;

        let image = card.querySelector('.card-img img')?.getAttribute('src') || null;
        if (!image) {
          const sourceEl = card.querySelector('.card-img source[srcset], source[srcset]');
          if (sourceEl) {
            const srcset = sourceEl.getAttribute('srcset');
            image = srcset?.split(',')[0]?.trim()?.split(' ')[0] || null;
          }
        }

        let price = null;
        const priceEl = card.querySelector('p.subtitle .label-l, .subtitle .label-l, .subtitle');
        if (priceEl?.textContent) {
          price = priceEl.textContent.replace(/\s+/g, ' ').trim();
        }

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping: null,
          });
        }
      } catch (err) {
        console.warn('Error extracting Vendora ad data:', err.message);
      }
    });

    return results;
  });
}

export async function extractGumtreeData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const adElements = document.querySelectorAll('a[href*="/s-ad/"]');

    adElements.forEach(ad => {
      try {
        // Extract title
        const titleEl = ad.querySelector('.user-ad-row-new-design__title-span') || ad.querySelector('[class*="title"]');
        const title = titleEl
          ? titleEl.textContent.trim()
          : (ad.getAttribute('aria-label')?.split('Price:')?.[0]?.trim() || null);

        // Extract URL (href is relative, need to prepend base URL)
        const relativeUrl = ad.getAttribute('href');
        const url = relativeUrl
          ? (relativeUrl.startsWith('http') ? relativeUrl : `https://www.gumtree.com.au${relativeUrl}`)
          : null;

        // Extract image
        const imgEl = ad.querySelector('.user-ad-image__thumbnail');
        const image = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-src')) : null;

        // Extract price
        const priceEl = ad.querySelector('.user-ad-price-new-design__price');
        const price = priceEl ? priceEl.textContent.trim() : null;

        // Extract location
        const locationEl = ad.querySelector('.user-ad-row-new-design__location');
        const location = locationEl ? locationEl.textContent.trim() : null;

        // Only add if we have at least title and url
        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping: location || null
          });
        }
      } catch (err) {
        console.warn('Error extracting Gumtree ad data:', err.message);
      }
    });

    return results;
  });
}

export async function extractGumtreeUkData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('article[data-q="search-result"]');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();

    cards.forEach((card) => {
      try {
        const linkEl = card.querySelector('a[data-q="search-result-anchor"]') || card.querySelector('a[href]');
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.gumtree.com${href}`) : null;

        const titleEl = card.querySelector('[data-q="tile-title"]');
        const title = cleanText(titleEl?.textContent) || null;

        const imgEl = card.querySelector('figure img') || card.querySelector('img');
        const image = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || null;

        let price = null;
        const priceEl = card.querySelector('[data-q="tile-price"], [data-testid="price"]');
        if (priceEl?.textContent) {
          price = cleanText(priceEl.textContent);
        }

        let shipping = null;
        const locationEl = card.querySelector('[data-q="tile-location"]');
        if (locationEl?.textContent) {
          shipping = cleanText(locationEl.textContent);
        }

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting Gumtree UK ad data:', err.message);
      }
    });

    return results;
  });
}

export async function extractKufarData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const adLinks = document.querySelectorAll('section > a[data-testid="kufar-ad"]');

    adLinks.forEach((linkEl) => {
      try {
        // URL from the link href
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.kufar.by${href}`) : null;

        // Title from h3.styles_title__F3uIe
        const titleEl = linkEl.querySelector('h3.styles_title__F3uIe');
        const title = titleEl?.textContent?.trim();

        // Price from p.styles_price__aVxZc > span
        let price = null;
        const priceEl = linkEl.querySelector('p.styles_price__aVxZc span');
        if (priceEl?.textContent) {
          price = priceEl.textContent.trim();
        }

        // Image from img.styles_image__ZPJzx
        let image = linkEl.querySelector('img.styles_image__ZPJzx')?.getAttribute('src');

        // Location from p.styles_region__qCRbf
        let location = null;
        const locationEl = linkEl.querySelector('p.styles_region__qCRbf');
        if (locationEl?.textContent) {
          location = locationEl.textContent.trim();
        }

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping: location || null
          });
        }
      } catch (err) {
        console.warn('Error extracting Kufar ad data:', err.message);
      }
    });

    return results;
  });
}

export async function extractOstaData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const listingCards = document.querySelectorAll('li.col-md-3.mb-custom-thumb-fancy');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();

    const toAbsoluteUrl = (href) => {
      if (!href) return null;
      return href.startsWith('http') ? href : `https://osta.ee${href}`;
    };

    const pickImageFromStyle = (styleText) => {
      if (!styleText) return null;
      const match = styleText.match(/url\(["']?(.*?)["']?\)/i);
      return match?.[1] || null;
    };

    listingCards.forEach((card) => {
      try {
        const titleEl =
          card.querySelector('h3.offer-thumb__title a') ||
          card.querySelector('a.offer-thumb__link--anchor') ||
          card.querySelector('a[href]');
        const title = cleanText(titleEl?.textContent || titleEl?.getAttribute('title') || card.getAttribute('data-title')) || null;

        const href = titleEl?.getAttribute('href') || card.querySelector('a[href]')?.getAttribute('href');
        const url = toAbsoluteUrl(href);

        const imageLink = card.querySelector('a.offer-thumb__link') || card.querySelector('figure.offer-thumb__image a[href]');
        const imgEl = card.querySelector('img');
        let image =
          imgEl?.getAttribute('src') ||
          imgEl?.getAttribute('data-original') ||
          pickImageFromStyle(imageLink?.getAttribute('style')) ||
          pickImageFromStyle(card.querySelector('figure.offer-thumb__image')?.getAttribute('style')) ||
          null;

        let price = null;
        const dataPrice = card.querySelector('figure.offer-thumb')?.getAttribute('data-price') || card.querySelector('figure.offer-thumb__fancy')?.getAttribute('data-price');
        const currentPriceEl = card.querySelector('.offer-thumb__price--current');
        const buyNowPriceEl = card.querySelector('.buynow-brand-price');

        if (dataPrice) {
          price = `${cleanText(dataPrice)}€`;
        } else if (currentPriceEl?.textContent) {
          const normalized = cleanText(currentPriceEl.textContent);
          const match = normalized.match(/([\d\s.,]+\s*€)/);
          price = match ? match[1].trim() : normalized;
        } else if (buyNowPriceEl?.textContent) {
          const normalized = cleanText(buyNowPriceEl.textContent);
          const match = normalized.match(/([\d\s.,]+\s*€)/);
          price = match ? match[1].trim() : normalized;
        }

        let shipping = null;
        const timeLeftEl = card.querySelector('.offer-thumb__metadata--item.timeleft span') || card.querySelector('.timeleft span');
        if (timeLeftEl?.textContent) {
          shipping = cleanText(timeLeftEl.textContent);
        }

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting Osta.ee item:', err.message);
      }
    });

    return results;
  });
}

export async function extractHuutoData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('a[href*="/kohteet/"]');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();

    cards.forEach((linkEl) => {
      try {
        const href = linkEl.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.huuto.net${href}`) : null;

        const titleEl = linkEl.querySelector('h2');
        const title = cleanText(titleEl?.textContent) || null;

        const imgEl = linkEl.querySelector('img');
        let image =
          imgEl?.getAttribute('src') ||
          imgEl?.getAttribute('data-src') ||
          null;

        let price = null;
        const priceEl = Array.from(linkEl.querySelectorAll('span')).find((el) => el.textContent?.includes('€'));
        if (priceEl?.textContent) {
          price = cleanText(priceEl.textContent);
        }

        let shipping = null;
        const locationEl = linkEl.querySelector('span.mt-1.truncate');
        if (locationEl?.textContent) {
          shipping = cleanText(locationEl.textContent);
        }

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting Huuto item:', err.message);
      }
    });

    return results;
  });
}

export async function extractJofogasData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('[data-testid="ad-card-general"]');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();

    cards.forEach((card) => {
      try {
        const linkEl = card.querySelector('a[href*="jofogas.hu/"]') || card.querySelector('a[href]');
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://www.jofogas.hu${href}`) : null;

        const titleEl = linkEl?.querySelector('h5') || card.querySelector('h5');
        const title = cleanText(titleEl?.textContent) || null;

        const imgEl = card.querySelector('a img') || card.querySelector('img');
        const image = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || null;

        let price = null;
        const priceBlock = Array.from(card.querySelectorAll('h3, h6, span, p'))
          .map((el) => cleanText(el.textContent))
          .filter(Boolean)
          .find((text) => /Ft\b/i.test(text) || /^\d+[\d\s.,]*$/.test(text));

        if (priceBlock) {
          const valueMatch = priceBlock.match(/([\d\s.,]+)/);
          const suffixMatch = priceBlock.match(/Ft\b/i);
          if (valueMatch) {
            price = `${valueMatch[1].trim()}${suffixMatch ? ' Ft' : ''}`.trim();
          } else {
            price = priceBlock;
          }
        }

        const bodyTexts = Array.from(card.querySelectorAll('p'))
          .map((el) => cleanText(el.textContent))
          .filter(Boolean);

        let shipping = null;
        if (bodyTexts.length >= 2) {
          const location = bodyTexts[bodyTexts.length - 2];
          const date = bodyTexts[bodyTexts.length - 1];
          shipping = [location, date].filter(Boolean).join(' • ') || null;
        }

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting Jofogas item:', err.message);
      }
    });

    return results;
  });
}

export async function extractBlandData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('div.classifiedentry');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();

    const pickBackgroundImage = (styleText) => {
      if (!styleText) return null;
      const match = styleText.match(/url\(['"]?(.*?)['"]?\)/i);
      return match?.[1] || null;
    };

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://bland.is${value}`;
      return value;
    };

    const firstNonEmpty = (...values) => values.find((value) => Boolean(value)) || null;

    cards.forEach((card) => {
      try {
        const linkEl = card.querySelector('a.clickEntry[href]') || card.querySelector('h3 a[href]') || card.querySelector('a[href]');
        const href = linkEl?.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://bland.is${href}`) : null;

        const titleEl = card.querySelector('h3 a.clickEntry') || card.querySelector('h3 a') || card.querySelector('h3');
        const title = cleanText(titleEl?.textContent || titleEl?.getAttribute('title')) || null;

        const imgEl = card.querySelector('.classifiedImage img') || card.querySelector('img');
        const previewLink = card.querySelector('a.filesPreview');
        const thumbEl = card.querySelector('.thumbimg');
        const srcset = imgEl?.getAttribute('srcset') || imgEl?.getAttribute('data-srcset');
        const bestFromSrcset = srcset
          ? srcset
              .split(',')
              .map((entry) => entry.trim().split(' ')[0])
              .filter(Boolean)
              .pop()
          : null;
        const image = normalizeUrl(
          firstNonEmpty(
            imgEl?.getAttribute('src'),
            imgEl?.getAttribute('data-src'),
            bestFromSrcset,
            previewLink?.getAttribute('data-cover'),
            previewLink?.getAttribute('data-images'),
            pickBackgroundImage(thumbEl?.getAttribute('style')),
            pickBackgroundImage(previewLink?.getAttribute('style')),
          )
        );

        let price = null;
        const priceEl = card.querySelector('.priceRight .orangeText') || card.querySelector('.priceRight p');
        if (priceEl?.textContent) {
          price = cleanText(priceEl.textContent);
        }

        const addressEl = card.querySelector('.classifiedAddress a') || card.querySelector('.classifiedAddress');
        const dateEl = card.querySelector('#galleryClassifiedDate') || card.querySelector('.dateSeparator + span');
        const location = cleanText(addressEl?.textContent) || null;
        const date = cleanText(dateEl?.textContent) || null;
        const shipping = [location, date].filter(Boolean).join(' • ') || null;

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting Bland item:', err.message);
      }
    });

    return results;
  });
}

export async function extractSubitoData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('article.index-module_card__dW0sY, article');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      return `https://www.subito.it${value}`;
    };

    const pickFromSrcset = (srcset) => {
      if (!srcset) return null;
      const candidates = srcset
        .split(',')
        .map((entry) => entry.trim().split(' ')[0])
        .filter(Boolean);
      return candidates.length ? candidates[0] : null;
    };

    cards.forEach((card) => {
      try {
        const linkEl = card.querySelector('a.index-module_link__onvFH[href]') || card.querySelector('a[href*="subito.it/"]') || card.querySelector('a[href]');
        const href = linkEl?.getAttribute('href');
        const url = normalizeUrl(href);
        const imageScope = linkEl || card;

        const titleEl = card.querySelector('h3.index-module_subject__m4Sp9') || card.querySelector('h3') || card.querySelector('[class*="subject"]');
        const title = cleanText(titleEl?.textContent || titleEl?.getAttribute('title')) || null;

        const imgEl = card.querySelector('img.index-module_image__2sWAS') || card.querySelector('img');
        const image =
          pickFromSrcset(imgEl?.getAttribute('srcset')) ||
          imgEl?.getAttribute('src') ||
          imgEl?.getAttribute('data-src') ||
          null;

        let price = null;
        const priceEl = card.querySelector('p.index-module_price__Fc9-u') || card.querySelector('[class*="price"]');
        if (priceEl?.textContent) {
          price = cleanText(priceEl.textContent);
        }

        let shipping = null;
        const shippingEl = card.querySelector('svg[role="img"] title, title');
        if (shippingEl?.textContent) {
          shipping = cleanText(shippingEl.textContent);
        }
        if (!shipping) {
          const locationEl = card.querySelector('span.index-module_location__vLPWy, .index-module_location__vLPWy');
          const location = cleanText(locationEl?.textContent) || null;
          if (location) {
            shipping = location;
          }
        }

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting Subito item:', err.message);
      }
    });

    return results;
  });
}

export async function extractDoneDealData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('li[data-testid^="listing-card-index-"], li[data-testid*="listing-card"]');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const seenUrls = new Set();

    const extractFromContainer = (container) => {
      const linkEl = container.querySelector('a[href]');
      const href = linkEl?.getAttribute('href');
      const url = href
        ? (href.startsWith('http') ? href : `https://www.donedeal.ie${href}`)
        : null;

      if (!url || seenUrls.has(url)) {
        return null;
      }

      const titleEl =
        container.querySelector('[data-testid="card-title"]') ||
        container.querySelector('p[class*="SearchCardstyled__Title"]') ||
        container.querySelector('h2, h3, p');
      const title = cleanText(titleEl?.textContent) || null;

      const imgEl = container.querySelector('img');
      const image =
        imgEl?.getAttribute('src') ||
        imgEl?.getAttribute('data-src') ||
        null;

      let price = null;
      const priceEl =
        container.querySelector('[data-testid="card-price"]') ||
        container.querySelector('div[class*="Pricestyled__Price"]') ||
        container.querySelector('div[class*="Price"]');
      if (priceEl?.textContent) {
        const m = cleanText(priceEl.textContent).match(/€\s*[\d.,]+/);
        price = m ? m[0] : cleanText(priceEl.textContent);
      }

      let shipping = null;
      const metaItems = Array.from(container.querySelectorAll('ul li'))
        .map((el) => cleanText(el.textContent))
        .filter(Boolean);
      if (metaItems.length > 0) {
        shipping = metaItems.slice(0, 2).join(' • ');
      }

      if (!title) {
        return null;
      }

      seenUrls.add(url);
      return {
        title,
        url,
        image,
        alt: title,
        price,
        shipping,
      };
    };

    cards.forEach((card) => {
      try {
        const item = extractFromContainer(card);
        if (item) {
          results.push(item);
        }
      } catch (err) {
        console.warn('Error extracting DoneDeal item:', err.message);
      }
    });

    // Fallback: if list-item wrappers are missing, parse directly from listing links.
    if (results.length === 0) {
      const links = document.querySelectorAll('a[href*="/games-for-sale/"], a[href*="/for-sale/"]');
      links.forEach((link) => {
        try {
          const container = link.closest('li') || link.closest('article') || link.parentElement;
          if (!container) {
            return;
          }
          const item = extractFromContainer(container);
          if (item) {
            results.push(item);
          }
        } catch (err) {
          console.warn('Error extracting DoneDeal fallback item:', err.message);
        }
      });
    }

    return results;
  });
}

export async function extractMyMarketData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const links = document.querySelectorAll('a[href*="/pr/"]');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();

    links.forEach((linkEl) => {
      try {
        const card =
          linkEl.querySelector('article[data-testid="product-card"]') ||
          linkEl.closest('article[data-testid="product-card"]') ||
          linkEl;

        const href = linkEl.getAttribute('href');
        const url = href ? (href.startsWith('http') ? href : `https://mymarket.ge${href}`) : null;

        const titleEl = card.querySelector('[data-testid="productcard-title"]');
        const title = cleanText(titleEl?.textContent) || null;

        const imageEl = card.querySelector('img');
        const image = imageEl?.getAttribute('src') || imageEl?.getAttribute('data-src') || null;

        const priceEl = card.querySelector('[data-testid="productcard-price"]');
        const price = priceEl?.textContent ? cleanText(priceEl.textContent) : null;

        const sellerEl = card.querySelector('[data-testid="seller-name"]');
        const shipping = sellerEl?.textContent ? cleanText(sellerEl.textContent) : null;

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting MyMarket item:', err.message);
      }
    });

    return results;
  });
}

export async function extractNjuskaloData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('li.EntityList-item article.entity-body');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();

    cards.forEach((card) => {
      try {
        const linkEl = card.querySelector('h3.entity-title a.link') || card.querySelector('a.link[href]');
        const href = linkEl?.getAttribute('href') || linkEl?.getAttribute('data-href');
        const url = href ? (href.startsWith('http') ? href : `https://www.njuskalo.hr${href}`) : null;

        const title = cleanText(linkEl?.textContent) || null;

        const imgEl = card.querySelector('.entity-thumbnail img') || card.querySelector('img');
        const image = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || null;

        let price = null;
        const priceEl = card.querySelector('.entity-prices .price, strong.price');
        if (priceEl?.textContent) {
          price = cleanText(priceEl.textContent);
        }

        const locationText = cleanText(card.querySelector('.entity-description')?.textContent || '').replace(/^Lokacija:\s*/i, '');
        const dateText = cleanText(card.querySelector('.entity-pub-date time')?.textContent || '');
        const shipping = [locationText || null, dateText || null].filter(Boolean).join(' • ') || null;

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting Njuskalo item:', err.message);
      }
    });

    return results;
  });
}

export async function extractKupujemProdajemData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('section.AdItem_adOuterHolder__hb5N_, section[id][data-scrolled]');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://www.kupujemprodajem.com${value}`;
      return value;
    };

    cards.forEach((card) => {
      try {
        const titleLink =
          card.querySelector('a[href*="/oglas/"] .AdItem_name__iOZvA')?.closest('a[href]') ||
          card.querySelector('a[href*="/oglas/"]');

        const href = titleLink?.getAttribute('href');
        const url = normalizeUrl(href);

        const title =
          cleanText(card.querySelector('.AdItem_name__iOZvA')?.textContent) ||
          cleanText(titleLink?.textContent) ||
          null;

        const imgEl = card.querySelector('.AdItem_imageHolder__ropiU img') || card.querySelector('img');
        const image =
          normalizeUrl(imgEl?.getAttribute('src')) ||
          normalizeUrl(imgEl?.getAttribute('data-src')) ||
          null;

        let price = null;
        const priceEl = card.querySelector('.AdItem_price__VZ_at, .AdItem_adPrice__18aqn, [class*="AdItem_price"]');
        if (priceEl?.textContent) {
          const priceText = cleanText(priceEl.textContent);
          const match = priceText.match(/([\d\s.,]+\s*din)/i);
          price = match ? cleanText(match[1]) : priceText;
        }

        const location = cleanText(card.querySelector('.AdItem_originAndPromoLocation__rQvKl p')?.textContent);
        const posted = cleanText(card.querySelector('.AdItem_postedStatus__4y6Ca p, [class*="postedStatus"] p')?.textContent);
        const shipping = [location || null, posted || null].filter(Boolean).join(' • ') || null;

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting KupujemProdajem item:', err.message);
      }
    });

    return results;
  });
}

export async function extractTraderaData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('div[id^="item-card-"][data-item-loaded="true"], div[id^="item-card-"][data-item-type], .item-card-module-scss-module__IIyH5q__itemCard');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://www.tradera.com${value}`;
      return value;
    };

    const pickBestFromSrcset = (srcset) => {
      if (!srcset) return null;
      const candidates = srcset
        .split(',')
        .map((entry) => entry.trim().split(' ')[0])
        .filter(Boolean);
      return candidates.length ? candidates[candidates.length - 1] : null;
    };

    const pickFromBgImage = (styleValue) => {
      if (!styleValue) return null;
      const match = styleValue.match(/url\(["']?([^"')]+)["']?\)/i);
      return match?.[1] || null;
    };

    cards.forEach((card) => {
      try {
        const itemLinks = Array.from(card.querySelectorAll('a[href*="/item/"]'));
        const linkEl =
          itemLinks.find((el) => el.getAttribute('title')) ||
          itemLinks.find((el) => cleanText(el.textContent)) ||
          itemLinks[0] ||
          null;

        const href =
          linkEl?.getAttribute('href') ||
          itemLinks[0]?.getAttribute('href') ||
          null;
        const url = normalizeUrl(href);
        const imageScope = linkEl || card;

        const title =
          cleanText(linkEl?.getAttribute('title')) ||
          cleanText(linkEl?.getAttribute('aria-label')) ||
          cleanText(linkEl?.textContent) ||
          cleanText(card.querySelector('a[href*="/item/"][aria-label]')?.getAttribute('aria-label')) ||
          cleanText(card.querySelector('a[href*="/item/"]')?.textContent) ||
          null;

        const sourceEl =
          imageScope.querySelector('picture source[srcset]') ||
          card.querySelector('picture source[srcset]');

        const imgEl =
          imageScope.querySelector('picture img') ||
          imageScope.querySelector('img') ||
          card.querySelector('picture img') ||
          card.querySelector('img');

        const secondaryImageDiv =
          imageScope.querySelector('[class*="secondaryImage"][style]') ||
          card.querySelector('[class*="secondaryImage"][style]') ||
          card.querySelector('div[style*="background-image"]');

        const image =
          normalizeUrl(pickBestFromSrcset(sourceEl?.getAttribute('srcset'))) ||
          normalizeUrl(pickBestFromSrcset(imgEl?.getAttribute('srcset'))) ||
          normalizeUrl(imgEl?.getAttribute('data-src')) ||
          normalizeUrl(imgEl?.getAttribute('src')) ||
          normalizeUrl(pickFromBgImage(secondaryImageDiv?.getAttribute('style'))) ||
          null;

        let price = null;
        const priceEl = card.querySelector('[data-testid="price"]');
        if (priceEl?.textContent) {
          const priceText = cleanText(priceEl.textContent);
          const match = priceText.match(/([\d\s.,]+\s*kr)/i);
          price = match ? cleanText(match[1]) : priceText;
        }

        const listingType = cleanText(card.querySelector('[data-testid="fixedPriceLabel"]')?.textContent);
        const shipping = listingType || null;

        if (url) {
          results.push({
            title: title || url,
            url,
            image,
            alt: title || url,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting Tradera item:', err.message);
      }
    });

    return results;
  });
}

export async function extractSkelbIUData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const links = document.querySelectorAll('a.js-cfuser-link.standard-list-item, a.standard-list-item');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://www.skelbiu.lt${value}`;
      return value;
    };

    links.forEach((linkEl) => {
      try {
        // URL from link href
        const href = linkEl.getAttribute('href');
        const url = normalizeUrl(href);

        // Title from div.collapsed-info > div.title
        const titleEl = linkEl.querySelector('div.collapsed-info > div.title');
        const title = titleEl ? cleanText(titleEl.textContent) : null;

        // Image from div.extended-info > div.img-block > div.wrapper > img
        let image = null;
        const imgEl = linkEl.querySelector('div.extended-info div.img-block img');
        if (imgEl) {
          image = normalizeUrl(imgEl.getAttribute('src'));
        }

        // Price from div.collapsed-info > div.price-item > div.price
        let price = null;
        const priceEl = linkEl.querySelector('div.collapsed-info div.price-item div.price');
        if (priceEl?.textContent) {
          price = cleanText(priceEl.textContent);
        }

        // Shipping/Location from div.collapsed-info > div.second-line
        let shipping = null;
        const locationEl = linkEl.querySelector('div.collapsed-info div.second-line');
        if (locationEl?.textContent) {
          shipping = cleanText(locationEl.textContent);
        }

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting Skelbiu item:', err.message);
      }
    });

    return results;
  });
}

export async function extractSsLvData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const rows = document.querySelectorAll('tr[id^="tr_"]');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://www.ss.lv${value}`;
      return value;
    };

    rows.forEach((row) => {
      try {
        // Get all <td> elements (0: checkbox, 1: image, 2: title/desc, 3: price)
        const tds = row.querySelectorAll('td');
        if (tds.length < 4) return;

        // Title from a.am within div.d1 (second <a> from title cell)
        const titleCell = tds[2];
        const titleEl = titleCell?.querySelector('div.d1 a.am');
        const title = titleEl ? cleanText(titleEl.textContent) : null;

        // URL from a.am href
        const href = titleEl?.getAttribute('href');
        const url = normalizeUrl(href);

        // Image from img.isfoto in image cell (second <td>)
        const imageCell = tds[1];
        let image = null;
        const imgEl = imageCell?.querySelector('img.isfoto');
        if (imgEl) {
          image = normalizeUrl(imgEl.getAttribute('src'));
        }

        // Price from a.amopt in price cell (fourth <td>)
        const priceCell = tds[3];
        let price = null;
        const priceEl = priceCell?.querySelector('a.amopt');
        if (priceEl?.textContent) {
          price = cleanText(priceEl.textContent);
        }

        // Category from div.ads_cat_names
        let shipping = null;
        const catEl = titleCell?.querySelector('div.ads_cat_names');
        if (catEl?.textContent) {
          shipping = cleanText(catEl.textContent);
        }

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting SS.lv item:', err.message);
      }
    });

    return results;
  });
}

export async function extractPazar3Data(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('div.new.row.row-listing');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').trim();

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://www.pazar3.mk${value}`;
      return value;
    };

    cards.forEach((card) => {
      try {
        const titleEl =
          card.querySelector('h2 a.Link_vis[href]') ||
          card.querySelector('a.Link_vis[href]') ||
          card.querySelector('h2 a[href]');

        const title = cleanText(
          titleEl?.getAttribute('title') || titleEl?.textContent
        ) || null;

        const href = titleEl?.getAttribute('href');
        const url = normalizeUrl(href);

        const imgEl =
          card.querySelector('img.ProductionImg') ||
          card.querySelector('.img-col img') ||
          card.querySelector('img');
        const image =
          normalizeUrl(imgEl?.getAttribute('data-src')) ||
          normalizeUrl(imgEl?.getAttribute('src')) ||
          null;

        let price = null;
        const priceEl = card.querySelector('p.list-price');
        if (priceEl?.textContent) {
          price = cleanText(priceEl.textContent);
        }

        let shipping = null;
        const dateEl = card.querySelector('.title .pull-right');
        if (dateEl?.textContent) {
          shipping = cleanText(dateEl.textContent);
        }

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting Pazar3 item:', err.message);
      }
    });

    return results;
  });
}

export async function extractMerrjepAlData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('div.new.row.row-listing[data-product-id]');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://${window.location.hostname}${value}`;
      return value;
    };

    cards.forEach((card) => {
      try {
        const titleEl =
          card.querySelector('h2 a.Link_vis[href]') ||
          card.querySelector('a.Link_vis[href]') ||
          card.querySelector('h2 a[href*="/njoftim/"]') ||
          card.querySelector('a[href*="/njoftim/"]');

        const title = cleanText(titleEl?.getAttribute('title') || titleEl?.textContent) || null;
        const href = titleEl?.getAttribute('href');
        const url = normalizeUrl(href);

        const imgEl =
          card.querySelector('.span2-ad-img-list img') ||
          card.querySelector('img');
        const image =
          normalizeUrl(imgEl?.getAttribute('data-src')) ||
          normalizeUrl(imgEl?.getAttribute('src')) ||
          null;

        let price = null;
        const priceEl = card.querySelector('p.list-price');
        if (priceEl?.textContent) {
          price = cleanText(priceEl.textContent);
        }

        const locationEl = card.querySelector('.title a[href^="/njoftime/"]') || card.querySelector('.title a[href*="/q-"]');
        const dateEl = card.querySelector('.title .pull-right');
        const location = cleanText(locationEl?.textContent) || null;
        const date = cleanText(dateEl?.textContent) || null;
        const shipping = [location, date].filter(Boolean).join(' • ') || null;

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting Merrjep.al item:', err.message);
      }
    });

    return results;
  });
}

export async function extractListAmData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('a.fav-item-info-container');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://www.list.am${value}`;
      return value;
    };

    cards.forEach((card) => {
      try {
        const href = card.getAttribute('href') || card.querySelector('a[href]')?.getAttribute('href');
        const url = normalizeUrl(href);

        const titleEl = card.querySelector('.dltitle .pt');
        const title = cleanText(titleEl?.textContent) || null;

        const imgEl = card.querySelector('img');
        const image =
          normalizeUrl(imgEl?.getAttribute('data-original')) ||
          normalizeUrl(imgEl?.getAttribute('src')) ||
          null;

        let price = null;
        const priceEl = card.querySelector('.ad-info-line-wrapper .p');
        if (priceEl?.textContent) {
          price = cleanText(priceEl.textContent);
        }

        const locationEl = card.querySelector('.at');
        const categoryEl = card.querySelector('.c');
        const dateEl = card.querySelector('.d');
        const shipping = [
          cleanText(locationEl?.textContent) || null,
          cleanText(categoryEl?.textContent) || null,
          cleanText(dateEl?.textContent) || null,
        ].filter(Boolean).join(' • ') || null;

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting List.am item:', err.message);
      }
    });

    return results;
  });
}

export async function extract999MdData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('a.styles_advert__photo__link__SnL_t[href^="/ro/"]');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://999.md${value}`;
      return value;
    };

    const pickImageFromStyle = (styleText) => {
      if (!styleText) return null;
      const match = styleText.match(/url\(["']?(.*?)["']?\)/i);
      return match?.[1] || null;
    };

    cards.forEach((card) => {
      try {
        const href = card.getAttribute('href');
        if (!href || !/^\/ro\/\d+/.test(href)) {
          return;
        }

        // Skip sponsored/boosted cards (slick carousel + booster markers)
        const isSponsored = Boolean(
          card.querySelector(
            '.styles_animation__01Hnw, .slick-slider, .icon-rd-booster, [data-testid="add-booster-ad-favorites"]'
          )
        );
        if (isSponsored) {
          return;
        }

        const url = normalizeUrl(href);

        const titleEl = card.querySelector('h4');
        const title = cleanText(titleEl?.textContent) || null;

        const imageStyleEl = card.querySelector('.styles_image__EyfwD[style]');
        const imageFromStyle = pickImageFromStyle(imageStyleEl?.getAttribute('style'));
        const imgEl = card.querySelector('img');
        const image =
          normalizeUrl(imageFromStyle) ||
          normalizeUrl(imgEl?.getAttribute('data-src')) ||
          normalizeUrl(imgEl?.getAttribute('src')) ||
          null;

        let price = null;
        const priceEl = card.querySelector('.styles_price__text__VPLPL');
        if (priceEl?.textContent) {
          price = cleanText(priceEl.textContent);
        }

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping: null,
          });
        }
      } catch (err) {
        console.warn('Error extracting 999.md item:', err.message);
      }
    });

    return results;
  });
}

export async function extractClickMonacoData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('div.background-ads-listing-container');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://www.clickmonaco.com${value}`;
      return value;
    };

    cards.forEach((card) => {
      try {
        const linkEl =
          card.querySelector('a.content-block-listing[href]') ||
          card.querySelector('a.picture-block-listing[href]') ||
          card.querySelector('a[href*="/annonce/"]');

        const href = linkEl?.getAttribute('href');
        const url = normalizeUrl(href);

        const titleEl = card.querySelector('p.title-listing');
        const title = cleanText(titleEl?.textContent) || null;

        const imgEl = card.querySelector('a.picture-block-listing img') || card.querySelector('img');
        const image =
          normalizeUrl(imgEl?.getAttribute('src')) ||
          normalizeUrl(imgEl?.getAttribute('data-src')) ||
          null;

        let price = null;
        const priceEl = card.querySelector('span.price-listing');
        if (priceEl?.textContent) {
          price = cleanText(priceEl.textContent);
        }

        const locationEl = card.querySelector('p.localisation-listing');
        const dateEl = card.querySelector('span.date-listing');
        const shipping = [
          cleanText(locationEl?.textContent) || null,
          cleanText(dateEl?.textContent) || null,
        ].filter(Boolean).join(' • ') || null;

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting ClickMonaco item:', err.message);
      }
    });

    return results;
  });
}

export async function extractMaltaParkData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('div.item.e3.e2, div.item[data-itemid]');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://maltapark.com${value}`;
      return value;
    };

    cards.forEach((card) => {
      try {
        const titleLink =
          card.querySelector('.content a.header[href]') ||
          card.querySelector('a.header[href]') ||
          card.querySelector('a[href*="/item/details/"]');

        const href = titleLink?.getAttribute('href');
        const url = normalizeUrl(href);

        const title = cleanText(titleLink?.textContent) || null;

        const imgEl = card.querySelector('.image a.imagelink img') || card.querySelector('img');
        const image = normalizeUrl(imgEl?.getAttribute('src')) || normalizeUrl(imgEl?.getAttribute('data-src')) || null;

        let price = null;
        const priceEl = card.querySelector('.meta .price span') || card.querySelector('.price span') || card.querySelector('.price');
        if (priceEl?.textContent) {
          price = cleanText(priceEl.textContent);
        }

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping: null,
          });
        }
      } catch (err) {
        console.warn('Error extracting MaltaPark item:', err.message);
      }
    });

    return results;
  });
}

export async function extractAvitoData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const listingCards = document.querySelectorAll('div[data-marker="item"]');

    const pickBestFromSrcset = (srcset) => {
      if (!srcset) return null;
      const candidates = srcset
        .split(',')
        .map((entry) => entry.trim().split(' ')[0])
        .filter(Boolean);
      return candidates.length ? candidates[candidates.length - 1] : null;
    };

    listingCards.forEach((card) => {
      try {
        // Title and URL from h2[itemprop="name"] a
        const titleLink = card.querySelector('h2[itemprop="name"] a');
        const href = titleLink?.getAttribute('href');
        const title = titleLink?.textContent?.trim() || null;
        const url = href ? (href.startsWith('http') ? href : `https://www.avito.ru${href}`) : null;

        // Image from photo slider
        const imgEl = card.querySelector('img.photo-slider-image-cD891');
        const image =
          pickBestFromSrcset(imgEl?.getAttribute('srcset')) ||
          pickBestFromSrcset(imgEl?.getAttribute('data-srcset')) ||
          imgEl?.getAttribute('src') ||
          imgEl?.getAttribute('data-src') ||
          null;

        // Price from [data-marker="item-price-value"]
        let price = null;
        const priceEl = card.querySelector('[data-marker="item-price-value"]');
        if (priceEl?.textContent) {
          const priceText = priceEl.textContent.replace(/\s+/g, ' ').trim();
          const match = priceText.match(/([\d\s.,]+\s*₽)/i);
          price = match ? match[1].trim() : priceText;
        }

        // Location/date info
        let shipping = null;
        const dateInfo = card.querySelector('[data-marker="item-date"]');
        if (dateInfo?.textContent) {
          shipping = dateInfo.textContent.replace(/\s+/g, ' ').trim();
        }

        if (title && url) {
          results.push({ title, url, image, alt: title, price, shipping });
        }
      } catch (e) {
        console.warn('Parse error (Avito.ru):', e.message);
      }
    });

    return results;
  });
}

export async function extractFinnData(page_obj) {
  return await page_obj.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll('article.sf-search-ad, article[class*="sf-search-ad"]');

    const cleanText = (value) => (value || '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();

    const normalizeUrl = (value) => {
      if (!value) return null;
      if (value.startsWith('http')) return value;
      if (value.startsWith('//')) return `https:${value}`;
      if (value.startsWith('/')) return `https://www.finn.no${value}`;
      return value;
    };

    cards.forEach((card) => {
      try {
        const linkEl =
          card.querySelector('a.sf-search-ad-link[href*="/recommerce/forsale/item/"]') ||
          card.querySelector('h2 a[href*="/recommerce/forsale/item/"]') ||
          card.querySelector('a[href*="/recommerce/forsale/item/"]');

        const href = linkEl?.getAttribute('href');
        const url = normalizeUrl(href);

        const title = cleanText(linkEl?.textContent) || null;

        const activeImage = card.querySelector('img.sf-ad-carousel-desktop-item--active');
        const imgEl = activeImage || card.querySelector('img.sf-ad-carousel-desktop-item') || card.querySelector('img');
        const image =
          normalizeUrl(imgEl?.getAttribute('src')) ||
          normalizeUrl(imgEl?.getAttribute('data-src')) ||
          null;

        let price = null;
        const priceEl = card.querySelector('div.font-bold span') || card.querySelector('span');
        if (priceEl?.textContent) {
          const priceText = cleanText(priceEl.textContent);
          const match = priceText.match(/([\d\s.,]+\s*kr\.?)/i);
          price = match ? cleanText(match[1]) : null;
        }

        let shipping = null;
        const metaSpans = Array.from(card.querySelectorAll('.text-xs.s-text-subtle span'))
          .map((el) => cleanText(el.textContent))
          .filter(Boolean);
        if (metaSpans.length > 0) {
          shipping = metaSpans.join(' • ');
        }

        if (title && url) {
          results.push({
            title,
            url,
            image,
            alt: title,
            price,
            shipping,
          });
        }
      } catch (err) {
        console.warn('Error extracting Finn item:', err.message);
      }
    });

    return results;
  });
}
