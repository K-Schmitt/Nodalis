import { useGraphStore } from '../stores/useGraphStore';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';

/**
 * Drill-down trail: Workspace ▸ Node ▸ Node…. Clicking a crumb jumps back to
 * that graph level. Only rendered with content when inside at least one sub-graph,
 * but the root crumb + preset badge always show the current context.
 */
export function Breadcrumb() {
  const { context, navigateTo } = useGraphStore();
  const { active } = useWorkspaceStore();

  const trail = context?.breadcrumb ?? [];
  const presetLabel = context?.preset?.label;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, flexWrap: 'wrap' }}>
      <button
        onClick={() => trail.length > 0 && navigateTo([])}
        style={crumbBtn(trail.length === 0)}
        title="Root graph"
      >
        🏠 {active?.name ?? 'Root'}
      </button>

      {trail.map((entry, i) => (
        <span key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#cbd5e1' }}>▸</span>
          <button
            onClick={() => i < trail.length - 1 && navigateTo(trail.slice(0, i + 1))}
            style={crumbBtn(i === trail.length - 1)}
            title={entry.label}
          >
            {entry.label}
          </button>
        </span>
      ))}

      {presetLabel && (
        <span style={{
          marginLeft: 6, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
          background: '#eef2ff', color: '#4338ca', border: '1px solid #e0e7ff',
        }}>
          {presetLabel}
        </span>
      )}
    </div>
  );
}

const crumbBtn = (current: boolean): React.CSSProperties => ({
  border: 'none', background: 'transparent', cursor: current ? 'default' : 'pointer',
  fontSize: 13, fontWeight: current ? 700 : 500, color: current ? '#1f2937' : '#6366f1',
  padding: '2px 4px', borderRadius: 4, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
});
