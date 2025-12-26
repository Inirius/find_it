import React from 'react';

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
    <article className="ebay-card" style={{border: '1px solid #ddd', padding: 12, borderRadius: 6, maxWidth: 520}}>
      <div style={{display: 'flex', gap: 12}}>
        {image && (
          <div style={{flex: '0 0 160px'}}>
            <img src={image} alt={alt ?? ''} style={{width: '100%', height: 'auto', display: 'block', borderRadius: 4}} />
          </div>
        )}
        <div style={{flex: 1}}>
          <h3 style={{margin: '0 0 8px 0', fontSize: '1rem'}}>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" style={{color: '#0a66c2', textDecoration: 'none'}}>
                {title ?? 'Voir l\'article'}
              </a>
            ) : (
              title ?? 'Titre indisponible'
            )}
          </h3>
          <div style={{color: '#111', fontWeight: 700, marginBottom: 6}}>{price ?? ''}</div>
          {shipping && (
            <div style={{color: '#555'}}>Livraison: {shipping}</div>
          )}
        </div>
      </div>
    </article>
  );
}
