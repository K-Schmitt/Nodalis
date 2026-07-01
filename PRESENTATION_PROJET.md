# PRÉSENTATION PROJET ARCHI-OS

**Projet**: Moteur de Graphe Sémantique Meta-Modeler
**Phase actuelle**: Phase 0 - Initialisation & POC
**Date**: Février 2026

---

## 1️⃣ STACK TECHNIQUE

### Frontend (Interface Web)
- **React 19 + Vite** - Framework moderne
- **React Flow** - Moteur de rendu de graphe
- **ELK.js** - Auto-Layout (positionnement automatique)
- **Tailwind CSS** - Styling
- **Zustand** - Gestion d'état global

### Backend (Core)
- **Node.js + Fastify** - Performance et typage TypeScript
- **Zod** - Validation stricte des schémas JSON

### Interface IA
- **MCP (Model Context Protocol) SDK** - Connecteur pour Cursor/Windsurf
- **OpenAI API (GPT-4o)** ou **Gemini 1.5 Pro** - Services IA

### Infrastructure
- **Docker** - Isolation du serveur MCP
- **Git** - Versioning fichiers JSON

### Persistance (Phase finale uniquement)
- **PostgreSQL + JSONB** - Base de données (optionnel Phase 5+, si >1000 nodes ou besoins collaboratifs)

---

## 2️⃣ FONCTIONNALITÉS VERSION FINALE

### Interface Utilisateur (Web UI)

**Visualisation:**
- Visualiser le graphe complet avec zoom/pan via React Flow
- Voir les détails d'un nœud dans un panneau latéral
- Afficher les nœuds avec leur style spécifique (couleur/forme personnalisée)
- Réorganiser automatiquement le graphe avec algorithme ELK

**Interaction:**
- Réorganiser les nœuds manuellement (Drag & Drop)
- Afficher les propositions IA en split-screen: version précédente (gauche) vs version modifiée (droite) avec code couleur (vert: ajout, rouge: suppression, orange: modification)
- Valider ou rejeter une proposition d'un clic (boutons Approve/Reject)
- Rechercher et filtrer les nœuds par nom/type/catégorie
- Annuler/Refaire les actions (Ctrl+Z / Ctrl+Y avec historique de 50 actions)
- Notifications contextuelles (succès, erreurs, warnings)

### Moteur & Intelligence (Backend/MCP)

**Gestion des Définitions:**
- Scanner un dossier local pour charger dynamiquement les types disponibles
- Valider la cohérence des règles au démarrage
- Hot-reload des définitions en mode développement
- Générer automatiquement la documentation des types

**Assistant IA:**
- Interroger l'IA sur l'architecture actuelle
- Demander à l'IA de modifier le graphe via des proposals
- Empêcher l'IA de créer des connexions interdites (Rule Engine + validation des contraintes)
- Détecter les cycles dans les dépendances
- Valider les schémas de données des nœuds

### Système & Stockage

**Persistance:**
- Sauvegarder l'état du graphe (PostgreSQL + JSONB en version finale, fichiers JSON en phases initiales)
- Versionner les définitions via Git
- Système de proposals avec file d'attente

**Export & Import:**
- Exporter le graphe en PNG/SVG
- Exporter en JSON pour backup
- Importer une architecture depuis un fichier

**Developer Experience:**
- CLI pour valider des définitions offline (`archi-os validate`)
- CLI pour initialiser un nouveau projet (`archi-os init`)
- CLI pour exporter en mode headless (`archi-os export --format svg`)
- Logging structuré et health check endpoints
- Tests automatisés via CI/CD GitHub Actions

---

## 3️⃣ BACKLOG / SCOPE DÉTAILLÉ (7 MOIS)

### 📦 PHASE 0 : Initialisation (Mois 0)
**Objectif**: Valider la faisabilité technique

**0.1 : Setup DevOps** (Petit - 1-2j)
- Setup repo Git + .gitignore + structure dossiers
- Configuration ESLint + Prettier
- Documentation CONTRIBUTING.md

**0.2 : Docker & Environnement** (Moyen - 3-5j)
- Dockerfile multi-stage (core + web)
- Docker Compose pour dev local
- Scripts npm pour build/run

**0.3 : POC React Flow** (Moyen - 3-5j)
- React Flow avec 50 nodes de test (dummy data)
- Validation interactions (zoom/pan/drag)
- Performance check

