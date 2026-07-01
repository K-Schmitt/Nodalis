import { z } from 'zod';

/**
 * Paradigm-aware render descriptor (optional, per node definition).
 *
 * The Core stays 100% agnostic: it validates the shape and forwards it as
 * opaque data. It NEVER branches on `archetype` — the frontend picks the
 * matching generic renderer. Absent ⇒ frontend falls back to `style.shape`
 * (the legacy "box" rendering), so this is fully backward-compatible.
 *
 * Archetypes:
 *   - "record" : titled box with compartments of rows (ERD table, UML class,
 *                DDD entity/aggregate). Rows come from a `data`/`dataSchema` array.
 *   - "shape"  : pure geometry with BPMN/flowchart semantics (event, task,
 *                gateway, data-object) selected via `shape`.
 *   - "device" : big centered icon + label (network devices, infra).
 *   - "box"    : explicit legacy box (same as omitting `render`).
 */
export const RenderSpecSchema = z.object({
  archetype: z.enum(['record', 'shape', 'device', 'box', 'container']),

  /** record: field name to read the header title from (default: node label). */
  titleFrom: z.string().optional(),
  /** record: accent colour for the title bar / stripe (hex). */
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'accent must be a valid hex color').optional(),
  /** record: one section per compartment, each listing rows from a data array. */
  compartments: z.array(z.object({
    /** data/dataSchema key holding the array of rows to render. */
    from: z.string().min(1),
    /** optional compartment header (e.g. "Attributes", "Methods"). */
    label: z.string().optional(),
    /** map of badge name → source key marking rows (e.g. { pk: "primaryKey" }). */
    badges: z.record(z.string()).optional(),
  })).optional(),

  /** shape: geometric variant, e.g. "event-start", "task", "gateway-x". */
  shape: z.string().optional(),

  /** device: lucide icon name rendered large. */
  icon: z.string().optional(),
}).strict();

export type RenderSpec = z.infer<typeof RenderSpecSchema>;

/**
 * Schema for Definition files (*.def.json)
 * Validates the structure of node type definitions
 */
export const DefinitionSchema = z.object({
  typeId: z.string().regex(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/, 'typeId must follow pattern "namespace:category:name" (lowercase, digits and hyphens allowed)'),
  label: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  style: z.object({
    shape: z.enum(['rectangle', 'circle', 'diamond', 'cylinder', 'hexagon']),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'color must be a valid hex color'),
    icon: z.string().optional(),
  }),
  constraints: z.object({
    maxInputs: z.number().int().min(0).optional(),
    maxOutputs: z.number().int().min(0).optional(),
    allowedSources: z.array(z.string()).optional(),
    allowedTargets: z.array(z.string()).optional(),
    requiredFields: z.array(z.string()).optional(),
  }).optional(),
  dataSchema: z.record(z.unknown()).optional(),
  /**
   * Paradigm-aware rendering hint. Opaque to the Core (forwarded as-is to the
   * frontend). See {@link RenderSpecSchema}.
   */
  render: RenderSpecSchema.optional(),
});

export type Definition = z.infer<typeof DefinitionSchema>;

/**
 * Schema for Graph Nodes
 * Represents instances of types in the graph
 */
export const NodeSchema = z.object({
  id: z.string().uuid(),
  typeId: z.string(),
  label: z.string().min(1),
  data: z.record(z.unknown()).optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }).optional(),
  /**
   * Optional parent node id. When set, this node is nested inside a `container`
   * node (BPMN pool/lane, DDD bounded-context, UML package) and its `position`
   * is relative to that parent. Drives grouping in the frontend + nested layout.
   */
  parentId: z.string().uuid().optional(),
  /**
   * When present, this node owns a nested sub-graph (drill-down). The sub-graph
   * has its OWN architecture preset, so e.g. a "Database" node in a web graph can
   * link to an ERD sub-graph. Stored at `.archi/subgraphs/<node.id>.graph.json`.
   */
  subgraph: z.object({
    presetId: z.string().min(1),
  }).optional(),
});

export type Node = z.infer<typeof NodeSchema>;

/**
 * Schema for Graph Edges
 * Represents connections between nodes
 */
export const EdgeSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
  label: z.string().optional(),
  /**
   * Semantic relation id (e.g. "extends", "composes", "one-to-many"). Must match
   * one of the active preset's `edgeTypes` when that preset declares them. Drives
   * the visual rendering (line style + arrowheads) in the frontend.
   */
  type: z.string().optional(),
});

export type Edge = z.infer<typeof EdgeSchema>;

/**
 * Arrowhead/line markers a preset can assign to an edge relation. The frontend
 * maps these to SVG markers (UML-style hollow triangle, composition diamond, …).
 */
export const EdgeMarkerSchema = z.enum([
  'none', 'arrow', 'arrow-closed',
  'triangle', 'triangle-open',
  'diamond', 'diamond-open',
  'circle', 'circle-open',
  // ERD crow's-foot cardinality notation
  'cf-one', 'cf-many', 'cf-one-mandatory', 'cf-zero-one', 'cf-zero-many',
]);

