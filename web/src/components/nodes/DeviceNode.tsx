import { getIcon, NodeFrame, type ArchiNodeData } from './shared';
import { T } from '../../lib/theme';

/**
 * `device` archetype: a large centered icon with the label underneath, for
 * network devices and infra. Shows an up/down status dot and an IP/CIDR
 * subtitle when the instance data provides them.
 */
export function DeviceNode({ data }: { data: ArchiNodeData }) {
  const render = data.render!;
  const color = data.style?.color ?? '#0EA5E9';
  const Icon = getIcon(render.icon ?? data.style?.icon);

  const status = String(data.data?.status ?? '').toLowerCase();
  const statusColor = status === 'down' || status === 'offline' ? '#ef4444'
    : status === 'up' || status === 'online' ? '#22c55e'
    : status ? '#f59e0b' : null;
  const subtitle = (data.data?.ip ?? data.data?.cidr ?? data.data?.address) as string | undefined;

  return (
    <NodeFrame data={data}>
      <div style={{ width: 104, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
        <div style={{
          position: 'relative', width: 64, height: 64, borderRadius: 14, background: T.surface,
          border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.shadowLg,
        }}>
          <Icon size={34} color={color} strokeWidth={1.8} />
          {statusColor && (
            <span title={`Status: ${status}`} style={{
              position: 'absolute', top: -3, right: -3, width: 13, height: 13, borderRadius: '50%',
              background: statusColor, border: `2px solid ${T.surface}`,
            }} />
          )}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.text, textAlign: 'center', maxWidth: 104, wordBreak: 'break-word' }}>
          {data.label}
        </div>
        {subtitle && (
          <div style={{ fontSize: 10, color: T.textMuted, fontFamily: 'ui-monospace, monospace' }}>{subtitle}</div>
        )}
      </div>
    </NodeFrame>
  );
}
