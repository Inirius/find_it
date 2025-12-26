import { useEffect, useState } from 'react'
import './App.css'
import EbayCard from './components/EbayCard'

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
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchItems = async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = `http://localhost:3002/api/ebay/browse?query=${encodeURIComponent(q)}&limit=20`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API request failed: ${res.status} ${res.statusText}`);
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'API returned an error');
        setItems([]);
        return;
      }
      setItems(data.items || []);
    } catch (err: any) {
      setItems([]);
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
      <h1 style={{marginBottom: 12}}>Recherche eBay (Browse API)</h1>
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

      {!loading && !error && items.length === 0 && (
        <div>Aucun résultat.</div>
      )}

      <div style={{paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 12}}>
        {items.map((item, index) => (
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
      </div>
    </div>
  );
}

export default App
