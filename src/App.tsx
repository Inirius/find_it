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

function App() {
  const [query, setQuery] = useState('drone');
  const [ebayItems, setEbayItems] = useState<Item[]>([]);
  const [leboncoinItems, setLeboncoinItems] = useState<Item[]>([]);
  const [vintedItems, setVintedItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
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
      // Fetch from all three APIs in parallel with pagination
      const [ebayRes, leboncoinRes, vintedRes] = await Promise.all([
        fetch(`http://localhost:3002/api/ebay/browse?query=${encodeURIComponent(q)}&page=${pEbay}`),
        fetch(`http://localhost:3002/api/leboncoin/search?query=${encodeURIComponent(q)}&page=${pLbc}`),
        fetch(`http://localhost:3002/api/vinted/search?query=${encodeURIComponent(q)}&page=${pVinted}`)
      ]);

      let ebayData = null;
      let leboncoinData = null;
      let vintedData = null;

      if (ebayRes.ok) {
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

      if (leboncoinRes.ok) {
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

      if (vintedRes.ok) {
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

      // Show error only if all sources failed
      if (!ebayData?.success && !leboncoinData?.success && !vintedData?.success) {
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
  }, [pageEbay, pageLbc, pageVinted]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPageEbay(1);
    setPageLbc(1);
    setPageVinted(1);
    fetchItems(query, 1, 1, 1);
  };

  return (
    <div style={{padding: 16, maxWidth: 960, margin: '0 auto'}}>
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

      <div style={{paddingTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16}}>
        <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
          <h2 style={{fontSize: '18px', marginBottom: 0}}>eBay France</h2>
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

        <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
          <h2 style={{fontSize: '18px', marginBottom: 0}}>LeBonCoin</h2>
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
            <p style={{color: '#999'}}>Aucun résultat LeBonCoin</p>
          )}
        </div>

        <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
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
      </div>

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