export type EdgeMarker = z.infer<typeof EdgeMarkerSchema>;

/**
 * A relation type a preset makes available for edges (e.g. UML "extends",
 * ERD "one-to-many"). Keeps the core agnostic: paradigms define their own
 * relation vocabulary and visual style as data.
 */
export const EdgeTypeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  style: z.object({
    stroke: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'stroke must be a hex color').optional(),
    dashed: z.boolean().optional(),
    animated: z.boolean().optional(),
    width: z.number().min(1).max(8).optional(),
    markerStart: EdgeMarkerSchema.optional(),
    markerEnd: EdgeMarkerSchema.optional(),
  }).default({}),
});

export type EdgeType = z.infer<typeof EdgeTypeSchema>;

/**
 * Schema for Operations in Proposals
 * Discriminated union for type safety
 */
export const OperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_node'),
    payload: NodeSchema,
  }),
  z.object({
    op: z.literal('update_node'),
    payload: z.object({
      id: z.string().uuid(),
      changes: z.record(z.unknown()),
    }),
  }),
  z.object({
    op: z.literal('delete_node'),
    payload: z.object({
      id: z.string().uuid(),
    }),
  }),
  z.object({
    op: z.literal('add_edge'),
    payload: EdgeSchema,
  }),
  z.object({
    op: z.literal('delete_edge'),
    payload: z.object({
      id: z.string().uuid(),
    }),
  }),
  z.object({
    op: z.literal('clear_all'),
    payload: z.object({}).optional(),
  }),
]);

export type Operation = z.infer<typeof OperationSchema>;

/**
 * Schema for Proposals
 * Represents a batch of operations to be validated and applied
 */
export const ProposalSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  author: z.string().min(1),
  operations: z.array(OperationSchema).min(1, 'A proposal must contain at least one operation').max(500, 'Maximum 500 operations per proposal'),
});

export type Proposal = z.infer<typeof ProposalSchema>;

/**
 * Validation Result
 * Standardized structure for validation outcomes
 */
export interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    code: string;
    message: string;
    context?: Record<string, unknown>;
  }>;
}

/**
 * Validation Error Details
 * Used in ValidationResult errors array
 */
export interface ValidationError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Schema for a workspace's metadata file (`.archi/workspace.json`).
 * `presetId` ties the workspace to an architecture type (web, game, …) that
 * determines which node definitions and rules are loaded.
 */
export const WorkspaceMetaSchema = z.object({
  name: z.string().min(1),
  presetId: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WorkspaceMeta = z.infer<typeof WorkspaceMetaSchema>;

/**
 * Preset-level rules applied on top of per-node constraints.
 * `from`/`to` fields match a node's typeId OR its definition category.
 *
 * Blocking rules (enforced per operation at proposal time):
 *   - forbiddenConnections  : pairs always blocked
 *   - allowedConnectionsOnly: whitelist — only these pairs allowed
 *   - forbiddenTypes        : node type/category banned from this preset
 *   - maxNodesPerType       : cap on instances of a given typeId
 *   - maxDepth              : cap on the longest source→target chain
 *   - noCycles              : whether cycles are blocked (default true)
 *   - defaultMaxInputs/Outputs: fallback when the node def has no limit
 *
 * Advisory rules (checked by validateGraphIntegrity, not blocking):
 *   - requiredTypes         : types/categories that must appear in the graph
 *   - requiredConnections   : every `from` node must edge to a `to` node
 */
export const PresetRulesSchema = z.object({
  forbiddenConnections: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    reason: z.string().optional(),
  })).optional(),

  requiredConnections: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    reason: z.string().optional(),
  })).optional(),

  allowedConnectionsOnly: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
  })).optional(),

  maxNodesPerType: z.record(z.string(), z.number().int().min(1)).optional(),

  requiredTypes: z.array(z.string()).optional(),

  forbiddenTypes: z.array(z.string()).optional(),

  maxDepth: z.number().int().min(1).optional(),

  noCycles: z.boolean().optional(),

  defaultMaxInputs: z.number().int().min(0).optional(),
  defaultMaxOutputs: z.number().int().min(0).optional(),
});

export type PresetRules = z.infer<typeof PresetRulesSchema>;

/**
 * Schema for an architecture-type preset file (`presets/*.preset.json`).
 * `include` lists the definition folders to load for this type (use `"*"` to
 * load every folder). This is the "subset" mechanism: a workspace's preset
 * decides which node types and rules are active.
 */
export const PresetSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'preset id must be lowercase kebab-case'),
  label: z.string().min(1),
  description: z.string().optional(),
  include: z.array(z.string().min(1)).min(1, 'a preset must include at least one folder'),
  rules: PresetRulesSchema.optional(),
  /**
   * Relation types available for edges in this paradigm. When set, an edge's
   * `type` must be one of these ids. Absent ⇒ plain unlabelled edges (back-compat).
   */
  edgeTypes: z.array(EdgeTypeSchema).optional(),
});

export type Preset = z.infer<typeof PresetSchema>;
