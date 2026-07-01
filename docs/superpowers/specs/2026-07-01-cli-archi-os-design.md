# Design — CLI `@archi-os/cli`

> Date: 2026-07-01
> Statut: validé (brainstorming), prêt pour writing-plans
> Portée: **CLI complète** (M1 `init`+`doctor` + M2 `up`/`down`/`uninstall`).
> Hors portée: extension VSCode et page webview → specs séparés ultérieurs.
> Référence source: [docs/HANDOFF-CLI-EXTENSION.md](../../HANDOFF-CLI-EXTENSION.md)

---

## 1. Objectif & principe directeur

Rendre ARCHI-OS installable/lançable en une commande, proprement et de façon pro :

```
npx archi-os init && archi-os up   # → MCP configuré + web ouvert, 0 étape manuelle
```

**Principe directeur :** la logique « installer / lancer / configurer MCP » vit **une seule fois** dans la CLI. L'extension VSCode (spec ultérieur) l'enveloppera sans réécrire cette couche. Docker est une **cible runtime** de la CLI (`--docker`), pas un produit concurrent.

Une seule modification côté `web/` dans ce spec (voir §7).

---

## 2. Arborescence

```
cli/                              # @archi-os/cli — ajouté à workspaces[] racine (déjà ["core","web"] → +"cli")
├── src/
│   ├── index.ts                  # shebang, câblage commander, catch global
│   ├── commands/
│   │   ├── init.ts               # merge config MCP client(s)
│   │   ├── doctor.ts             # diagnostics
│   │   ├── up.ts                 # spawn core (HTTP+MCP) + web statique
│   │   ├── down.ts               # stoppe les process lancés
│   │   └── uninstall.ts          # down + retire config MCP (réversible)
│   ├── lib/
│   │   ├── mcp-config.ts         # merge/unmerge purs, clé paramétrée, JSONC modify
│   │   ├── paths.ts              # descripteurs clients OS-aware
│   │   ├── ports.ts              # findFreePort, waitForHealth
│   │   ├── process.ts            # spawn bimodal, registre run.json, kill signé
│   │   └── static-server.ts      # SPA zéro-dep, confiné, bind 127.0.0.1
│   ├── config.ts                 # schéma Zod de la config utilisateur
│   └── errors.ts                 # CliError & dérivés
├── package.json                  # bin: { "archi-os": "dist/index.js" }, build tsup
└── tsconfig.json
```

**Stack :** TypeScript (strict), `commander` (args) + `@clack/prompts` (interactif), build **tsup** (bundle 1 fichier), `zod` (validation config), `jsonc-parser` (parse + édition chirurgicale). **Zéro dépendance** pour le serveur statique (Node `http`/`fs`).

---

## 3. Fichiers d'état

Deux fichiers, tous deux **gitignorés**, logés sous l'existant `.archi/` pour éviter la confusion avec un second dossier caché quasi identique (`.archi-os/`).

| Fichier | Rôle | Écrit par |
|---|---|---|
| `.archi/cli.json` | Config utilisateur : ports **préférés**, clients configurés. Validé Zod. | `init` |
| `.archi/cli/run.json` | Registre runtime : PID/port/signature réels **après fallback**. | `up` |
| `.archi/cli/logs/{core,web}.log` | Sorties des process détachés. | `up` |

> **Nommage tranché :** runtime CLI sous `.archi/cli/` (un seul dossier caché, sémantique claire). `.archi/` existant = données workspace/graphe. Pas de `.archi-os/` à la racine.

### `.archi/cli.json` (schéma Zod, `config.ts`)
```jsonc
{
  "ports": { "core": 3000, "web": 4173 },   // préférés
  "clients": ["cursor", "vscode"]             // configurés via init
}
```

### `.archi/cli/run.json` (registre runtime)
```jsonc
{
  "mode": "native",                 // 'native' | 'docker' → route down
  "startedAt": 1751000000000,
  "core": { "pid": 12345, "port": 3000, "startedAt": 1751000000000, "cmd": "node .../core/dist/index.js" },
  "web":  { "pid": 12346, "port": 4173, "startedAt": 1751000000100, "cmd": "node static-server" }
}
```

