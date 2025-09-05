# Compose interest tracker

Une application web pour tracker et monitorer vos positions de lending AAVE à travers plusieurs wallets.

## 🚀 Démarrage Rapide

### Avec Docker (Recommandé)

1. **Build et run avec Docker Compose** :
```bash
docker-compose up --build
```

2. **Ou avec Docker directement** :
```bash
# Build l'image
docker build -t aave-tracker .

# Run le container
docker run -p 8083:8083 -v $(pwd)/database:/app/database -v $(pwd)/environements:/app/environements aave-tracker
```

3. **Accéder à l'application** :
Ouvrez votre navigateur sur `http://localhost:8083`

### Sans Docker

1. **Installer les dépendances** :
```bash
npm install
```

2. **Démarrer le serveur** :
```bash
node server.js
```

## 📝 Fonctionnalités

- ✅ **Gestion des Wallets** : Ajouter/supprimer des wallets Ethereum
- ✅ **Système de Filtres** : Sélectionner quels wallets afficher
- ✅ **Vue d'Ensemble** : Affichage des tokens avec montants totaux agrégés
- ✅ **Historique Détaillé** : Vue par token avec historique quotidien (montants, changements, pourcentages)
- ✅ **Interface Moderne** : Design responsive avec animations

## 🔧 Configuration

L'application utilise les fichiers de configuration dans le dossier `environements/` pour les paramètres RPC et autres configurations.

## 📊 Structure des Données

Les données sont stockées dans le dossier `database/` :
- `wallets` : Liste des wallets trackés avec leur historique
- `projects` : Configuration des tokens supportés (USDC, USDT, etc.)

## 🐳 Docker

### Variables d'environnement

- `PORT` : Port du serveur (défaut: 8083)
- `NODE_ENV` : Environment Node.js (défaut: production)

### Volumes

- `/app/database` : Persistance des données
- `/app/environements` : Configuration de l'environnement

### Health Check

Le container inclut un health check qui vérifie que l'API répond correctement sur `/api/wallets`.

## 🌐 API Endpoints

- `GET /` : Interface web
- `GET /api/wallets` : Liste des wallets
- `POST /api/wallets` : Ajouter un wallet
- `DELETE /api/wallets/:address` : Supprimer un wallet
- `POST /api/aggregated-balances` : Balances agrégées
- `POST /api/token-history/:token` : Historique d'un token
- `POST /api/track-wallet/:address` : Mettre à jour un wallet

## 🚦 Logs

Les logs du container peuvent être visualisés avec :
```bash
docker-compose logs -f aave-tracker
``` 