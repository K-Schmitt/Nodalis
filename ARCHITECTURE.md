# Architecture d'ARCHI-OS

## Vue d'ensemble

ARCHI-OS est un système de gestion et de visualisation d'architecture logicielle qui permet de manipuler des graphes d'architecture via des IA et de les visualiser dans une interface web.

### Architecture générale

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   IA Assistant  │────────▶│  MCP Server      │────────▶│  graph.json     │
│   (via MCP)     │         │  (stdio)         │         │  (persistence)  │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                                                   │
                                                                   │ watch
                                                                   ▼
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Frontend Web  │────────▶│  HTTP Server     │────────▶│  Graph (memory) │
│   (React)       │  poll   │  (port 3000)     │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

## Structure du projet

```
Archi-Os/
├── core/                    # Backend (TypeScript/Node.js)
│   ├── src/
│   │   ├── application/     # Use cases (logique métier)
│   │   ├── domain/          # Modèle de domaine
│   │   ├── errors/          # Erreurs personnalisées
│   │   └── infrastructure/  # Couches techniques
│   ├── definitions/         # Définitions des types de nodes
│   ├── tests/              # Tests unitaires et d'intégration
│   └── dist/               # Code compilé (généré)
│
├── web/                    # Frontend (React/Vite)
│   ├── src/
│   │   ├── components/     # Composants React
│   │   ├── hooks/          # Hooks React custom
│   │   └── stores/         # State management (Zustand)
│   └── public/            # Assets statiques
│
├── cli/                    # CLI @archi-os/cli (install/launch/MCP)
│   ├── src/
│   │   ├── commands/      # init, doctor, up, down, uninstall
│   │   ├── lib/           # modules purs (mcp-config, paths, ports, process, static-server)
│   │   ├── config.ts      # schéma Zod de .archi/cli.json
│   │   └── errors.ts      # CliError & dérivés
│   └── tests/unit/        # tests vitest des modules purs
│
└── .archi/                # Données persistées
    ├── graph.json         # État du graphe
    ├── cli.json           # Config CLI : ports préférés + clients configurés
    └── cli/               # Runtime CLI (gitignoré)
        ├── run.json       # Registre PID/port/signature des process lancés
        └── logs/          # core.log, web.log (process détachés)
```

---

## Core Backend (`/core`)

### Points d'entrée

#### `src/index.ts`
**Rôle** : Point d'entrée principal du backend. Initialise tous les composants et démarre soit le serveur MCP soit le serveur HTTP selon la variable d'environnement.

**Fonctionnement** :
- Crée les instances du domaine (`Registry`, `Graph`)
- Initialise le `GraphStorage` pour la persistance
- Charge le graph depuis le fichier `.archi/graph.json`
- Charge les définitions de types depuis `/definitions`
- Lance soit :
  - **MCP Server** (par défaut) : pour la communication avec les IA
  - **HTTP Server** (si `RUN_HTTP_SERVER=true`) : pour le frontend web

**Variables d'environnement** :
- `WORKSPACE_ROOT` : Racine du workspace
- `DEFINITIONS_PATH` : Chemin vers les définitions
- `RUN_HTTP_SERVER` : Si `true`, lance le serveur HTTP au lieu du MCP

---

### Domain Layer (`src/domain/`)

#### `graph.ts`
**Rôle** : Modèle central représentant le graphe d'architecture.

**Responsabilités** :
- Gestion des nodes (ajout, suppression, récupération)
- Gestion des edges (ajout, suppression, récupération)
- Maintien de la cohérence du graphe en mémoire
- Méthode `clear()` pour vider complètement le graphe

**Structure de données** :
```typescript
class Graph {
  private nodes: Map<string, Node>
  private edges: Map<string, Edge>
}
```

#### `registry.ts`
**Rôle** : Registre des types de nodes disponibles (definitions).

**Responsabilités** :
- Stocke les définitions de types (tech:frontend:react, tech:database:postgres, etc.)
- Fournit l'accès aux définitions pour validation et affichage
- Gère le hot-reload des définitions en développement

**Exemple de définition** :
```json
{
  "id": "tech:frontend:react",
  "name": "React Frontend",
  "style": { "shape": "rectangle", "color": "#61dafb" }
}
```

#### `types.ts`
**Rôle** : Définitions TypeScript des types du domaine.

**Types principaux** :
- `Node` : Représente un composant d'architecture
- `Edge` : Représente une connexion entre nodes
- `Definition` : Définition d'un type de node
- `Proposal` : Proposition de changements au graphe

