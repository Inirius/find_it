import { useEffect, useState } from 'react'
import './App.css'
import Card from './components/Card.tsx'
import { hasEbaySupportBrowse, hasVintedSupport } from '../shared/countrySupport.js'

const API_BASE_URL = (() => {
  const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '');
  }

  if (import.meta.env.DEV) {
    return 'http://localhost:3001';
  }

  return '';
})();

type Item = {
  title: string | null;
  url: string | null;
  image: string | null;
  alt?: string | null;
  price: string | null;
  shipping: string | null;
};

type ClassifiedSite = {
  id: string;
  label: string;
};

// Helper functions for country-specific labels
const getCountryName = (country: string): string => {
  const names: { [key: string]: string } = {
    ad: 'Andorre',
    al: 'Albanie', am: 'Arménie', au: 'Australie', at: 'Autriche',
    ba: 'Bosnie-Herzégovine', be: 'Belgique', bg: 'Bulgarie', by: 'Biélorussie',
    cy: 'Chypre', cz: 'Tchéquie', de: 'Allemagne', dk: 'Danemark',
    ee: 'Estonie', es: 'Espagne', fi: 'Finlande', fr: 'France',
    gb: 'Royaume-Uni', ge: 'Géorgie', gr: 'Grèce', hr: 'Croatie',
    hu: 'Hongrie', ie: 'Irlande', is: 'Islande', it: 'Italie',
    li: 'Liechtenstein', lu: 'Luxembourg',
    kz: 'Kazakhstan', lt: 'Lituanie', lv: 'Lettonie', mk: 'Macédoine du Nord',
    mc: 'Monaco', md: 'Moldavie', me: 'Monténégro', mt: 'Malte', nl: 'Pays-Bas', no: 'Norvège',
    pl: 'Pologne', pt: 'Portugal', ro: 'Roumanie', ru: 'Russie',
    sm: 'Saint-Marin', ch: 'Suisse',
    rs: 'Serbie', se: 'Suède', si: 'Slovénie', sk: 'Slovaquie',
    tr: 'Turquie', ua: 'Ukraine', va: 'Vatican', xk: 'Kosovo',
  };
  return names[country] || 'France';
};

const getCountryFlag = (country: string): string => {
  const flags: { [key: string]: string } = {
    ad: '🇦🇩',
    al: '🇦🇱', am: '🇦🇲', au: '🇦🇺', at: '🇦🇹',
    ba: '🇧🇦', be: '🇧🇪', bg: '🇧🇬', by: '🇧🇾',
    cy: '🇨🇾', cz: '🇨🇿', de: '🇩🇪', dk: '🇩🇰',
    ee: '🇪🇪', es: '🇪🇸', fi: '🇫🇮', fr: '🇫🇷',
    gb: '🇬🇧', ge: '🇬🇪', gr: '🇬🇷', hr: '🇭🇷',
    hu: '🇭🇺', ie: '🇮🇪', is: '🇮🇸', it: '🇮🇹',
    li: '🇱🇮', lu: '🇱🇺',
    kz: '🇰🇿', lt: '🇱🇹', lv: '🇱🇻', mk: '🇲🇰',
    mc: '🇲🇨', md: '🇲🇩', me: '🇲🇪', mt: '🇲🇹', nl: '🇳🇱', no: '🇳🇴',
    pl: '🇵🇱', pt: '🇵🇹', ro: '🇷🇴', ru: '🇷🇺',
    sm: '🇸🇲', ch: '🇨🇭',
    rs: '🇷🇸', se: '🇸🇪', si: '🇸🇮', sk: '🇸🇰',
    tr: '🇹🇷', ua: '🇺🇦', va: '🇻🇦', xk: '🇽🇰',
  };
  return flags[country] || '🇫🇷';
};