**0.4 : POC MCP Server** (Moyen - 3-5j)
- Serveur MCP basique exposant 1 tool_call fictif
- Test intégration avec Cursor/Windsurf
- Validation du protocole

**Livrables**: Repo initialisé + 2 POCs validés + Docker fonctionnel + Validation faisabilité technique

---

### 🧱 PHASE 1 : Fondations & Registry (Mois 1)
**Objectif**: Poser les bases du système de définitions

**1.1 : Definition Loader & Registry** (Petit - 1-2j)
- Créer le Schema Zod pour valider les fichiers `.def.json`
- Implémenter le scan récursif du dossier `./definitions`
- Stocker les définitions valides dans une Map en mémoire
- Gérer le versioning des définitions (semver)
- Test : Rejeter une fiche si `maxIncomingEdges` est une string "infinite" (doit être `null`)

**1.2 : File Watcher & Hot Reload** (Moyen - 3-5j)
- Détecter les modifications des fichiers `.def.json`
- Recharger automatiquement le Registry en dev mode
- Logger les changements et erreurs de chargement

**Livrables**: Module `registry/` fonctionnel + Tests unitaires (10+ cas) + Documentation API

**Charge**: ~10 jours

---

### 🧠 PHASE 2 : Rule Engine & Validation (Mois 2)
**Objectif**: Implémenter la logique de validation des graphes

**2.1 : Connection Validator** (MUST HAVE)
- Implémenter la validation des wildcards (`tech:service:*`)
- Créer la fonction `validateConnection(source, target)`
- Gérer les contraintes `maxIncomingEdges` et `maxOutgoingEdges`
- Test : Tenter de connecter une Database vers une API → Erreur bloquante

**2.2 : Cycle Detection** (MUST HAVE)
- Algorithme de détection de cycles dans le graphe
- Prévenir les dépendances circulaires
- Messages d'erreur explicites avec chemin du cycle

**2.3 : Data Schema Validation** (MUST HAVE)
- Valider le contenu des nodes selon leur `dataSchema`
- Fournir des valeurs par défaut
- Gérer les champs requis et optionnels

**Livrables**: Module `validation/` complet + Tests (>50 cas) + Catalogue d'erreurs standardisé

**Charge**: ~12 jours

---

### 🤖 PHASE 3 : MCP Server & AI Integration (Mois 3)
**Objectif**: Connecter l'IA au système via MCP

**3.1 : Dynamic MCP Server** (Gros - 7-10j)
- Générer la description des outils MCP à partir du Registry
- Implémenter l'endpoint `list_types`
- Implémenter l'endpoint `propose_changes` (limité à 50 ops)
- Gérer les erreurs avec codes explicites (`ERR_RULE_VIOLATION`, etc.)

**3.2 : Proposal System** (Moyen - 3-5j)
- Structure de données Proposal (UUID, status, operations)
- File d'attente des proposals (`.archi/pending/`)
- API approve/reject pour l'utilisateur

**3.3 : Context Builder** (Moyen - 3-5j)
- Générer automatiquement le prompt système pour l'IA
- Inclure les types disponibles et leurs contraintes
- Fournir des exemples d'usage

**3.4 : Tests & Intégration** (Moyen - 3-5j)
- Script de test simulant l'IA via OpenAI API
- Validation tool_call et réponses
- Tests end-to-end MCP

**Livrables**: Serveur MCP fonctionnel + Script test IA + Documentation protocole

**Charge**: ~15 jours

---

### 🎨 PHASE 4 : UI & Visualisation (Mois 4)
**Objectif**: Créer l'interface de visualisation

**4.1 : React Flow Setup** (Petit - 1-2j)
- Initialiser le projet Vite + React 19 + Tailwind
- Configurer React Flow + Zustand
- Créer le layout de base (header, canvas, sidebar)

**4.2 : Universal Node Renderer** (Gros - 7-10j)
- Composant `UniversalNode.tsx` générique
- Support des shapes (rectangle, cylinder, circle, diamond)
- Styling dynamique depuis `definition.style`
- Affichage des icônes

**4.3 : Graph Interactions** (Moyen - 3-5j)
- Zoom/Pan sur le canvas
- Sélection de nodes
- Drag & Drop pour réorganiser
- Panneau latéral de détails

