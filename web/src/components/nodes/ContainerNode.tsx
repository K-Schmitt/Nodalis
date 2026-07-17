import { Handle, Position } from '@xyflow/react';
import { getIcon, type ArchiNodeData } from './shared';
import { T, readableText } from '../../lib/theme';

/**
 * `container` archetype: a large labelled frame that groups child nodes (BPMN
 * pool/lane, DDD bounded-context, UML package). Child nodes carry `parentId`
 * and are rendered *inside* by React Flow; this component only draws the frame
 * and header tab. Its width/height come from the layout (nested ELK) or from
 * the node's `style`.
 */
export function ContainerNode({ data }: { data: ArchiNodeData }) {
  const accent = data.render?.accent ?? data.style?.color ?? '#64748b';
  const fg = readableText(accent);
  const Icon = getIcon(data.render?.icon ?? data.style?.icon);
  // When this container is a node that owns a sub-graph (e.g. rendered by the
  // merged PNG export), mark it explicitly as that sub-graph's parent.
  const ownsSubgraph = data.subgraph?.presetId;

  return (
    <div style={{
      width: '100%', height: '100%', minWidth: 260, minHeight: 160,
      border: `2px ${ownsSubgraph ? 'solid' : 'dashed'} ${accent}`, borderRadius: T.radiusLg,
      background: `${accent}1f`, position: 'relative', boxSizing: 'border-box',
    }}>
      <Handle type="target" position={data.hTarget ?? Position.Top} />
      {/* Header tab */}
      <div style={{
        position: 'absolute', top: -1, left: -1, display: 'inline-flex', alignItems: 'center', gap: 6,
        background: accent, color: fg, padding: '3px 12px',
        borderRadius: `${T.radiusLg}px 0 ${T.radiusSm}px 0`, fontSize: 12, fontWeight: 700,
      }}>
        <Icon size={13} color={fg} strokeWidth={2.5} />
        {data.label}
      </div>
      {/* Sub-graph parent marker */}
      {ownsSubgraph && (
        <div style={{
          position: 'absolute', top: -11, right: 8, display: 'inline-flex', alignItems: 'center', gap: 4,
          background: '#4338ca', color: '#fff', padding: '2px 9px', borderRadius: 999,
          fontSize: 10, fontWeight: 700, border: '2px solid #fff', whiteSpace: 'nowrap',
        }}>
          ⤵ sous-graphe : {ownsSubgraph}
        </div>
      )}
      <Handle type="source" position={data.hSource ?? Position.Bottom} />
    </div>
  );
}
