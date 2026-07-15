import { useState } from 'react';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { FolderPicker } from './FolderPicker';
import { Folder, ChevronDown, Plus } from 'lucide-react';
import { T } from '../lib/theme';

const chip: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
  border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, cursor: 'pointer', fontSize: 14,
};

export function WorkspaceSwitcher() {
  const { active, recent, openWorkspace } = useWorkspaceStore();
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button style={chip} onClick={() => setOpen((v) => !v)}>
        <Folder size={15} color={T.textMuted} />
        <span style={{ fontWeight: 600, color: active ? T.text : T.textMuted }}>
          {active ? active.name : 'No workspace'}
        </span>
        {active && <span style={{ fontSize: 11, color: T.textMuted, background: T.surfaceAlt, padding: '2px 6px', borderRadius: 4 }}>{active.presetId}</span>}
        <ChevronDown size={13} color={T.textMuted} />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '110%', left: 0, zIndex: 50, minWidth: 280,
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10,
            boxShadow: T.shadowLg, overflow: 'hidden',
          }}>
            <div style={{ padding: '8px 12px', fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Recent workspaces
            </div>
            {recent.length === 0 && <div style={{ padding: '8px 12px', fontSize: 13, color: T.textMuted }}>None yet.</div>}
            {recent.map((r) => (
              <button
                key={r.path}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                  border: 'none', background: active?.path === r.path ? T.surfaceAlt : T.surface,
                  cursor: 'pointer', fontSize: 13,
                }}
                onClick={async () => { await openWorkspace(r.path); setOpen(false); }}
              >
                <div style={{ fontWeight: 600, color: T.text }}>{r.name} <span style={{ fontWeight: 400, color: T.textMuted }}>· {r.presetId}</span></div>
                <div style={{ fontSize: 11, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.path}</div>
              </button>
            ))}
            <div style={{ borderTop: `1px solid ${T.border}` }}>
              <button
                style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: T.surface, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: T.accent }}
                onClick={() => { setOpen(false); setPicker(true); }}
              >
                <Plus size={13} /> Open / create a folder…
              </button>
            </div>
          </div>
        </>
      )}

      {picker && <FolderPicker onClose={() => setPicker(false)} />}
    </div>
  );
}
