// Shared frontend types mirroring the Core API payloads.

export interface NodeStyle {
  shape: string;
  color: string;
  icon?: string;
}

export type RenderArchetype = 'record' | 'shape' | 'device' | 'box' | 'container';

/** One section of a `record` node (e.g. a table's columns, a class's methods). */
export interface RenderCompartment {
  /** data key holding the array of rows to render. */
  from: string;
  /** optional compartment header. */
  label?: string;
  /** badge name → source key marking rows (e.g. { pk: "primaryKey" }). */
  badges?: Record<string, string>;
}

/**
 * Paradigm-aware render descriptor forwarded verbatim from the Core.
 * Mirrors `RenderSpecSchema` in `core/src/domain/types.ts`.
 */
export interface RenderSpec {
  archetype: RenderArchetype;
  titleFrom?: string;
  accent?: string;
  compartments?: RenderCompartment[];
  shape?: string;
  icon?: string;
}

export interface DataSchemaField {
  type: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
}

export interface Definition {
  typeId: string;
  label: string;
  description?: string;
  category: string;
  style: NodeStyle;
  constraints?: {
    maxInputs?: number;
    maxOutputs?: number;
    allowedSources?: string[];
    allowedTargets?: string[];
    requiredFields?: string[];
  };
  dataSchema?: Record<string, DataSchemaField>;
  render?: RenderSpec;
}

export type EdgeMarker =
  | 'none' | 'arrow' | 'arrow-closed'
  | 'triangle' | 'triangle-open'
  | 'diamond' | 'diamond-open'
  | 'circle' | 'circle-open'
  | 'cf-one' | 'cf-many' | 'cf-one-mandatory' | 'cf-zero-one' | 'cf-zero-many';

export interface EdgeTypeStyle {
  stroke?: string;
  dashed?: boolean;
  animated?: boolean;
  width?: number;
  markerStart?: EdgeMarker;
  markerEnd?: EdgeMarker;
}

export interface EdgeType {
  id: string;
  label: string;
  description?: string;
  style: EdgeTypeStyle;
}

export interface Preset {
  id: string;
  label: string;
  description?: string;
  include: string[];
  edgeTypes?: EdgeType[];
}

/** One level of the drill-down breadcrumb trail. */
export interface BreadcrumbEntry {
  id: string;
  label: string;
}

export interface GraphContext {
  subgraphId: string | null;
  breadcrumb: BreadcrumbEntry[];
  preset: { id: string; label: string } | null;
  edgeTypes: EdgeType[];
}

export interface WorkspaceInfo {
  name: string;
  presetId: string;
  description?: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecentWorkspace {
  path: string;
  name: string;
  presetId: string;
  lastOpenedAt: string;
}

export interface DirEntry {
  name: string;
  path: string;
  isWorkspace: boolean;
}

export interface DirListing {
  path: string;
  parent: string | null;
  root: string;
  entries: DirEntry[];
}

export type GraphOperation =
  | { op: 'add_node'; payload: { id: string; typeId: string; label: string; data?: Record<string, unknown>; position?: { x: number; y: number }; subgraph?: { presetId: string } } }
  | { op: 'update_node'; payload: { id: string; changes: Record<string, unknown> } }
  | { op: 'delete_node'; payload: { id: string } }
  | { op: 'add_edge'; payload: { id: string; sourceId: string; targetId: string; label?: string; type?: string } }
  | { op: 'delete_edge'; payload: { id: string } }
  | { op: 'clear_all'; payload?: Record<string, never> };

/** Structured validation error returned by the Core. */
export interface ApiError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export const newId = (): string => crypto.randomUUID();
