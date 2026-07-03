# Design — Extension VSCode ARCHI-OS (EXT-M0→M4)

> Date : 2026-07-03
> Statut : approuvé (brainstorming) → prêt pour writing-plans
> Base : `docs/HANDOFF-CLI-EXTENSION.md` §3–4
> Périmètre : extension complète M0→M4 (distribution **et** livrable #1 versioning/hooks) + glue Web M0.

## 1. Objectif

Livrer l'extension VSCode `archi-os-vscode` : produit phare portant le **livrable #1**
(versioning + hooks éditeur). L'extension enveloppe la CLI existante (déjà complète) et
héberge le frontend `web/` dans un webview. Aucune logique dupliquée : install/lancement/config
MCP vit une seule fois dans `cli/`.

Décisions actées en brainstorming :
- **Scope** : un seul spec couvre M0→M4 (distribution + versioning).
- **Réutilisation CLI** : `exports` map sur `@archi-os/cli` → l'extension **importe** `spawnManaged`
  (mode `attached`), `ports`, `mcp-config`. Pas de shell-out au binaire (le binaire détache les
  process → `deactivate()` ne pourrait pas tuer les enfants).
- **Versioning UX** : TreeView barre latérale.
- **Hook `onDidSave`** : validation → Diagnostics/Problems (primaire) + push refresh webview +
  feedback status-bar (notification uniquement à l'échec). **Pas** d'auto-snapshot.
- **API versioning** : ajouter 3 routes HTTP minces au core (le versioning n'existe qu'en MCP+storage).

## 2. Architecture (3 packages touchés + 1 nouveau)

- **`extension/`** (nouveau — `archi-os-vscode`)
  - Bundle **esbuild** `--bundle --platform=node --external:vscode`.
  - Packaging `.vsix` via `@vscode/vsce`. Compatible Cursor.
  - Habillage fin : importe `cli/lib` et le schéma core, ne réimplémente rien.
- **`cli/`** (existant, complet)
  - Ajouter champ `exports` exposant la lib :
    ```json
    "exports": {
      ".": "./dist/index.js",
      "./lib/*": "./dist/lib/*.js"
    }
    ```
  - L'extension importe `@archi-os/cli/lib/process`, `.../ports`, `.../mcp-config`.
    esbuild les inline dans le `.vsix`.
- **`core/`** (existant)
  - **Subpath export dédié** pour le schéma (fold #2) :
    ```json
    "exports": {
      ".": "./dist/index.js",
      "./schema": "./dist/domain/types.js"
    }
    ```
    `types.ts` n'importe que `zod` → esbuild ne bundle que zod, **pas** Fastify/MCP.
    L'import racine `@archi-os/core` traînerait tout le serveur : interdit dans l'extension.
  - +3 routes HTTP versioning (§5).
  - **CORS webview origin (fold #5)** : la config CORS (`http-server.ts:53–63`) n'autorise que
    `http://localhost(:port)`. L'origine d'un webview VSCode = `vscode-webview://<id>` → CORS
    **rejette tous les `fetch`** du webview, indépendamment du CSP. CSP (client, `connect-src`)
    et CORS (serveur, `Access-Control-Allow-Origin`) sont **deux couches distinctes** : le CSP
    passe, la réponse est bloquée côté serveur → webview mort silencieux. Étendre la regex :
    ```ts
    origin: (origin, cb) => {
      if (!origin
          || /^http:\/\/localhost(:\d+)?$/.test(origin)
          || /^vscode-webview:\/\//.test(origin)) {   // ← ajout
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'), false);
      }
    },
    ```
    (`!origin` couvre déjà le cas « null origin » que certains webviews envoient.) ~2 lignes,
    mais **bloquant** sans elle.
- **`web/`** (Web M0, glue minimale)
  - `vite.config` → `base: './'` (chemins d'assets relatifs, obligatoire pour `asWebviewUri`).
  - Nouveau `web/src/lib/vscode.ts` : `acquireVsCodeApi()` si présent, sinon no-op
    (l'app reste utilisable en navigateur pur).

## 3. Composants `extension/src/`

| Fichier | Rôle | Milestone |
|---|---|---|
| `extension.ts` | activate/deactivate, registre commandes + contributions, autostart **gaté** (§6) | M0 |
| `webview/panel.ts` | createWebviewPanel, lit `web/dist/index.html`, réécrit assets via `asWebviewUri`, CSP+nonce, `retainContextWhenHidden`, **injecte `__ARCHI_OS__` dans un `<script nonce>`** (§4) | M1 |
| `webview/bridge.ts` | protocole typé `{ type, payload }` : ext→web `init`/`theme`/`refresh` ; web→ext `ready`/`open-external` | M1 |
| `engine.ts` | spawn core (HTTP+MCP) + web via `cli/lib` `spawnManaged` **mode `attached`** → enfants tués au `deactivate()` | M2 |
| `mcp.ts` | 1er lancement : propose `cli init` (merge config MCP client, idempotent, réversible, backup) | M2 |
| `statusbar.ts` | indicateur Live/Disconnected + flash « ⟳ rules reloaded », sync thème | M2 |
| `versioning/tree.ts` | `TreeDataProvider` → `GET /api/versions` ; commandes `createSnapshot`/`restoreVersion` ; refresh | M4 |
| `diagnostics.ts` | hook `onDidSave` filtré `**/definitions/**/*.def.json`, debounce ~300ms, valide via `@archi-os/core/schema` `DefinitionSchema` → `DiagnosticCollection` (Problems) | M4 |

Commandes exposées (`contributes.commands`) : `archi-os.open`, `archi-os.start`, `archi-os.stop`,
`archi-os.configureMcp`, `archi-os.createSnapshot`, `archi-os.restoreVersion`.

## 4. Injection webview + CSP (fold #1)

Le static-server de la CLI injecte `window.__ARCHI_OS__` **sans** nonce (aucune CSP là-bas).
En webview, l'injection est faite par `panel.ts` sous **CSP stricte** — le `<script>` inline
qui pose `apiBaseUrl` **doit** porter le nonce, sinon il est bloqué et **tous les `fetch`
meurent silencieusement**. Ne pas réutiliser l'injection du static-server ; écrire l'injection
nonced explicitement dans `panel.ts`.

CSP (le port réel est injecté dynamiquement à la création du panel) :

```
default-src 'none';
img-src ${cspSource} https: data:;
style-src ${cspSource} 'unsafe-inline';
script-src 'nonce-<NONCE>';
connect-src http://localhost:<PORT> ws://localhost:<PORT>;
font-src ${cspSource};
```

- Chaque `<script>` (bundle web + injection `__ARCHI_OS__`) porte le `nonce`.
- `style-src 'unsafe-inline'` : **nécessaire** — les nœuds React Flow utilisent `style={{}}` partout.
  Tradeoff conscient et assumé.
- `connect-src` : la string CSP est construite à la création du panel avec le port effectif
  (dynamique), pas en dur.

## 5. Ajout core — 3 routes HTTP versioning

Wrappent les méthodes storage existantes (`createSnapshot`/`listVersions`/`restoreVersion`,
`core/src/infrastructure/persistence/graph-storage.ts`) — mêmes internals que les handlers MCP
existants (`core/src/infrastructure/mcp/mcp-server.ts`). ~40 lignes.

- `GET  /api/versions` → `listVersions()`
- `POST /api/snapshot` `{ label }` → `createSnapshot(this.graph, label)`
- `POST /api/versions/:id/restore` → `restoreVersion(id, this.graph)` → renvoie le graphe restauré

**Cohérence 2-process + persistance (fold #3).** Le core tourne en 2 process (HTTP + MCP stdio)
partageant le fichier graphe (SSOT disque). Chaque route appelle `this.syncContext()` en entrée
(reload-before-read via `graphStorage.loadIfChanged`, déjà en place, http-server.ts:47–49).
La route `restore` doit :
1. `syncContext()` (charger l'état courant),
2. `restoreVersion(id, this.graph)` → **mute l'in-memory HTTP**,
3. persister sur disque (`graphStorage.save(this.graph)`) → **met à jour le SSOT**.

Ainsi le webview (poll 2s) **et** le process MCP (reload-before-read) voient le graphe restauré.
Vérifier explicitement en test qu'après restore le disque **et** l'in-memory sont à jour (pas de stale).

**Méta-opération vs immuabilité (fold #3, note d'architecture).** `restore` remplace le graphe,
ce qui viole *en apparence* le principe « pas de mutation directe » (CLAUDE.md #2). C'est une
**méta-opération légitime** de gestion de version (analogue à `git checkout`), pas une mutation
métier — elle contourne délibérément le système de Proposal. Choix acté, documenté ici pour que
ce soit un choix et non un trou.

**Modèle de confiance.** Ces routes mutent l'état sur `localhost` non-authentifié : même modèle
que `/api/graph/operations` existant (bind `127.0.0.1` uniquement). Cohérent, pas de régression.

## 6. Cycle de vie & autostart gaté (fold #4)

`.archi/` existe dès qu'un workspace a été ouvert une fois → autostart silencieux = spawn core
surprise à chaque `activate()`. **Interdit.**

- Setting `archiOs.autostart` (défaut **off**, ou **prompt au 1er coup**). Jamais de spawn silencieux.
- `activate()` : enregistre commandes + status bar + TreeView + hook diagnostics. Ne spawn le
  runtime que si `archiOs.autostart` est activé (ou sur action explicite `archi-os.start`).
- `engine.ts` spawn core (attached, `RUN_HTTP_SERVER=true`) + web static via `cli/lib`, puis
  health-check `GET /health` avant de passer status-bar **Live**.
- `deactivate()` : `stopEntry` sur les enfants attached (= `down`).

## 7. Flux de données

1. **activate** → enregistre tout → si `archiOs.autostart` on (ou `archi-os.start`) → `engine`
   spawn core+web (attached) via cli lib → health-check → status-bar **Live**.
2. **archi-os.open** → `panel` charge `web/dist` ; `init` injecté dans `<script nonce>`
   (apiBaseUrl = port réel, theme, workspacePath). Webview fetch `core:PORT`
   (autorisé par `connect-src`), poll graphe 2s (existant).
3. **save `*.def.json`** → `diagnostics.ts` valide via `DefinitionSchema` → issue Zod → `Range`
   → squiggle + Problems. Valide → clear diags du fichier + bridge `refresh` (court-circuite le
   poll 2s) + flash status-bar. Échec → notification.
4. **TreeView versioning** → `GET /api/versions` ; snapshot → `POST /api/snapshot` ;
   restore → `POST /api/versions/:id/restore` → bridge `refresh`.
5. **deactivate** → `stopEntry` sur enfants attached.

## 8. Synchro thème

`vscode.window.activeColorTheme` + `onDidChangeActiveColorTheme` → bridge `theme: 'dark'|'light'`
→ webview pose `data-theme` (déjà tokenisé, gratuit).

## 9. Tests

- **core** : vitest via `app.inject()` sur les 3 routes — round-trip snapshot → list → restore ;
  **assertion explicite** disque + in-memory à jour post-restore (fold #3).
- **extension** : unit sur `bridge` (protocole `{type,payload}`) + `diagnostics` (mapping
  issue Zod → `Range`). `mcp-config` déjà couvert côté cli.
- **manuel** : `vsce package` → install `.vsix` dans Cursor → Open (graphe + assets, 0 erreur CSP
  console) → save def.json cassé (squiggle + Problems) → snapshot puis restore (webview reflète).
- Integration `@vscode/test-electron` = **stretch**, hors plan initial.

## 10. Ordre des milestones (entrée writing-plans)

1. **Web M0** — `base:'./'` + `web/src/lib/vscode.ts` bridge no-op.
2. **cli exports** — champ `exports` `./lib/*` + build lib.
3. **core exports + routes + CORS** — subpath `@archi-os/core/schema` + 3 routes versioning HTTP + whitelist origine `vscode-webview://` (fold #5).
4. **EXT-M0** — scaffold `extension/` (manifest, esbuild, tsconfig) + `extension.ts` activate/deactivate + commandes vides.
5. **EXT-M1** — `webview/panel.ts` (CSP/nonce/asWebviewUri/injection nonced) + `webview/bridge.ts` chargeant `web/dist`.
6. **EXT-M2** — `engine.ts` (spawn attached via cli) + `mcp.ts` (init) + `statusbar.ts` + thème + autostart gaté.
7. **EXT-M4** — `diagnostics.ts` (onDidSave → Problems + push refresh) + `versioning/tree.ts` (TreeView + commandes).
8. **Packaging** — `vsce package` → `.vsix`. Publier `@archi-os/cli` (npm) optionnel.

## 11. Definition of done

- [ ] `.vsix` installable (VSCode + Cursor), commande « Open ARCHI-OS » ouvre la page câblée.
- [ ] Runtime + MCP démarrés par l'extension (pas de terminal manuel), autostart gaté par setting.
- [ ] Status bar Live/Disconnected, thème synchro, `retainContextWhenHidden`.
- [ ] Webview : assets chargés, 0 erreur CSP console, `fetch` core:PORT OK, injection `__ARCHI_OS__` nonced.
- [ ] Save `*.def.json` cassé → squiggle + Problems ; valide → clear + refresh instantané.
- [ ] TreeView versions : list / snapshot / restore ; restore persiste disque + in-memory (webview & MCP à jour).
- [ ] Zéro logique dupliquée (extension réutilise `cli/lib` + `@archi-os/core/schema`).
- [ ] `ARCHITECTURE.md` mis à jour (nouveau package `extension/`, exports cli/core, routes versioning).

## 12. Pièges connus (rappel handoff §7 + folds)

- Webview sandbox : pas d'accès Node/fs → tout via `postMessage`.
- Vite `base` défaut `/` casse `asWebviewUri` → `./`.
- Injection `__ARCHI_OS__` **sans nonce** en webview → fetch morts (fold #1).
- Import `@archi-os/core` racine → esbuild bundle Fastify+MCP → utiliser `/schema` (fold #2).
- **CSP ≠ CORS** : CSP passe mais l'origine `vscode-webview://` non whitelistée côté serveur
  → réponse bloquée par CORS → fetch morts. Whitelister l'origine webview (fold #5).
- Restore qui ne persiste pas disque → webview/MCP stale (fold #3).
- Autostart sur simple présence `.archi/` → spawn surprise (fold #4).
- MCP stdio spawné par le client, pas par la CLI ; `init` écrit juste la config.
- Perf webview > 500 nœuds : prévoir « ouvrir dans navigateur » en secours.
