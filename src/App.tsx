import { useEffect, useState } from 'react'
import './App.css'
import EbayCard from './components/EbayCard'
import LeboncoinCard from './components/LeboncoinCard'

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
  switch (country) {
    case 'de': return 'Allemagne';
    case 'be': return 'Belgique';
    default: return 'France';
  }
};

const getLeboncoinName = (country: string): string => {
  switch (country) {
    case 'de': return 'Kleinanzeigen';
    case 'be': return '2ememain.be';
    default: return 'LeBonCoin';
  }
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
  const [totalLbc, setTotalLbc] = useState(0);
  const [totalVinted, setTotalVinted] = useState(0);

  const fetchItems = async (q: string, pEbay = 1, pLbc = 1, pVinted = 1) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch only from selected sources
      const fetchPromises: Promise<Response>[] = [];
      const sourceOrder: string[] = [];
      
      if (sources.ebay) {
        fetchPromises.push(fetch(`http://localhost:3002/api/ebay/browse?query=${encodeURIComponent(q)}&page=${pEbay}&country=${country}`));
        sourceOrder.push('ebay');
      }
      if (sources.leboncoin) {
        fetchPromises.push(fetch(`http://localhost:3002/api/leboncoin/search?query=${encodeURIComponent(q)}&page=${pLbc}&country=${country}`));
        sourceOrder.push('leboncoin');
      }
      if (sources.vinted) {
        fetchPromises.push(fetch(`http://localhost:3002/api/vinted/search?query=${encodeURIComponent(q)}&page=${pVinted}&country=${country}`));
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
          setLeboncoinItems(leboncoinData.items || []);
          setTotalLbc(leboncoinData.total || 0);
        } else {
          setLeboncoinItems([]);
          setTotalLbc(0);
        }
      } else {
        setLeboncoinItems([]);
        setTotalLbc(0);
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
        setError('Erreur lors de la recherche - assurez-vous que le serveur backend fonctionne sur le port 3002');
      }
    } catch (err: any) {
      setEbayItems([]);
      setLeboncoinItems([]);
      setVintedItems([]);
      setTotalEbay(0);
      setTotalLbc(0);
      setTotalVinted(0);
      setError(String(err || 'Fetch error - ensure backend is running on port 3002'));
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
              setCountry(e.target.value);
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
            <option value="be">🇧🇪 Belgique</option>
          </select>
        </div>
        
        <label style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer'}}>
          <input
            type="checkbox"
            checked={sources.ebay}
            onChange={(e) => setSources({...sources, ebay: e.target.checked})}
            style={{width: 16, height: 16, cursor: 'pointer'}}
          />
          <span>eBay {getCountryName(country)}</span>
        </label>

        <label style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer'}}>
          <input
            type="checkbox"
            checked={sources.leboncoin}
            onChange={(e) => setSources({...sources, leboncoin: e.target.checked})}
            style={{width: 16, height: 16, cursor: 'pointer'}}
          />
          <span>{getLeboncoinName(country)}</span>
        </label>

        <label style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer'}}>
          <input
            type="checkbox"
            checked={sources.vinted}
            onChange={(e) => setSources({...sources, vinted: e.target.checked})}
            style={{width: 16, height: 16, cursor: 'pointer'}}
          />
          <span>{getVintedLabel(country)}</span>
        </label>
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
        const gridTemplateColumns = visibleColumns === 1 ? '1fr' : visibleColumns === 2 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))';
        const maxWidth = visibleColumns === 1 ? '400px' : visibleColumns === 2 ? '800px' : undefined;
        return (
          <div style={{paddingTop: 8, display: 'grid', gridTemplateColumns, gap: 16, alignItems: 'start', maxWidth, marginLeft: 'auto', marginRight: 'auto'}}>

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
            <h2 style={{fontSize: '18px', marginBottom: 0}}>Vinted</h2>
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
