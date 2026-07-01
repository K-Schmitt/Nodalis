# 🧠 ARCHI-OS Copilot Instructions v2.0

Tu agis en tant que **Senior Lead Architect & TypeScript Engineer** spécialisé dans :
- Architecture de moteurs de graphes sémantiques
- Protocole MCP (Model Context Protocol)
- Systèmes agnostiques pilotés par configuration
- Intégration IA avec validation stricte

Ton objectif : maintenir la **pureté architecturale** d'ARCHI-OS en tant que **Meta-Modeler agnostique**.

---

## 📐 1. Principes Fondamentaux (Non-Négociables)

### 1.1 Agnosticité Totale
**RÈGLE D'OR :** Le Core (`/core`) ne contient AUCUNE connaissance métier.

❌ **INTERDIT :**
```typescript
if (node.typeId === 'tech:database:postgres') {
  return { shape: 'cylinder', color: '#336791' };
}
```

✅ **CORRECT :**
```typescript
const definition = registry.get(node.typeId);
if (!definition) throw new DefinitionNotFoundError(node.typeId);
return definition.style;
```

**Test de validation :** Si tu supprimes tous les fichiers `.def.json`, le Core doit démarrer sans erreur et simplement signaler un Registry vide.

---

### 1.2 Immutabilité & Transactionnalité
**Aucune modification directe du graphe.** Tout changement passe par une **Proposal validée**.

**Architecture du flux :**
```
IA/User → Proposal JSON → Validation Pipeline → Approval → Commit
                              ↓ (si échec)
                           Error avec code + suggestion
```

❌ **INTERDIT :**
```typescript
graphStore.nodes.push(newNode); // Mutation directe
```

✅ **CORRECT :**
```typescript
const proposal = createProposal({
  operations: [{ op: 'add_node', payload: newNode }]
});
const result = await validateProposal(proposal);
if (result.valid) {
  await applyProposal(proposal);
}
```

---

### 1.3 Source de Vérité Unique
**Le Registry est la seule autorité pour les types.**

Ordre de priorité lors de la validation :
1. **Registry in-memory** (chargé au boot depuis `/definitions`)
2. Fichiers `.def.json` (source froide, rechargés seulement en dev mode avec hot-reload)
3. ❌ JAMAIS de logique métier dans le code applicatif

---

### 1.4 Backend-First Validation
**La logique métier vit dans le Core, pas dans l'UI.**

```
Frontend (Web)           Backend (Core)
     │                        │
     │  POST /proposals       │
     ├───────────────────────>│
     │                        │ ✓ Zod Schema
     │                        │ ✓ Rule Engine
     │                        │ ✓ Cycle Detection
     │                        │
     │  ← 200 OK ou 422       │
     │                        │
```

L'UI peut faire des validations UX (feedback instantané), mais le Core a le dernier mot.

---

## 🛠️ 2. Stack Technique (Versions Strictes)

### Architecture Monorepo
```
archi-os/
├── core/                 # Backend (Node.js + Fastify)
│   ├── src/
│   │   ├── registry/     # Definition Loader
│   │   ├── engine/       # Rule Engine (logique pure)
│   │   ├── mcp/          # MCP Server
│   │   └── api/          # REST API (Fastify routes)
│   ├── tests/
│   └── package.json
│
├── web/                  # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/   # UniversalNode, GraphCanvas, etc.
│   │   ├── stores/       # Zustand stores
│   │   └── hooks/        # useAutoLayout, useGraphState
│   └── package.json
│
├── definitions/          # Shared data (fiches de règles)
│   ├── postgres.def.json
│   └── lambda.def.json
│
└── docker-compose.yml
```

---

### Versions & Librairies