**Précédence ports :** `cli.json` = préférés ; `run.json` = réels (après fallback `EADDRINUSE`). L'injection web (§7) lit **`run.json`**.

---

## 4. Config MCP — le cœur « pro »

### Descripteurs clients (`paths.ts`)

Résolution OS-aware via `process.platform`. Chaque client porte sa **clé** et sa **forme d'entrée** — jamais de hardcode `mcpServers`.

```ts
type ClientDescriptor = {
  id: 'cursor' | 'claude' | 'vscode';
  file: string;                       // chemin absolu résolu
  key: 'mcpServers' | 'servers';
  entry: 'plain' | 'stdio';           // vscode → ajoute "type": "stdio"
};
```

| Client | Fichier | Clé | Entrée |
|---|---|---|---|
| Cursor | `~/.cursor/mcp.json` (global) ou `<ws>/.cursor/mcp.json` | `mcpServers` | plain |
| Claude Desktop | darwin `~/Library/Application Support/Claude/` · win `%APPDATA%\Claude\` · linux `~/.config/Claude/` → `claude_desktop_config.json` | `mcpServers` | plain |
| VSCode | `<ws>/.vscode/mcp.json` | **`servers`** | **`stdio`** (+ `"type":"stdio"`) |

> ⚠️ VSCode utilise `servers`, **pas** `mcpServers`. Hardcoder `mcpServers` = config écrite au mauvais endroit = MCP jamais chargé.

### Entrée écrite
```jsonc
{
  "command": "node",
  "args": ["<abs>/core/dist/index.js"],
  "env": { "WORKSPACE_ROOT": "<abs>" }
  // VSCode: + "type": "stdio"
}
```
> **Rappel :** le MCP stdio est spawné **par le client** (Cursor/Claude/VSCode), pas par la CLI. `init` écrit uniquement la config. Ne pas confondre avec le core HTTP (lancé par `up`).

### `mcp-config.ts` — fonctions pures + édition chirurgicale
- `mergeServer(text, entry, key)` / `unmergeServer(text, key)` : **purs** (string → string), testables.
- **Édition chirurgicale JSONC** via `jsonc-parser` `modify` / `applyEdits` : on édite **uniquement** la clé `archi-os` sous `key`. Les **commentaires** et le formatage voisins de l'utilisateur restent **intacts** (fréquents dans `.vscode/mcp.json`).
  - Parse (lecture) tolérant ≠ écriture : un `JSON.parse → stringify` détruirait les commentaires. `modify`/`applyEdits` évite ça, pour **merge ET unmerge**.
- **Idempotent :** si la clé `archi-os` est déjà identique → aucune écriture.
- **Réversible :** `unmergeServer` retire exactement la clé `archi-os`, préserve les serveurs voisins.

### I/O & robustesse (dans `init.ts`, séparé des fonctions pures)
1. **Parse illisible** (jsonc renvoie des erreurs de syntaxe) → **jamais écraser** : backup + abort avec message clair (« config illisible, édite à la main »).
2. **Fichier/dossier absents** (machine fraîche) → `mkdir -p` + création d'un fichier neuf.
3. **Backup `.bak` seulement si absent** (sinon 2ᵉ `init` sauvegarde la version déjà modifiée → original perdu). Idempotence + unmerge sont le vrai filet.
4. **Écriture atomique** : écrire dans un temp puis `rename` → un crash en plein write ne corrompt pas le `mcp.json` utilisateur.

### `init` interactif
- Sans `--client` → **détecter les clients réellement installés** (fichiers/dossiers présents) → multiselect `@clack/prompts` (`[x] Cursor [ ] VSCode`). Ne jamais écrire une config Claude sur une machine sans Claude.
- `--client cursor|claude|vscode|all` → explicite, pas de prompt.
- Écrit/met à jour `.archi/cli.json` (ports préférés, clients configurés).

---

## 5. Runtime — `up` / `down`

### `process.ts` — bimodal dès maintenant
```ts
spawn({ mode: 'detached' })   // CLI up : detached:true, unref(), le terminal rend la main
spawn({ mode: 'attached' })   // future extension : enfant lié, tué au deactivate()
```
Même registre `run.json`, deux stratégies de cycle de vie. **Acté dans ce spec** pour éviter une réécriture côté extension (dette).

- **Sans shell** : PID unique (pas d'arbre de process orphelinable), pas d'injection de commande.
- **Logs** : stdout/stderr → `.archi/cli/logs/{core,web}.log` (les détachés n'ont pas de stdout visible).

### Anti-PID-reuse (kill signé)
Un PID est recyclé par l'OS. Avant tout kill, vérifier que le process vivant correspond à la **signature** stockée : `port` en écoute **et** `startedAt`/`cmd` cohérents. Sinon → « déjà arrêté », pas de kill d'un innocent.

### Kill portable
- Windows : `taskkill /T /F /PID`.
- Autres : `SIGTERM` → grâce → `SIGKILL`.

### Flow `up`
1. `run.json` présent + process **vivant** (signature OK) → « already up on :PORT », exit (idempotent, pas de double-lancement).
2. Résoudre port core (`findFreePort(cli.json.ports.core)`).
3. Spawn core détaché : `RUN_HTTP_SERVER=true`, `PORT=<core>`, `WORKSPACE_ROOT=<abs>`.
4. **Écrire l'entrée `core` dans `run.json` immédiatement** (avant le web) → toute défaillance ultérieure laisse un process **killable** (pas d'orphelin).
5. `waitForHealth(GET /health)` en **race avec l'exit du child** :
   - health OK avant timeout → continuer.
   - child sort avant → **fail-fast** + tail des dernières lignes de `logs/core.log` (mauvais `WORKSPACE_ROOT`, port pris, exception).
6. Résoudre port web, lancer le serveur statique (§6), compléter `run.json` (`web`).
7. Imprimer les URLs (« ready »).

`--docker` → délègue `docker compose up -d`, marque `mode:'docker'` dans `run.json`, saute le spawn natif.

### Flow `down`
- Lit `run.json`. Route selon `mode` :
  - `native` → kill signé de `web` puis `core`.
  - `docker` → `docker compose down`.
- Supprime `run.json` en fin.

---

## 6. Serveur statique (`static-server.ts`)

Sert `web/dist` (build prod). **Zéro dépendance** (Node `http`/`fs`).

- **Sécurité path traversal** : `resolve(distRoot, urlPath)` puis **vérifier `startsWith(distRoot)`** → rejet `403` sinon. Empêche `GET /../../etc/passwd`.
- **Bind `127.0.0.1` uniquement** (jamais `0.0.0.0`) → pas d'exposition LAN.
- **SPA fallback** : route inconnue → `index.html`.
- **Retry `EADDRINUSE`** (TOCTOU du port) → port suivant, port autoritaire = celui réellement bindé, écrit dans `run.json`.
- **Injection runtime** avant `</head>` :
  ```html
  <script>window.__ARCHI_OS__ = { apiBaseUrl: "http://localhost:<corePort>" };</script>
  ```

### Décision `web/dist`
- **Prébuild shippé** dans le package (recommandé) → `up` fonctionne même sans les devDeps web.
- Si `dist` absent → **erreur claire** (« lance `npm run build:web` »), **pas** de stacktrace `vite`.

---

## 7. Modification côté `web/` (unique)

Problème : `web/src/config.ts` bake `VITE_API_BASE_URL` au **build**, mais `up` choisit le port core **dynamiquement**. Un `dist` prébuildé pointerait un port périmé.

Fix (chaîne de fallback, global **typé** — respecte la règle zero-`any` de CLAUDE.md) :
```ts
declare global {
  interface Window { __ARCHI_OS__?: { apiBaseUrl?: string } }
}

