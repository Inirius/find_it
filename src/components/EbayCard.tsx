type Props = {
  title: string | null;
  url: string | null;
  image: string | null;
  alt?: string | null;
  price: string | null;
  shipping: string | null;
};

export default function EbayCard({ title, url, image, alt, price, shipping }: Props) {
  return (
    <article className="ebay-card" style={{border: '1px solid #ddd', padding: 12, borderRadius: 6, width: '100%', overflow: 'hidden'}}>
      {image && (
        <img
          src={image}
          alt={alt ?? ''}
          style={{width: '100%', height: 180, objectFit: 'cover', display: 'block', borderRadius: 4}}
        />
      )}
      <h3 style={{margin: '8px 0 8px 0', fontSize: '1rem', overflowWrap: 'anywhere'}}>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" style={{color: '#0a66c2', textDecoration: 'none', wordBreak: 'break-word', overflowWrap: 'anywhere'}}>
            {title ?? 'Voir l\'article'}
          </a>
        ) : (
          title ?? 'Titre indisponible'
        )}
      </h3>
      <div style={{color: '#fff', fontWeight: 700, marginBottom: 6}}>{price ?? ''}</div>
      {shipping && (
        <div style={{color: '#555'}}>Livraison: {shipping}</div>
      )}
    </article>
  );
}