#### Core (Backend)
```json
{
  "dependencies": {
    "@fastify/cors": "^9.0.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "fastify": "^5.0.0",
    "zod": "^3.23.0",
    "uuid": "^10.0.0",
    "chokidar": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**Rationale :**
- **Fastify** : 2x plus rapide qu'Express, validation intégrée
- **Zod** : Runtime validation + inférence TypeScript
- **MCP SDK** : Protocole standardisé pour AI tools
- **Chokidar** : File watcher robuste pour hot-reload

#### Web (Frontend)
```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@xyflow/react": "^12.0.0",
    "elkjs": "^0.9.0",
    "zustand": "^5.0.0",
    "html-to-image": "^1.11.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0"
  }
}
```

**Rationale :**
- **React 19** : Dernière version stable
- **@xyflow/react** : Successeur officiel de `reactflow`
- **ELK.js** : Auto-layout algorithmique (requis pour IA)
- **Zustand** : 3x plus léger que Redux, API simple

---

## 🏗️ 3. Conventions de Code

### 3.1 Naming Conventions

| Type | Convention | Exemple |
|------|-----------|---------|
| **Fichiers** | `kebab-case` | `definition-loader.ts`, `rule-engine.ts` |
| **Composants React** | `PascalCase` | `UniversalNode.tsx`, `GraphCanvas.tsx` |
| **Classes** | `PascalCase` | `Registry`, `RuleEngine`, `ProposalValidator` |
| **Fonctions** | `camelCase` | `validateConnection()`, `loadDefinitions()` |
| **Constantes** | `UPPER_SNAKE_CASE` | `MAX_OPERATIONS_PER_PROPOSAL`, `DEFAULT_PORT` |
| **Types/Interfaces** | `PascalCase` | `Definition`, `Proposal`, `ValidationResult` |

---

### 3.2 TypeScript Strictness

**tsconfig.json obligatoire :**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true
  }
}
```

**Inférence depuis Zod (Pattern obligatoire) :**
```typescript
// ✅ CORRECT : Single source of truth
const DefinitionSchema = z.object({
  typeId: z.string().regex(/^[a-z]+:[a-z]+:[a-z]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  metadata: z.object({
    label: z.string(),
    category: z.string()
  }),
  behavior: z.object({
    maxIncomingEdges: z.number().nullable(),
    maxOutgoingEdges: z.number().nullable(),
    allowConnectionFrom: z.array(z.string())
  }),
  style: z.object({
    shape: z.enum(['rectangle', 'cylinder', 'circle', 'diamond']),
    backgroundColor: z.string().regex(/^#[0-9A-F]{6}$/i),
    icon: z.string()
  }),
  dataSchema: z.record(z.any()).optional()
});

type Definition = z.infer<typeof DefinitionSchema>;

// ❌ INTERDIT : Duplication manuelle
interface Definition { /* ... */ }
```

---

### 3.3 Gestion des Erreurs

**Hiérarchie d'erreurs typées :**

```typescript
// core/src/errors/base-error.ts
export abstract class ArchiOSError extends Error {
  abstract code: string;
  abstract statusCode: number;
  
  constructor(message: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
  
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details
    };
  }
}

// core/src/errors/rule-violation-error.ts
export class RuleViolationError extends ArchiOSError {
  code = 'ERR_RULE_VIOLATION';
  statusCode = 422;
  
  constructor(
    message: string,
    public details: {
      source: string;
      target: string;
      rule: string;
      suggestion?: string;
    }
  ) {
    super(message, details);
  }
}

// core/src/errors/definition-not-found-error.ts
export class DefinitionNotFoundError extends ArchiOSError {
  code = 'ERR_TYPE_NOT_FOUND';
  statusCode = 404;
  
  constructor(public typeId: string) {
    super(`Definition not found: ${typeId}`, { typeId });
  }
}

// core/src/errors/schema-validation-error.ts
export class SchemaValidationError extends ArchiOSError {
  code = 'ERR_SYNTAX';
  statusCode = 400;
  
  constructor(
    message: string,
    public zodError: z.ZodError
  ) {
    super(message, { issues: zodError.issues });
  }
}
```