**4.4 : Auto-Layout** (Moyen - 3-5j)
- Intégration d'ELK.js
- Layout automatique (hierarchical, force-directed)
- Bouton "Auto-arrange"

**Livrables**: Application web fonctionnelle + Composants réutilisables + Storybook

**Charge**: ~14 jours

---

### ⚡ PHASE 5 : Advanced Features & UX (Mois 5)
**Objectif**: Améliorer l'expérience développeur et utilisateur

**5.1 : Visual Diff System** (Gros - 7-10j)
- Afficher les proposals de l'IA en splitscreen
- Code couleur (vert = ajout, rouge = suppression, orange = modification)
- Animation de transition
- Boutons Approve/Reject

**5.2 : Export & Import Features** (Moyen - 3-5j)
- Export graphe en PNG (html-to-image)
- Export graphe en SVG (React Flow natif)
- Export JSON pour backup
- Importer une architecture depuis un fichier JSON

**5.3 : Search & Filter** (Moyen - 3-5j)
- Recherche de nodes par nom/type
- Filtrage par catégorie
- Highlight des résultats sur le canvas

**5.4 : Undo/Redo** (Gros - 7-10j)
- Historique des actions (stack en mémoire, max 50)
- Ctrl+Z / Ctrl+Y
- Affichage de l'historique dans l'UI

**5.5 : Notifications** (Moyen - 3-5j)
- Toasts/Notifications : succès (vert), erreurs (rouge), warnings (orange)
- Gestion de la queue de notifications
- Animation fluide

**Livrables**: UX premium complète + Visual Diff opérationnel + Export/Import fonctionnels

**Charge**: ~13 jours

---

### 🔧 PHASE 6 : CLI, Documentation & Polish (Mois 6)
**Objectif**: Finaliser pour la production

**6.1 : CLI Tools** (Moyen - 3-5j)
- Commande `archi-os validate ./definitions` : validation offline
- Commande `archi-os init` : scaffold nouveau projet
- Commande `archi-os export --format svg|png` : export headless

**6.2 : Documentation** (Moyen - 3-5j)
- Page `/docs` : génération auto doc des types disponibles
- README.md final avec 3 exemples (AWS, K8s, Microservices)
- FAQ et troubleshooting

**6.3 : DevOps & Production** (Moyen - 3-5j)
- CI/CD GitHub Actions : lint + tests auto sur push
- Docker Compose prod-ready (volumes, env vars, healthcheck)
- Scripts de déploiement
- Migration vers PostgreSQL + JSONB pour la version finale

**6.4 : Logging & Monitoring** (Petit - 1-2j)
- Logging structuré (Winston/Pino)
- Health check endpoints
- Exports logs JSON

**6.5 : Security Audit** (Moyen - 3-5j)
- Validation des inputs utilisateur
- Rate limiting sur l'API
- CORS configuration
- Secrets management

**Livrables**: Version 1.0 production-ready + CLI installable npm + Documentation complète + Sécurité

**Charge**: ~12 jours

---

## 4️⃣ PROPOSITION SCHÉMA BASE DE DONNÉES

### Solution Phase 1-4 : Stockage Fichiers (Git-based)
**Architecture actuelle (Phase 0-4):**
- Fichier unique `architecture.json` contenant nodes et edges
- Définitions dans `definitions/*.def.json`
- Registry en mémoire (Map TypeScript)
- Versionning via Git

**Avantages:**
- Simple et versionnable
- Lisible par humains
- Suffisant pour MVP (<1000 nodes)

**Limites:**
- Conflits potentiels en collaboration intensive
- Performance limitée à grande échelle

---

### Solution Phase 5+ : PostgreSQL + JSONB (Optionnel)

**Contexte d'utilisation:**
- Si >1000 nodes dans le graphe
- Si besoin de collaboration temps réel
- Si requêtes complexes nécessaires

**Schéma Proposé:**

#### Table `definitions`
```sql
CREATE TABLE definitions (
    type_id VARCHAR(255) PRIMARY KEY,  -- Ex: "tech:database:postgres"
    version VARCHAR(50) NOT NULL,       -- Semver: "1.0.0"
    metadata JSONB NOT NULL,            -- {label, category}
    behavior JSONB NOT NULL,            -- {maxIncomingEdges, allowConnectionFrom[]}
    style JSONB NOT NULL,               -- {shape, backgroundColor, icon}
    data_schema JSONB,                  -- JSON Schema pour validation
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_definitions_category ON definitions ((metadata->>'category'));
```

