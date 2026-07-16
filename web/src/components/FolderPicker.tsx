import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import type { DirListing } from '../types';
import { FolderOpen, X, ArrowUp, Folder } from 'lucide-react';
import { T } from '../lib/theme';

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const modal: React.CSSProperties = {
  background: T.surface, borderRadius: 12, width: 620, maxWidth: '92vw', maxHeight: '85vh',
  display: 'flex', flexDirection: 'column', boxShadow: T.shadowLg,
};
const btn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text,
  cursor: 'pointer', fontSize: 13,
};
const primaryBtn: React.CSSProperties = { ...btn, background: T.accent, color: 'white', border: `1px solid ${T.accent}` };

export function FolderPicker({ onClose }: { onClose: () => void }) {
  const { browse, openWorkspace, createWorkspace, presets, error, clearError } = useWorkspaceStore();
  const [listing, setListing] = useState<DirListing | null>(null);
  const [name, setName] = useState('');
  const [subfolder, setSubfolder] = useState('');
  const [presetId, setPresetId] = useState('');

  useEffect(() => {
    browse().then(setListing);
    return () => clearError();
  }, [browse, clearError]);

  useEffect(() => {
    if (!presetId && presets.length > 0) setPresetId(presets[0].id);
  }, [presets, presetId]);

  const go = async (path?: string) => setListing(await browse(path));

  const open = async (path: string) => {
    if (await openWorkspace(path)) onClose();
  };

  const create = async () => {
    if (!listing || !name.trim() || !presetId) return;
    const target = subfolder.trim() ? `${listing.path}/${subfolder.trim()}` : listing.path;
    if (await createWorkspace(target, name.trim(), presetId)) onClose();
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, color: T.text }}><FolderOpen size={17} /> Open or create a workspace</strong>
          <button style={{ ...btn, display: 'flex' }} onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>

        {/* Path bar */}
        <div style={{ padding: '10px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={{ ...btn, display: 'flex', alignItems: 'center', gap: 4 }} disabled={!listing?.parent} onClick={() => go(listing?.parent ?? undefined)}><ArrowUp size={13} /> Up</button>
          <code style={{ fontSize: 12, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {listing?.path ?? '…'}
          </code>
        </div>

        {/* Folder list */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 180, maxHeight: 320 }}>
          {listing?.entries.length === 0 && (
            <div style={{ padding: 20, color: T.textMuted, fontSize: 13 }}>No sub-folders here.</div>
          )}
          {listing?.entries.map((e) => (
            <div key={e.path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderBottom: `1px solid ${T.border}` }}>
              <button
                style={{ ...btn, border: 'none', background: 'transparent', flex: 1, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                onClick={() => go(e.path)}
              >
                <Folder size={14} color={T.textMuted} /> {e.name}
              </button>
              {e.isWorkspace
                ? <><span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>workspace</span>
                    <button style={primaryBtn} onClick={() => open(e.path)}>Open</button></>
                : <span style={{ fontSize: 11, color: T.textMuted }}>—</span>}
            </div>
          ))}
        </div>

        {/* Create form */}
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${T.border}`, background: T.surfaceAlt, borderRadius: '0 0 12px 12px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: T.text }}>Create a new workspace here</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="Workspace name" value={name} onChange={(e) => setName(e.target.value)}
              style={{ ...btn, cursor: 'text', flex: '1 1 160px' }} />
            <input placeholder="New sub-folder (optional)" value={subfolder} onChange={(e) => setSubfolder(e.target.value)}
              style={{ ...btn, cursor: 'text', flex: '1 1 160px' }} />
            <select value={presetId} onChange={(e) => setPresetId(e.target.value)} style={{ ...btn, cursor: 'pointer' }}>
              {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <button style={primaryBtn} disabled={!name.trim() || !presetId} onClick={create}>Create</button>
          </div>
          {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}
