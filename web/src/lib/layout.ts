import { Position } from '@xyflow/react';

/**
 * Per-paradigm auto-layout. Each architecture type reads best with a different
 * ELK algorithm, flow direction and edge routing:
 *
 *   - ERD        : tables flow left→right, orthogonal edges, wide spacing.
 *   - UML        : inheritance top→down hierarchy, orthogonal edges.
 *   - BPMN       : process flows left→right (sequence flow), orthogonal, compact.
 *   - DDD        : EventStorming timeline left→right, orthogonal.
 *   - network    : organic topology (stress) — no inherent hierarchy.
 *   - default    : layered top→down (web/microservices/cloud/game/ai/…).
 *
 * The profile also dictates which sides node handles sit on, so edges enter/
 * leave along the flow axis instead of always top/bottom.
 */
export type FlowDirection = 'DOWN' | 'UP' | 'RIGHT' | 'LEFT';

export interface LayoutProfile {
  /** ELK layout options passed to `elk.layout({ layoutOptions })`. */
  options: Record<string, string>;
  /** Side the source handle sits on (outgoing edges leave here). */
  sourcePosition: Position;
  /** Side the target handle sits on (incoming edges arrive here). */
  targetPosition: Position;
}

const LAYERED = (direction: FlowDirection, extra: Record<string, string> = {}): Record<string, string> => ({
  'elk.algorithm': 'layered',
  'elk.direction': direction,
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.spacing.nodeNode': '70',
  'elk.spacing.edgeNode': '30',
  'elk.layered.spacing.nodeNodeBetweenLayers': '110',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  ...extra,
});

export const handlesFor = (direction: FlowDirection): Pick<LayoutProfile, 'sourcePosition' | 'targetPosition'> => {
  switch (direction) {
    case 'RIGHT': return { sourcePosition: Position.Right, targetPosition: Position.Left };
    case 'LEFT':  return { sourcePosition: Position.Left, targetPosition: Position.Right };
    case 'UP':    return { sourcePosition: Position.Top, targetPosition: Position.Bottom };
    case 'DOWN':
    default:      return { sourcePosition: Position.Bottom, targetPosition: Position.Top };
  }
};

const layered = (direction: FlowDirection, extra?: Record<string, string>): LayoutProfile => ({
  options: LAYERED(direction, extra),
  ...handlesFor(direction),
});

const PROFILES: Record<string, LayoutProfile> = {
  // Tables are large; give them room and flow them horizontally.
  erd: layered('RIGHT', { 'elk.spacing.nodeNode': '90', 'elk.layered.spacing.nodeNodeBetweenLayers': '150' }),
  // Class hierarchy reads top-down (parents above children).
  uml: layered('DOWN', { 'elk.spacing.nodeNode': '60', 'elk.layered.spacing.nodeNodeBetweenLayers': '100' }),
  // Sequence flow reads left-to-right, kept compact vertically.
  bpmn: layered('RIGHT', { 'elk.spacing.nodeNode': '55', 'elk.layered.spacing.nodeNodeBetweenLayers': '90' }),
  // EventStorming timeline: left-to-right.
  ddd: layered('RIGHT', { 'elk.spacing.nodeNode': '75', 'elk.layered.spacing.nodeNodeBetweenLayers': '130' }),
  // Network topology has no hierarchy — an organic stress layout spreads it out.
  network: {
    options: {
      'elk.algorithm': 'stress',
      'elk.stress.desiredEdgeLength': '180',
      'elk.spacing.nodeNode': '90',
      'elk.edgeRouting': 'POLYLINE',
    },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
  },
};

const DEFAULT_PROFILE: LayoutProfile = layered('DOWN');

/** Resolve the layout profile for the active preset (falls back to top-down). */
export function layoutProfileFor(presetId?: string | null): LayoutProfile {
  if (!presetId) return DEFAULT_PROFILE;
  return PROFILES[presetId] ?? DEFAULT_PROFILE;
}

/** Manual layout algorithms the toolbar can switch to. */
export const LAYOUT_ALGORITHMS = ['layered', 'stress', 'mrtree', 'radial', 'force'] as const;
export type LayoutAlgorithm = (typeof LAYOUT_ALGORITHMS)[number];

/** Apply user overrides (direction / algorithm) on top of a preset profile. */
export function applyOverride(base: LayoutProfile, direction?: FlowDirection, algorithm?: string): LayoutProfile {
  if (!direction && !algorithm) return base;
  const options = { ...base.options };
  if (algorithm) options['elk.algorithm'] = algorithm;
  if (direction) options['elk.direction'] = direction;
  const handles = direction ? handlesFor(direction) : { sourcePosition: base.sourcePosition, targetPosition: base.targetPosition };
  return { options, ...handles };
}