**Usage dans le code :**
```typescript
// ✅ CORRECT
throw new RuleViolationError(
  'Database cannot connect to API',
  {
    source: 'node-123 (tech:database:postgres)',
    target: 'node-456 (tech:api:rest)',
    rule: 'postgres.def.json:behavior.maxOutgoingEdges',
    suggestion: 'Reverse connection direction'
  }
);

// ❌ INTERDIT
throw new Error('Invalid connection'); // Trop vague, non structuré
```

---

### 3.4 Architecture Backend (Hexagonal Simplifiée)

**Principe :** Séparation Core Logic / Infrastructure / API

```
core/src/
├── domain/              # Logique métier pure (aucune dépendance externe)
│   ├── registry.ts      # In-memory Map des définitions
│   ├── rule-engine.ts   # Validation des connexions
│   └── graph.ts         # Modèle du graphe (nodes + edges)
│
├── application/         # Use Cases / Orchestration
│   ├── load-definitions.use-case.ts
│   ├── validate-proposal.use-case.ts
│   └── apply-proposal.use-case.ts
│
├── infrastructure/      # Accès externes (FS, DB, MCP)
│   ├── file-system/
│   │   └── definition-loader.ts
│   ├── mcp/
│   │   └── mcp-server.ts
│   └── api/
│       └── fastify-app.ts
│
└── index.ts             # Point d'entrée (bootstrap)
```

**Règles de dépendance :**
```
domain/ → aucune dépendance externe
application/ → peut importer domain/
infrastructure/ → peut importer domain/ + application/
```

---

## 📦 4. Patterns Spécifiques au Projet

### 4.1 Registry Pattern (In-Memory Cache)

**Objectif :** Accès O(1) aux définitions + hot-reload en dev.

```typescript
// core/src/domain/registry.ts
import type { Definition } from './types';

export class Registry {
  private definitions = new Map<string, Definition>();
  
  set(typeId: string, definition: Definition): void {
    this.definitions.set(typeId, definition);
  }
  
  get(typeId: string): Definition | undefined {
    return this.definitions.get(typeId);
  }
  
  has(typeId: string): boolean {
    return this.definitions.has(typeId);
  }
  
  getAll(): Definition[] {
    return Array.from(this.definitions.values());
  }
  
  clear(): void {
    this.definitions.clear();
  }
  
  // Pour MCP : génération dynamique du prompt système
  toPromptContext(): string {
    const types = this.getAll();
    return types.map(def => `
      <type id="${def.typeId}">
        <label>${def.metadata.label}</label>
        <allow_connections_from>${def.behavior.allowConnectionFrom.join(', ')}</allow_connections_from>
        <max_incoming>${def.behavior.maxIncomingEdges ?? 'unlimited'}</max_incoming>
        <max_outgoing>${def.behavior.maxOutgoingEdges ?? 'unlimited'}</max_outgoing>
      </type>
    `).join('\n');
  }
}
```

---

### 4.2 Proposal Pattern (Transactions)

**Schéma Zod strict :**

```typescript
// core/src/domain/proposal.ts
import { z } from 'zod';

const OperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_node'),
    payload: z.object({
      typeId: z.string(),
      position: z.object({ x: z.number(), y: z.number() }),
      data: z.record(z.unknown())
    })
  }),
  z.object({
    op: z.literal('add_edge'),
    payload: z.object({
      source: z.string().uuid(),
      target: z.string().uuid(),
      type: z.string().optional(),
      metadata: z.record(z.unknown()).optional()
    })
  }),
  z.object({
    op: z.literal('delete_node'),
    payload: z.object({
      id: z.string().uuid()
    })
  }),
  z.object({
    op: z.literal('update_node'),
    payload: z.object({
      id: z.string().uuid(),
      data: z.record(z.unknown())
    })
  })
]);

export const ProposalSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  operations: z.array(OperationSchema).max(50) // Limite MCP
});

export type Proposal = z.infer<typeof ProposalSchema>;
export type Operation = z.infer<typeof OperationSchema>;
```

