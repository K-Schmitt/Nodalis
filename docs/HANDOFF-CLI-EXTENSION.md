# 🚀 HANDOFF — CLI + Extension VSCode + Page Webview

> Bloc de reprise de session. Objectif : rendre ARCHI-OS simple à installer/utiliser,
> proprement et pro. Ordre imposé : **CLI d'abord**, puis **extension**, puis **page webview**.

---

## 0. Décisions déjà prises (ne pas re-débattre)

- **Extension VSCode = produit phare** (porte le livrable #1 : versioning, hooks, chat Cursor).
- **CLI = moteur réutilisable**, construite **en premier**. L'extension l'enveloppe.
- **Docker = cible de runtime optionnelle** (`--docker`), pas un produit concurrent. Déjà présent (`Dockerfile.core/web`, `docker-compose.yml`).
- **Page web = contenu d'un Webview** (approche A : bundler `web/dist` dans l'extension). Le web ne change quasi pas.
- **Le webview est une sandbox** : rendu React + `fetch` vers `core:3000` OK ; tout fs/git/hooks/MCP passe par l'extension (Node) via `postMessage`.

### Principe directeur
> La logique "installer / lancer / configurer MCP" vit **une seule fois** dans la CLI.
> Extension = habillage fin. Docker = cible runtime de la CLI.

---

## 1. Arborescence cible (monorepo)

```
Archi-Os/
├── core/                 # existant (Fastify HTTP + MCP stdio)
├── web/                  # existant (React + React Flow) → devient contenu webview
├── cli/                  # NOUVEAU  @archi-os/cli
│   ├── src/
│   │   ├── index.ts            # entrée bin (shebang)
│   │   ├── commands/
│   │   │   ├── init.ts         # patch config MCP client(s)
│   │   │   ├── up.ts           # lance core (HTTP+MCP) + web
│   │   │   ├── down.ts         # stoppe
│   │   │   ├── doctor.ts       # diagnostics
│   │   │   └── uninstall.ts    # retire la config MCP (réversible)
│   │   ├── lib/
│   │   │   ├── mcp-config.ts   # merge idempotent des fichiers client
│   │   │   ├── process.ts      # spawn/supervise core+web, gestion ports
│   │   │   ├── paths.ts        # résolution chemins client (Cursor/Claude/VSCode)
│   │   │   └── ports.ts        # find-free-port, health-check
│   │   └── config.ts           # schéma Zod du .archi-os.json
│   ├── package.json      # "bin": { "archi-os": "dist/index.js" }
│   └── tsconfig.json
├── extension/            # NOUVEAU  archi-os-vscode
│   ├── src/
│   │   ├── extension.ts        # activate/deactivate
│   │   ├── webview/
│   │   │   ├── panel.ts        # createWebviewPanel + HTML + CSP + nonce
│   │   │   └── bridge.ts       # protocole messages typé ext⇄webview
│   │   ├── engine.ts           # spawn core via la CLI (réutilise cli/lib)
│   │   ├── mcp.ts              # appelle cli init/uninstall
│   │   ├── statusbar.ts        # indicateur Live + actions
│   │   └── versioning.ts       # livrable #1 (snapshots/hooks) — squelette
│   ├── media/            # icônes, assets webview
│   ├── package.json      # manifest VSCode (contributes, activationEvents)
│   └── tsconfig.json
└── docs/HANDOFF-CLI-EXTENSION.md  (ce fichier)
```

---

## 2. CLI `@archi-os/cli` — le moteur

### Stack
- TypeScript, build **tsup** ou **esbuild** (bundle 1 fichier, rapide).
- Parsing args : **commander** (robuste) ou **clack** (jolis prompts). Reco : commander + `@clack/prompts` pour l'interactif.
- Validation config : **Zod** (déjà dans le stack, cohérence avec core).

### Commandes
| Commande | Rôle |
|---|---|
| `archi-os init [--client cursor\|claude\|vscode\|all]` | Écrit/merge la config MCP du/des client(s), **idempotent** + **réversible**. Crée `.archi-os.json` (ports, chemins). |
| `archi-os up [--docker] [--web-only] [--no-open]` | Lance `core` (HTTP+MCP) + `web`. Health-check, imprime l'URL. Supervise les process. |
| `archi-os down` | Stoppe proprement les process lancés. |
| `archi-os doctor` | Diagnostics : Node ≥ 20 ? ports libres ? config MCP présente ? définitions valides ? |
| `archi-os uninstall` | Retire **uniquement** le bloc archi-os des configs client (merge inverse). |