#### `rule-engine.ts`
**Rôle** : Moteur de règles pour valider les opérations sur le graphe (futur).

**Status** : Prévu pour les phases futures, pas encore utilisé.

---

### Application Layer (`src/application/`)

#### `load-definitions.use-case.ts`
**Rôle** : Use case pour charger les définitions de types depuis le système de fichiers.

**Fonctionnalités** :
- Charge tous les fichiers `.def.json` depuis `/definitions`
- Enregistre les définitions dans le `Registry`
- Active le hot-reload en mode développement

#### `validate-proposal.use-case.ts`
**Rôle** : Use case pour valider une proposition de changements.

**Validations** :
- Vérifie que les types de nodes existent
- Vérifie que les IDs sont au format UUID v4
- Vérifie que les nodes référencés dans les edges existent

#### `apply-proposal.use-case.ts`
**Rôle** : Use case pour appliquer une proposition validée au graphe.

**Opérations supportées** :
- `add_node` : Ajouter un node
- `add_edge` : Ajouter une edge
- `delete_node` : Supprimer un node
- `delete_edge` : Supprimer une edge
- `update_node` : Mettre à jour un node

---

### Infrastructure Layer (`src/infrastructure/`)

#### `mcp/mcp-server.ts`
**Rôle** : Serveur MCP (Model Context Protocol) pour la communication avec les IA.

**Communication** : Via stdio (stdin/stdout)

**Tools exposés** :
1. **`list_types`** : Liste tous les types de nodes disponibles
2. **`get_graph`** : Retourne l'état actuel du graphe
3. **`propose_changes`** : Propose et applique des changements au graphe

**Format des proposals** :
```typescript
{
  author: "AI Assistant",
  operations: [
    {
      op: "add_node",
      payload: {
        id: "uuid-v4",
        typeId: "tech:frontend:react",
        label: "My App"
      }
    }
  ]
}
```

**Fonctionnalités** :
- Validation automatique des proposals via `ValidateProposalUseCase`
- Application automatique via `ApplyProposalUseCase`
- Sauvegarde automatique après chaque changement via `GraphStorage`

#### `api/http-server.ts`
**Rôle** : Serveur HTTP REST pour le frontend web.

**Port** : 3000 (configurable)

**Endpoints** :
- `GET /api/graph` : Retourne le graphe au format React Flow
- `GET /api/definitions` : Liste les types disponibles
- `GET /health` : Health check du serveur

**Fonctionnalités clés** :
- **Auto-reload** : Surveille le fichier `graph.json` via `fs.watch()`
- Quand le fichier change, recharge automatiquement le graphe
- Transforme les données pour React Flow (format compatible)

**CORS** : Configuré pour accepter `http://localhost:5173`

#### `persistence/graph-storage.ts`
**Rôle** : Gestion de la persistance du graphe sur disque.

**Fichier** : `.archi/graph.json`

**Méthodes** :
- `load(graph)` : Charge le graphe depuis le fichier
  - **IMPORTANT** : Vide le graphe avant de charger (évite les doublons)
- `save(graph)` : Sauvegarde le graphe dans le fichier
- `clear()` : Supprime le fichier de persistance

**Format du fichier** :
```json
{
  "nodes": [...],
  "edges": [...],
  "savedAt": "2026-02-05T18:00:00.000Z"
}
```

#### `file-system/definition-loader.ts`
**Rôle** : Charge les définitions de types depuis le système de fichiers.

**Fonctionnalités** :
- Lit tous les fichiers `.def.json` depuis un répertoire
- Parse et valide le JSON
- Support du hot-reload via `fs.watch()`

---

### Errors (`src/errors/`)

#### `base-error.ts`
Classe de base pour toutes les erreurs custom.

#### `definition-not-found-error.ts`
Erreur lancée quand un type de node n'existe pas.

#### `rule-violation-error.ts`
Erreur lancée quand une règle de validation est violée.

#### `schema-validation-error.ts`
Erreur lancée quand les données ne respectent pas le schéma attendu.

---

## Definitions (`/definitions`)

Fichiers JSON définissant les types de nodes disponibles :

### `lambda.def.json`
Définition pour les fonctions AWS Lambda.

### `postgres.def.json`
Définition pour les bases de données PostgreSQL.

### `react.def.json`
Définition pour les applications React.

### `rest-api.def.json`
Définition pour les APIs REST.