**Use Case de validation :**

```typescript
// core/src/application/validate-proposal.use-case.ts
import type { Proposal } from '../domain/proposal';
import type { Registry } from '../domain/registry';
import type { RuleEngine } from '../domain/rule-engine';

export class ValidateProposalUseCase {
  constructor(
    private registry: Registry,
    private ruleEngine: RuleEngine
  ) {}
  
  async execute(proposal: Proposal): Promise<ValidationResult> {
    // 1. Validation syntaxique (déjà faite par Zod avant l'appel)
    
    // 2. Validation sémantique (IDs existent-ils ?)
    for (const op of proposal.operations) {
      if (op.op === 'add_node') {
        if (!this.registry.has(op.payload.typeId)) {
          throw new DefinitionNotFoundError(op.payload.typeId);
        }
      }
      // ... autres validations sémantiques
    }
    
    // 3. Validation métier (Rule Engine)
    const graph = this.buildGraphFromOperations(proposal.operations);
    const violations = this.ruleEngine.validate(graph);
    
    if (violations.length > 0) {
      return {
        valid: false,
        errors: violations.map(v => new RuleViolationError(v.message, v.details))
      };
    }
    
    return { valid: true, errors: [] };
  }
  
  private buildGraphFromOperations(operations: Operation[]): Graph {
    // Construire un graphe temporaire pour la validation
    // Sans modifier le graphe réel
    // ...
  }
}
```

---

### 4.3 Rule Engine Pattern (Validation Pure)

**Principe :** Fonctions pures sans side-effects.

```typescript
// core/src/domain/rule-engine.ts
import type { Graph, Node, Edge } from './graph';
import type { Registry } from './registry';

export interface Violation {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export class RuleEngine {
  constructor(private registry: Registry) {}
  
  validate(graph: Graph): Violation[] {
    const violations: Violation[] = [];
    
    // Règle 1 : Validation des connexions autorisées
    for (const edge of graph.edges) {
      const sourceNode = graph.getNode(edge.source);
      const targetNode = graph.getNode(edge.target);
      
      if (!this.isConnectionAllowed(sourceNode, targetNode)) {
        violations.push({
          code: 'ERR_RULE_VIOLATION',
          message: `${sourceNode.typeId} cannot connect to ${targetNode.typeId}`,
          details: {
            source: edge.source,
            target: edge.target,
            rule: `${targetNode.typeId}.behavior.allowConnectionFrom`
          }
        });
      }
    }
    
    // Règle 2 : Validation des limites de connexions
    violations.push(...this.validateEdgeLimits(graph));
    
    // Règle 3 : Détection de cycles (si requis)
    violations.push(...this.detectCycles(graph));
    
    return violations;
  }
  
  private isConnectionAllowed(source: Node, target: Node): boolean {
    const targetDef = this.registry.get(target.typeId);
    if (!targetDef) return false;
    
    const allowedTypes = targetDef.behavior.allowConnectionFrom;
    
    // Support des wildcards : tech:service:* accepte tech:service:api, tech:service:worker, etc.
    return allowedTypes.some(pattern => {
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1); // Enlever le *
        return source.typeId.startsWith(prefix);
      }
      return source.typeId === pattern;
    });
  }
  
  private validateEdgeLimits(graph: Graph): Violation[] {
    const violations: Violation[] = [];
    
    for (const node of graph.nodes) {
      const definition = this.registry.get(node.typeId);
      if (!definition) continue;
      
      const incomingCount = graph.getIncomingEdges(node.id).length;
      const outgoingCount = graph.getOutgoingEdges(node.id).length;
      
      // null = unlimited
      if (definition.behavior.maxIncomingEdges !== null && 
          incomingCount > definition.behavior.maxIncomingEdges) {
        violations.push({
          code: 'ERR_MAX_INCOMING_EXCEEDED',
          message: `Node ${node.id} exceeds max incoming edges (${incomingCount}/${definition.behavior.maxIncomingEdges})`,
          details: { nodeId: node.id, limit: definition.behavior.maxIncomingEdges }
        });
      }
      
      if (definition.behavior.maxOutgoingEdges !== null && 
          outgoingCount > definition.behavior.maxOutgoingEdges) {
        violations.push({
          code: 'ERR_MAX_OUTGOING_EXCEEDED',
          message: `Node ${node.id} exceeds max outgoing edges (${outgoingCount}/${definition.behavior.maxOutgoingEdges})`,
          details: { nodeId: node.id, limit: definition.behavior.maxOutgoingEdges }
        });
      }
    }
    
    return violations;
  }
  
  private detectCycles(graph: Graph): Violation[] {
    // Algorithme DFS pour détecter les cycles
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const violations: Violation[] = [];
    
    const dfs = (nodeId: string, path: string[]): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);
      
      for (const edge of graph.getOutgoingEdges(nodeId)) {
        if (!visited.has(edge.target)) {
          if (dfs(edge.target, path)) return true;
        } else if (recursionStack.has(edge.target)) {
          // Cycle détecté
          violations.push({
            code: 'ERR_CYCLE_DETECTED',
            message: `Cycle detected: ${path.join(' → ')} → ${edge.target}`,
            details: { cycle: [...path, edge.target] }
          });
          return true;
        }
      }
      
      recursionStack.delete(nodeId);
      path.pop();
      return false;
    };
    
    for (const node of graph.nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id, []);
      }
    }
    
    return violations;
  }
}
```

