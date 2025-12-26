# Find-it

Objectif : un site unique pour rechercher des objets sur plusieurs places de marché, avec un focus sur les sites de seconde main et des pays ciblés (ex. eBay France). Frontend React, backend Express avec l’API Browse eBay.

## Démarrage rapide

### Backend (port 3002)
```bash
cd server
$env:PORT=3002
npm start
```

### Frontend (port 5173)
```bash
npm run dev
```

Ouvre http://localhost:5173 et lance une recherche.

## Configuration

- `server/.env` (non versionné) :
  - `EBAY_APP_ID` = Client ID (Production)
  - `EBAY_CLIENT_SECRET` = Client Secret (Production)
  - `EBAY_SANDBOX` = false
  - `EBAY_NOTIFICATION_TOKEN` / `EBAY_NOTIFICATION_ENDPOINT` si notifications configurées
  - Optionnel : `EBAY_ENDUSERCTX` pour l’affiliation (ePN)

## Périmètre actuel

- Recherche eBay (Browse API) marketplace FR
- Formulaire de recherche côté frontend
- Cartes résultat via `EbayCard`

## À venir

- Support multi-sites (autres marketplaces seconde main)
- Sélecteur de pays / marketplace
- Affichage enrichi (livraison, vendeur, etc.)