const IDENTIFIED_CLASSIFIED_SITE_BY_COUNTRY: { [key: string]: string } = {
  al: 'Merrjep', am: 'List.am', au: 'Gumtree', at: 'Willhaben',
  ba: 'OLX', be: '2ememain.be', bg: 'OLX', by: 'Kufar',
  cy: 'Vendora', cz: 'Sbazar', de: 'Kleinanzeigen', dk: 'DBA',
  ee: 'Osta', es: 'Wallapop', fi: 'Huuto', fr: 'LeBonCoin',
  gb: 'Gumtree', ge: 'MyMarket', gr: 'Vendora', hr: 'Njuskalo',
  hu: 'Jofogas', ie: 'DoneDeal', is: 'Bland', it: 'Subito',
  kz: 'OLX', lt: 'Skelbiu', lv: 'SS.lv', mk: 'Pazar3',
  mc: 'ClickMonaco', md: '999.md', me: 'Patuljak', mt: 'MaltaPark', nl: 'Marktplaats', no: 'Finn',
  pl: 'OLX', pt: 'OLX', ro: 'OLX', ru: 'Avito',
  rs: 'Kupujem Prodajem', se: 'Tradera', si: 'Bolha', sk: 'Bazos',
  tr: 'LetGo', ua: 'OLX', ch: 'Ricardo', xk: 'Merrjep',
};

const CLASSIFIED_SCRAPER_SUPPORTED_COUNTRIES: { [key: string]: boolean } = {
  al: true, am: true, au: true, at: true,
  ba: true, be: true, bg: true, by: true,
  cy: true, cz: true, de: true, dk: true,
  ee: true, es: true, fi: true, fr: true,
  gb: true, ge: true, gr: true, hr: true,
  hu: true, ie: true, is: true, it: true,
  kz: true, lt: true, lv: true, mk: true,
  mc: true, md: true, me: true, mt: true, nl: true, no: true,
  pl: true, pt: true, ro: true, ru: true,
  rs: true, se: true, si: true, sk: true,
  ch: true, tr: true, ua: true, xk: true,
};

const hasClassifiedSupport = (country: string): boolean => {
  return CLASSIFIED_SCRAPER_SUPPORTED_COUNTRIES[country] || false;
};

const hasIdentifiedClassifiedSite = (country: string): boolean => {
  return Boolean(IDENTIFIED_CLASSIFIED_SITE_BY_COUNTRY[country]);
};

const getLeboncoinName = (country: string): string => {
  return IDENTIFIED_CLASSIFIED_SITE_BY_COUNTRY[country] || 'LeBonCoin';
};

const CLASSIFIED_SITES_BY_COUNTRY: Record<string, ClassifiedSite[]> = {
  fi: [
    { id: 'huuto', label: 'Huuto' },
    { id: 'tori', label: 'Tori' },
  ],
  ee: [
    { id: 'osta', label: 'Osta' },
    { id: 'okidoki', label: 'Okidoki' },
  ],
};

const getClassifiedSites = (country: string): ClassifiedSite[] => {
  const sites = CLASSIFIED_SITES_BY_COUNTRY[country];
  if (sites && sites.length > 0) {
    return sites;
  }

  return [{ id: 'default', label: getLeboncoinName(country) }];
};

const getVintedLabel = (country: string): string => {
  return `Vinted (${country.toUpperCase()})`;
};