### Config MCP — LE point pro
- **Cibles par client** :
  - Cursor : `~/.cursor/mcp.json` (global) ou `<workspace>/.cursor/mcp.json` (projet).
  - Claude Desktop : `claude_desktop_config.json` (chemin OS-dépendant).
  - VSCode (MCP natif) : `<workspace>/.vscode/mcp.json`.
- **Règles** :
  1. **Merge, pas écrase** : lire le JSON existant, ajouter/mettre à jour la clé `archi-os` sous `mcpServers`, réécrire. Jamais perdre les autres serveurs de l'utilisateur.
  2. **Idempotent** : relancer `init` 2× = même résultat.
  3. **Réversible** : `uninstall` retire exactement la clé ajoutée.
  4. **Backup** : copier `mcp.json` → `mcp.json.bak` avant écriture.
  5. Entrée type écrite :
     ```json
     {
       "mcpServers": {
         "archi-os": {
           "command": "node",
           "args": ["<abs>/core/dist/index.js"],
           "env": { "WORKSPACE_ROOT": "<abs>" }
         }
       }
     }
     ```
     (ou `"command": "npx", "args": ["-y", "@archi-os/core"]` une fois publié)
- **Détection OS** pour les chemins (`process.platform` → win/darwin/linux).

### Gestion des process (`lib/process.ts`)
- Spawn `core` en mode HTTP (`RUN_HTTP_SERVER=true`) + `web` (vite preview ou dist servi).
- **Ports** : détecter libre (fallback 3000→3001…), écrire dans `.archi-os.json`, passer au web via `VITE_API_BASE_URL`.
- **Health-check** : attendre `GET /health` avant d'imprimer "ready".
- Mode `--docker` : déléguer à `docker compose up -d` au lieu du spawn natif.
- Nettoyage sur SIGINT/SIGTERM.

### Definition of done CLI
- [ ] `npx archi-os init && archi-os up` → web ouvert + MCP configuré, **0 étape manuelle**.
- [ ] `uninstall` propre, `doctor` utile, config idempotente + backup.
- [ ] Cross-OS (au moins linux + 1 autre testé).

---

## 3. Extension VSCode `archi-os-vscode` — la surface

### Stack
- TypeScript, bundle **esbuild** (`--bundle --platform=node --external:vscode`).
- Manifest `package.json` VSCode : `engines.vscode`, `activationEvents`, `contributes.commands`, `contributes.viewsContainers` (icône barre latérale).
- Packaging : **@vscode/vsce** → `.vsix`. Compatible Cursor.

### Commandes exposées (`contributes.commands`)
- `archi-os.open` : ouvre la page (webview panel).
- `archi-os.start` / `archi-os.stop` : lance/stoppe le runtime (via `engine.ts` → CLI).
- `archi-os.configureMcp` : appelle `cli init`.
- `archi-os.createSnapshot` / `archi-os.restoreVersion` : livrable #1.

### Cycle de vie (`extension.ts`)
1. `activate()` : enregistre commandes, status bar, (optionnel) auto-start runtime si workspace ARCHI-OS détecté (présence `.archi/`).
2. `engine.ts` : réutilise `cli/lib/process.ts` pour spawn core+web (ne PAS dupliquer la logique — importer/partager le package cli).
3. `mcp.ts` : au premier lancement, propose "Configurer le MCP ?" → `cli init --client cursor`.
4. `deactivate()` : `down`.

### Livrable #1 (versioning/hooks) — squelette à poser
- `versioning.ts` : commandes snapshot/restore branchées sur les endpoints core existants (`create_snapshot`, `list_versions`, `restore_version` existent déjà côté MCP/HTTP).
- Hooks VSCode : `workspace.onDidSaveTextDocument` sur les `*.def.json` → refresh/hot-reload. Intégration chat Cursor = phase ultérieure.

### Definition of done extension
- [ ] `.vsix` installable, 1 commande "Open ARCHI-OS" ouvre la page câblée.
- [ ] Runtime + MCP démarrés par l'extension (pas de terminal manuel).
- [ ] Status bar Live/Disconnected, thème synchro.

---

## 4. Page Webview — intégrer `web/` dans VSCode

### Approche : bundler `web/dist` (approche A)