#### Table `nodes`
```sql
CREATE TABLE nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_id VARCHAR(255) NOT NULL REFERENCES definitions(type_id),
    position JSONB NOT NULL,            -- {x: number, y: number}
    data JSONB DEFAULT '{}',            -- Propriétés spécifiques au type
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_nodes_type ON nodes(type_id);
CREATE INDEX idx_nodes_data ON nodes USING GIN (data);
```

#### Table `edges`
```sql
CREATE TABLE edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    edge_type VARCHAR(100) DEFAULT 'default',
    metadata JSONB DEFAULT '{}',        -- {label, color, etc.}
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE UNIQUE INDEX idx_edges_unique ON edges(source_id, target_id, edge_type);
```

#### Table `proposals`
```sql
CREATE TABLE proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    operations JSONB NOT NULL,          -- Array d'opérations [{op, payload}]
    author VARCHAR(255),                -- "AI" ou user_id
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_proposals_status ON proposals(status);
CREATE INDEX idx_proposals_created ON proposals(created_at DESC);
```

#### Table `history` (pour Undo/Redo)
```sql
CREATE TABLE history (
    id BIGSERIAL PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL,   -- "add_node", "delete_edge", etc.
    payload JSONB NOT NULL,             -- État avant/après
    user_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_history_created ON history(created_at DESC);
```

**Requêtes d'exemple:**

```sql
-- Récupérer un graphe complet
SELECT 
    n.id, n.type_id, n.position, n.data,
    d.metadata->>'label' as type_label,
    d.style
FROM nodes n
JOIN definitions d ON n.type_id = d.type_id;

-- Trouver toutes les connexions d'un node
SELECT e.*, 
    source.type_id as source_type,
    target.type_id as target_type
FROM edges e
JOIN nodes source ON e.source_id = source.id
JOIN nodes target ON e.target_id = target.id
WHERE e.source_id = 'uuid-here' OR e.target_id = 'uuid-here';

-- Recherche full-text dans les propriétés JSONB
SELECT * FROM nodes
WHERE data @> '{"environment": "production"}';

-- Détecter les cycles (requête récursive CTE)
WITH RECURSIVE graph_path AS (
    SELECT source_id, target_id, ARRAY[source_id] as path
    FROM edges WHERE source_id = 'start-node-uuid'
    UNION ALL
    SELECT e.source_id, e.target_id, path || e.source_id
    FROM edges e
    JOIN graph_path gp ON e.source_id = gp.target_id
    WHERE NOT (e.source_id = ANY(path))
)
SELECT * FROM graph_path WHERE target_id = 'start-node-uuid'; -- Cycle détecté
```

**Migration Fichiers → DB:**
```javascript
// Script Node.js de migration
const architecture = JSON.parse(fs.readFileSync('architecture.json'));

await db.transaction(async (trx) => {
    // Insérer nodes
    for (const node of architecture.nodes) {
        await trx('nodes').insert({
            id: node.id,
            type_id: node.typeId,
            position: node.position,
            data: node.data
        });
    }
    // Insérer edges
    for (const edge of architecture.edges) {
        await trx('edges').insert({
            id: edge.id,
            source_id: edge.source,
            target_id: edge.target,
            metadata: edge.metadata
        });
    }
});
```

**Note importante:**
Cette base de données n'est **PAS utilisée dans les phases 0-4**. Le projet fonctionne actuellement avec des fichiers JSON versionnés via Git. La migration vers PostgreSQL sera considérée uniquement si nécessaire en Phase 5+, en fonction des besoins de performance et collaboration.

---

## 📊 RÉSUMÉ

**Période totale**: 7 mois (Mois 0 + 6 mois de développement)
**Charge totale estimée**: 76 jours-homme (10-15j/mois)
**Phase actuelle**: Mois 0 - POC et Initialisation
**Stack**: React Flow + Node.js + MCP + Docker
**DB**: Fichiers JSON (Phase 0-4), PostgreSQL optionnel (Phase 5+)
