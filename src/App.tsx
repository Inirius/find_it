import { useEffect, useState } from 'react'
import './App.css'
import EbayCard from './components/EbayCard'
import LeboncoinCard from './components/LeboncoinCard'
import { hasEbaySupportBrowse, hasVintedSupport } from '../shared/countrySupport.js'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || 'http://localhost:3001';

type Item = {
  title: string | null;
  url: string | null;
  image: string | null;
  alt?: string | null;
  price: string | null;
  shipping: string | null;
};

// Helper functions for country-specific labels
const getCountryName = (country: string): string => {
  const names: { [key: string]: string } = {
    al: 'Albanie', am: 'Arménie', au: 'Australie', at: 'Autriche',
    ba: 'Bosnie-Herzégovine', be: 'Belgique', bg: 'Bulgarie', by: 'Biélorussie',
    cy: 'Chypre', cz: 'Tchéquie', de: 'Allemagne', dk: 'Danemark',
    ee: 'Estonie', es: 'Espagne', fi: 'Finlande', fr: 'France',
    gb: 'Royaume-Uni', ge: 'Géorgie', gr: 'Grèce', hr: 'Croatie',
    hu: 'Hongrie', ie: 'Irlande', is: 'Islande', it: 'Italie',
    kz: 'Kazakhstan', lt: 'Lituanie', lv: 'Lettonie', mk: 'Macédoine du Nord',
    md: 'Moldavie', mt: 'Malte', nl: 'Pays-Bas', no: 'Norvège',
    pl: 'Pologne', pt: 'Portugal', ro: 'Roumanie', ru: 'Russie',
    rs: 'Serbie', se: 'Suède', si: 'Slovénie', sk: 'Slovaquie',
    tr: 'Turquie', ua: 'Ukraine', xk: 'Kosovo',
  };
  return names[country] || 'France';
};

const getCountryFlag = (country: string): string => {
  const flags: { [key: string]: string } = {
    al: '🇦🇱', am: '🇦🇲', au: '🇦🇺', at: '🇦🇹',
    ba: '🇧🇦', be: '🇧🇪', bg: '🇧🇬', by: '🇧🇾',
    cy: '🇨🇾', cz: '🇨🇿', de: '🇩🇪', dk: '🇩🇰',
    ee: '🇪🇪', es: '🇪🇸', fi: '🇫🇮', fr: '🇫🇷',
    gb: '🇬🇧', ge: '🇬🇪', gr: '🇬🇷', hr: '🇭🇷',
    hu: '🇭🇺', ie: '🇮🇪', is: '🇮🇸', it: '🇮🇹',
    kz: '🇰🇿', lt: '🇱🇹', lv: '🇱🇻', mk: '🇲🇰',
    md: '🇲🇩', mt: '🇲🇹', nl: '🇳🇱', no: '🇳🇴',
    pl: '🇵🇱', pt: '🇵🇹', ro: '🇷🇴', ru: '🇷🇺',
    rs: '🇷🇸', se: '🇸🇪', si: '🇸🇮', sk: '🇸🇰',
    tr: '🇹🇷', ua: '🇺🇦', xk: '🇽🇰',
  };
  return flags[country] || '🇫🇷';
};

const getLeboncoinName = (country: string): string => {
  const names: { [key: string]: string } = {
    al: 'Merrjep', am: 'List.am', au: 'Gumtree', at: 'Willhaben',
    ba: 'OLX', be: '2ememain.be', bg: 'OLX', by: 'Kufar',
    cy: 'Vendora', cz: 'Sbazar', de: 'Kleinanzeigen', dk: 'DBA',
    ee: 'Osta', es: 'Wallapop', fi: 'Huuto', fr: 'LeBonCoin',
    gb: 'Gumtree', ge: 'MyMarket', gr: 'Vendora', hr: 'Njuskalo',
    hu: 'Jofogas', ie: 'DoneDeal', is: 'Bland', it: 'Subito',
    kz: 'OLX', lt: 'Skelbiu', lv: 'SS.lv', mk: 'Pazar3',
    md: '999.md', mt: 'MaltaPark', nl: 'Marktplaats', no: 'Finn',
    pl: 'OLX', pt: 'OLX', ro: 'OLX', ru: 'Avito',
    rs: 'Kupujem Prodajem', se: 'Tradera', si: 'Bolha', sk: 'Bazos',
    tr: 'LetGo', ua: 'OLX', xk: 'Merrjep',
  };
  return names[country] || 'LeBonCoin';
};

