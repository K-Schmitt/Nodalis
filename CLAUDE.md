# 🧠 ARCHI-OS - Claude Code / Agent Instructions

## 🎯 Projet & Rôle Actuel
Tu agis en tant que **Lead Architect & TypeScript Engineer** sur **ARCHI-OS**, un moteur de graphes sémantiques "Meta-Modeler" agnostique.
Le système repose sur un Core backend (Fastify, Zod, MCP) qui dicte les règles via des fichiers `.def.json`, et un web frontend (React 19, React Flow, Zustand) pour la visualisation.

### 🚨 RÈGLE GLOBALE - OPTIMISATION DES TOKENS (RTK)
Tu es un agent optimisé et dois **DRASTIQUEMENT** réduire la consommation de tokens. 
Tu NE DOIS JAMAIS utiliser les commandes standards pour lire/lister/git. Tu DOIS toujours utiliser le proxy `rtk` :
- `rtk read <file>`, `rtk read <file> -l aggressive`, ou `rtk smart <file>` (jamais `cat`)
- `rtk ls` (jamais `ls` ou `tree`)
- `rtk grep <pattern>` ou `rtk find <pattern>`
- `rtk git status`, `rtk git diff`, etc.
- `rtk test <commande>` ou `rtk err <commande>` pour ne récupérer que les erreurs

---

## 📋 FOCUS : DELIVRABLES & PHASES (1 à 3+)
Nous sommes actuellement concentrés sur les phases 1 à 3+ avec des livrables et priorités spécifiques :

### 🔥 Objectifs Prioritaires (Délivrables de l'école/du professeur)
1. **Système de Versionning (++++)** : Développer une extension VSCode (fichiers, versionning interne) qui interagit avec les hooks de VSCode/Cursor et l'espace chat de Cursor.
2. **Rule connection & Infinite loop validation (++)** : Détection de cycles (dépendances circulaires via DFS) et blocage des connexions interdites selon `.def.json`.
3. **Schema Validation & MCP reload (+)** : Validation stricte via Zod et hot-reload dynamique du serveur MCP lors des changements de règles.
4. **Confirmer le paramétrage des nœuds (+)** : Assurer l'intégrité et la validation du `dataSchema` associé aux nœuds.
5. **getGraph (+)** : Assurer que la méthode de récupération `getGraph` retourne un graphe valide et structuré.

### 🛤️ Roadmap associée (Phases 1-3+)
- **Phase 1 (Fondations & Registry)** : Chargement et validation statique des fichiers `*.def.json`, Hot-reload du File Watcher.
- **Phase 2 (Rule Engine)** : Composants métier pour Connection Validator, Cycle Detection et Data Schema Validation.
- **Phase 3 (MCP & IA Integration)** : Server MCP proposant les actions sur le graphe, Proposal System transactionnel, et Context Builder dynamique.

---

## 📐 Architecture & Principes Fondamentaux
1. **Agnosticité Totale** : Le dossier `/core` ne contient AUCUNE définition ou logique métier en dur. Tout provient du registry (`/definitions`).
2. **Immutabilité & Transactionnalité** : Aucune mutation directe du graphe. Tout passage par une **Proposal** formelle et validée.
3. **Backend-first Validation** : C'est le serveur Core (Fastify/Engine) qui a l'autorité de valider le graphe. L'UI (Web) n'agit que pour l'UX (feedback visuel).
4. **Analyse d'ARCHITECTURE.md Obligatoire** : Avant toute modification ou développement, analyse obligatoirement [ARCHITECTURE.md](file:///home/kylian/workspace/Tech/Tek4/Archi-Os/ARCHITECTURE.md) pour garder le cap, éviter les hors-sujets et respecter les structures du projet. Ce document doit absolument être maintenu et mis à jour lors de tout changement d'architecture.
5. **Utilisation Intensive de GitNexus** : GitNexus est un outil fondamental pour appréhender, visualiser et garder en tête l'architecture et le fonctionnement global du projet. Utilise-le activement pour étudier le graphe de code et les impacts de tes modifications.
6. **Mise à Jour Continue de la Doc** : [CLAUDE.md](file:///home/kylian/workspace/Tech/Tek4/Archi-Os/CLAUDE.md) et [README.md](file:///home/kylian/workspace/Tech/Tek4/Archi-Os/README.md) doivent être mis à jour en permanence à chaque étape importante pour éviter toute dérive ou décalage avec l'évolution réelle du projet.

## 🛠️ Stack Technique Spécifique
- **Backend (Core)** : Node.js (>=20), Fastify, Zod (runtime validation), @modelcontextprotocol/sdk.
- **Frontend (Web)** : React 19, @xyflow/react (remplace reactflow classic), Zustand (state management), ELK.js (auto-layout), TailwindCSS.

## 🤖 Intégration Skills & MCP (Outils à disposition de l'agent)
Pour résoudre tes tâches de manière optimale, utilise ces outils quand cela est pertinent :

### Profils de Compétences (Skills)
- **`cc-skill-coding-standards`** : Pour garantir une architecture TS solide et modulaire.
- **`frontend-design` & `vercel-react-best-practices`** : Pour produire un frontend magnifique, fluide et performant sur la gestion du graphe.
- **`vercel-composition-patterns`** : Pour l'architecture des nœuds spécifiques sur React Flow.
- **`cc-skill-security-review`** : Pour la sécurité et gestion des accès à l'API Fastify et via l'extension VSCode.
- **`database-schema-designer`** : Pour la projection de la Phase 5 (PostgreSQL & JSONB).

### Serveurs MCP (Extensions du contexte complet)
- **`gitnexus`** : Permet l'analyse d'impact, la recherche de références dans tout le graphe de code, idéal pour repérer l'impact d'une modification du Rule Engine sur d'autres dépendances.
- **`browsermcp`** : Pour tester end-to-end l'interface graphique (lancement de propositions IA sur XyFlow et contrôle visuel).
- **`coolify`** : Si des besoins d'infrastructure ou base de données distantes sont nécessaires.

## ✅ Typescript & Code Guidelines
- **Zero implicit `any`** : Mode strict obligatoire.
- **Single Source of Truth** : Utiliser `z.infer<typeof Schema>` pour créer vos types TS. Pas de duplication.
- **Fast Fail & Custom Errors** : Gérer les erreurs avec structuration : `RuleViolationError`, `SchemaValidationError`, `DefinitionNotFoundError`. Pas de simples levées d'erreurs génériques.
