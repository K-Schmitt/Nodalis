import { useState, useMemo, useCallback } from 'react';
import { getIcon, toRows, badgeGlyph, badgeTitle, NodeFrame, MIN_W, type ArchiNodeData } from './shared';
import { setRow, newRow, withArray } from './recordEdit';
import { T, typeColor } from '../../lib/theme';
import { useGraphStore } from '../../stores/useGraphStore';
import { useUiStore } from '../../stores/useUiStore';

/**
 * `record` archetype: a titled box with one or more compartments of rows.
 * ERD tables (columns + PK/FK/unique badges + typed pills), UML classes
 * (Attributes / Methods, «stereotype», italic when abstract), DDD entities.
 *
 * Interactions: double-click the title or any row to edit inline; ＋ adds a
 * row; each compartment header collapses. Hovering a FK/relation row lights up
 * the node's incident edges.
 */
export function RecordNode({ data }: { data: ArchiNodeData }) {
  const render = data.render!;
  const accent = render.accent ?? data.style?.color ?? '#4F46E5';
  const Icon = getIcon(render.icon ?? data.style?.icon);
  const comps = useMemo(() => render.compartments ?? [], [render.compartments]);

  const applyOperations = useGraphStore((s) => s.applyOperations);
  const setHoverNodeId = useUiStore((s) => s.setHoverNodeId);

  const stereotype = data.data?.stereotype as string | undefined;
  const isAbstract = /abstract|interface/i.test(data.typeId ?? '') || data.data?.abstract === true;
  const title = (render.titleFrom && String(data.data?.[render.titleFrom])) || data.label || 'Untitled';

  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);

  const toggle = (i: number) =>
    setCollapsed((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const commitTitle = useCallback((value: string) => {
    if (data.id && value.trim() && value !== title) void applyOperations([{ op: 'update_node', payload: { id: data.id, changes: { label: value.trim() } } }]);
    setEditing(null);
  }, [applyOperations, data.id, title]);

  const commitRow = useCallback((from: string, index: number, value: string) => {
    setEditing(null);
    const arr = Array.isArray(data.data?.[from]) ? [...(data.data![from] as unknown[])] : [];
    const [text, type] = value.split(':').map((x) => x.trim());
    arr[index] = setRow(arr[index], text, type || undefined);
    if (data.id) void applyOperations([{ op: 'update_node', payload: { id: data.id, changes: { data: withArray(data.data, from, arr) } } }]);
  }, [applyOperations, data.id, data.data]);

  const addRow = useCallback((from: string) => {
    const arr = Array.isArray(data.data?.[from]) ? [...(data.data![from] as unknown[])] : [];
    arr.push(newRow(from));
    if (data.id) void applyOperations([{ op: 'update_node', payload: { id: data.id, changes: { data: withArray(data.data, from, arr) } } }]);
  }, [applyOperations, data.id, data.data]);

  const editInput = (key: string, initial: string, onCommit: (v: string) => void) => (
    <input
      autoFocus
      defaultValue={initial}
      onBlur={(e) => onCommit(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onCommit((e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditing(null); }}
      onClick={(e) => e.stopPropagation()}
      style={{ font: 'inherit', width: '100%', border: `1px solid ${accent}`, borderRadius: 4, padding: '1px 4px', background: T.surface, color: T.text }}
      key={key}
    />
  );

  return (
    <NodeFrame data={data}>
      <div style={{ minWidth: MIN_W, background: T.surface, color: T.text, border: `2px solid ${accent}`, borderRadius: T.radius, overflow: 'hidden', boxShadow: T.shadow, fontSize: 12 }}>
        {/* Title bar */}
        <div style={{ background: accent, color: '#fff', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon size={15} color="#fff" strokeWidth={2.5} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {stereotype && <div style={{ fontSize: 9, opacity: 0.9, lineHeight: 1 }}>«{stereotype}»</div>}
            {editing === 'title'
              ? editInput('title', title, commitTitle)
              : (
                <span
                  onDoubleClick={() => setEditing('title')}
                  style={{ fontWeight: 700, fontStyle: isAbstract ? 'italic' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', cursor: 'text' }}
                  title="Double-click to rename"
                >
                  {title}
                </span>
              )}
          </div>
        </div>

        {/* Compartments */}
        {comps.map((c, ci) => {
          const rows = toRows(data.data, c.from, c.badges);
          const isCollapsed = collapsed.has(ci);
          return (
            <div key={ci} style={{ borderTop: ci > 0 ? `1px solid ${accent}44` : undefined }}>
              {c.label && (
                <div
                  onClick={() => toggle(ci)}
                  style={{ padding: '2px 10px', fontSize: 10, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                >
                  <span>{c.label}</span>
                  <span style={{ opacity: 0.6 }}>{isCollapsed ? `▸ ${rows.length}` : '▾'}</span>
                </div>
              )}
              {!isCollapsed && (rows.length === 0 ? (
                <div style={{ padding: '4px 12px', color: T.textMuted, fontStyle: 'italic', fontSize: 11 }}>—</div>
              ) : (
                rows.map((r, ri) => {
                  const editKey = `${ci}:${ri}`;
                  const isFk = r.badges.includes('fk');
                  return (
                    <div
                      key={ri}
                      onMouseEnter={isFk ? () => setHoverNodeId(data.id ?? null) : undefined}
                      onMouseLeave={isFk ? () => setHoverNodeId(null) : undefined}
                      style={{ padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 6, borderTop: ri > 0 ? `1px solid ${T.border}` : undefined }}
                    >
                      <span style={{ minWidth: 16, textAlign: 'center', flexShrink: 0, fontSize: 11 }}>
                        {r.badges.map((b) => <span key={b} title={badgeTitle(b)}>{badgeGlyph(b)}</span>)}
                      </span>
                      {editing === editKey
                        ? editInput(editKey, r.type ? `${r.text} : ${r.type}` : r.text, (v) => commitRow(c.from, ri, v))
                        : (
                          <>
                            <span
                              onDoubleClick={() => setEditing(editKey)}
                              style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'ui-monospace, monospace', cursor: 'text' }}
                              title="Double-click to edit"
                            >
                              {r.text}
                            </span>
                            {r.type && (
                              <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', background: typeColor(r.type), borderRadius: 4, padding: '0 5px', flexShrink: 0 }}>
                                {r.type}
                              </span>
                            )}
                          </>
                        )}
                    </div>
                  );
                })
              ))}
              {!isCollapsed && (
                <div
                  onClick={() => addRow(c.from)}
                  style={{ padding: '2px 10px', fontSize: 11, color: T.textMuted, cursor: 'pointer', borderTop: `1px dashed ${T.border}` }}
                  title="Add a row"
                >
                  ＋ add
                </div>
              )}
            </div>
          );
        })}
      </div>
    </NodeFrame>
  );
}