**Structure d'une définition** :
```json
{
  "id": "tech:frontend:react",
  "name": "React Application",
  "description": "A React frontend application",
  "category": "frontend",
  "style": {
    "shape": "rectangle",
    "color": "#61dafb"
  }
}
```

---

## Frontend Web (`/web`)

### `src/main.tsx`
Point d'entrée React. Monte l'application sur le DOM.

### `src/App.tsx`
Composant racine de l'application. Contient le `GraphCanvas`.

### `src/components/GraphCanvas.tsx`
**Rôle** : Composant principal de visualisation du graphe.

**Fonctionnalités** :
- Utilise **React Flow** pour le rendu du graphe
- Polling du serveur HTTP toutes les 2 secondes
- **Auto-layout paradigme-aware** avec **ELK.js** — l'algorithme, la direction de flux et le routage d'edges sont choisis selon le preset actif (voir `src/lib/layout.ts`)
- Tailles de nœuds réelles (`estimateNodeSize`) transmises à ELK ⇒ les records à hauteur variable ne se chevauchent pas
- Les handles suivent l'axe de flux (left→right pour BPMN/ERD/DDD, top→down pour UML)

**Profils de layout** (`src/lib/layout.ts`) :
| Preset | Algorithme | Direction | Routage |
|--------|-----------|-----------|---------|
| `erd` | layered (network-simplex) | RIGHT | orthogonal, spacing large |
| `uml` | layered | DOWN (héritage) | orthogonal |
| `bpmn` | layered | RIGHT (sequence flow) | orthogonal, compact |
| `ddd` | layered | RIGHT (timeline EventStorming) | orthogonal |
| `network` | **stress** (organique) | — | polyline |
| défaut | layered | DOWN | orthogonal |

### `src/components/UniversalNode.tsx` + `src/components/nodes/`
**Rôle** : Dispatcher de rendu paradigme-aware. `UniversalNode` reste le seul `nodeType` enregistré auprès de React Flow, mais il ne dessine plus lui-même : il lit `data.render.archetype` (transmis tel quel par le Core) et délègue au renderer générique correspondant. Aucune logique paradigme n'est câblée ici — l'archétype est de la **donnée**, donc une table ERD, une classe UML et une gateway BPMN passent toutes par ce composant tout en gardant un rendu authentique.

**Archétypes de rendu** (`src/components/nodes/`) :
- **`RecordNode`** — boîte titrée à compartiments de lignes : table ERD (colonnes + badges PK 🔑 / FK 🔗), classe UML (compartiments Attributs / Méthodes, visibilité `+/-/#` portée par le texte de la ligne), entité/agrégat DDD.
- **`ShapeNode`** — géométrie BPMN/flowchart pure : event (cercle fin=start / épais=end / double anneau=intermediate), task (rect arrondi + icône de type en coin), gateway (losange + glyphe `× / + / ○`), data-object.
- **`DeviceNode`** — grosse icône centrée + label dessous : équipements réseau (router / switch / firewall / server / cloud), infra.
- **`BoxNode`** — rendu legacy (forme colorée + icône + label), fallback quand une définition ne déclare pas de `render` (rétro-compatible ; convient aussi aux post-its EventStorming DDD event/command/saga).
- **`shared.tsx`** — helpers communs : `NodeFrame` (handles + badge sous-graphe), parsing des lignes/badges (`toRows`), et `estimateNodeSize()` — taille déterministe par archétype, **réutilisée par ELK** dans `GraphCanvas` pour que les nœuds à hauteur variable (records) ne se chevauchent pas.

Le descripteur `render` est optionnel, défini dans chaque `*.def.json`, validé par Zod dans le Core (`RenderSpecSchema`) puis transmis comme donnée opaque : **le Core ne branche jamais sur `archetype`** (agnosticité totale). Les edges ERD utilisent la notation **crow's-foot** (`cf-one`, `cf-many`, `cf-one-mandatory`, …) déclarée dans `MarkerDefs` (`RelationEdge.tsx`) et sélectionnée par les `edgeTypes` du preset.

**Archétype `container` + nesting** : les nœuds peuvent porter un `parentId` (`NodeSchema`, Core) et sont alors rendus *à l'intérieur* d'un nœud `container` (BPMN pool, DDD bounded-context, UML package) via le `parentId`/`extent:'parent'` de React Flow. La mise en page nested est gérée par `layoutNested` (`src/lib/elk.ts`) qui construit un arbre ELK — ELK retourne des coordonnées enfant relatives au parent, exactement ce qu'attend React Flow.

