# Nodalis Core (Backend)

Moteur de validation et Registry pour le graphe sémantique.

## Structure

```
src/
├── domain/          # Logique métier pure (agnostique)
├── application/     # Use cases
├── infrastructure/  # Adaptateurs (API, MCP, File System)
└── errors/          # Hiérarchie d'erreurs typées
```

## Commandes

```bash
npm run dev          # Mode développement avec hot-reload
npm run build        # Compilation TypeScript
npm run test         # Lancer tous les tests
npm run test:unit    # Tests unitaires uniquement
```

## Règles Architecturales

- **Agnosticité Totale** : Aucune logique métier hardcodée
- **Immutabilité** : Modifications via Proposals uniquement
- **Registry as Source of Truth** : Toutes les validations passent par le Registry
