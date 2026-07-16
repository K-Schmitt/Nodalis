import { Handle, Position } from '@xyflow/react';
import * as Icons from 'lucide-react';
import { KeyRound, Link, Star, Zap, Circle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { NodeStyle, RenderSpec } from '../../types';

/**
 * Data attached to every graph node by the Core (`{ ...node, style, render }`).
 * `data` holds the node *instance* values (a table's actual columns, a class's
 * attributes, …) — distinct from the type-level `dataSchema`.
 */
export interface ArchiNodeData {
  id?: string;
  label?: string;
  typeId?: string;
  data?: Record<string, unknown>;
  style?: NodeStyle;
  render?: RenderSpec;
  subgraph?: { presetId: string };
  ghostKind?: 'add';
  /** Parent container id (nesting). Present on grouped nodes. */
  parentId?: string;
  /** Handle sides injected by the layout profile (flow-axis aware). */
  hSource?: Position;
  hTarget?: Position;
}

export const getIcon = (name?: string) => {
  if (!name) return Icons.Box;
  const key = name.charAt(0).toUpperCase() + name.slice(1);
  return (Icons as Record<string, unknown>)[key] as typeof Icons.Box ?? Icons.Box;
};

/** A single row of a `record` compartment, plus the badges attached to it. */
export interface RecordRow {
  /** logical name used for badge matching + inline editing. */
  name: string;
  /** display text (name, incl. UML visibility prefix). */
  text: string;
  /** data type, shown as a coloured pill (ERD columns, UML attributes). */
  type?: string;
  badges: string[];
}

const rowNameOf = (row: unknown): string => {
  if (row && typeof row === 'object') {
    const o = row as Record<string, unknown>;
    return String(o.name ?? o.field ?? o.label ?? '');
  }
  return String(row).split(':')[0].trim().replace(/^[+\-#~]\s*/, '');
};

const rowDisplayOf = (row: unknown): { text: string; type?: string } => {
  if (row && typeof row === 'object') {
    const o = row as Record<string, unknown>;
    const name = String(o.name ?? o.field ?? o.label ?? '');
    const type = o.type ?? o.dataType;
    return { text: name, type: type ? String(type) : undefined };
  }
  const raw = String(row);
  const [left, right] = raw.split(':');
  return { text: left.trim(), type: right ? right.trim() : undefined };
};

/** Row-level boolean flags (e.g. { pk:true, unique:true }) → badge names. */
const ROW_FLAG_BADGES = ['pk', 'fk', 'unique', 'index', 'nullable', 'required'] as const;
const rowFlagBadges = (row: unknown): string[] => {
  if (!row || typeof row !== 'object') return [];
  const o = row as Record<string, unknown>;
  return ROW_FLAG_BADGES.filter((f) => o[f] === true);
};

/** Names referenced by a badge source value (string or array of strings). */
const badgeNames = (value: unknown): Set<string> => {
  if (Array.isArray(value)) return new Set(value.map((v) => String(v)));
  if (value == null || value === '') return new Set();
  return new Set([String(value)]);
};

/**
 * Turn a compartment's source array + badge map into renderable rows.
 * Rows come from `nodeData[from]`; each badge marks the rows whose name matches
 * the value at `nodeData[badgeSourceKey]`.
 */
export function toRows(
  nodeData: Record<string, unknown> | undefined,
  from: string,
  badges?: Record<string, string>,
): RecordRow[] {
  const raw = nodeData?.[from];
  if (!Array.isArray(raw)) return [];
  const badgeSets = Object.entries(badges ?? {}).map(
    ([badge, key]) => [badge, badgeNames(nodeData?.[key])] as const,
  );
  return raw.map((row) => {
    const name = rowNameOf(row);
    const { text, type } = rowDisplayOf(row);
    const fromMap = badgeSets.filter(([, names]) => names.has(name)).map(([b]) => b);
    const badges = [...new Set([...fromMap, ...rowFlagBadges(row)])];
    return { name, text, type, badges };
  });
}

const BADGE_ICON: Record<string, typeof KeyRound> = {
  pk: KeyRound, fk: Link, unique: Star, index: Zap,
};
/** Small icon for a record-row badge (PK/FK/unique/index); nullable/required stay as text marks. */
export function BadgeIcon({ badge }: { badge: string }) {
  if (badge === 'nullable') return <span>∅</span>;
  if (badge === 'required') return <span>＊</span>;
  const Icon = BADGE_ICON[badge];
  return Icon ? <Icon size={11} /> : <Circle size={6} fill="currentColor" />;
}
export const badgeTitle = (b: string) =>
  ({ pk: 'Primary key', fk: 'Foreign key', unique: 'Unique', index: 'Indexed', nullable: 'Nullable', required: 'Required' }[b] ?? b);

// --- sizing (shared with ELK layout so authentic nodes don't overlap) ---
export const ROW_H = 22;
export const TITLE_H = 34;
export const COMPARTMENT_HEADER_H = 18;
const CHAR_W = 7.2;
export const MIN_W = 160;

/** Deterministic size estimate for a node, driven by its render archetype. */
export function estimateNodeSize(data: ArchiNodeData): { width: number; height: number } {
  const render = data.render;
  if (render?.archetype === 'record') {
    const comps = render.compartments ?? [];
    let rows = 0;
    let headers = 0;
    let longest = (data.label ?? '').length;
    for (const c of comps) {
      const rs = toRows(data.data, c.from, c.badges);
      rows += rs.length;
      if (c.label) headers += 1;
      for (const r of rs) longest = Math.max(longest, r.text.length + 3);
    }
    const width = Math.max(MIN_W, Math.min(360, Math.round(longest * CHAR_W) + 40));
    const height = TITLE_H + headers * COMPARTMENT_HEADER_H + Math.max(1, rows) * ROW_H + 8;
    return { width, height };
  }
  if (render?.archetype === 'shape') {
    const s = render.shape ?? '';
    if (s.startsWith('event')) return { width: 70, height: 70 };
    if (s.startsWith('gateway')) return { width: 80, height: 80 };
    return { width: 150, height: 70 };
  }
  if (render?.archetype === 'device') return { width: 120, height: 96 };
  // Containers are sized by nested layout; this is a fallback minimum.
  if (render?.archetype === 'container') return { width: 320, height: 220 };
  return { width: 150, height: 80 };
}

/** Small drill-down badge shown on nodes that own a sub-graph. */
function SubgraphBadge({ presetId }: { presetId: string }) {
  return (
    <div
      title={`Double-click to open ${presetId} sub-graph`}
      style={{
        position: 'absolute', top: -10, right: -10, background: '#4338ca', color: '#fff',
        borderRadius: 999, padding: '1px 7px', fontSize: 10, fontWeight: 700,
        border: '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', whiteSpace: 'nowrap', zIndex: 2,
      }}
    >
      ⤵ {presetId}
    </div>
  );
}

/** Common chrome: source/target handles + optional sub-graph badge. */
export function NodeFrame({ data, children }: { data: ArchiNodeData; children: ReactNode }) {
  return (
    <div style={{ position: 'relative' }}>
      <Handle type="target" position={data.hTarget ?? Position.Top} />
      {data.subgraph && <SubgraphBadge presetId={data.subgraph.presetId} />}
      {children}
      <Handle type="source" position={data.hSource ?? Position.Bottom} />
    </div>
  );
}
