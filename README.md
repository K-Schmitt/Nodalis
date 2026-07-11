# 📘 ARCHI-OS

**Moteur de Graphe Sémantique Meta-Modeler**

Version 1.0 | Stack: Node.js + React Flow + MCP

---

## 🚀 Getting Started

### Prérequis

- Node.js >= 18.x
- npm ou yarn
- Git

### Installation Rapide

```bash
# Cloner le repository
git clone https://github.com/votre-org/archi-os.git
cd archi-os

# Installer les dépendances du Core
cd core
npm install

# Installer les dépendances du Web
cd ../web
npm install
```

### Lancer le Projet

**Terminal 1 - Backend (Core) :**
```bash
cd core
npm run dev
```

**Terminal 2 - Frontend (Web) :**
```bash
cd web
npm run dev
```

Rendez-vous sur `http://localhost:5173`

### Premier Test

1. Créez une définition dans `definitions/test.def.json`
2. Rechargez le core
3. L'IA peut maintenant utiliser ce nouveau type

---

## 🔌 Configuration MCP, Workspaces & Partage

### Deux process à connaître

ARCHI-OS tourne en **deux process complémentaires** :

| Process | Lancé par | Rôle |
|---|---|---|
| **Serveur MCP** (stdio) | Le client IA (Cursor / VSCode / Antigravity) via sa config MCP | Donne ses outils à l'agent (`get_active_workspace`, `list_presets`, `propose_changes`, `clear_graph`…) |
| **Serveur HTTP + Web** | Toi, à la main (`npm run dev`) → http://localhost:5173 | Voir le graphe, **approuver les propositions** de l'IA, éditer à la souris |

> `propose_changes` **bloque** tant que tu n'as pas accepté/refusé dans l'UI web. Les deux process communiquent via les fichiers `.archi/` du workspace.

### Workspaces (modèle « dossier ouvert », façon VSCode)

