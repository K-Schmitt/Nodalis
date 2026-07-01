import { useState } from 'react';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { FolderPicker } from './FolderPicker';

const chip: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
  border: '1px solid #e5e7eb', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 14,
};

export function WorkspaceSwitcher() {
  const { active, recent, openWorkspace } = useWorkspaceStore();
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button style={chip} onClick={() => setOpen((v) => !v)}>
        <span>📁</span>
        <span style={{ fontWeight: 600, color: active ? '#1f2937' : '#9ca3af' }}>
          {active ? active.name : 'No workspace'}
        </span>
        {active && <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{active.presetId}</span>}
        <span style={{ color: '#9ca3af' }}>▾</span>
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '110%', left: 0, zIndex: 50, minWidth: 280,
            background: 'white', border: '1px solid #e5e7eb', borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)', overflow: 'hidden',
          }}>
            <div style={{ padding: '8px 12px', fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Recent workspaces
            </div>
            {recent.length === 0 && <div style={{ padding: '8px 12px', fontSize: 13, color: '#9ca3af' }}>None yet.</div>}
            {recent.map((r) => (
              <button
                key={r.path}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                  border: 'none', background: active?.path === r.path ? '#eff6ff' : 'white',
                  cursor: 'pointer', fontSize: 13,
                }}
                onClick={async () => { await openWorkspace(r.path); setOpen(false); }}
              >
                <div style={{ fontWeight: 600, color: '#1f2937' }}>{r.name} <span style={{ fontWeight: 400, color: '#9ca3af' }}>· {r.presetId}</span></div>
                <div style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.path}</div>
              </button>
            ))}
            <div style={{ borderTop: '1px solid #f1f5f9' }}>
              <button
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#2563eb' }}
                onClick={() => { setOpen(false); setPicker(true); }}
              >
                ＋ Open / create a folder…
              </button>
            </div>
          </div>
        </>
      )}

      {picker && <FolderPicker onClose={() => setPicker(false)} />}
    </div>
  );
}