const getVintedLabel = (country: string): string => {
  return `Vinted (${country.toUpperCase()})`;
};

function App() {
  const [query, setQuery] = useState('drone');
  const [ebayItems, setEbayItems] = useState<Item[]>([]);
  const [leboncoinItems, setLeboncoinItems] = useState<Item[]>([]);
  const [vintedItems, setVintedItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Menu sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sources, setSources] = useState({
    ebay: true,
    leboncoin: true,
    vinted: true
  });
  const [country, setCountry] = useState('fr'); // 'fr', 'de', or 'be'
  
  // Pagination states
  const [pageEbay, setPageEbay] = useState(1);
  const [pageLbc, setPageLbc] = useState(1);
  const [pageVinted, setPageVinted] = useState(1);
  
  // Total items/pages for each source
  const [totalEbay, setTotalEbay] = useState(0);
  const [totalVinted, setTotalVinted] = useState(0);

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
      if (sources.leboncoin) {
        fetchPromises.push(fetch(`${API_BASE_URL}/api/leboncoin/search?query=${encodeURIComponent(q)}&page=${pLbc}&country=${country}`));
        sourceOrder.push('leboncoin');
      }
      if (sources.vinted && hasVintedSupport(country)) {
        fetchPromises.push(fetch(`${API_BASE_URL}/api/vinted/search?query=${encodeURIComponent(q)}&page=${pVinted}&country=${country}`));
        sourceOrder.push('vinted');
      }
      
      const responses = await Promise.all(fetchPromises);
      
      // Map responses to sources
      const responseMap: { [key: string]: Response } = {};
      responses.forEach((res, idx) => {
        responseMap[sourceOrder[idx]] = res;
      });
      
      const ebayRes = responseMap['ebay'] || null;
      const leboncoinRes = responseMap['leboncoin'] || null;
      const vintedRes = responseMap['vinted'] || null;

      let ebayData = null;
      let leboncoinData = null;
      let vintedData = null;

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

      if (leboncoinRes && leboncoinRes.ok) {
        leboncoinData = await leboncoinRes.json();
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

          setLeboncoinItems(normalizedItems);
        } else {
          setLeboncoinItems([]);
        }
      } else {
        setLeboncoinItems([]);
      }

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
        (!sources.leboncoin || !leboncoinData?.success) &&
        (!sources.vinted || !vintedData?.success);
      
      if (selectedSourcesFailed) {
        setError(`Erreur lors de la recherche - assurez-vous que le serveur backend fonctionne (${API_BASE_URL})`);
      }
    } catch (err: any) {
      setEbayItems([]);
      setLeboncoinItems([]);
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
  }, [pageEbay, pageLbc, pageVinted, country]);

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
                leboncoin: true,
                vinted: hasVintedSupport(newCountry),
              };
              
              setCountry(newCountry);
              setSources(newSources);
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
            <option value="fr">🇫🇷 France</option>
            <option value="de">🇩🇪 Allemagne</option>
            <option value="at">🇦🇹 Autriche</option>
            <option value="be">🇧🇪 Belgique</option>
            <option value="es">🇪🇸 Espagne</option>
            <option value="nl">🇳🇱 Pays-Bas</option>
            <option value="pl">🇵🇱 Pologne</option>
            <option value="au">🇦🇺 Australie</option>
            <option value="ba">🇧🇦 Bosnie-Herzégovine</option>
            <option value="bg">🇧🇬 Bulgarie</option>
            <option value="by">🇧🇾 Biélorussie</option>
            <option value="cy">🇨🇾 Chypre</option>
            <option value="cz">🇨🇿 Tchéquie</option>
            <option value="dk">🇩🇰 Danemark</option>
            <option value="ee">🇪🇪 Estonie</option>
            <option value="fi">🇫🇮 Finlande</option>
            <option value="gb">🇬🇧 Royaume-Uni</option>
            <option value="ge">🇬🇪 Géorgie</option>
            <option value="gr">🇬🇷 Grèce</option>
            <option value="hr">🇭🇷 Croatie</option>
            <option value="hu">🇭🇺 Hongrie</option>
            <option value="ie">🇮🇪 Irlande</option>
            <option value="is">🇮🇸 Islande</option>
            <option value="it">🇮🇹 Italie</option>
            <option value="kz">🇰🇿 Kazakhstan</option>
            <option value="lt">🇱🇹 Lituanie</option>
            <option value="lv">🇱🇻 Lettonie</option>
            <option value="mk">🇲🇰 Macédoine du Nord</option>
            <option value="md">🇲🇩 Moldavie</option>
            <option value="mt">🇲🇹 Malte</option>
            <option value="no">🇳🇴 Norvège</option>
            <option value="pt">🇵🇹 Portugal</option>
            <option value="ro">🇷🇴 Roumanie</option>
            <option value="ru">🇷🇺 Russie</option>
            <option value="rs">🇷🇸 Serbie</option>
            <option value="se">🇸🇪 Suède</option>
            <option value="si">🇸🇮 Slovénie</option>
            <option value="sk">🇸🇰 Slovaquie</option>
            <option value="tr">🇹🇷 Turquie</option>
            <option value="ua">🇺🇦 Ukraine</option>
            <option value="al">🇦🇱 Albanie</option>
            <option value="am">🇦🇲 Arménie</option>
            <option value="xk">🇽🇰 Kosovo</option>
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

        <label style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer'}}>
          <input
            type="checkbox"
            checked={sources.leboncoin}
            onChange={(e) => setSources({...sources, leboncoin: e.target.checked})}
            style={{width: 16, height: 16, cursor: 'pointer'}}
          />
          <span>{getLeboncoinName(country)}</span>
        </label>

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
      
      <h1 style={{marginBottom: 12}}>Recherche multi-sites</h1>
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

        {!loading && !error && ebayItems.length === 0 && leboncoinItems.length === 0 && vintedItems.length === 0 && (
        <div>Aucun résultat.</div>
      )}

      {(() => {
        const visibleColumns = Object.values(sources).filter(Boolean).length;
        const gridTemplateColumns = visibleColumns === 1 ? '1fr' : visibleColumns === 2 ? 'repeat(2, minmax(0, 1fr))' : visibleColumns === 3 ? 'repeat(3, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))';
        const maxWidth = visibleColumns === 1 ? '400px' : visibleColumns === 2 ? '800px' : visibleColumns === 3 ? '1200px' : undefined;
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
              <EbayCard
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

        {sources.leboncoin && (
          <div style={{display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, overflow: 'hidden'}}>
            <h2 style={{fontSize: '18px', marginBottom: 0}}>{getLeboncoinName(country)}</h2>
            {leboncoinItems.map((item, index) => (
              <LeboncoinCard
                key={index}
                title={item.title}
                url={item.url}
                image={item.image}
                alt={item.alt}
                price={item.price}
                shipping={item.shipping}
              />
            ))}
            {leboncoinItems.length === 0 && !loading && (
              <p style={{color: '#999'}}>Aucun résultat {getLeboncoinName(country)}</p>
            )}
          </div>
        )}

        {sources.vinted && (
          <div style={{display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, overflow: 'hidden'}}>
            <h2 style={{fontSize: '18px', marginBottom: 0}}>{getVintedLabel(country)}</h2>
            {vintedItems.map((item, index) => (
              <LeboncoinCard
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
      {(ebayItems.length > 0 || leboncoinItems.length > 0 || vintedItems.length > 0) && (
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
              leboncoinItems.length === 0
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
                leboncoinItems.length === 0
              ) ? 'not-allowed' : 'pointer',
              opacity: (
                (pageEbay * 40 >= totalEbay || totalEbay === 0) && 
                (pageVinted * 40 >= totalVinted || totalVinted === 0) && 
                leboncoinItems.length === 0
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