### Réglages `web/` (minimes)
1. **`vite.config` → `base: './'`** : chemins d'assets **relatifs** (obligatoire pour `asWebviewUri`).
2. `VITE_API_BASE_URL` déjà géré (`config.ts`) → l'extension injecte le port réel.
3. Ajouter un petit **client bridge** (`web/src/lib/vscode.ts`) : `acquireVsCodeApi()` si présent, sinon no-op (pour garder l'app utilisable en navigateur pur).

### Côté extension (`webview/panel.ts`)
1. `vscode.window.createWebviewPanel('archiOs', 'ARCHI-OS', ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [web/dist] })`.
2. Lire `web/dist/index.html`, **réécrire** les `src/href` via `webview.asWebviewUri(...)`.
3. Injecter une **CSP stricte** avec **nonce** :
   ```
   default-src 'none';
   img-src ${cspSource} https: data:;
   style-src ${cspSource} 'unsafe-inline';
   script-src 'nonce-<NONCE>';
   connect-src http://localhost:<PORT> ws://localhost:<PORT>;
   font-src ${cspSource};
   ```
4. Ajouter `nonce` sur chaque `<script>`.
5. `retainContextWhenHidden: true` (garde l'état du graphe).

### Bridge typé ext⇄webview (`webview/bridge.ts` + `web/src/lib/vscode.ts`)
- Protocole : `{ type: string; payload: unknown }`.
- Messages initiaux : `init` (workspacePath, apiBaseUrl, theme), `theme-changed`, `refresh`, `open-file`.
- Webview → ext : `ready`, `request-fs`, `open-external`.
- **Synchro thème** : `window.matchMedia` + `vscode.window.activeColorTheme` → envoyer `theme: 'dark'|'light'` → set `data-theme` (déjà tokenisé, gratuit).

### Definition of done webview
- [ ] Onglet VSCode affiche le graphe, assets chargés (pas de CSP error console).
- [ ] `fetch` vers core:PORT OK.
- [ ] Thème matche l'éditeur, état conservé au switch d'onglet.

---

## 5. Ordre de travail (milestones)

1. **CLI M1** : `init` (config MCP idempotente + backup) + `doctor`. → testable seul.
2. **CLI M2** : `up`/`down` (spawn core+web, ports, health-check) + `--docker`.
3. **Web M0** : `base:'./'` + `lib/vscode.ts` bridge no-op. (build inchangé sinon)
4. **Extension M1** : activate + commande Open + `webview/panel.ts` (CSP/nonce/asWebviewUri) chargeant `web/dist`.
5. **Extension M2** : `engine.ts` (spawn via CLI) + `mcp.ts` (init) + status bar + thème.
6. **Extension M3** : squelette versioning (snapshot/restore) + hooks `onDidSave` def.json.
7. **Packaging** : `vsce package` → `.vsix` ; publier `@archi-os/cli` (npm) optionnel.

---

## 6. Checklist "pro" transverse
- [ ] Zéro logique dupliquée (extension réutilise le package cli).
- [ ] Config MCP : merge / idempotent / réversible / backup.
- [ ] Cross-OS (chemins clients).
- [ ] `doctor` = auto-diagnostic clair.
- [ ] Désinstall propre, sans résidu.
- [ ] CSP stricte + nonce (sécurité webview).
- [ ] `retainContextWhenHidden`, thème synchro.
- [ ] README d'install : 1 commande (`npx archi-os init && archi-os up`) OU install `.vsix`.
- [ ] Mettre à jour `ARCHITECTURE.md` (nouveaux packages cli/ + extension/).

## 7. Pièges connus
- Webview **sandbox** : pas d'accès Node/fs → tout via `postMessage`.
- Vite `base` par défaut = `/` → casse `asWebviewUri`. **Mettre `./`**.
- CSP oublie `connect-src localhost:PORT` → tous les fetch échouent silencieusement.
- MCP stdio : lancé PAR le client, pas par la CLL. `init` écrit juste la config ; c'est Cursor/Claude qui spawn `core`. Ne pas confondre avec le core HTTP (lui, lancé par `up`).
- Perf webview sur gros graphes (>500 nœuds) : prévoir "ouvrir dans navigateur" en secours.

---

**Reprise demain** : commencer par **CLI M1** (`init` + `doctor`). Lire ce fichier + `ARCHITECTURE.md` avant de coder.