function App() {
  const [query, setQuery] = useState('drone');
  const [ebayItems, setEbayItems] = useState<Item[]>([]);
  const [leboncoinItemsBySite, setLeboncoinItemsBySite] = useState<Record<string, Item[]>>({});
  const [vintedItems, setVintedItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Menu sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sources, setSources] = useState(() => ({
    ebay: hasEbaySupportBrowse('fr'),
    leboncoin: hasClassifiedSupport('fr'),
    vinted: hasVintedSupport('fr')
  }));
  const [country, setCountry] = useState('fr'); // 'fr', 'de', or 'be'
  const [selectedLbcSites, setSelectedLbcSites] = useState<string[]>(() => getClassifiedSites('fr').map((site) => site.id));
  
  // Pagination states
  const [pageEbay, setPageEbay] = useState(1);
  const [pageLbc, setPageLbc] = useState(1);
  const [pageVinted, setPageVinted] = useState(1);
  
  // Total items/pages for each source
  const [totalEbay, setTotalEbay] = useState(0);
  const [totalVinted, setTotalVinted] = useState(0);

  const currentClassifiedSites = getClassifiedSites(country);
  const activeLbcSiteIds = selectedLbcSites.filter((siteId) => currentClassifiedSites.some((site) => site.id === siteId));
  const isMultiClassifiedCountry = currentClassifiedSites.length > 1;
  const leboncoinEnabled = isMultiClassifiedCountry ? activeLbcSiteIds.length > 0 : sources.leboncoin;
  const totalLeboncoinItems = activeLbcSiteIds.reduce((sum, siteId) => sum + (leboncoinItemsBySite[siteId]?.length || 0), 0);

  const fetchItems = async (q: string, pEbay = 1, pLbc = 1, pVinted = 1) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch only from selected sources (and only if supported in this country)
      const fetchPromises: Promise<Response>[] = [];
      const sourceOrder: string[] = [];
      
      if (sources.ebay && hasEbaySupportBrowse(country)) {
        fetchPromises.push(fetch(`${API_BASE_URL}/api/ebay/browse?query=${encodeURIComponent(q)}&page=${pEbay}&country=${country}`));
        sourceOrder.push('ebay');
      }
      if (leboncoinEnabled && activeLbcSiteIds.length > 0) {
        activeLbcSiteIds.forEach((siteId) => {
          fetchPromises.push(
            fetch(
              `${API_BASE_URL}/api/leboncoin/search?query=${encodeURIComponent(q)}&page=${pLbc}&country=${country}&site=${encodeURIComponent(siteId)}`
            )
          );
          sourceOrder.push(`leboncoin:${siteId}`);
        });
      }
      if (sources.vinted && hasVintedSupport(country)) {
        fetchPromises.push(fetch(`${API_BASE_URL}/api/vinted/search?query=${encodeURIComponent(q)}&page=${pVinted}&country=${country}`));
        sourceOrder.push('vinted');
      }

      if (fetchPromises.length === 0) {
        setEbayItems([]);
        setLeboncoinItemsBySite({});
        setVintedItems([]);
        setTotalEbay(0);
        setTotalVinted(0);
        setLoading(false);
        return;
      }
      
      const responses = await Promise.all(fetchPromises);
      
      // Map responses to sources
      const responseMap: { [key: string]: Response } = {};
      responses.forEach((res, idx) => {
        responseMap[sourceOrder[idx]] = res;
      });
      
      const ebayRes = responseMap['ebay'] || null;
      const vintedRes = responseMap['vinted'] || null;

      let ebayData = null;
      let vintedData = null;
      let hasLeboncoinSuccess = false;

      if (ebayRes && ebayRes.ok) {
        ebayData = await ebayRes.json();
        if (ebayData.success) {
          setEbayItems(ebayData.items || []);
          setTotalEbay(ebayData.total || 0);
        } else {
          setEbayItems([]);
          setTotalEbay(0);
        }
      } else {
        setEbayItems([]);
        setTotalEbay(0);
      }

      const leboncoinBySite: Record<string, Item[]> = {};
      for (const siteId of activeLbcSiteIds) {
        const siteKey = `leboncoin:${siteId}`;
        const leboncoinRes = responseMap[siteKey] || null;

        if (leboncoinRes && leboncoinRes.ok) {
          const leboncoinData = await leboncoinRes.json();
          if (leboncoinData.success) {
            const rawItems: Item[] = leboncoinData.items || [];
            const normalizedItems = country === 'se'
              ? rawItems.map((item) => {
                  const imageUrl = item.image || '';
                  const shouldProxy = /^https?:\/\/img\.tradera\.net\//i.test(imageUrl);
                  return {
                    ...item,
                    image: shouldProxy ? `${API_BASE_URL}/api/image-proxy?url=${encodeURIComponent(imageUrl)}` : item.image,
                  };
                })
              : rawItems;

            leboncoinBySite[siteId] = normalizedItems;
            hasLeboncoinSuccess = true;
          } else {
            leboncoinBySite[siteId] = [];
          }
        } else {
          leboncoinBySite[siteId] = [];
        }
      }
      setLeboncoinItemsBySite(leboncoinBySite);

      if (vintedRes && vintedRes.ok) {
        vintedData = await vintedRes.json();
        if (vintedData.success) {
          setVintedItems(vintedData.items || []);
          setTotalVinted(vintedData.total || 0);
        } else {
          setVintedItems([]);
          setTotalVinted(0);
        }
      } else {
        setVintedItems([]);
        setTotalVinted(0);
      }

      // Show error only if all selected sources failed
      const selectedSourcesFailed = 
        (!sources.ebay || !ebayData?.success) &&
        (!leboncoinEnabled || activeLbcSiteIds.length === 0 || !hasLeboncoinSuccess) &&
        (!sources.vinted || !vintedData?.success);
      
      if (selectedSourcesFailed) {
        setError(`Erreur lors de la recherche - assurez-vous que le serveur backend fonctionne (${API_BASE_URL})`);
      }
    } catch (err: any) {
      setEbayItems([]);
      setLeboncoinItemsBySite({});
      setVintedItems([]);
      setTotalEbay(0);
      setTotalVinted(0);
      setError(String(err || `Fetch error - ensure backend is running (${API_BASE_URL})`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems(query, pageEbay, pageLbc, pageVinted);
  }, [pageEbay, pageLbc, pageVinted, country, selectedLbcSites]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPageEbay(1);
    setPageLbc(1);
    setPageVinted(1);
    fetchItems(query, 1, 1, 1);
  };

  return (
    <div style={{padding: '16px 8px', maxWidth: 1400, margin: '0 auto'}}>
      {/* Sidebar toggle button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          position: 'fixed',
          top: '16px',
          left: '16px',
          zIndex: 1001,
          padding: '8px 12px',
          backgroundColor: '#242f3fff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '16px'
        }}
      >
        ☰ Filtres
      </button>

      {/* Country flag and name badge (top right) */}
      <div
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 1001,
          padding: '8px 12px',
          backgroundColor: '#242f3fff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontSize: '16px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <span style={{ fontSize: '20px' }}>{getCountryFlag(country)}</span>
        <span>{getCountryName(country)}</span>
      </div>

      {/* Sidebar menu */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: '250px',
          height: '100vh',
          backgroundColor: '#494949ff',
          boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease-in-out',
          zIndex: 1000,
          overflow: 'auto',
          padding: '60px 16px 16px 16px'
        }}
      >
        <h3 style={{marginTop: 0, marginBottom: 20}}>Sources à rechercher</h3>
        
        <div style={{marginBottom: 20}}>
          <label style={{display: 'block', marginBottom: 8, fontWeight: 'bold', fontSize: '14px'}}>Pays:</label>
          <select
            value={country}
            onChange={(e) => {
              const newCountry = e.target.value;
              const newSources = {
                ebay: hasEbaySupportBrowse(newCountry),
                leboncoin: hasClassifiedSupport(newCountry),
                vinted: hasVintedSupport(newCountry),
              };
              
              setCountry(newCountry);
              setSources(newSources);
              setSelectedLbcSites(getClassifiedSites(newCountry).map((site) => site.id));
              setPageEbay(1);
              setPageLbc(1);
              setPageVinted(1);
            }}
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid #ccc',
              backgroundColor: 'white',
              color: '#333',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            <option value="al">🇦🇱 Albanie</option>
            <option value="de">🇩🇪 Allemagne</option>
            <option value="ad">🇦🇩 Andorre</option>
            <option value="am">🇦🇲 Arménie</option>
            <option value="au">🇦🇺 Australie</option>
            <option value="at">🇦🇹 Autriche</option>
            <option value="be">🇧🇪 Belgique</option>
            <option value="by">🇧🇾 Biélorussie</option>
            <option value="ba">🇧🇦 Bosnie-Herzégovine</option>
            <option value="bg">🇧🇬 Bulgarie</option>
            <option value="cy">🇨🇾 Chypre</option>
            <option value="hr">🇭🇷 Croatie</option>
            <option value="dk">🇩🇰 Danemark</option>
            <option value="es">🇪🇸 Espagne</option>
            <option value="ee">🇪🇪 Estonie</option>
            <option value="fi">🇫🇮 Finlande</option>
            <option value="fr">🇫🇷 France</option>
            <option value="ge">🇬🇪 Géorgie</option>
            <option value="gr">🇬🇷 Grèce</option>
            <option value="hu">🇭🇺 Hongrie</option>
            <option value="ie">🇮🇪 Irlande</option>
            <option value="is">🇮🇸 Islande</option>
            <option value="it">🇮🇹 Italie</option>
            <option value="kz">🇰🇿 Kazakhstan</option>
            <option value="xk">🇽🇰 Kosovo</option>
            <option value="lv">🇱🇻 Lettonie</option>
            <option value="li">🇱🇮 Liechtenstein</option>
            <option value="lt">🇱🇹 Lituanie</option>
            <option value="lu">🇱🇺 Luxembourg</option>
            <option value="mk">🇲🇰 Macédoine du Nord</option>
            <option value="mt">🇲🇹 Malte</option>
            <option value="md">🇲🇩 Moldavie</option>
            <option value="mc">🇲🇨 Monaco</option>
            <option value="me">🇲🇪 Monténégro</option>
            <option value="no">🇳🇴 Norvège</option>
            <option value="nl">🇳🇱 Pays-Bas</option>
            <option value="pl">🇵🇱 Pologne</option>
            <option value="pt">🇵🇹 Portugal</option>
            <option value="ro">🇷🇴 Roumanie</option>
            <option value="gb">🇬🇧 Royaume-Uni</option>
            <option value="ru">🇷🇺 Russie</option>
            <option value="sm">🇸🇲 Saint-Marin</option>
            <option value="rs">🇷🇸 Serbie</option>
            <option value="sk">🇸🇰 Slovaquie</option>
            <option value="si">🇸🇮 Slovénie</option>
            <option value="se">🇸🇪 Suède</option>
            <option value="ch">🇨🇭 Suisse</option>
            <option value="cz">🇨🇿 Tchéquie</option>
            <option value="tr">🇹🇷 Turquie</option>
            <option value="ua">🇺🇦 Ukraine</option>
            <option value="va">🇻🇦 Vatican</option>
          </select>
        </div>
        
        {hasEbaySupportBrowse(country) && (
          <label style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer'}}>
            <input
              type="checkbox"
              checked={sources.ebay}
              onChange={(e) => setSources({...sources, ebay: e.target.checked})}
              style={{width: 16, height: 16, cursor: 'pointer'}}
            />
            <span>eBay {getCountryName(country)}</span>
          </label>
        )}

        {hasClassifiedSupport(country) && (
          <div style={{ marginBottom: 12 }}>
            {!isMultiClassifiedCountry && (
              <label style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer'}}>
                <input
                  type="checkbox"
                  checked={sources.leboncoin}
                  onChange={(e) => setSources({...sources, leboncoin: e.target.checked})}
                  style={{width: 16, height: 16, cursor: 'pointer'}}
                />
                <span>{getLeboncoinName(country)}</span>
              </label>
            )}

            {isMultiClassifiedCountry && (
              <div>
                {currentClassifiedSites.map((site) => (
                  <label key={site.id} style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={activeLbcSiteIds.includes(site.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedLbcSites((prev) => prev.includes(site.id) ? prev : [...prev, site.id]);
                        } else {
                          setSelectedLbcSites((prev) => prev.filter((value) => value !== site.id));
                        }
                      }}
                      style={{width: 16, height: 16, cursor: 'pointer'}}
                    />
                    <span>{site.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {hasVintedSupport(country) && (
          <label style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer'}}>
            <input
              type="checkbox"
              checked={sources.vinted}
              onChange={(e) => setSources({...sources, vinted: e.target.checked})}
              style={{width: 16, height: 16, cursor: 'pointer'}}
            />
            <span>{getVintedLabel(country)}</span>
          </label>
        )}
      </div>

      {/* Overlay when sidebar is open */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 999
          }}
        />
      )}
      
      <h1 style={{marginBottom: 12}}>Find it here !</h1>
        <form
          onSubmit={handleSearch}
          style={{display: 'flex', gap: 8, marginBottom: 16}}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tapez votre recherche"
            style={{flex: 1, padding: '8px 10px'}}
          />
          <button type="submit" style={{padding: '8px 12px'}}>Rechercher</button>
        </form>

        {loading && <div>Chargement...</div>}
        {error && <div style={{color: 'red'}}><strong>Erreur:</strong> {error}</div>}

        {!loading && !error && !hasEbaySupportBrowse(country) && !hasVintedSupport(country) && !hasIdentifiedClassifiedSite(country) && (
          <div style={{ marginBottom: 12, color: '#d8d6d6', border: '1px solid #ccc', padding: 10, display: 'inline-block' }}>
  Ce pays n'a actuellement aucun site de petites annonces référencé, vous pouvez contribuer en en ajoutant un ! <br />
  Envoyer le nom du site à l'adresse : support@find-it.com
</div>
        )}

        {!loading && !error && !hasEbaySupportBrowse(country) && !hasVintedSupport(country) && hasIdentifiedClassifiedSite(country) && !hasClassifiedSupport(country) && (
          <div style={{marginBottom: 12, color: '#333'}}>
            Un site de petites annonces est identifié pour ce pays ({getLeboncoinName(country)}), mais son intégration n'est pas encore disponible dans l'application.
          </div>
        )}

        {!loading && !error && ebayItems.length === 0 && totalLeboncoinItems === 0 && vintedItems.length === 0 && (
        <div>Aucun résultat.</div>
      )}

      {(() => {
        const visibleColumns =
          (sources.ebay ? 1 : 0) +
          (leboncoinEnabled ? activeLbcSiteIds.length : 0) +
          (sources.vinted ? 1 : 0);
        const displayColumns = Math.max(1, visibleColumns);
        const gridTemplateColumns = displayColumns === 1 ? '1fr' : displayColumns === 2 ? 'repeat(2, minmax(0, 1fr))' : displayColumns === 3 ? 'repeat(3, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))';
        const maxWidth = displayColumns === 1 ? '400px' : displayColumns === 2 ? '800px' : displayColumns === 3 ? '1200px' : undefined;
        return (
          <div style={{position: 'relative', paddingTop: 8, width: '100%'}}>
            {/* Voile de chargement */}
            {loading && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 'calc(-50vw + 50%)',
                width: '100vw',
                bottom: 0,
                backgroundColor: 'rgba(70, 70, 70, 0.4)',
                backdropFilter: 'blur(1px)',
                zIndex: 100,
                pointerEvents: 'none'
              }} />
            )}
            <div style={{paddingTop: 8, display: 'grid', gridTemplateColumns, gap: 16, alignItems: 'start', maxWidth, marginLeft: 'auto', marginRight: 'auto', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s ease-in-out'}}>

        {sources.ebay && (
          <div style={{display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, overflow: 'hidden'}}>
            <h2 style={{fontSize: '18px', marginBottom: 0}}>eBay {getCountryName(country)}</h2>
            {ebayItems.map((item, index) => (
              <Card
                key={index}
                title={item.title}
                url={item.url}
                image={item.image}
                alt={item.alt}
                price={item.price}
                shipping={item.shipping}
              />
            ))}
            {ebayItems.length === 0 && !loading && (
              <p style={{color: '#999'}}>Aucun résultat eBay</p>
            )}
          </div>
        )}

        {leboncoinEnabled && activeLbcSiteIds.map((siteId) => {
          const site = currentClassifiedSites.find((entry) => entry.id === siteId);
          const items = leboncoinItemsBySite[siteId] || [];
          const siteLabel = site?.label || getLeboncoinName(country);

          return (
            <div key={siteId} style={{display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, overflow: 'hidden'}}>
              <h2 style={{fontSize: '18px', marginBottom: 0}}>{siteLabel}</h2>
              {items.map((item, index) => (
                <Card
                  key={`${siteId}-${index}`}
                  title={item.title}
                  url={item.url}
                  image={item.image}
                  alt={item.alt}
                  price={item.price}
                  shipping={item.shipping}
                />
              ))}
              {items.length === 0 && !loading && (
                <p style={{color: '#999'}}>Aucun résultat {siteLabel}</p>
              )}
            </div>
          );
        })}

        {sources.vinted && (
          <div style={{display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, overflow: 'hidden'}}>
            <h2 style={{fontSize: '18px', marginBottom: 0}}>{getVintedLabel(country)}</h2>
            {vintedItems.map((item, index) => (
              <Card
                key={index}
                title={item.title}
                url={item.url}
                image={item.image}
                alt={item.alt}
                price={item.price}
                shipping={item.shipping}
              />
            ))}
            {vintedItems.length === 0 && !loading && (
              <p style={{color: '#999'}}>Aucun résultat Vinted</p>
            )}
          </div>
        )}
            </div>
          </div>
        );
      })()}

      {/* Navigation globale pour tous les sites */}
      {(ebayItems.length > 0 || totalLeboncoinItems > 0 || vintedItems.length > 0) && (
        <div style={{display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, paddingBottom: 16}}>
          <button 
            disabled={pageEbay === 1 && pageLbc === 1 && pageVinted === 1}
            onClick={() => {
              setPageEbay(Math.max(1, pageEbay - 1));
              setPageLbc(Math.max(1, pageLbc - 1));
              setPageVinted(Math.max(1, pageVinted - 1));
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              cursor: (pageEbay === 1 && pageLbc === 1 && pageVinted === 1) ? 'not-allowed' : 'pointer',
              opacity: (pageEbay === 1 && pageLbc === 1 && pageVinted === 1) ? 0.5 : 1
            }}
          >
            ← Page précédente
          </button>
          <span style={{padding: '10px 0', fontSize: '16px', fontWeight: 500}}>
            Page {Math.max(pageEbay, pageLbc, pageVinted)}
          </span>
          <button 
            disabled={
              (pageEbay * 40 >= totalEbay || totalEbay === 0) && 
              (pageVinted * 40 >= totalVinted || totalVinted === 0) &&
              totalLeboncoinItems === 0
            }
            onClick={() => {
              setPageEbay(pageEbay + 1);
              setPageLbc(pageLbc + 1);
              setPageVinted(pageVinted + 1);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            style={{
              padding: '10px 20px',
              fontSize: '16px',
              cursor: (
                (pageEbay * 40 >= totalEbay || totalEbay === 0) && 
                (pageVinted * 40 >= totalVinted || totalVinted === 0) && 
                totalLeboncoinItems === 0
              ) ? 'not-allowed' : 'pointer',
              opacity: (
                (pageEbay * 40 >= totalEbay || totalEbay === 0) && 
                (pageVinted * 40 >= totalVinted || totalVinted === 0) && 
                totalLeboncoinItems === 0
              ) ? 0.5 : 1
            }}
          >
            Page suivante →
          </button>
        </div>
      )}

      {/* Bouton flottant retour en haut */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          padding: '12px 16px',
          fontSize: '20px',
          backgroundColor: '#242f3fff',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          cursor: 'pointer',
          boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
          width: '50px',
          height: '50px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
        title="Retour en haut"
      >
        ↑
      </button>
    </div>
  );
}

export default App