**Interactions par nœud** :
- `RecordNode` : édition inline (double-clic titre/ligne), ＋ ajout de ligne, compartiments repliables, pastilles de type colorées (`typeColor`), badges PK/FK/unique/index, italique + «stereotype» pour UML abstract, survol d'une FK → surbrillance des edges incidents.
- `ShapeNode` : icône de type de tâche (user/service/script/manual), events typés (message/timer/error), marqueur `[+]` sous-process.
- `DeviceNode` : pastille statut up/down, sous-titre IP/CIDR.
- `BoxNode` : palette EventStorming DDD + couleur de texte auto-contrastée (`readableText`).

**Édition d'edge** : label de cardinalité rendu via `EdgeLabelRenderer` ; clic-droit sur un edge → menu de changement de relation (`onEdgeContextMenu`).

**Design system & thème** : tokens CSS (`src/lib/theme.ts` + variables `index.css`), **dark mode** via `data-theme` piloté par `useUiStore`. Stores UI : `useUiStore` (thème, Cmd-K, survol), `useToastStore` (toasts liés aux `ApiError` du Core).

**Auto-layout avancé** (`GraphCanvas`) :
- placement **incrémental** (seuls les nouveaux nœuds sont placés, près d'un voisin connecté),
- toolbar : bascule direction ↓/→, choix d'algorithme ELK (`layered`/`stress`/`mrtree`/`radial`/`force`), Fit, Auto-layout,
- animation CSS des positions au re-layout (classe `.archi-animate`), `fitView` + focus sur le nœud sélectionné,
- tailles **mesurées réelles** (`node.measured`) transmises à ELK pour une mise en page au pixel près.

**UX globale** : palette avec **preview** du rendu réel + **drag-and-drop** sur le canvas, `NodeInspector` avec édition de tableaux (colonnes/attributs), **command palette** ⌘K (`CommandPalette`), toasts (`Toaster`), raccourcis clavier (F=fit, Shift+L=layout, Esc, Suppr), empty state, minimap colorée par paradigme, surbrillance du chemin impacté par une proposition IA. Le `GraphCanvas` (React Flow + ELK) est **code-split** (`React.lazy`) : le chunk initial passe de ~2,6 Mo à ~234 Ko.

### `src/stores/useGraphStore.ts`
**Rôle** : Store Zustand pour gérer l'état du graphe dans le frontend.

**État** :
```typescript
{
  nodes: Node[]        // Nodes React Flow
  edges: Edge[]        // Edges React Flow
  fetchGraph: () => Promise<void>
}
```

**Fonctionnalités** :
- Fetch les données depuis `http://localhost:3000/api/graph`
- Transforme les données pour React Flow
- Gère les erreurs de fetch

---

## CLI (`/cli`)

Package `@archi-os/cli` : **maison unique** de la logique « installer / lancer / configurer MCP ». L'extension VSCode (à venir) l'enveloppera sans dupliquer cette couche ; Docker est une cible runtime (`--docker`), pas un produit concurrent.

### Commandes (`src/commands/`)
- `init` : écrit/merge la config MCP du/des client(s), idempotent + réversible + backup. Écrit `.archi/cli.json`.
- `doctor` : diagnostics (Node ≥ 20, core buildé, config MCP présente, port préféré libre, process vivants, tail des logs).
- `up` : lance core (HTTP) détaché + serveur statique `web/dist`. Health-check en course avec la mort du child, registre incrémental. `--docker` délègue à `docker compose`.
- `down` : stoppe selon `run.json` (`native` → kill signé ; `docker` → `docker compose down`).
- `uninstall` : `down` puis retire chirurgicalement la clé `archi-os` des configs client (réversible).

### Modules purs (`src/lib/`)
- `mcp-config.ts` : merge/unmerge JSONC **chirurgical** (`jsonc-parser` `modify`/`applyEdits`) — préserve commentaires et serveurs voisins de l'utilisateur. Clé paramétrée (`mcpServers` pour Cursor/Claude, `servers` + `type:stdio` pour VSCode).
- `paths.ts` : descripteurs clients OS-aware (`process.platform`) + détection des clients installés.
- `ports.ts` : `findFreePort` (fallback), `waitForHealth` (poll `/health`, annulable via `signal`).
- `process.ts` : spawn **bimodal** (`detached` pour la CLI / `attached` réservé à l'extension), registre `run.json` avec **signature** anti-PID-reuse, kill portable (`taskkill` Windows / `SIGTERM→SIGKILL`).
- `static-server.ts` : serveur SPA zéro-dép, **confiné** (anti path-traversal), bind `127.0.0.1`, injection runtime `window.__ARCHI_OS__` (résout le port dynamique côté web sans rebuild).

### Fichiers d'état (sous `.archi/`)
- `.archi/cli.json` : config utilisateur (ports **préférés**, clients configurés). Validé Zod.
- `.archi/cli/run.json` : ports/PID **réels** après fallback ; source de vérité de `down`. L'injection web lit ce fichier.
- `.archi/cli/logs/{core,web}.log` : sorties des process détachés.

---

## Flux de données

### Création d'un node via IA

```
1. IA → propose_changes → MCP Server
2. MCP Server → ValidateProposalUseCase → vérifie le format
3. MCP Server → ApplyProposalUseCase → modifie le Graph
4. MCP Server → GraphStorage.save() → écrit graph.json
5. HTTP Server (fs.watch) → détecte le changement → GraphStorage.load()
6. Frontend (polling) → GET /api/graph → reçoit les nouveaux nodes
7. Frontend → affiche le graphe mis à jour
```

### Suppression d'un node via IA

```
1. IA → propose_changes (delete_node) → MCP Server
2. MCP Server → Graph.removeNode() + Graph.removeEdge() (edges associées)
3. MCP Server → GraphStorage.save()
4. HTTP Server → reload automatique
5. Frontend → affiche le graphe mis à jour
```

---

## Configuration

### Variables d'environnement

#### Core Backend
- `NODE_ENV` : Mode d'exécution (`development` | `production`)
- `WORKSPACE_ROOT` : Racine du projet (obligatoire)
- `DEFINITIONS_PATH` : Chemin vers les définitions (défaut: `./definitions`)
- `RUN_HTTP_SERVER` : Lance le HTTP server au lieu du MCP (`true` | `false`)

#### MCP Configuration (`~/.config/Code/User/mcp.json`)
```json
{
  "mcpServers": {
    "archi-os": {
      "command": "node",
      "args": ["/path/to/core/dist/index.js"],
      "env": {
        "NODE_ENV": "development",
        "WORKSPACE_ROOT": "/path/to/Archi-Os",
        "DEFINITIONS_PATH": "/path/to/definitions"
      }
    }
  }
}
```

---

## Problèmes résolus

### 1. Synchronisation MCP ↔ HTTP Server
**Problème** : Le serveur HTTP ne voyait pas les changements faits par le MCP Server.

**Cause** : Deux instances de `Graph` en mémoire, pas de synchronisation.

**Solution** : Ajout de `fs.watch()` dans le HTTP Server pour recharger le graphe quand `graph.json` change.

### 2. Duplication des nodes lors du reload
**Problème** : Après un reload, les nodes s'additionnaient au lieu de remplacer.

**Cause** : `GraphStorage.load()` ajoutait les nodes sans vider le graphe d'abord.

**Solution** : Ajout de `graph.clear()` au début de `load()`.

### 3. Format des proposals
**Problème** : Les IA oubliaient de mettre les UUIDs.

**Solution** : Documentation détaillée dans la description du tool MCP avec des exemples concrets et règles critiques.

---

## Scripts de développement

### Root (`/`)
```bash
npm run dev          # Lance MCP + HTTP + Frontend en parallèle
npm run dev:http     # Lance uniquement le HTTP server
npm run dev:web      # Lance uniquement le frontend
```

### Core (`/core`)
```bash
npm run dev          # Lance le serveur en mode watch (tsx)
npm run build        # Compile TypeScript → dist/
npm test             # Lance les tests
```

### Web (`/web`)
```bash
npm run dev          # Lance Vite dev server (port 5173)
npm run build        # Build de production
npm run preview      # Preview du build
```

---

## Technologies utilisées

### Backend
- **TypeScript** : Langage principal
- **Node.js** : Runtime
- **@modelcontextprotocol/sdk** : SDK pour MCP
- **Fastify** : Framework HTTP
- **tsx** : Exécution TypeScript en dev

### Frontend
- **React 18** : Framework UI
- **Vite** : Build tool et dev server
- **React Flow** : Librairie de graphes
- **ELK.js** : Algorithme d'auto-layout
- **Zustand** : State management
- **TailwindCSS** : Framework CSS

---

## Paradigmes, Edge Types & Sous-graphes (drill-down)

> Section ajoutée lors de la release "paradigmes & sous-graphes". Le reste de ce
> document décrit l'état antérieur (mono-graphe) et reste à rafraîchir ; cette
> section fait foi pour les capacités décrites ci-dessous.

### Paradigmes = presets (mécanisme de "subset" étendu)
Un workspace (ou un sous-graphe) porte un **preset** qui décide *quels* dossiers de
définitions charger ET les **règles** + **types de relations** actifs. Les presets
livrés couvrent deux familles :
- **Techniques** : `web`, `mobile`, `cloud-native`, `microservices`, `ai-ml`, `game`, `full`.
- **Modélisation** (paradigmes structurellement différents) : `erd` (entité-relation),
  `ddd` (Domain-Driven Design), `bpmn` (processus métier), `uml` (diagramme de classes),
  `network` (topologie réseau).

Chaque paradigme a son propre dossier de définitions (`definitions/erd/`, `ddd/`, …) et
son `*.preset.json`. Le Core reste **agnostique** : aucune logique de domaine en dur.

### Règles de preset (`PresetRulesSchema` dans `domain/types.ts`)
Appliquées par `RuleEngine`. Bloquantes (vérifiées à chaque opération) :
`forbiddenConnections`, `allowedConnectionsOnly`, `forbiddenTypes`, `maxNodesPerType`,
`maxDepth`, `noCycles`, `defaultMaxInputs/Outputs`. Consultatives (via
`validateGraphIntegrity`, exposé par `GET /api/graph/validate` et le tool MCP
`validate_graph`) : `requiredTypes`, `requiredConnections`.

### Edge Types (relations sémantiques)
Un preset peut déclarer `edgeTypes` : la liste des relations possibles sur les arêtes
(ex. UML `extends`/`composes`, ERD `1:N`). Chaque relation porte un `style`
(trait, pointillés, animation, **marqueurs** `markerStart`/`markerEnd`). L'arête
(`Edge.type`) doit correspondre à un `edgeType` du preset actif (sinon
`ERR_EDGE_TYPE_UNKNOWN`). Le frontend (`RelationEdge.tsx` + `MarkerDefs`) rend ces
relations avec des marqueurs SVG (triangle creux UML, losange de composition, etc.)
qui héritent de la couleur via `context-stroke`.

### Sous-graphes (drill-down)
Un nœud peut posséder un **sous-graphe imbriqué** avec son **propre preset** (ex. un
nœud "Database" d'un graphe `web` ouvre un sous-graphe `erd`).
- **Stockage** : `<workspace>/.archi/subgraphs/<nodeId>.graph.json` (contient
  `presetId`, `nodes`, `edges`). Le nœud parent porte `subgraph: { presetId }`.
  Historique de versions séparé par graphe (`versions/sub-<nodeId>.index.json`).
- **Pointeur de graphe actif** : `AppStateStore.activeGraphStack` (pile partagée
  cross-process MCP↔HTTP, remise à zéro au changement de workspace). Vide = graphe
  racine ; chaque entrée = un cran de drill-down (breadcrumb).
- **`WorkspaceManager.getActiveGraphContext()`** résout le fichier à lire/écrire et le
  **preset effectif** (auto-réparation vers la racine si le fichier de sous-graphe a
  disparu). `GraphStorage` et `PresetRegistry` se calent sur ce contexte → tout le
  mécanisme "reload-before-read" anti split-brain fonctionne tel quel pour les
  sous-graphes.

### Routes HTTP ajoutées
`GET /api/edge-types`, `GET /api/graph/context`, `GET /api/graph/validate`,
`PUT /api/graph/active` (pile de navigation), `POST /api/graph/nodes/:id/subgraph`.

### Tools MCP ajoutés
`create_subgraph`, `open_graph` (root/<nodeId>), `validate_graph`. `get_graph` renvoie
désormais `activeGraph` (scope, preset, breadcrumb) et `nodesWithSubgraphs`.

---

## Prochaines étapes

1. **Authentification** : Sécuriser les APIs
2. **WebSocket** : Remplacer le polling par du temps réel
3. **Undo/Redo** : Historique des changements (s'appuyer sur les snapshots existants)
4. **Exports** : Export du graphe en différents formats (PNG, SVG, JSON)
5. **Liens inter-graphes** : référencer un nœud d'un autre sous-graphe
6. **Rafraîchir** les sections "Definitions" et "Frontend Web" de ce document (état mono-graphe obsolète)