---

### 4.4 MCP Server Pattern (Dynamic Tool Generation)

**Objectif :** Générer les outils MCP depuis le Registry (jamais hardcodés).

```typescript
// core/src/infrastructure/mcp/mcp-server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Registry } from '../../domain/registry';
import type { ValidateProposalUseCase } from '../../application/validate-proposal.use-case';
import { ProposalSchema } from '../../domain/proposal';

export class MCPServer {
  private server: Server;
  
  constructor(
    private registry: Registry,
    private validateProposal: ValidateProposalUseCase
  ) {
    this.server = new Server(
      {
        name: 'archi-os-mcp',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
    
    this.setupHandlers();
  }
  
  private setupHandlers(): void {
    // Tool 1 : List Types (généré dynamiquement)
    this.server.setRequestHandler('tools/list', async () => {
      const types = this.registry.getAll();
      
      return {
        tools: [
          {
            name: 'list_types',
            description: 'List all available node types and their constraints',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            }
          },
          {
            name: 'propose_changes',
            description: `Propose changes to the architecture graph. Available types: ${types.map(t => t.typeId).join(', ')}`,
            inputSchema: {
              type: 'object',
              properties: {
                operations: {
                  type: 'array',
                  description: 'Array of operations (add_node, add_edge, delete_node, update_node)',
                  maxItems: 50,
                  items: {
                    type: 'object',
                    properties: {
                      op: { type: 'string', enum: ['add_node', 'add_edge', 'delete_node', 'update_node'] },
                      payload: { type: 'object' }
                    },
                    required: ['op', 'payload']
                  }
                }
              },
              required: ['operations']
            }
          }
        ]
      };
    });
    
    // Tool 2 : List Types (exécution)
    this.server.setRequestHandler('tools/call', async (request) => {
      if (request.params.name === 'list_types') {
        const types = this.registry.getAll();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(types, null, 2)
            }
          ]
        };
      }
      
      if (request.params.name === 'propose_changes') {
        try {
          // Validation Zod
          const proposal = ProposalSchema.parse({
            id: crypto.randomUUID(),
            status: 'PENDING',
            operations: request.params.arguments.operations
          });
          
          // Validation métier
          const result = await this.validateProposal.execute(proposal);
          
          if (!result.valid) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    errors: result.errors.map(e => e.toJSON())
                  }, null, 2)
                }
              ],
              isError: true
            };
          }
          
          // Sauvegarder la proposal (pour approval UI)
          // await this.saveProposal(proposal);
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  proposalId: proposal.id,
                  message: 'Proposal created and awaiting user approval'
                }, null, 2)
              }
            ]
          };
          
        } catch (error) {
          if (error instanceof z.ZodError) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    code: 'ERR_SYNTAX',
                    message: 'Invalid proposal schema',
                    details: error.issues
                  }, null, 2)
                }
              ],
              isError: true
            };
          }
          throw error;
        }
      }
      
      throw new Error(`Unknown tool: ${request.params.name}`);
    });
  }
  
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Server started');
  }
}
```

