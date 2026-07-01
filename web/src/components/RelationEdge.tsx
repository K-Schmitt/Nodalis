import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import type { EdgeMarker, EdgeTypeStyle } from '../types';
import { useUiStore } from '../stores/useUiStore';
import { T } from '../lib/theme';

/**
 * Custom edge that renders a paradigm relation (UML extends/composes, ERD 1:N, …)
 * with the right line style, arrowheads AND a mid-edge label (cardinality /
 * relation name). Markers use SVG `context-stroke` so a single marker set adapts
 * to each edge's colour (see {@link MarkerDefs}). The edge dims when another node
 * is hovered and highlights when it is selected or touches the hovered node.
 */
const markerUrl = (m?: EdgeMarker): string | undefined =>
  m && m !== 'none' ? `url(#rel-${m})` : undefined;

interface RelationEdgeData {
  relation?: string;
  style?: EdgeTypeStyle;
}

export function RelationEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, source, target, selected, label } = props;
  const data = (props.data ?? {}) as RelationEdgeData;
  const s = data.style ?? {};

  const hoverNodeId = useUiStore((st) => st.hoverNodeId);
  const incident = hoverNodeId != null && (source === hoverNodeId || target === hoverNodeId);
  const dimmed = hoverNodeId != null && !incident;

  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 });

  const stroke = s.stroke ?? '#64748b';
  const emphasised = selected || incident;
  const style: React.CSSProperties = {
    stroke,
    strokeWidth: (s.width ?? 1.75) * (emphasised ? 1.8 : 1),
    opacity: dimmed ? 0.25 : 1,
    transition: 'opacity 120ms, stroke-width 120ms',
    ...(s.dashed ? { strokeDasharray: '6 4' } : {}),
    ...(s.animated ? { strokeDasharray: '6 4', animation: 'rel-dash 0.6s linear infinite' } : {}),
  };

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={style}
        markerStart={markerUrl(s.markerStart)}
        markerEnd={markerUrl(s.markerEnd)}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: T.surface, color: T.text, border: `1px solid ${stroke}`,
              borderRadius: 6, padding: '0 6px', fontSize: 10, fontWeight: 700, pointerEvents: 'all',
              opacity: dimmed ? 0.25 : 1, boxShadow: T.shadow,
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/**
 * One reusable set of SVG markers for every relation type. `context-stroke`
 * makes each marker inherit the colour of the edge it's attached to, and
 * `auto-start-reverse` flips start-markers (e.g. composition diamond at the whole).
 */
export function MarkerDefs() {
  const common = { markerWidth: 16, markerHeight: 16, refX: 11, refY: 6, orient: 'auto-start-reverse' as const, markerUnits: 'userSpaceOnUse' as const };
  // Crow's-foot glyphs need a wider box for the fanned prongs.
  const cf = { markerWidth: 22, markerHeight: 16, refY: 6, orient: 'auto-start-reverse' as const, markerUnits: 'userSpaceOnUse' as const };
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden>
      <style>{`@keyframes rel-dash { to { stroke-dashoffset: -20; } }`}</style>
      <defs>
        {/* open V arrow */}
        <marker id="rel-arrow" {...common}>
          <path d="M2,2 L11,6 L2,10" fill="none" stroke="context-stroke" strokeWidth={1.5} />
        </marker>
        {/* filled arrow */}
        <marker id="rel-arrow-closed" {...common}>
          <path d="M2,2 L12,6 L2,10 Z" fill="context-stroke" stroke="context-stroke" />
        </marker>
        {/* UML inheritance/realization — hollow triangle */}
        <marker id="rel-triangle-open" {...common} refX={12}>
          <path d="M2,1 L13,6 L2,11 Z" fill="#ffffff" stroke="context-stroke" strokeWidth={1.5} />
        </marker>
        {/* filled triangle */}
        <marker id="rel-triangle" {...common} refX={12}>
          <path d="M2,1 L13,6 L2,11 Z" fill="context-stroke" stroke="context-stroke" />
        </marker>
        {/* UML composition — filled diamond */}
        <marker id="rel-diamond" {...common} refX={13}>
          <path d="M1,6 L7,1 L14,6 L7,11 Z" fill="context-stroke" stroke="context-stroke" />
        </marker>
        {/* UML aggregation — hollow diamond */}
        <marker id="rel-diamond-open" {...common} refX={13}>
          <path d="M1,6 L7,1 L14,6 L7,11 Z" fill="#ffffff" stroke="context-stroke" strokeWidth={1.5} />
        </marker>
        {/* ERD "one" — filled circle */}
        <marker id="rel-circle" {...common} refX={6}>
          <circle cx={6} cy={6} r={4} fill="context-stroke" stroke="context-stroke" />
        </marker>
        {/* ERD optional — hollow circle */}
        <marker id="rel-circle-open" {...common} refX={6}>
          <circle cx={6} cy={6} r={4} fill="#ffffff" stroke="context-stroke" strokeWidth={1.5} />
        </marker>

        {/* ERD crow's-foot cardinality. Wider box to fit the fanned prongs. */}
        {/* "one" — single perpendicular bar */}
        <marker id="rel-cf-one" {...cf} refX={12}>
          <path d="M12,1 L12,11" fill="none" stroke="context-stroke" strokeWidth={1.6} />
        </marker>
        {/* "one and only one" — double bar */}
        <marker id="rel-cf-one-mandatory" {...cf} refX={13}>
          <path d="M9,1 L9,11 M13,1 L13,11" fill="none" stroke="context-stroke" strokeWidth={1.6} />
        </marker>
        {/* "many" — crow's foot */}
        <marker id="rel-cf-many" {...cf} refX={14}>
          <path d="M2,6 L14,1 M2,6 L14,6 M2,6 L14,11" fill="none" stroke="context-stroke" strokeWidth={1.6} />
        </marker>
        {/* "zero or one" — circle + bar */}
        <marker id="rel-cf-zero-one" {...cf} refX={14}>
          <circle cx={4} cy={6} r={3} fill="#ffffff" stroke="context-stroke" strokeWidth={1.4} />
          <path d="M12,1 L12,11" fill="none" stroke="context-stroke" strokeWidth={1.6} />
        </marker>
        {/* "zero or many" — circle + crow's foot */}
        <marker id="rel-cf-zero-many" {...cf} refX={16}>
          <circle cx={4} cy={6} r={3} fill="#ffffff" stroke="context-stroke" strokeWidth={1.4} />
          <path d="M8,6 L16,1 M8,6 L16,6 M8,6 L16,11" fill="none" stroke="context-stroke" strokeWidth={1.6} />
        </marker>
      </defs>
    </svg>
  );
}