export const API_BASE_URL =
  window.__ARCHI_OS__?.apiBaseUrl
  ?? import.meta.env.VITE_API_BASE_URL
  ?? 'http://localhost:3000';
```
Marche en **webview** (injecté par la future extension), en **CLI** (injecté par le static-server), et en **navigateur pur** (fallback). C'est exactement le pattern dont le bridge webview aura besoin.

---

## 8. `doctor`

Diagnostics clairs, sortie lisible :
- Node ≥ 20 ?
- Ports préférés (`cli.json`) libres / occupés ?
- Config MCP présente pour les clients détectés ?
- Chemin absolu baké (`<abs>/core/dist/index.js`) **existe encore** ? (détecte un repo déplacé)
- `run.json` : process vivants (signature) ? tail des dernières lignes de `logs/*.log`.
- Définitions valides (réutilise la validation core si accessible).

---

## 9. `uninstall`

Réversible, sans résidu :
1. `down` d'abord (stoppe les process).
2. `unmergeServer` sur chaque client configuré → retire **uniquement** la clé `archi-os` (édition chirurgicale, commentaires voisins intacts).
3. Supprime `run.json`.

---

## 10. Erreurs & tests

### `errors.ts`
- `CliError` (base) : `message` orienté utilisateur + `exitCode`.
- Dérivés : `McpConfigError`, `PortError`, `ProcessError`.
- `index.ts` : catch global → imprime `.message` propre (jamais de stacktrace à l'utilisateur), détail complet dans les logs.

### Tests (vitest, aligné sur core)
Couverture ciblée sur les **fonctions pures** :
- `mcp-config` : merge/unmerge, idempotence, clé cursor-vs-vscode, **préservation des commentaires** (JSONC modify), refus d'écraser si illisible.
- `paths` : switch OS via `platform` mocké.
- `ports` : fallback `findFreePort`.
- `static-server` : rejet path traversal, SPA fallback, injection `__ARCHI_OS__`.

Spawn/détaché → **un smoke d'intégration** + checklist manuelle (DoD).

---

## 11. Sécurité (skill `cc-skill-security-review` passée)

| Point | Traitement |
|---|---|
| Path traversal | static-server confiné à `web/dist` (`startsWith`) |
| Exposition réseau | bind `127.0.0.1` (static + core HTTP), jamais `0.0.0.0` |
| Injection commande | spawn **sans shell**, PID unique |
| Intégrité config | écriture **atomique** (temp+rename), backup-si-absent, édition chirurgicale JSONC |
| Fuite d'infos | erreurs propres à l'utilisateur, détails uniquement dans les logs fichiers |
| Secrets | aucun écrit (uniquement des chemins + `WORKSPACE_ROOT`) |
| Validation entrée | Zod (`cli.json`), `--client` enum, ports coercés+bornés, JSONC tolérant |

CSP/nonce = concernent le **webview** (spec ultérieur), hors de ce spec.

---

## 12. Definition of Done

- [ ] `npx archi-os init && archi-os up` → web ouvert + MCP configuré, **0 étape manuelle**.
- [ ] `down` / `uninstall` propres, sans résidu.
- [ ] `doctor` utile (Node, ports, config MCP, chemin baké, logs).
- [ ] Config MCP : merge / idempotent / réversible / backup / commentaires préservés.
- [ ] Cross-OS (linux + au moins 1 autre testé).
- [ ] `process.ts` bimodal detached/attached, kill signé, logs fichiers.
- [ ] `ARCHITECTURE.md` mis à jour (nouveau package `cli/`).

---

## 13. Milestones (ordre d'implémentation)

1. **M1** : `paths` + `mcp-config` (purs, tests) → `init` + `doctor`. Testable seul.
2. **M2a** : `ports` + `process` (bimodal, run.json, kill signé) + `static-server` → `up` / `down`.
3. **M2b** : `--docker`, `uninstall`, modif `web/config.ts`, prébuild `web/dist`.
4. **Packaging** : `bin` + build tsup ; publication `@archi-os/cli` (npm) optionnelle.