Un **workspace = n'importe quel dossier** que tu ouvres depuis le frontend (sélecteur 📁) ou via l'agent. ARCHI-OS y crée un dossier mémoire `.archi/` (graphe, type d'archi, snapshots, `notes.md`). Le workspace actif est mémorisé entre les sessions (dans `~/.archi-os/state.json`) et **partagé entre l'agent et l'UI**.

Chaque workspace a un **preset** (type d'archi) qui détermine quels nœuds/règles sont chargés — voir `definitions/presets/*.preset.json` (`web`, `game`, `full`).

### Déclarer le serveur MCP dans ton client

Le serveur MCP est compilé : **après tout changement du code Core, rebuild** avec `npm run build:core` (les clients lancent `core/dist/index.js`).

**VSCode / Antigravity** : un fichier portable est déjà fourni dans le repo → [.vscode/mcp.json](.vscode/mcp.json). Il utilise `${workspaceFolder}`, donc il marche sans chemin en dur dès que le dossier est ouvert. (Antigravity étant basé sur VSCode, copie-le au besoin dans `~/.config/Antigravity/User/mcp.json` avec des chemins absolus.)

**Cursor** (`~/.cursor/mcp.json`, chemins absolus) :
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
| `DEFINITIONS_PATH` | Dossier des `*.def.json` / presets | `./definitions` (requis si lancé hors du repo) |
| `WORKSPACE_BROWSE_ROOT` | Racine autorisée pour ouvrir/créer des workspaces | home de l'utilisateur |
| `ARCHI_OS_STATE_DIR` | Où mémoriser le workspace actif | `~/.archi-os` |

### Partager le projet à quelqu'un

```bash
git clone <url> archi-os && cd archi-os
npm run install:all     # dépendances root + core + web
npm run build           # compile core/dist + web/dist
npm run dev             # HTTP :3000 + Web :5173 (UI d'approbation + édition)
```
Puis la personne déclare le MCP dans **son** client (VSCode/Antigravity : le `.vscode/mcp.json` du repo suffit ; Cursor : config absolue ci-dessus) et redémarre le client.

---

## 📖 Gouvernance & Bonnes Pratiques

Afin de garantir la cohérence du projet et d'éviter les dérives d'implémentation :

1. **Garder le cap (ARCHITECTURE.md)** : Toute modification de code doit impérativement s'aligner sur la vision technique décrite dans [ARCHITECTURE.md](ARCHITECTURE.md). Ce document doit être analysé avant chaque développement majeur et maintenu rigoureusement à jour lors de chaque évolution de structure.
2. **Utilisation active de GitNexus** : Utilisez intensivement le serveur MCP et les outils **GitNexus** pour cartographier le code, comprendre les dépendances logicielles complexes et réaliser des analyses d'impact fiables avant tout commit ou refactoring.
3. **Documentation en continu** : Ne laissez jamais la documentation technique dériver par rapport au code. [CLAUDE.md](CLAUDE.md) et [README.md](README.md) doivent être mis à jour de manière continue au fil des évolutions du projet pour rester de parfaits guides de développement.

---

## 🎯 Concept Fondamental

### En une phrase

ARCHI-OS est comme un moteur de jeu vidéo (comme Unity), mais pour l'architecture. Il est vide au départ, mais si tu lui donnes des "fiches de règles", il apprend à construire n'importe quoi (un réseau cloud, un plan de maison, ou un arbre généalogique) et empêche l'IA de faire des erreurs.

### Explication Détaillée

Contrairement aux outils classiques (Draw.io) ou spécialisés (Structurizr), **ARCHI-OS est un Core Agnostique**.

- Il ne sait pas nativement ce qu'est une "API" ou une "Database"
- Il ingère des **Fiches de Définition** (fichiers JSON) créées par l'utilisateur qui décrivent les types d'objets existants et leurs contraintes
- Une fois ces fiches chargées, il génère dynamiquement des outils pour l'IA (via MCP), transformant un LLM généraliste en expert du domaine défini

---

## ⚙️ Flux de Fonctionnement

```
Input → Context IA → Proposal → Validation → Output
```

### 1. Input (Apprentissage)
Le Core scanne le dossier `/definitions` et lit les fichiers `*.def.json`. Il stocke ces règles dans son **Registry** (en mémoire).

### 2. Contexte IA (Prompting Dynamique)
L'IA demande "Quels sont mes outils ?". Le Core répond avec les types disponibles et leurs contraintes.

### 3. Proposition (Proposal System)
L'IA ne modifie jamais le graphe directement. Elle soumet un fichier JSON de **Proposal** (proposition de changements).

### 4. Validation (Pipeline)
Le Core vérifie la proposition :
- **Syntaxe** : Le JSON est-il valide ?
- **Logique** : Les règles de connexion sont-elles respectées ?

### 5. Output
- ✅ **Si valide** → Affichage à l'utilisateur pour confirmation visuelle
- ❌ **Si invalide** → Rejet automatique avec message d'erreur pour l'IA

---

## 🏗️ Architecture Technique

### Le Core (Backend Logic)

Le Core maintient un état en mémoire (Stateful Registry) pour la performance, synchronisé avec les fichiers.

**Composants clés :**
- **Registry (In-Memory Map)** : Charge au démarrage toutes les définitions. Source de vérité pour la validation des types.
- **Pipeline de Validation (3 Niveaux)** :
  - Syntaxique (Zod) : Vérifie la structure du JSON
  - Sémantique : Vérifie que les IDs référencés existent
  - Business (Rule Engine) : Vérifie les contraintes (cycles, directions de connexion)
- **Transaction Manager** : Assure que les modifications sont atomiques (tout ou rien)

### Structures de Données

#### Exemple de Fiche de Définition

`definitions/postgres.def.json` :

```json
{
  "typeId": "tech:database:postgres",
  "version": "1.0.0",
  "metadata": {
    "label": "PostgreSQL",
    "category": "Storage"
  },
  "behavior": {
    "maxIncomingEdges": null,
    "maxOutgoingEdges": 0,
    "allowConnectionFrom": [
      "tech:service:*",
      "tech:function:lambda"
    ]
  },
  "style": {
    "shape": "cylinder",
    "backgroundColor": "#336791",
    "icon": "database"
  },
  "dataSchema": {
    "type": "object",
    "required": ["port"],
    "properties": {
      "port": { "type": "number", "default": 5432 }
    }
  }
}
```

### Interface MCP (Pont IA)

Le serveur MCP ne contient aucun outil "en dur" :

- **`list_types`** : Renvoie la liste des types chargés depuis le Registry
- **`propose_changes`** : Accepte un tableau d'opérations (Create/Update/Delete/Connect) limité à 50 ops par appel
- **Prompt Système** : Généré dynamiquement à chaque démarrage pour inclure les descriptions des fiches chargées

### UI (Visualisation)

**Composant UniversalNode** : Un composant React unique capable de tout afficher. Il lit `props.style.shape` et `props.style.color` pour se dessiner, sans code spécifique par type.

---

## 📦 Modèle de Données (JSON Schema)

Nous n'utilisons pas de SQL, mais des structures JSON strictes stockées en fichiers.

### A. Definition (Le "Type")

Stocké dans `/definitions/*.def.json`

```json
{
  "typeId": "string (PK)",
  "version": "string",
  "metadata": {
    "label": "string",
    "category": "string"
  },
  "behavior": {
    "allowConnectionFrom": "string[]",
    "maxIncomingEdges": "number | null"
  },
  "style": {
    "shape": "string",
    "icon": "string"
  }
}
```

### B. Node (L'Instance)

Stocké dans `architecture.json`

```json
{
  "id": "UUID (v4)",
  "typeId": "string",
  "position": { "x": 0, "y": 0 },
  "data": {}
}
```

### C. Edge (La Relation)

Stocké dans `architecture.json`

```json
{
  "id": "UUID (v4)",
  "source": "UUID",
  "target": "UUID",
  "type": "string",
  "metadata": {
    "label": "string"
  }
}
```

### D. Proposal (La Transaction)

Stocké dans `.archi/pending/{uuid}.json`

```json
{
  "id": "UUID (PK)",
  "status": "PENDING | APPROVED | REJECTED",
  "operations": [
    { "op": "add_node", "payload": "Node" },
    { "op": "add_edge", "payload": "Edge" }
  ]
}
```

---

## ⚠️ Risques & Mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| OpenAI rate limits dépassés | Moyenne | Moyen | Implémenter retry + backoff, budget API défini |
| Performances React Flow >500 nodes | Faible | Moyen | Virtualisation canvas en Phase 5 si besoin |
| Complexité Rule Engine sous-estimée | Moyenne | Élevé | Commencer par cas simples, tests incrémentaux |
| Intégration MCP bloquante | Faible | Élevé | POC Mois 0 valide, SDK documenté |
| Conflits Git en équipe | Faible | Moyen | Fichier unique acceptable pour projet étudiant solo |

---

## 🎯 Critères de Succès (KPIs)

### Technique
- ✅ 100% des tests Registry passent (Mois 1)
- ✅ Rule Engine rejette 100% des graphes invalides (Mois 2)
- ✅ IA peut créer un graphe AWS valide de 10 nodes en <30s (Mois 3)
- ✅ UI render 200 nodes sans lag (<100ms) (Mois 4)
- ✅ Export PNG/SVG fonctionnel (Mois 5)
- ✅ Visual Diff clair et non-ambigu (Mois 5)

### Fonctionnel
- ✅ CLI installable et utilisable (Mois 6)
- ✅ 3 exemples d'architecture documentés (AWS, K8s, Microservices)
- ✅ Documentation complète publiée
- ✅ Docker Compose fonctionnel

### Académique
- ✅ Livraison mensuelle validée
- ✅ Code source versionné sur Git
- ✅ Présentation finale délivrée

---

## 🚨 Stratégie de Gestion des Erreurs

### Codes d'Erreur Standardisés

Tous les rejets de proposals retournent un objet structuré :
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

### Catalogue des Erreurs

| Code | Signification | Action Utilisateur |
|------|---------------|-------------------|
| `ERR_SYNTAX` | JSON invalide | Corriger la syntaxe |
| `ERR_RULE_VIOLATION` | Contrainte métier non respectée | Voir `details.rule` |
| `ERR_CYCLE_DETECTED` | Cycle dans le graphe | Supprimer une edge |
| `ERR_TYPE_NOT_FOUND` | TypeId inexistant | Charger la définition manquante |

### UX dans l'Interface

- ❌ **Rejet** : Toast rouge avec code + lien vers la définition
- ⚠️ **Warning** : Surbrillance orange sur le nœud concerné
- ✅ **Succès** : Animation verte + sauvegarde auto

---

## 🛠️ Stack Technique

### Frontend (Interface Web / UI)
- **React 19 + Vite** : Standard industriel
- **React Flow** : Moteur de rendu de graphe
- **ELK.js** : Auto-Layout (positionnement automatique des nœuds)
- **Tailwind CSS** : Styling rapide
- **Zustand** : Gestion d'état global

### Backend (Core)
- **Node.js + Fastify** : Performance et typage TS natif
- **Zod** : Validation stricte des schémas JSON (Runtime checking)

### Interface IA
- **MCP (Model Context Protocol) SDK** : Connecteur standardisé pour Cursor/Windsurf

### Persistance
- **Git-based** : Stockage fichiers plats JSON (Phase 1-4)
- **PostgreSQL + JSONB** : Optionnel Phase 5+ si >1000 nodes ou besoins collaboratifs

### Infrastructure
- **Docker** : Isolation du serveur MCP
- **OpenAI API (GPT-4o)** ou **Gemini 1.5 Pro** : Services IA

---

## ✨ Fonctionnalités (User Stories)

### 🖥️ Interface Utilisateur (Web UI)

**Visualisation :**
- ✅ Visualiser le graphe complet (zoom/pan) via React Flow (MUST HAVE)
- ✅ Voir les détails d'un nœud (clic) dans un panneau latéral (MUST HAVE)
- ✅ Voir les nœuds rendus avec leur style spécifique (couleur/forme) (MUST HAVE)
- ⚡ Réorganiser automatiquement le graphe avec ELK (SHOULD HAVE)

**Interaction :**
- ✅ Réorganiser les nœuds manuellement (Drag & Drop) (MUST HAVE)
- 💡 Visualiser les changements proposés par l'IA en surbrillance (Visual Diff) (MUST HAVE)
- ✅ Valider ou rejeter une proposition d'un clic (MUST HAVE)

### 🧠 Moteur & Intelligence (Backend/MCP)

**Gestion des Définitions :**
- ✅ Scanner un dossier local pour charger les types disponibles (MUST HAVE)
- ✅ Valider la cohérence des règles au démarrage (MUST HAVE)

**Assistant IA :**
- ✅ Interroger l'IA sur l'architecture actuelle (MUST HAVE)
- ✅ Demander à l'IA de modifier le graphe (MUST HAVE)
- 💡 Empêcher l'IA de créer des connexions interdites (Rule Engine) (MUST HAVE)

### 💾 Système & Stockage

**Persistance :**
- ✅ Sauvegarder l'état du graphe dans un fichier JSON unique (MUST HAVE)
- ✅ Versionner l'architecture via Git (fichier lisible) (MUST HAVE)

**Stratégie de Merge :**

Architecture basée sur un fichier unique `architecture.json` :

- ✅ **Avantage** : Simple, versionnable
- ⚠️ **Limite** : Conflits potentiels en équipe

**Solutions :**
1. **Phase 1** : Un fichier unique (suffisant pour MVP)
2. **Phase 2** : Splitter en `/nodes/*.json` + `/edges/*.json` (si collaboration intensive)
3. **Alternative** : Lock pessimiste (un seul éditeur à la fois)

### 🔧 Developer Experience

**CLI & Validation :**
- ✅ Tester une définition sans redémarrer (`archi-os validate ./definitions`) (SHOULD HAVE)
- ✅ Hot-reload des définitions en dev mode (SHOULD HAVE)
- ⚡ Générer la doc automatique des types (`archi-os docs`) (COULD HAVE)

**Export & Import :**
- ✅ Exporter le graphe en SVG/PNG (SHOULD HAVE)
- ⚡ Importer une architecture depuis un fichier (COULD HAVE)
- ⚡ Partager un "pack" de définitions réutilisables (COULD HAVE)

**Historique :**
- ✅ Annuler la dernière action (Ctrl+Z) (SHOULD HAVE)
- ⚡ Voir l'historique des modifications (COULD HAVE)
- ⚡ Revenir à un commit Git précédent (COULD HAVE)

---

## 📂 Structure du Projet

```
archi-os/
├── README.md              # Documentation complète
├── .gitignore
├── definitions/           # Fiches de définition (.def.json)
│   ├── database.def.json
│   └── api.def.json
├── web/                   # Frontend React + Vite
│   ├── package.json
│   └── src/
│       ├── components/
│       │   └── UniversalNode.tsx
│       └── App.tsx
└── core/                  # Backend Node.js + Fastify
    ├── package.json
    └── src/
        ├── mcp/           # Serveur MCP
        ├── registry/      # Definition Loader
        └── index.ts
```

---

## 🎮 Exemple d'Usage

### Scénario : Créer une Architecture AWS

**Étape 1 : Charger les définitions**
```bash
archi-os load ./definitions/aws/
```

Charge `ec2.def.json`, `rds.def.json`, `lambda.def.json`.

**Étape 2 : Demander à l'IA**
```
User: "Crée une architecture avec une Lambda qui écrit dans une RDS"
```

**Étape 3 : L'IA propose**
```json
{
  "operations": [
    { "op": "add_node", "payload": { "typeId": "tech:function:lambda", ... } },
    { "op": "add_node", "payload": { "typeId": "tech:database:rds", ... } },
    { "op": "add_edge", "payload": { "source": "lambda-1", "target": "rds-1" } }
  ]
}
```

**Étape 4 : Validation & Rendu**

✅ Le Core valide → Affichage dans React Flow → L'utilisateur confirme.

---

## 📝 License

MIT
