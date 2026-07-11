# 📘 Nodalis

**Moteur de graphe sémantique agnostique — un "meta-modeler" piloté par des fiches de règles.**

Stack : Node.js + Fastify · React 19 + React Flow · MCP · Zod. Distribué comme
extension VSCode **Nodalis**, comme CLI `@archi-os/cli`, ou lancé depuis les sources.

> Dépôt : [K-Schmitt/Nodalis](https://github.com/K-Schmitt/Nodalis). Pour la
> référence technique fichier-par-fichier, voir [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 🎯 Concept

Nodalis est comme un moteur de jeu, mais pour l'architecture logicielle : **vide au
départ**, il apprend à modéliser n'importe quel domaine dès qu'on lui donne des
**fiches de définition** (`*.def.json`), et il empêche l'IA de faire des erreurs.

Contrairement à Draw.io (générique) ou Structurizr (spécialisé), le **Core est
agnostique** :

- Il ne connaît nativement ni "API" ni "Database".
- Il ingère des fiches JSON décrivant les types d'objets et leurs contraintes.
- Une fois chargées, il génère dynamiquement des outils pour l'IA (via MCP),
  transformant un LLM généraliste en expert du domaine défini.

Un même Core couvre plusieurs **paradigmes** (presets) : technique (`web`, `mobile`,
`cloud-native`, `microservices`, `ai-ml`, `game`, `full`) et modélisation (`erd`,
`ddd`, `bpmn`, `uml`, `network`).

---

## ⚙️ Flux de fonctionnement

```
Input (definitions) → Contexte IA (MCP) → Proposal → Validation → Approbation UI → Graphe
```

1. **Input** — le Core scanne `/definitions`, charge les `*.def.json` dans son **Registry** (mémoire).
2. **Contexte IA** — le serveur MCP expose dynamiquement les types + contraintes chargés.
3. **Proposal** — l'IA ne mute jamais le graphe : elle soumet une **proposition** transactionnelle.
4. **Validation** — pipeline Zod (syntaxe) → sémantique (IDs existants) → **Rule Engine** (connexions interdites, cycles, `dataSchema`).
5. **Approbation** — `propose_changes` **bloque** jusqu'à accept/reject dans l'UI web.

---

## 🚀 Utilisation

Trois façons, du plus simple au plus manuel.

### 1. Extension VSCode / Cursor — *Nodalis* (recommandé)

Installe l'extension (Marketplace, Open VSX, ou un `.vsix` des
[releases](https://github.com/K-Schmitt/Nodalis/releases)). **Tout est bundlé** : ni
clone, ni build, ni Node externe requis.

- Ouvre un dossier de travail. Sur un workspace Nodalis (présence de `.archi/` ou
  `definitions/`), le **premier lancement** configure le MCP, démarre le runtime et
  ouvre le panneau automatiquement (réglable via `archiOs.autoBootstrap`).
- La vue **Nodalis** (barre d'activité) fournit des boutons **Start** / **Open** et la
  gestion des **versions** (snapshot / restore).

### 2. CLI — `@archi-os/cli`

```bash
npx @archi-os/cli init      # configure le MCP du/des client(s) IA (idempotent, réversible)
npx @archi-os/cli up        # lance core (HTTP) + serveur web statique
npx @archi-os/cli doctor    # diagnostics (Node, build, config MCP, ports, process)
npx @archi-os/cli down      # stoppe les process lancés
```

### 3. Depuis les sources (développement)

```bash
git clone https://github.com/K-Schmitt/Nodalis.git archi-os && cd archi-os
npm run install:all         # dépendances root + workspaces
npm run build               # compile core/dist + web/dist
npm run dev                 # HTTP :3000 + Web :5173 (UI d'approbation + édition)
```

Ouvre `http://localhost:5173`. Utilise `npm run dev:full` pour lancer aussi le serveur MCP en local.

**Prérequis** : Node ≥ 18 (20+ recommandé), npm ≥ 9.

---

## 🔌 Configuration MCP & Workspaces

### Deux process complémentaires

| Process | Lancé par | Rôle |
|---|---|---|
| **Serveur MCP** (stdio) | Le client IA (Cursor / VSCode / Claude Code) via sa config MCP | Expose les outils à l'agent (voir ci-dessous) |
| **Serveur HTTP + Web** | Toi (`npm run dev`, CLI `up`, ou l'extension) → :5173 | Voir le graphe, **approuver les propositions**, éditer à la souris |

> Les deux communiquent via les fichiers `.archi/` du workspace.

### Workspaces (modèle « dossier ouvert »)

Un **workspace = n'importe quel dossier** ouvert depuis le frontend (sélecteur 📁) ou
via l'agent. Nodalis y crée un dossier mémoire `.archi/` (graphe, preset, snapshots,
sous-graphes, `notes.md`). Le workspace actif est mémorisé (`~/.archi-os/state.json`) et
**partagé entre l'agent et l'UI**.

### Déclarer le serveur MCP à la main

`archi-os init` (CLI) ou `Nodalis: Configure MCP` (extension) écrivent la config
automatiquement. En manuel, le serveur MCP compilé est `core/dist/index.js`
(**rebuild après tout changement du Core** : `npm run build:core`).

**VSCode** : fichier portable fourni → [.vscode/mcp.json](.vscode/mcp.json) (utilise `${workspaceFolder}`).

**Cursor / Claude Code** (`~/.cursor/mcp.json`, chemins absolus) :
```json
{ "mcpServers": { "archi-os": {
  "command": "node",
  "args": ["/CHEMIN/ABSOLU/archi-os/core/dist/index.js"],
  "env": {
    "DEFINITIONS_PATH": "/CHEMIN/ABSOLU/archi-os/definitions",
    "WORKSPACE_BROWSE_ROOT": "/home/<user>"
  }
} } }
```

| Variable d'env | Rôle | Défaut |
|---|---|---|
| `DEFINITIONS_PATH` | Dossier des `*.def.json` / presets | `./definitions` (requis hors du repo) |
| `WORKSPACE_BROWSE_ROOT` | Racine autorisée pour ouvrir/créer des workspaces | home utilisateur |
| `ARCHI_OS_STATE_DIR` | Où mémoriser le workspace actif | `~/.archi-os` |
| `RUN_HTTP_SERVER` | Lance le serveur HTTP au lieu du MCP | `false` |

### Outils MCP exposés

Le serveur ne contient **aucun outil en dur** — ils reflètent le registry et le
preset actifs :

| Domaine | Tools |
|---|---|
| Graphe | `get_graph`, `propose_changes`, `validate_graph`, `clear_graph`, `list_types` |
| Presets & relations | `list_presets` |
| Sous-graphes | `create_subgraph`, `open_graph` |
| Workspaces | `list_workspaces`, `create_workspace`, `open_workspace`, `get_active_workspace`, `get_workspace_notes`, `append_workspace_note` |
| Versioning | `create_snapshot`, `list_versions`, `restore_version` |
| Proposals | `check_proposal_status` |

---

## 🏗️ Architecture technique (survol)

Détail complet dans [ARCHITECTURE.md](ARCHITECTURE.md).

- **Core (`/core`)** — Fastify + MCP. Registry en mémoire (source de vérité des types),
  pipeline de validation 3 niveaux (Zod → sémantique → **Rule Engine** : connexions
  interdites, détection de cycles, `dataSchema`, presets), Proposal System
  transactionnel, persistance disque `.archi/graph.json`.
- **Web (`/web`)** — React 19 + React Flow, auto-layout **ELK.js** paradigme-aware,
  rendu de nœuds par archétype (record/shape/device/box), sous-graphes imbriqués,
  Zustand, TailwindCSS.
- **CLI (`/cli`)** — `@archi-os/cli` : maison unique de la logique install / launch /
  config MCP (`init`, `up`, `down`, `doctor`, `uninstall`). Modules purs réutilisables
  via `@archi-os/cli/lib/*`.
- **Extension (`/extension`)** — *Nodalis* : enveloppe fine de la CLI, bundlée en `.vsix`
  autonome (core + web + définitions embarqués). Versioning, diagnostics `*.def.json`,
  first-run bootstrap.

### Exemple de fiche de définition

`definitions/database/postgres.def.json` :

```json
{
  "typeId": "tech:database:postgres",
  "version": "1.0.0",
  "metadata": { "label": "PostgreSQL", "category": "Storage" },
  "behavior": {
    "maxIncomingEdges": null,
    "maxOutgoingEdges": 0,
    "allowConnectionFrom": ["tech:service:*", "tech:function:lambda"]
  },
  "style": { "shape": "cylinder", "backgroundColor": "#336791", "icon": "database" },
  "dataSchema": {
    "type": "object",
    "required": ["port"],
    "properties": { "port": { "type": "number", "default": 5432 } }
  }
}
```

---

## 📦 Modèle de données

Pas de SQL : structures JSON strictes (validées Zod), persistées en fichiers.

| Objet | Stockage | Champs clés |
|---|---|---|
| **Definition** (le type) | `/definitions/**/*.def.json` | `typeId`, `version`, `metadata`, `behavior`, `style`, `dataSchema`, `render` |
| **Preset** (paradigme) | `/definitions/presets/*.preset.json` | dossiers chargés, règles, `edgeTypes` |
| **Node** (instance) | `.archi/graph.json` | `id` (UUID v4), `typeId`, `position`, `data`, `parentId?`, `subgraph?` |
| **Edge** (relation) | `.archi/graph.json` | `id`, `source`, `target`, `type` (⊂ `edgeTypes` du preset), `metadata` |
| **Sous-graphe** | `.archi/subgraphs/<nodeId>.graph.json` | `presetId`, `nodes`, `edges` |

---

## 🚨 Gestion des erreurs

Tout rejet de proposal renvoie un objet structuré :

```json
{
  "code": "ERR_RULE_VIOLATION",
  "message": "Database cannot connect to API",
  "details": {
    "source": "node-123 (tech:database:postgres)",
    "target": "node-456 (tech:api:rest)",
    "rule": "postgres.def.json:behavior.maxOutgoingEdges",
    "suggestion": "Reverse connection direction"
  }
}
```

| Code | Signification | Action |
|---|---|---|
| `ERR_SYNTAX` | JSON invalide | Corriger la syntaxe |
| `ERR_RULE_VIOLATION` | Contrainte métier violée | Voir `details.rule` |
| `ERR_CYCLE_DETECTED` | Cycle dans le graphe | Supprimer une edge |
| `ERR_TYPE_NOT_FOUND` | `typeId` inexistant | Charger la définition manquante |
| `ERR_EDGE_TYPE_UNKNOWN` | Relation hors du preset actif | Utiliser un `edgeType` déclaré |

Erreurs custom côté Core : `DefinitionNotFoundError`, `RuleViolationError`,
`SchemaValidationError`.

---

## 📂 Structure du projet

```
archi-os/
├── core/              # Backend Fastify + MCP (domain / application / infrastructure)
├── web/               # Frontend React 19 + React Flow + ELK
├── cli/               # @archi-os/cli — install / launch / config MCP
├── extension/         # Extension VSCode « Nodalis » (bundle .vsix autonome)
├── definitions/       # Fiches *.def.json (par catégorie) + presets/
├── .archi/            # Données persistées du workspace (graph.json, snapshots, …)
├── docker-compose.yml # + Dockerfile.core / Dockerfile.web
├── ARCHITECTURE.md    # Référence technique détaillée
└── README.md
```

---

## 📖 Gouvernance

1. **Garder le cap** — toute modif de code s'aligne sur [ARCHITECTURE.md](ARCHITECTURE.md), maintenu à jour à chaque évolution de structure.
2. **GitNexus** — utiliser le serveur MCP GitNexus pour cartographier le code et faire les analyses d'impact avant commit / refactoring.
3. **Doc en continu** — ne jamais laisser [README.md](README.md) et [ARCHITECTURE.md](ARCHITECTURE.md) dériver du code réel.

---

## 📝 License

MIT
