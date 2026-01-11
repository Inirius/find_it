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

  const fetchItems = async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch from all three APIs in parallel
      const [ebayRes, leboncoinRes, vintedRes] = await Promise.all([
        fetch(`http://localhost:3002/api/ebay/browse?query=${encodeURIComponent(q)}&limit=20`),
        fetch(`http://localhost:3002/api/leboncoin/search?query=${encodeURIComponent(q)}`),
        fetch(`http://localhost:3002/api/vinted/search?query=${encodeURIComponent(q)}`)
      ]);

      let ebayData = null;
      let leboncoinData = null;
      let vintedData = null;

      if (ebayRes.ok) {
        ebayData = await ebayRes.json();
        if (ebayData.success) {
          setEbayItems(ebayData.items || []);
        } else {
          setEbayItems([]);
        }
      } else {
        setEbayItems([]);
      }

      if (leboncoinRes.ok) {
        leboncoinData = await leboncoinRes.json();
        if (leboncoinData.success) {
          setLeboncoinItems(leboncoinData.items || []);
        } else {
          setLeboncoinItems([]);
        }
      } else {
        setLeboncoinItems([]);
      }

      if (vintedRes.ok) {
        vintedData = await vintedRes.json();
        if (vintedData.success) {
          setVintedItems(vintedData.items || []);
        } else {
          setVintedItems([]);
        }
      } else {
        setVintedItems([]);
      }

      // Show error only if all sources failed
      if (!ebayData?.success && !leboncoinData?.success && !vintedData?.success) {
        setError('Erreur lors de la recherche - assurez-vous que le serveur backend fonctionne sur le port 3002');
      }
    } catch (err: any) {
      setEbayItems([]);
      setLeboncoinItems([]);
      setVintedItems([]);
      setError(String(err || 'Fetch error - ensure backend is running on port 3002'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems(query);
  }, []);

  return (
    <div style={{padding: 16, maxWidth: 960, margin: '0 auto'}}>
      <h1 style={{marginBottom: 12}}>Recherche multi-sites</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          fetchItems(query);
        }}
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
    </div>
  );
}

export default App
