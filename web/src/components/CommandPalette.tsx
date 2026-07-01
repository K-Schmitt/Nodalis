import { useEffect, useMemo, useState } from 'react';
import { useUiStore } from '../stores/useUiStore';
import { useGraphStore } from '../stores/useGraphStore';
import { newId, type Definition } from '../types';
import { T } from '../lib/theme';

interface Command { id: string; label: string; hint?: string; run: () => void }

/**
 * Command palette (⌘/Ctrl-K): quick actions — add any node type of the active
 * paradigm, toggle theme, clear selection.
 */
export function CommandPalette() {
  const open = useUiStore((s) => s.cmdkOpen);
  const setOpen = useUiStore((s) => s.setCmdkOpen);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const { definitions, applyOperations, selectNode } = useGraphStore();
  const [query, setQuery] = useState('');

  useEffect(() => { if (open) setQuery(''); }, [open]);

  const addNode = (def: Definition) =>
    applyOperations([{ op: 'add_node', payload: { id: newId(), typeId: def.typeId, label: def.label, data: {}, position: { x: 200 + Math.random() * 200, y: 160 + Math.random() * 160 } } }]);

  const commands = useMemo<Command[]>(() => [
    { id: 'theme', label: 'Toggle light / dark theme', hint: 'UI', run: toggleTheme },
    { id: 'deselect', label: 'Clear selection', hint: 'UI', run: () => selectNode(null) },
    ...definitions.map((d) => ({ id: `add:${d.typeId}`, label: `Add ${d.label}`, hint: d.category, run: () => void addNode(d) })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [definitions, toggleTheme, selectNode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 40);
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q)).slice(0, 40);
  }, [commands, query]);

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 92vw)', background: T.surface, color: T.text, borderRadius: 12, boxShadow: T.shadowLg, overflow: 'hidden', border: `1px solid ${T.border}` }}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && filtered[0]) { filtered[0].run(); setOpen(false); } if (e.key === 'Escape') setOpen(false); }}
          placeholder="Type a command or node type…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', border: 'none', outline: 'none', fontSize: 15, background: T.surface, color: T.text, borderBottom: `1px solid ${T.border}` }}
        />
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {filtered.length === 0 && <div style={{ padding: 16, color: T.textMuted, fontSize: 13 }}>No matches.</div>}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => { c.run(); setOpen(false); }}
              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '9px 16px', border: 'none', background: 'transparent', color: T.text, cursor: 'pointer', fontSize: 13 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-alt)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span>{c.label}</span>
              {c.hint && <span style={{ color: T.textMuted, fontSize: 11, textTransform: 'uppercase' }}>{c.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
