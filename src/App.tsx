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
          {ebayItems.length > 0 && (
            <div style={{display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12}}>
              <button 
                disabled={pageEbay === 1} 
                onClick={() => setPageEbay(pageEbay - 1)}
                style={{padding: '6px 12px', cursor: pageEbay === 1 ? 'not-allowed' : 'pointer', opacity: pageEbay === 1 ? 0.5 : 1}}
              >
                ← Précédent
              </button>
              <span style={{padding: '6px 0'}}>Page {pageEbay}</span>
              <button 
                disabled={ebayItems.length < 40}
                onClick={() => setPageEbay(pageEbay + 1)}
                style={{padding: '6px 12px', cursor: ebayItems.length < 40 ? 'not-allowed' : 'pointer', opacity: ebayItems.length < 40 ? 0.5 : 1}}
              >
                Suivant →
              </button>
            </div>
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
          {leboncoinItems.length > 0 && (
            <div style={{display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12}}>
              <button 
                disabled={pageLbc === 1}
                onClick={() => setPageLbc(pageLbc - 1)}
                style={{padding: '6px 12px', cursor: pageLbc === 1 ? 'not-allowed' : 'pointer', opacity: pageLbc === 1 ? 0.5 : 1}}
              >
                ← Précédent
              </button>
              <span style={{padding: '6px 0'}}>Page {pageLbc}</span>
              <button 
                disabled={false}
                onClick={() => setPageLbc(pageLbc + 1)}
                style={{padding: '6px 12px', cursor: 'pointer', opacity: 1}}
              >
                Suivant →
              </button>
            </div>
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
          {vintedItems.length > 0 && (
            <div style={{display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12}}>
              <button 
                disabled={pageVinted === 1}
                onClick={() => setPageVinted(pageVinted - 1)}
                style={{padding: '6px 12px', cursor: pageVinted === 1 ? 'not-allowed' : 'pointer', opacity: pageVinted === 1 ? 0.5 : 1}}
              >
                ← Précédent
              </button>
              <span style={{padding: '6px 0'}}>Page {pageVinted}</span>
              <button 
                disabled={vintedItems.length < 40}
                onClick={() => setPageVinted(pageVinted + 1)}
                style={{padding: '6px 12px', cursor: vintedItems.length < 40 ? 'not-allowed' : 'pointer', opacity: vintedItems.length < 40 ? 0.5 : 1}}
              >
                Suivant →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App
