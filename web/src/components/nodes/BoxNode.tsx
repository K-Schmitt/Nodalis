import { getIcon, NodeFrame, type ArchiNodeData } from './shared';
import { T, readableText, eventStormingColor } from '../../lib/theme';

/**
 * Legacy "box" rendering: a coloured geometric shape with an icon + label.
 * Used when a definition declares no `render` archetype. DDD nodes are drawn as
 * EventStorming sticky-notes (canonical colour palette + relief). Text colour is
 * auto-chosen for contrast (WCAG-ish).
 */
const getShapeStyle = (shape: string, color: string, fg: string): React.CSSProperties => {
  const base: React.CSSProperties = {
    backgroundColor: color, padding: '16px', border: '2px solid rgba(0,0,0,0.25)',
    minWidth: '150px', minHeight: '80px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '8px', color: fg, boxShadow: T.shadowLg,
  };
  switch (shape) {
    case 'cylinder': return { ...base, borderRadius: '50% / 20%' };
    case 'circle':   return { ...base, borderRadius: '50%', width: 120, height: 120, minWidth: 120, minHeight: 120 };
    case 'diamond':  return { ...base, clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' };
    case 'hexagon':  return { ...base, clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' };
    default:         return { ...base, borderRadius: '8px' };
  }
};

export function BoxNode({ data }: { data: ArchiNodeData }) {
  const isDdd = (data.typeId ?? '').startsWith('ddd:');
  const color = isDdd ? eventStormingColor(data.typeId, data.style?.color) : (data.style?.color ?? '#666666');
  const fg = readableText(color);
  const Icon = getIcon(data.style?.icon);
  const shapeStyle = getShapeStyle(data.style?.shape ?? 'rectangle', color, fg);

  return (
    <NodeFrame data={data}>
      <div style={shapeStyle}>
        <Icon size={24} color={fg} strokeWidth={2} />
        <div style={{ fontWeight: 'bold', textAlign: 'center', fontSize: 14 }}>{data.label}</div>
        <div style={{ fontSize: 10, opacity: 0.75, textAlign: 'center' }}>{data.typeId}</div>
      </div>
    </NodeFrame>
  );
}