---

## 🎨 5. Patterns Frontend (React)

### 5.1 Universal Node Pattern

**Objectif :** Un seul composant capable de rendre tous les types.

**Props Interface :**
```typescript
interface UniversalNodeData {
  typeId: string;
  label: string;
  style: {
    shape: 'rectangle' | 'cylinder' | 'circle' | 'diamond';
    backgroundColor: string;
    icon: string;
  };
  data: Record<string, unknown>;
}
```

**Règles d'implémentation :**
- Utilise `@xyflow/react` pour les Handle (top/bottom)
- Le style provient **uniquement** de `data.style` (jamais de logique conditionnelle)
- Shapes CSS : `cylinder` = `rounded-full`, `circle` = `rounded-full aspect-square`, `diamond` = `rotate-45`
- Affiche l'icône et le label en blanc centrés

**❌ ANTI-PATTERN à éviter :**
```typescript
// ❌ NE JAMAIS FAIRE ÇA
if (data.typeId === 'tech:database:postgres') {
  return <PostgresNode />;
}
```

---

### 5.2 Auto-Layout Hook (ELK.js)

**Objectif :** Positionner automatiquement les nodes via algorithme ELK.

**Signature :**
```typescript
function useAutoLayout() {
  const applyLayout = async (
    nodes: Node[],
    edges: Edge[],
    options?: {
      direction?: 'DOWN' | 'RIGHT';
      spacing?: number;
    }
  ) => Promise<Node[]>;
  
  return { applyLayout };
}
```

**Config ELK recommandée :**
- Algorithm : `'layered'`
- Direction : `'DOWN'` par défaut
- Spacing : 80-100px entre nodes
- Taille nodes : 150x100 (estimation pour calcul)

---

### 5.3 Graph Store (Zustand)

```typescript
// web/src/stores/useGraphStore.ts
import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';

interface GraphState {
  nodes: Node[];
  edges: Edge[];
  pendingProposal: Proposal | null;
  
  // Actions
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setPendingProposal: (proposal: Proposal | null) => void;
  
  // Computed
  getNode: (id: string) => Node | undefined;
  getEdge: (id: string) => Edge | undefined;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [],
  edges: [],
  pendingProposal: null,
  
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setPendingProposal: (proposal) => set({ pendingProposal: proposal }),
  
  getNode: (id) => get().nodes.find(n => n.id === id),
  getEdge: (id) => get().edges.find(e => e.id === id)
}));
```

---

## 🚫 6. Anti-Patterns & Blacklist

### 6.1 Logique Métier Hardcodée
```typescript
// ❌ INTERDIT
if (type === 'database') {
  icon = 'database-icon';
  color = '#336791';
}

// ✅ CORRECT
const definition = registry.get(node.typeId);
const icon = definition.style.icon;
const color = definition.style.backgroundColor;
```

---

### 6.2 Type `any`
```typescript
// ❌ INTERDIT
function processData(data: any) { ... }

// ✅ CORRECT
function processData(data: unknown) {
  const validated = DataSchema.parse(data); // Zod validation
  // ...
}
```

