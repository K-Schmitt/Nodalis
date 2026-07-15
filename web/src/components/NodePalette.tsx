import { useMemo } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useGraphStore } from '../stores/useGraphStore';
import { useUiStore } from '../stores/useUiStore';
import { newId, type Definition } from '../types';
import { T } from '../lib/theme';

/** Build node.data pre-filled so required fields pass validation; user refines in the inspector. */
function buildDefaultData(def: Definition): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const schema = def.dataSchema ?? {};
  const required = new Set(def.constraints?.requiredFields ?? []);
  for (const [field, spec] of Object.entries(schema)) {
    if (spec.default !== undefined) data[field] = spec.default;
    else if (required.has(field)) {
      data[field] = spec.type === 'number' ? 0 : spec.type === 'boolean' ? false : spec.type === 'array' ? [] : '';
    }
  }
  // Required fields without a dataSchema entry still need a value.
  for (const field of required) if (!(field in data)) data[field] = '';
  return data;
}

export function NodePalette() {
  const { definitions, applyOperations } = useGraphStore();
  const { paletteOpen, togglePalette } = useUiStore();

  const byCategory = useMemo(() => {
    const map = new Map<string, Definition[]>();
    for (const d of definitions) {
      const list = map.get(d.category) ?? [];
      list.push(d);
      map.set(d.category, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [definitions]);

  const addNode = async (def: Definition) => {
    await applyOperations([{
      op: 'add_node',
      payload: {
        id: newId(),
        typeId: def.typeId,
        label: def.label,
        data: buildDefaultData(def),
        // Stagger so manually-added nodes don't stack at the origin.
        position: { x: 120 + Math.round(Math.random() * 260), y: 120 + Math.round(Math.random() * 200) },
      },
    }]);
  };

  if (!paletteOpen) {
    return (
      <aside style={{ width: 32, borderRight: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 10 }}>
        <button
          onClick={togglePalette}
          title="Show node palette"
          aria-label="Show node palette"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: T.textMuted, padding: 4, display: 'flex' }}
        >
          <PanelLeftOpen size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside style={{
      width: 230, borderRight: `1px solid ${T.border}`, background: T.surface,
      overflowY: 'auto', flexShrink: 0,
    }}>
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 12, fontWeight: 700, color: T.text, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Node palette</span>
        <button
          onClick={togglePalette}
          title="Hide node palette"
          aria-label="Hide node palette"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: T.textMuted, padding: 0, display: 'flex' }}
        >
          <PanelLeftClose size={15} />
        </button>
      </div>
      {definitions.length === 0 && (
        <div style={{ padding: 14, fontSize: 13, color: T.textMuted }}>Open a workspace to see its node types.</div>
      )}
      {byCategory.map(([category, defs]) => (
        <div key={category}>
          <div style={{ padding: '8px 14px 4px', fontSize: 11, color: T.textMuted, textTransform: 'uppercase' }}>{category}</div>
          {defs.map((def) => (
            <button
              key={def.typeId}
              title={`${def.description ?? def.typeId}\n(drag onto the canvas, or click to add)`}
              draggable
              onDragStart={(e) => { e.dataTransfer.setData('application/archi-node', JSON.stringify(def)); e.dataTransfer.effectAllowed = 'move'; }}
              onClick={() => addNode(def)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                padding: '7px 14px', border: 'none', background: 'transparent', cursor: 'grab', fontSize: 13,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-alt)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <TypePreview def={def} />
              <span style={{ color: T.text, flex: 1 }}>{def.label}</span>
              <span style={{ fontSize: 9, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{def.render?.archetype ?? 'box'}</span>
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}

/** Tiny glyph hinting at the node's real rendering (record / shape / device …). */
function TypePreview({ def }: { def: Definition }) {
  const c = def.render?.accent ?? def.style.color;
  const a = def.render?.archetype ?? 'box';
  const shape = def.render?.shape ?? '';
  const box: React.CSSProperties = { width: 18, height: 14, flexShrink: 0, border: `1.5px solid ${c}`, borderRadius: 3 };
  if (a === 'record') return <span style={{ ...box, background: 'var(--surface)', borderTop: `5px solid ${c}` }} />;
  if (a === 'shape' && shape.startsWith('gateway')) return <span style={{ width: 13, height: 13, background: 'var(--surface)', border: `1.5px solid ${c}`, transform: 'rotate(45deg)', flexShrink: 0 }} />;
  if (a === 'shape' && shape.startsWith('event')) return <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${c}`, flexShrink: 0 }} />;
  if (a === 'device') return <span style={{ ...box, borderRadius: 5, background: `${c}22` }} />;
  if (a === 'container') return <span style={{ ...box, borderStyle: 'dashed', background: `${c}11` }} />;
  return <span style={{ width: 14, height: 14, borderRadius: 3, background: c, flexShrink: 0, border: '1px solid rgba(0,0,0,0.15)' }} />;
}
