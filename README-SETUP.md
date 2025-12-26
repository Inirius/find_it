# Find-it - eBay Browse API

Application React + Express utilisant l'API officielle **Browse** d'eBay (OAuth) pour rechercher des articles seconde main, avec un focus par marketplace (ex. eBay France).

## Architecture

- **Frontend**: React + Vite (port 5173)
- **Backend**: Express + Browse API eBay (port 3002) – OAuth client credentials

## Installation et démarrage

### 1️⃣ Démarrer le serveur backend (Terminal 1)

```bash
cd server
$env:PORT=3002
npm start
```

Le serveur API sera disponible sur `http://localhost:3002`

### 2️⃣ Démarrer le frontend (Terminal 2)

```bash
npm run dev
```

L'application sera disponible sur `http://localhost:5173`

## API Backend

### Endpoint de recherche (Browse API)

```
GET http://localhost:3002/api/ebay/browse?query=YOUR_SEARCH&limit=20
```

Exemple:
```bash
curl "http://localhost:3002/api/ebay/browse?query=drone&limit=3"
```

Réponse (exemple):
```json
{
  "success": true,
  "count": 20,
  "items": [
    {
      "title": "Drone pliable...",
      "url": "https://www.ebay.fr/itm/...",
      "image": "https://i.ebayimg.com/...",
      "price": "39.99 EUR",
      "shipping": "5.90 EUR"
    }
  ],
  "source": "Browse API Production"
}
```

### Health check

```
GET http://localhost:3002/health
```

## Pourquoi cette architecture ?

### ❌ Problème initial: CORS & blocage eBay
- Les requêtes directes sont bloquées et sujettes aux challenges/anti-scraping.

### ✅ Solution actuelle: API officielle eBay Browse (OAuth)
- Requêtes serveur → eBay via Browse API (données structurées, légales, stables)
- Pas de scraping HTML ni de dépendance au DOM d'eBay
- Paramétrage par marketplace (ex. `EBAY_FR`)

## Avantages

- ✅ Conforme et stable (API officielle)
- ✅ Données structurées (prix, images, livraison)
- ✅ Pas de CORS côté frontend (proxy backend)
- ✅ Extensible (affiliation via `X-EBAY-C-ENDUSERCTX`)

## Technologies

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Express, Axios
- **API**: eBay Browse API (OAuth client credentials)