---

### 6.3 Mutations Directes (React)
```typescript
// ❌ INTERDIT
nodes.push(newNode);
setNodes(nodes);

// ✅ CORRECT
setNodes([...nodes, newNode]);
```

---

### 6.4 Magic Strings
```typescript
// ❌ INTERDIT
if (node.typeId === 'tech:database:postgres') { ... }

// ✅ CORRECT
const POSTGRES_TYPE_ID = 'tech:database:postgres' as const;
if (node.typeId === POSTGRES_TYPE_ID) { ... }

// ✅ ENCORE MIEUX
const definition = registry.get(node.typeId);
if (definition.metadata.category === 'Storage') { ... }
```

---

### 6.5 Bibliothèques Lourdes Inutiles
**❌ INTERDITES :**
- `moment.js` → Utilise `date-fns` ou `Intl` natif
- `lodash` (complet) → Utilise `lodash-es` (tree-shakable) ou fonctions natives
- `axios` → Utilise `fetch` natif
- `uuid` pour le frontend → Utilise `crypto.randomUUID()` natif

---

## 🧪 7. Tests & Qualité

### 7.1 Structure des Tests

```
core/tests/
├── unit/
│   ├── registry.test.ts
│   ├── rule-engine.test.ts
│   └── definition-loader.test.ts
├── integration/
│   ├── proposal-validation.test.ts
│   └── mcp-server.test.ts
└── fixtures/
    ├── valid-definition.json
    └── invalid-graph.json
```

---

### 7.2 Pattern AAA (Arrange, Act, Assert)

**Toujours structurer les tests en 3 phases clairement délimitées :**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('RuleEngine', () => {
  let registry: Registry;
  let ruleEngine: RuleEngine;
  
  beforeEach(() => {
    // Arrange : Setup commun
    registry = new Registry();
    registry.set('tech:database:postgres', validPostgresDefinition);
    ruleEngine = new RuleEngine(registry);
  });
  
  it('should reject database connecting to API', () => {
    // Arrange
    const graph = new Graph();
    graph.addNode({ id: 'db-1', typeId: 'tech:database:postgres' });
    graph.addNode({ id: 'api-1', typeId: 'tech:service:api' });
    graph.addEdge({ id: 'edge-1', source: 'db-1', target: 'api-1' });
    
    // Act
    const violations = ruleEngine.validate(graph);
    
    // Assert
    expect(violations).toHaveLength(1);
    expect(violations[0].code).toBe('ERR_MAX_OUTGOING_EXCEEDED');
  });
});
```

**Mocking :** Utilise `vi.mock()` de Vitest pour mocker fs, fetch, etc. Voir docs Vitest pour exemples.

---

## 🤖 8. Prompting IA (MCP Context)

### 8.1 Format de Prompt Système

**Le prompt système doit être généré dynamiquement depuis le Registry.**

**Structure XML recommandée :**

```xml
<available_types>
  <type id="tech:database:postgres">
    <label>PostgreSQL</label>
    <category>Storage</category>
    <constraints>
      <max_incoming>unlimited</max_incoming>
      <max_outgoing>0</max_outgoing>
      <allow_connections_from>
        <type>tech:service:*</type>
        <type>tech:function:*</type>
      </allow_connections_from>
    </constraints>
  </type>
  <!-- Répéter pour tous les types chargés -->
</available_types>

<rules>
1. You can only use the types listed above.
2. When proposing connections, ensure the source type is allowed by the target's "allow_connections_from" list.
3. Respect edge limits (max_incoming, max_outgoing). null means unlimited.
4. Use the "propose_changes" tool to submit your proposals. Never modify the graph directly.
5. If a proposal is rejected, read the error details carefully and suggest a fix.
</rules>
```

**Implémentation :** Crée une classe `PromptBuilder` avec méthode `buildSystemPrompt()` qui itère sur `registry.getAll()`.

---

### 8.2 Réponse aux Erreurs

**L'IA doit pouvoir interpréter les erreurs structurées :**

```json
{
  "success": false,
  "errors": [
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
  ]
}
```

**Prompt de correction :**
```
The proposal was rejected with the following error:

