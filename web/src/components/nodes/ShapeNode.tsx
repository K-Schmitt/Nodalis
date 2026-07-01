import { getIcon, NodeFrame, type ArchiNodeData } from './shared';
import { T } from '../../lib/theme';

/**
 * `shape` archetype: pure BPMN/flowchart geometry.
 *   - event-*   : circle (thin=start, thick=end, double ring=intermediate) + a
 *                 trigger glyph (message/timer/error/signal) from `data.type`.
 *   - gateway-* : diamond with a routing glyph (× exclusive, + parallel, ○ inclusive)
 *   - task/*    : rounded rectangle with a corner icon reflecting the task `type`
 *                 (user 👤, service ⚙️, script 📜, manual ✋).
 *   - data-object: rectangle with a folded corner.
 * A sub-process (node owning a sub-graph) gets a [+] expand marker.
 */

const EVENT_TRIGGER: Record<string, string> = {
  message: '✉', timer: '⏱', error: '⚡', signal: '▲', escalation: '↑', conditional: '▤',
};
const TASK_TYPE_GLYPH: Record<string, string> = {
  user: '👤', service: '⚙️', script: '📜', manual: '✋', send: '✉', receive: '📥', businessRule: '▤',
};

export function ShapeNode({ data }: { data: ArchiNodeData }) {
  const render = data.render!;
  const shape = render.shape ?? 'task';
  const color = data.style?.color ?? '#2563EB';
  const label = data.label ?? '';
  const kind = String(data.data?.type ?? data.data?.trigger ?? '');

  if (shape.startsWith('event')) {
    const isEnd = shape.includes('end');
    const isIntermediate = shape.includes('intermediate');
    const glyph = EVENT_TRIGGER[kind];
    return (
      <NodeFrame data={data}>
        <div style={{ position: 'relative', width: 56, height: 56 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: T.surface,
            border: `${isEnd ? 4 : 2.5}px solid ${color}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.shadow,
          }}>
            {isIntermediate && <div style={{ position: 'absolute', inset: 5, borderRadius: '50%', border: `2px solid ${color}` }} />}
            {glyph
              ? <span style={{ fontSize: 20, color, lineHeight: 1 }}>{glyph}</span>
              : render.icon ? (() => { const I = getIcon(render.icon); return <I size={20} color={color} strokeWidth={2} />; })() : null}
          </div>
          <div style={labelBelow}>{label}</div>
        </div>
      </NodeFrame>
    );
  }

  if (shape.startsWith('gateway')) {
    const glyph = shape.includes('parallel') ? '+' : shape.includes('inclusive') ? '○' : '×';
    return (
      <NodeFrame data={data}>
        <div style={{ position: 'relative', width: 60, height: 60 }}>
          <div style={{
            width: 42, height: 42, margin: 9, background: T.surface, border: `2.5px solid ${color}`,
            transform: 'rotate(45deg)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.shadow,
          }}>
            <span style={{ transform: 'rotate(-45deg)', fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{glyph}</span>
          </div>
          <div style={labelBelow}>{label}</div>
        </div>
      </NodeFrame>
    );
  }

  if (shape === 'data-object') {
    return (
      <NodeFrame data={data}>
        <div style={{
          width: 90, minHeight: 60, background: T.surface, border: `2px solid ${color}`, color: T.text,
          padding: '10px 8px 6px', fontSize: 11, textAlign: 'center',
          clipPath: 'polygon(0 0, 78% 0, 100% 22%, 100% 100%, 0 100%)',
        }}>
          {label}
        </div>
      </NodeFrame>
    );
  }

  // task (default): rounded rectangle with a type marker in the corner.
  const Icon = getIcon(render.icon ?? data.style?.icon);
  const taskGlyph = TASK_TYPE_GLYPH[kind];
  const isSubprocess = shape === 'subprocess' || !!data.subgraph;
  return (
    <NodeFrame data={data}>
      <div style={{
        position: 'relative', minWidth: 130, minHeight: 56, background: T.surface, color: T.text,
        border: `2px solid ${color}`, borderRadius: 10, padding: '12px 14px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        fontWeight: 600, fontSize: 12, boxShadow: T.shadow,
      }}>
        <span style={{ position: 'absolute', top: 5, left: 6, fontSize: 13, lineHeight: 1 }}>
          {taskGlyph ?? <Icon size={13} color={color} strokeWidth={2} />}
        </span>
        {label}
        {isSubprocess && (
          <span title="Sub-process" style={{
            position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)',
            width: 14, height: 14, border: `1.5px solid ${color}`, borderRadius: 3, color,
            fontSize: 12, lineHeight: '11px', textAlign: 'center', background: T.surface,
          }}>+</span>
        )}
      </div>
    </NodeFrame>
  );
}

const labelBelow: React.CSSProperties = {
  position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
  marginTop: 3, fontSize: 11, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', textAlign: 'center',
};
