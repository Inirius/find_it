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

export function getExtractor(country) {
  const extractors = {
    fr: extractLeBonCoinData,
    cz: extractSbazarData,
    dk: extractDbaData,
    de: extractEbayKleinanzeigenData,
    ba: extractOlxBaData,
    bg: extractOlxBgData,
    cy: extractVendoraData,
    be: extract2ememainData,
    at: extractWillhabenData,
    es: extractWallapopData,
    nl: extract2ememainData,
    pl: extractOlxData,
    au: extractGumtreeData,
    gb: extractGumtreeUkData,
    by: extractKufarData,
    ee: extractOstaData,
    fi: extractHuutoData,
    ge: extractMyMarketData,
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
