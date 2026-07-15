import { useEffect, Suspense, lazy } from 'react';
import { Waypoints, Sun, Moon, Wifi, WifiOff, FolderOpen, Folder } from 'lucide-react';
import { ProposalPanel } from './components/ProposalPanel';
import { NodePalette } from './components/NodePalette';
import { NodeInspector } from './components/NodeInspector';
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher';
import { Breadcrumb } from './components/Breadcrumb';
import { Toaster } from './components/Toaster';
import { CommandPalette } from './components/CommandPalette';
import { useGraphStore } from './stores/useGraphStore';
import { useWorkspaceStore } from './stores/useWorkspaceStore';
import { useUiStore } from './stores/useUiStore';
import { useToastStore } from './stores/useToastStore';
import { HEADER_HEIGHT_PX } from './config';
import { T } from './lib/theme';
import '@xyflow/react/dist/style.css';

// Code-split the canvas: React Flow + ELK are the heaviest chunk.
const GraphCanvas = lazy(() => import('./components/GraphCanvas').then((m) => ({ default: m.GraphCanvas })));

function App() {
  const { isLive, lastUpdate, lastError, clearError } = useGraphStore();
  const { active, init } = useWorkspaceStore();
  const { theme, toggleTheme, setCmdkOpen } = useUiStore();
  const pushToast = useToastStore((s) => s.push);

  useEffect(() => { init(); }, [init]);

  // Route Core errors to the toast stack.
  useEffect(() => {
    if (lastError) { pushToast('error', lastError); clearError(); }
  }, [lastError, pushToast, clearError]);

  // ⌘/Ctrl-K opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setCmdkOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setCmdkOpen]);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', backgroundColor: T.surfaceAlt, color: T.text }}>
      {/* Header */}
      <div style={{
        height: `${HEADER_HEIGHT_PX}px`, backgroundColor: T.surface, borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 24px',
        boxShadow: T.shadow, position: 'relative', zIndex: 20,
      }}>
        <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Waypoints size={22} />
          Nodalis
        </h1>
        <WorkspaceSwitcher />

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          <button
            onClick={() => setCmdkOpen(true)}
            title="Command palette (⌘K)"
            style={{ border: `1px solid ${T.border}`, background: T.surface, color: T.textMuted, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}
          >⌘K</button>
          <button
            onClick={toggleTheme}
            title="Toggle theme"
            aria-label="Toggle light/dark theme"
            style={{ border: `1px solid ${T.border}`, background: T.surface, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 15 }}
          >{theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</button>
          <span style={{ display: 'flex', color: isLive ? '#10b981' : '#ef4444' }}>{isLive ? <Wifi size={14} /> : <WifiOff size={14} />}</span>
          <span style={{ fontWeight: 600, color: isLive ? '#10b981' : '#ef4444' }}>{isLive ? 'Live' : 'Disconnected'}</span>
          {lastUpdate && <span style={{ fontSize: 12, color: T.textMuted }}>{lastUpdate.toLocaleTimeString()}</span>}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {active ? (
          <>
            <div style={{
              height: 40, flexShrink: 0, background: T.surface, borderBottom: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'center', padding: '0 16px',
            }}>
              <Breadcrumb />
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <NodePalette />
              <main style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                <Suspense fallback={<div style={{ padding: 24, color: T.textMuted }}>Loading canvas…</div>}>
                  <GraphCanvas />
                </Suspense>
                <ProposalPanel />
              </main>
              <NodeInspector />
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: T.textMuted }}>
            <FolderOpen size={48} />
            <h2 style={{ color: T.text }}>No workspace open</h2>
            <p style={{ maxWidth: 420, textAlign: 'center', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              Open or create a workspace folder from the <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Folder size={14} /> selector</strong> in the header.
              Nodalis will store the architecture, its type and notes inside that folder’s <code>.nodalis/</code> directory.
            </p>
          </div>
        )}
      </div>

      <CommandPalette />
      <Toaster />
    </div>
  );
}

export default App;
