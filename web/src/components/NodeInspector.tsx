import { useEffect, useMemo, useState } from 'react';
import { useGraphStore } from '../stores/useGraphStore';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import type { Definition, DataSchemaField } from '../types';
import { X, ArrowDownCircle, Plus } from 'lucide-react';
import { T } from '../lib/theme';

interface XYNodeData {
  id: string;
  typeId: string;
  label: string;
  data?: Record<string, unknown>;
  subgraph?: { presetId: string };
}

const field: React.CSSProperties = {
  width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13, boxSizing: 'border-box',
  background: T.surface, color: T.text,
};
const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4, display: 'block' };

export function NodeInspector() {
  const { nodes, definitions, selectedNodeId, selectNode, applyOperations, createSubgraph, enterSubgraph } = useGraphStore();
  const { presets } = useWorkspaceStore();

  const node = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId]
  );
  const nodeData = node?.data as unknown as XYNodeData | undefined;
  const def = definitions.find((d) => d.typeId === nodeData?.typeId) as Definition | undefined;

  const [labelValue, setLabelValue] = useState('');
  const [data, setData] = useState<Record<string, unknown>>({});
  const [subPreset, setSubPreset] = useState('');

  useEffect(() => {
    setLabelValue(nodeData?.label ?? '');
    setData({ ...(nodeData?.data ?? {}) });
  }, [selectedNodeId, nodeData?.label]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Default the sub-graph preset picker to a sensible paradigm.
    if (!subPreset && presets.length > 0) {
      setSubPreset(presets.find((p) => p.id === 'erd')?.id ?? presets[0].id);
    }
  }, [presets, subPreset]);

  if (!selectedNodeId || !node || !nodeData) return null;

  const setField = (key: string, value: unknown) => setData((d) => ({ ...d, [key]: value }));

  const save = async () => {
    await applyOperations([{ op: 'update_node', payload: { id: nodeData.id, changes: { label: labelValue, data } } }]);
  };

  const remove = async () => {
    const ok = await applyOperations([{ op: 'delete_node', payload: { id: nodeData.id } }]);
    if (ok.ok) selectNode(null);
  };

  const renderInput = (key: string, spec: DataSchemaField) => {
    const value = data[key];
    if (spec.type === 'array') {
      const items = Array.isArray(value) ? value : [];
      const asText = (it: unknown) => (it && typeof it === 'object' ? JSON.stringify(it) : String(it));
      const setItem = (i: number, v: string) => { const next = [...items]; next[i] = v; setField(key, next); };
      const removeItem = (i: number) => setField(key, items.filter((_, j) => j !== i));
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 4 }}>
              <input style={{ ...field, flex: 1 }} value={asText(it)} onChange={(e) => setItem(i, e.target.value)} placeholder="name : type" />
              <button onClick={() => removeItem(i)} aria-label="Remove item" style={{ display: 'flex', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', borderRadius: 6, cursor: 'pointer', padding: '0 8px' }}><X size={13} /></button>
            </div>
          ))}
          <button onClick={() => setField(key, [...items, ''])} style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', border: `1px dashed ${T.borderStrong}`, background: 'transparent', color: T.textMuted, borderRadius: 6, cursor: 'pointer', padding: '4px', fontSize: 12 }}><Plus size={12} /> add item</button>
        </div>
      );
    }
    if (spec.enum && spec.enum.length > 0) {
      return (
        <select style={field} value={String(value ?? '')} onChange={(e) => setField(key, e.target.value)}>
          {spec.enum.map((opt) => <option key={String(opt)} value={String(opt)}>{String(opt)}</option>)}
        </select>
      );
    }
    if (spec.type === 'boolean') {
      return <input type="checkbox" checked={Boolean(value)} onChange={(e) => setField(key, e.target.checked)} />;
    }
    if (spec.type === 'number') {
      return <input style={field} type="number" value={value === undefined ? '' : Number(value)} onChange={(e) => setField(key, e.target.value === '' ? undefined : Number(e.target.value))} />;
    }
    return <input style={field} value={value === undefined ? '' : String(value)} onChange={(e) => setField(key, e.target.value)} />;
  };

  const schema = def?.dataSchema ?? {};
  const required = new Set(def?.constraints?.requiredFields ?? []);

  return (
    <aside style={{ width: 300, borderLeft: `1px solid ${T.border}`, background: T.surface, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 14, color: T.text }}>{def?.label ?? 'Node'}</strong>
        <button onClick={() => selectNode(null)} aria-label="Close inspector" style={{ display: 'flex', border: 'none', background: 'transparent', cursor: 'pointer', color: T.textMuted }}><X size={16} /></button>
      </div>

      <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 12 }}>{nodeData.typeId}</div>

        <label style={label}>Label</label>
        <input style={{ ...field, marginBottom: 16 }} value={labelValue} onChange={(e) => setLabelValue(e.target.value)} />

        {Object.entries(schema).map(([key, spec]) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={label}>{key}{required.has(key) ? ' *' : ''}</label>
            {renderInput(key, spec)}
            {spec.description && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{spec.description}</div>}
          </div>
        ))}
        {Object.keys(schema).length === 0 && <div style={{ fontSize: 13, color: T.textMuted }}>This node type has no configurable fields.</div>}

        {/* Sub-graph (drill-down) */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px dashed ${T.border}` }}>
          <label style={label}>Sub-graph</label>
          {nodeData.subgraph ? (
            <div>
              <div style={{ fontSize: 12, color: T.textMuted, margin: '4px 0 8px' }}>
                This node has a nested <strong>{nodeData.subgraph.presetId}</strong> graph.
              </div>
              <button
                onClick={() => enterSubgraph(nodeData.id, nodeData.label)}
                style={{ width: '100%', padding: '8px', borderRadius: 6, border: `1px solid ${T.accent}`, background: T.surfaceAlt, color: T.accent, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <ArrowDownCircle size={14} /> Open sub-graph
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: T.textMuted, margin: '4px 0 8px' }}>
                Give this node its own nested graph (with its own paradigm) — e.g. an ERD for a database.
              </div>
              <select style={{ ...field, marginBottom: 8 }} value={subPreset} onChange={(e) => setSubPreset(e.target.value)}>
                {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <button
                onClick={async () => { if (await createSubgraph(nodeData.id, subPreset)) await enterSubgraph(nodeData.id, nodeData.label); }}
                style={{ width: '100%', padding: '8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', fontWeight: 600, color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Plus size={14} /> Create sub-graph
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: 16, borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8 }}>
        <button onClick={save} style={{ flex: 1, padding: '8px', borderRadius: 6, border: `1px solid ${T.accent}`, background: T.accent, color: 'white', cursor: 'pointer', fontWeight: 600 }}>Save</button>
        <button onClick={remove} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>Delete</button>
      </div>
    </aside>
  );
}
