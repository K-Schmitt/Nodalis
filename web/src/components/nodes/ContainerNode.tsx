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

  return (
    <div style={{
      width: '100%', height: '100%', minWidth: 260, minHeight: 160,
      border: `2px dashed ${accent}`, borderRadius: T.radiusLg,
      background: `${accent}10`, position: 'relative', boxSizing: 'border-box',
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
      <Handle type="source" position={data.hSource ?? Position.Bottom} />
    </div>
  );
}