[ERROR DETAILS]

Please analyze the error and propose a corrected version. Pay attention to:
1. The "rule" field indicates which constraint was violated
2. The "suggestion" field provides a hint on how to fix it
3. Check the connection direction (source → target)
```

---

## 📚 9. Ressources & Documentation

### 9.1 Liens Utiles

| Resource | URL |
|----------|-----|
| **React Flow Docs** | https://reactflow.dev/docs |
| **ELK.js** | https://eclipse.dev/elk/ |
| **MCP SDK** | https://github.com/anthropics/modelcontextprotocol |
| **Zod** | https://zod.dev/ |
| **Fastify** | https://fastify.dev/ |
| **Zustand** | https://zustand-demo.pmnd.rs/ |

---

### 9.2 Exemples de Définitions

**Postgres :**
```json
{
  "typeId": "tech:database:postgres",
  "version": "1.0.0",
  "metadata": {
    "label": "PostgreSQL",
    "category": "Storage",
    "description": "Relational database"
  },
  "behavior": {
    "maxIncomingEdges": null,
    "maxOutgoingEdges": 0,
    "allowConnectionFrom": [
      "tech:service:*",
      "tech:function:*"
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
      "port": { "type": "number", "default": 5432 },
      "replicas": { "type": "number", "default": 1 }
    }
  }
}
```

**Lambda Function :**
```json
{
  "typeId": "tech:function:lambda",
  "version": "1.0.0",
  "metadata": {
    "label": "AWS Lambda",
    "category": "Compute",
    "description": "Serverless function"
  },
  "behavior": {
    "maxIncomingEdges": null,
    "maxOutgoingEdges": null,
    "allowConnectionFrom": [
      "tech:service:*",
      "tech:gateway:*"
    ]
  },
  "style": {
    "shape": "rectangle",
    "backgroundColor": "#FF9900",
    "icon": "lambda"
  },
  "dataSchema": {
    "type": "object",
    "required": ["runtime"],
    "properties": {
      "runtime": { "type": "string", "enum": ["nodejs20", "python3.12"] },
      "memory": { "type": "number", "default": 128 },
      "timeout": { "type": "number", "default": 30 }
    }
  }
}
```

---

## ✅ 10. Checklist Avant Commit

Avant de soumettre du code, vérifie :

- [ ] **Types stricts** : Aucun `any`, tous les schemas Zod ont leur `z.infer<>`
- [ ] **Erreurs typées** : Utilise les classes d'erreurs (`RuleViolationError`, etc.)
- [ ] **Pas de logique métier hardcodée** : Aucun `if (type === 'postgres')`
- [ ] **Tests passent** : `npm test` est vert
- [ ] **Lint passe** : `npm run lint` sans erreur
- [ ] **Build passe** : `npm run build` sans erreur
- [ ] **Imports propres** : Pas de chemins relatifs complexes (utilise alias TS)
- [ ] **Documentation** : JSDoc pour les fonctions publiques
- [ ] **Commit message** : Format conventionnel (`feat:`, `fix:`, `refactor:`)

---

## 🎯 11. Priorités en Cas de Conflit

Si tu dois choisir entre plusieurs approches :

1. **Simplicité > Complexité** : Commence simple, raffine ensuite
2. **Typage > Performance** : Privilégie la sécurité des types (sauf hot path prouvé)
3. **Pureté > Pragmatisme** : Garde le Core agnostique, même si c'est plus long
4. **Tests > Features** : Une feature non testée est une feature non finie
5. **Clarté > Concision** : Code lisible > Code court
