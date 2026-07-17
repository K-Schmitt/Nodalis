import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
  type NodeMouseHandler,
} from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Sparkles, Maximize2, Trash2, Link2, Puzzle, Download, ChevronDown } from 'lucide-react';
import { useGraphStore } from '../stores/useGraphStore';
import { useProposalStore, type ProposalPreview } from '../stores/useProposalStore';
import { useUiStore } from '../stores/useUiStore';
import { UniversalNode } from './UniversalNode';
import { type ArchiNodeData, estimateNodeSize } from './nodes/shared';
import { layoutProfileFor, applyOverride, LAYOUT_ALGORITHMS, type FlowDirection, type LayoutProfile } from '../lib/layout';
import { layoutNested, containerSizeFromChildren } from '../lib/elk';
import {
  mergeSubgraphs, collectGraphs, capturePng, waitForMeasuredNodes, waitForEdgesRendered, downloadPng,
  DEFAULT_EXPORT_SETTINGS, type ExportSettings, type ExportBackground, type ExportEdgeWeight,
} from '../lib/exportPng';
import { T } from '../lib/theme';
import { type Definition } from '../types';

const isContainerNode = (n: Node) => (n.data as ArchiNodeData).render?.archetype === 'container';
import { RelationEdge, MarkerDefs } from './RelationEdge';
import { newId } from '../types';
import '@xyflow/react/dist/style.css';

const elk = new ELK();
const nodeTypes = { universal: UniversalNode };
const edgeTypes = { relation: RelationEdge };

const NODE_HEIGHT     = 80;
const GHOST_OFFSET_X  = 280;
const GHOST_OFFSET_Y  = 110;
const GHOST_STAGING_X = 100;
const GHOST_STAGING_Y = 180;
const GHOST_SPACING_X = 220;

const GHOST_ID = (id: string) => `__ghost_add__${id}`;
const isGhost = (id: string) => id.startsWith('__ghost_');
const isPositioned = (p?: { x: number; y: number }) => !!p && (p.x !== 0 || p.y !== 0);

// ─── Ghost helpers (proposal preview overlay) ───────────────────────────────────

function computeGhostNodes(preview: ProposalPreview | null, layoutedNodes: Node[]): Node[] {
  if (!preview) return [];
  const positionMap = new Map(layoutedNodes.map((n) => [n.id, n.position]));
  const ghostIds = new Set(preview.nodesToAdd.map((n) => n.id));

  return preview.nodesToAdd.map((item, i) => {
    const connectingEdge = preview.edgesToAdd.find(
      (e) => (e.sourceId === item.id && !ghostIds.has(e.targetId)) || (e.targetId === item.id && !ghostIds.has(e.sourceId))
    );
    let position: { x: number; y: number };
    if (connectingEdge) {
      const existingId = connectingEdge.sourceId === item.id ? connectingEdge.targetId : connectingEdge.sourceId;
      const base = positionMap.get(existingId);
      position = base ? { x: base.x + GHOST_OFFSET_X, y: base.y + i * GHOST_OFFSET_Y } : { x: GHOST_SPACING_X * i, y: -NODE_HEIGHT * 2 };
    } else {
      const maxY = Math.max(0, ...Array.from(positionMap.values()).map((p) => p.y));
      position = { x: GHOST_STAGING_X + i * GHOST_SPACING_X, y: maxY + GHOST_STAGING_Y };
    }
    return {
      id: GHOST_ID(item.id),
      type: 'universal',
      position,
      data: { id: item.id, typeId: item.typeId, label: item.label, style: item.style, ghostKind: 'add' as const },
      style: { opacity: 0.75, outline: '3px solid #22c55e', outlineOffset: 2, borderRadius: 8, filter: 'drop-shadow(0 0 6px rgba(34,197,94,0.5))' },
    } satisfies Node;
  });
}

function computeGhostEdges(preview: ProposalPreview | null, ghostIds: Set<string>): Edge[] {
  if (!preview) return [];
  return preview.edgesToAdd.map((ge) => ({
    id: `__ghost_edge__${ge.id}`,
    source: ghostIds.has(ge.sourceId) ? GHOST_ID(ge.sourceId) : ge.sourceId,
    target: ghostIds.has(ge.targetId) ? GHOST_ID(ge.targetId) : ge.targetId,
    label: ge.label,
    style: { stroke: '#22c55e', strokeWidth: 2, strokeDasharray: '6 3' },
    animated: true,
  }));
}

// ─── GraphCanvas ──────────────────────────────────────────────────────────────

export function GraphCanvas() {
  const {
    nodes: storeNodes, edges: storeEdges, selectedNodeId,
    applyOperations, updateNodePosition, selectNode,
    startPolling, stopPolling,
    context, activeRelation, setActiveRelation, enterSubgraph,
  } = useGraphStore();
  const edgeRelations = context?.edgeTypes ?? [];
  const presetId = context?.preset?.id;
  // Auto-layout algorithm + flow direction chosen to match the active paradigm,
  // with optional manual overrides from the toolbar.
  const [dirOverride, setDirOverride] = useState<FlowDirection | undefined>();
  const [algoOverride, setAlgoOverride] = useState<string | undefined>();
  const layoutProfile = useMemo(
    () => applyOverride(layoutProfileFor(presetId), dirOverride, algoOverride),
    [presetId, dirOverride, algoOverride],
  );
  const { pending, startPolling: startProposalPolling, stopPolling: stopProposalPolling } = useProposalStore();

  const setHoverNodeId = useUiStore((s) => s.setHoverNodeId);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  // PNG export: while true the overlay effect is suspended and polling paused so
  // the handler can drive the merged graph into the canvas for a clean capture.
  const [isExporting, setIsExporting] = useState(false);
  const isExportingRef = useRef(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(DEFAULT_EXPORT_SETTINGS);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Real (non-overlay) laid-out graph.
  const [baseNodes, setBaseNodes] = useState<Node[]>([]);
  const [baseEdges, setBaseEdges] = useState<Edge[]>([]);
  const baseNodesRef = useRef<Node[]>([]);
  const persistedRef = useRef<Set<string>>(new Set());
  useEffect(() => { baseNodesRef.current = baseNodes; }, [baseNodes]);

  const activeProposal = pending[0] ?? null;
  const deleteNodeIds = useMemo(() => new Set(activeProposal?.preview.nodesToDelete.map((n) => n.id) ?? []), [activeProposal]);
  const deleteEdgeIds = useMemo(() => new Set(activeProposal?.preview.edgesToDelete.map((e) => e.id) ?? []), [activeProposal]);
  const ghostAddIds = useMemo(() => new Set(activeProposal?.preview.nodesToAdd.map((n) => n.id) ?? []), [activeProposal]);

  // Reconcile store → baseNodes: preserve existing positions, place only NEW nodes.
  const reconcile = useCallback(async (snodes: Node[], sedges: Edge[]) => {
    const prevPos = new Map(baseNodesRef.current.map((n) => [n.id, n.position]));
    const knownPos = (n: Node) => prevPos.get(n.id) ?? (isPositioned(n.position) ? n.position : undefined);

    const placed = snodes.filter((n) => knownPos(n));
    const unplaced = snodes.filter((n) => !knownPos(n));
    const toPersist: Array<{ id: string; x: number; y: number }> = [];
    const positions = new Map<string, { x: number; y: number }>();
    const freshSizes = new Map<string, { width: number; height: number }>();

    if (snodes.length > 0 && placed.length === 0) {
      // Brand-new graph (e.g. AI-generated, no coordinates) → nested auto-layout.
      try {
        const laid = await layoutNested(elk, snodes, sedges as Array<{ id: string; source: string; target: string }>, layoutProfile.options);
        for (const n of snodes) {
          const c = laid.get(n.id);
          const pos = { x: c?.x ?? 0, y: c?.y ?? 0 };
          positions.set(n.id, pos);
          if (c) freshSizes.set(n.id, { width: c.width, height: c.height });
          toPersist.push({ id: n.id, ...pos });
        }
      } catch {
        snodes.forEach((n, i) => positions.set(n.id, { x: 100 + (i % 5) * 220, y: 100 + Math.floor(i / 5) * 160 }));
      }
    } else {
      // Incremental: keep placed nodes, drop only NEW nodes near a placed neighbour.
      for (const n of placed) positions.set(n.id, knownPos(n)!);
      const placedIds = new Set(placed.map((n) => n.id));
      let stackI = 0;
      const baseY = Math.max(0, ...placed.map((n) => knownPos(n)!.y)) + 180;
      for (const n of unplaced) {
        const link = sedges.find((e) => (e.source === n.id && placedIds.has(e.target)) || (e.target === n.id && placedIds.has(e.source)));
        const neighbourId = link ? (link.source === n.id ? link.target : link.source) : null;
        const anchor = neighbourId ? positions.get(neighbourId) : undefined;
        const pos = anchor
          ? { x: anchor.x + GHOST_OFFSET_X, y: anchor.y + (stackI++ % 3) * GHOST_OFFSET_Y }
          : { x: 120 + (stackI++) * GHOST_SPACING_X, y: baseY };
        positions.set(n.id, pos);
        placedIds.add(n.id);
        toPersist.push({ id: n.id, ...pos });
      }
    }

    const childrenByParent = new Map<string, Node[]>();
    const baseNodesBuilt: Node[] = snodes.map((n) => {
      const d = n.data as ArchiNodeData;
      const node: Node = {
        id: n.id, type: 'universal', position: positions.get(n.id) ?? { x: 0, y: 0 },
        sourcePosition: layoutProfile.sourcePosition, targetPosition: layoutProfile.targetPosition,
        data: { ...d, hSource: layoutProfile.sourcePosition, hTarget: layoutProfile.targetPosition },
      };
      if (d.parentId) { node.parentId = d.parentId; node.extent = 'parent'; }
      return node;
    });
    for (const n of baseNodesBuilt) {
      const pid = (n.data as ArchiNodeData).parentId;
      if (pid) (childrenByParent.get(pid) ?? childrenByParent.set(pid, []).get(pid)!).push(n);
    }
    // Size container nodes + render parents before their children (React Flow requirement).
    for (const n of baseNodesBuilt) {
      if ((n.data as ArchiNodeData).render?.archetype !== 'container') continue;
      const size = freshSizes.get(n.id) ?? containerSizeFromChildren(childrenByParent.get(n.id) ?? []);
      n.style = { ...n.style, width: size.width, height: size.height, zIndex: 0 };
      n.zIndex = 0;
    }
    const isContainer = (n: Node) => (n.data as ArchiNodeData).render?.archetype === 'container';
    baseNodesBuilt.sort((a, b) => Number(isContainer(b)) - Number(isContainer(a)));
    setBaseNodes(baseNodesBuilt);
    // Preserve the relation type + style so paradigm edges render correctly.
    setBaseEdges(sedges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label, type: e.type, data: e.data })));

    // Persist freshly-assigned positions (guarded so we don't re-PATCH each poll).
    for (const p of toPersist) {
      if (persistedRef.current.has(p.id)) continue;
      persistedRef.current.add(p.id);
      void updateNodePosition(p.id, p.x, p.y);
    }
  }, [updateNodePosition, layoutProfile]);

  useEffect(() => { reconcile(storeNodes, storeEdges); }, [storeNodes, storeEdges, reconcile]);

  // Nodes touched by the pending proposal (added/deleted/updated) → highlight path.
  const impactedNodeIds = useMemo(() => {
    const p = activeProposal?.preview;
    if (!p) return new Set<string>();
    const ids = new Set<string>();
    p.nodesToUpdate.forEach((n) => ids.add(n.id));
    p.edgesToAdd.forEach((e) => { ids.add(e.sourceId); ids.add(e.targetId); });
    p.edgesToDelete.forEach((e) => ids.add(e.id));
    return ids;
  }, [activeProposal]);

  // Overlay: delete-highlight + proposal ghosts + impacted-path, on top of the base graph.
  // Suspended while exporting — the export handler drives nodes/edges directly
  // (merged sub-graphs, no animation/ghosts) so the capture is clean.
  useEffect(() => {
    if (isExportingRef.current) return;
    const displayNodes: Node[] = [
      ...baseNodes.map((n) => {
        const withAnim = { ...n, className: 'archi-animate' };
        if (deleteNodeIds.has(n.id))
          return { ...withAnim, style: { ...n.style, outline: '3px solid #ef4444', outlineOffset: 2, opacity: 0.5, borderRadius: 8, filter: 'drop-shadow(0 0 6px rgba(239,68,68,0.5))' } };
        if (impactedNodeIds.has(n.id))
          return { ...withAnim, style: { ...n.style, outline: '2px solid #22c55e', outlineOffset: 2, borderRadius: 8 } };
        return withAnim;
      }),
      ...computeGhostNodes(activeProposal?.preview ?? null, baseNodes),
    ];
    const displayEdges: Edge[] = [
      ...baseEdges.map((e) =>
        deleteEdgeIds.has(e.id)
          ? { ...e, style: { stroke: '#ef4444', strokeWidth: 2.5, strokeDasharray: '6 3' }, animated: true }
          : e
      ),
      ...computeGhostEdges(activeProposal?.preview ?? null, ghostAddIds),
    ];
    setNodes(displayNodes);
    setEdges(displayEdges);
  }, [baseNodes, baseEdges, deleteNodeIds, deleteEdgeIds, activeProposal, ghostAddIds, impactedNodeIds, isExporting, setNodes, setEdges]);

  useEffect(() => {
    startPolling();
    startProposalPolling();
    return () => { stopPolling(); stopProposalPolling(); };
  }, [startPolling, stopPolling, startProposalPolling, stopProposalPolling]);


  // ─── Interactions ──────────────────────────────────────────────────────────

  const onConnect = useCallback(async (c: Connection) => {
    if (!c.source || !c.target || isGhost(c.source) || isGhost(c.target)) return;
    // In a paradigm with relation types, new edges use the selected relation.
    const type = activeRelation ?? undefined;
    await applyOperations([{ op: 'add_edge', payload: { id: newId(), sourceId: c.source, targetId: c.target, ...(type ? { type } : {}) } }]);
  }, [applyOperations, activeRelation]);

  // Double-click a node that owns a sub-graph to drill into it.
  const onNodeDoubleClick = useCallback((_: unknown, node: Node) => {
    if (isGhost(node.id)) return;
    const data = node.data as { subgraph?: { presetId: string }; label?: string } | undefined;
    if (data?.subgraph) void enterSubgraph(node.id, data.label ?? 'sub-graph');
  }, [enterSubgraph]);

  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    if (isGhost(node.id)) return;
    setBaseNodes((prev) => prev.map((n) => (n.id === node.id ? { ...n, position: node.position } : n)));
    void updateNodePosition(node.id, node.position.x, node.position.y);
  }, [updateNodePosition]);

  const onNodesDelete = useCallback(async (deleted: Node[]) => {
    const ops = deleted.filter((n) => !isGhost(n.id)).map((n) => ({ op: 'delete_node' as const, payload: { id: n.id } }));
    if (ops.length) await applyOperations(ops);
    if (deleted.some((n) => n.id === selectedNodeId)) selectNode(null);
  }, [applyOperations, selectedNodeId, selectNode]);

  const onEdgesDelete = useCallback(async (deleted: Edge[]) => {
    const ops = deleted.filter((e) => !isGhost(e.id)).map((e) => ({ op: 'delete_edge' as const, payload: { id: e.id } }));
    if (ops.length) await applyOperations(ops);
  }, [applyOperations]);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    if (!isGhost(node.id)) selectNode(node.id);
  }, [selectNode]);

  const runLayout = useCallback(async (profile: LayoutProfile) => {
    if (baseNodes.length === 0) return;
    const withHandles = baseNodes.map((n) => ({
      ...n, sourcePosition: profile.sourcePosition, targetPosition: profile.targetPosition,
      data: { ...(n.data as ArchiNodeData), hSource: profile.sourcePosition, hTarget: profile.targetPosition },
    }));
    // Prefer real measured dimensions (from the DOM) for a pixel-accurate layout.
    const measuredSize = (n: Node) => {
      const m = n.measured;
      return m?.width && m?.height ? { width: m.width, height: m.height } : estimateNodeSize(n.data as ArchiNodeData);
    };
    const laid = await layoutNested(elk, withHandles, baseEdges as Array<{ id: string; source: string; target: string }>, profile.options, measuredSize);
    const next = withHandles.map((n) => {
      const c = laid.get(n.id);
      const pos = c ? { x: c.x, y: c.y } : n.position;
      const style = c && isContainerNode(n) ? { ...n.style, width: c.width, height: c.height } : n.style;
      return { ...n, position: pos, style };
    });
    setBaseNodes(next);
    for (const n of next) void updateNodePosition(n.id, n.position.x, n.position.y);
    // Fit the view to the freshly-arranged graph.
    requestAnimationFrame(() => rfRef.current?.fitView({ padding: 0.2, duration: 400 }));
  }, [baseNodes, baseEdges, updateNodePosition]);

  const autoLayout = useCallback(() => runLayout(layoutProfile), [runLayout, layoutProfile]);

  // Export the graph as PNG(s), configured by the settings popover. Drives each
  // graph into the LIVE canvas — polling paused, overlay/animation suspended —
  // then captures and restores. Sub-graphs are either merged into one image, or
  // exported one image per graph, per the chosen scope/mode.
  const exportGraphPng = useCallback(async (settings: ExportSettings) => {
    if (baseNodes.length === 0 || isExportingRef.current || !wrapRef.current) return;
    isExportingRef.current = true;
    setIsExporting(true);
    stopPolling(); // freeze the 2s reconcile so it can't clobber the swapped graph
    const captureOpts = { scale: settings.scale, background: settings.background, edgeWeight: settings.edgeWeight };

    // Lay out one graph (or keep its current positions), drive it into the
    // canvas, wait for render, capture. `forceLayout` overrides the setting for
    // merged exports, which combine separate coordinate spaces and always need
    // a fresh nested layout.
    const relayout = settings.layout === 'auto';
    const renderOne = async (gNodes: Node[], gEdges: Edge[], forceLayout = false): Promise<string> => {
      let positioned: Node[];
      if (relayout || forceLayout) {
        const laid = await layoutNested(elk, gNodes, gEdges as Array<{ id: string; source: string; target: string }>, layoutProfile.options);
        positioned = gNodes.map((n) => {
          const c = laid.get(n.id);
          const pos = c ? { x: c.x, y: c.y } : n.position;
          const style = c && isContainerNode(n) ? { ...n.style, width: c.width, height: c.height } : n.style;
          return { ...n, position: pos, style };
        });
      } else {
        // Keep on-screen / stored positions untouched — export as-is.
        positioned = gNodes.map((n) => ({ ...n }));
      }
      setNodes(positioned);
      setEdges(gEdges);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await waitForMeasuredNodes(() => rfRef.current?.getNodes() ?? [], positioned.length);
      await waitForEdgesRendered(wrapRef.current!, gEdges.length);
      await new Promise((r) => setTimeout(r, 250));
      const bounds = rfRef.current!.getNodesBounds(rfRef.current!.getNodes());
      return capturePng(wrapRef.current!, bounds, captureOpts);
    };

    const slug = (s: string) => s.replace(/[^\w-]+/g, '_').slice(0, 40) || 'graphe';
    const stamp = Date.now();
    try {
      if (settings.scope === 'subgraphs' && settings.mode === 'per-graph') {
        // One image per graph (current graph + each sub-graph, flat).
        const graphs = await collectGraphs(baseNodes, baseEdges);
        for (let i = 0; i < graphs.length; i++) {
          const g = graphs[i];
          const url = await renderOne(g.nodes, g.edges);
          downloadPng(url, `graph-${String(i + 1).padStart(2, '0')}-${slug(g.label)}-${stamp}.png`);
          await new Promise((r) => setTimeout(r, 300)); // stagger downloads
        }
      } else if (settings.scope === 'subgraphs') {
        // Merged: all sub-graphs in a single image.
        const merged = await mergeSubgraphs(baseNodes, baseEdges, { linkParent: settings.linkParent });
        if (relayout) {
          const url = await renderOne(merged.nodes, merged.edges, true);
          downloadPng(url, `graph-export-${stamp}.png`);
        } else {
          // Current layout: keep the on-screen root nodes exactly where they are;
          // lay out only the sub-graph boxes and append them to the right so the
          // visible graph isn't distorted.
          const rootIds = new Set(baseNodes.map((n) => n.id));
          const subNodes = merged.nodes.filter((n) => !rootIds.has(n.id));
          const subEdges = merged.edges.filter((e) => !rootIds.has(e.source) && !rootIds.has(e.target));
          const laid = await layoutNested(elk, subNodes, subEdges as Array<{ id: string; source: string; target: string }>, layoutProfile.options);
          let rootMaxX = 0, rootMinY = Infinity;
          for (const n of baseNodes) {
            const s = estimateNodeSize(n.data as ArchiNodeData);
            rootMaxX = Math.max(rootMaxX, n.position.x + s.width);
            rootMinY = Math.min(rootMinY, n.position.y);
          }
          if (!isFinite(rootMinY)) rootMinY = 0;
          const offsetX = rootMaxX + 160;
          const positioned: Node[] = [
            ...baseNodes.map((n) => ({ ...n })), // roots at their current screen positions
            ...subNodes.map((n) => {
              const c = laid.get(n.id);
              const isTop = !(n.data as ArchiNodeData).parentId; // container (children keep relative pos)
              const pos = c ? { x: c.x + (isTop ? offsetX : 0), y: c.y + (isTop ? rootMinY : 0) } : n.position;
              const style = c && isContainerNode(n) ? { ...n.style, width: c.width, height: c.height } : n.style;
              return { ...n, position: pos, style };
            }),
          ];
          const url = await renderOne(positioned, merged.edges); // relayout=false → keeps these positions
          downloadPng(url, `graph-export-${stamp}.png`);
        }
      } else {
        // Visible graph only.
        const url = await renderOne(baseNodes, baseEdges);
        downloadPng(url, `graph-export-${stamp}.png`);
      }
    } catch (err) {
      console.error('[GraphCanvas] PNG export failed:', err);
      window.alert('PNG export failed. See console for details.');
    } finally {
      isExportingRef.current = false;
      setIsExporting(false); // re-runs the overlay effect → restores the normal view
      startPolling();
    }
  }, [baseNodes, baseEdges, layoutProfile, setNodes, setEdges, stopPolling, startPolling]);

  // Canvas keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'f' || e.key === 'F') rfRef.current?.fitView({ padding: 0.2, duration: 400 });
      else if ((e.key === 'l' || e.key === 'L') && e.shiftKey) autoLayout();
      else if (e.key === 'Escape') { selectNode(null); setEdgeMenu(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [autoLayout, selectNode]);

  // Re-layout when the user flips direction / algorithm from the toolbar.
  const overrideReady = useRef(false);
  useEffect(() => {
    if (!overrideReady.current) { overrideReady.current = true; return; }
    void runLayout(layoutProfile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirOverride, algoOverride]);

  // Focus the selected node.
  useEffect(() => {
    if (!selectedNodeId || !rfRef.current) return;
    const n = rfRef.current.getNode(selectedNodeId);
    if (n) rfRef.current.setCenter(n.position.x + 80, n.position.y + 50, { zoom: 1.2, duration: 400 });
  }, [selectedNodeId]);

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    if (edgeRelations.length === 0 || isGhost(edge.id)) return;
    e.preventDefault();
    const rect = wrapRef.current?.getBoundingClientRect();
    setEdgeMenu({ id: edge.id, x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) });
  }, [edgeRelations.length]);

  const changeEdgeRelation = useCallback(async (edgeId: string, type: string) => {
    setEdgeMenu(null);
    const edge = baseEdges.find((ed) => ed.id === edgeId);
    if (!edge) return;
    await applyOperations([
      { op: 'delete_edge', payload: { id: edgeId } },
      { op: 'add_edge', payload: { id: newId(), sourceId: edge.source, targetId: edge.target, type } },
    ]);
  }, [baseEdges, applyOperations]);

  const onNodeMouseEnter = useCallback<NodeMouseHandler>((_, node) => { if (!isGhost(node.id)) setHoverNodeId(node.id); }, [setHoverNodeId]);
  const onNodeMouseLeave = useCallback(() => setHoverNodeId(null), [setHoverNodeId]);

  // Drag-and-drop from the palette.
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);
  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/archi-node');
    if (!raw || !rfRef.current) return;
    const def = JSON.parse(raw) as Definition;
    const position = rfRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    await applyOperations([{ op: 'add_node', payload: { id: newId(), typeId: def.typeId, label: def.label, data: {}, position } }]);
  }, [applyOperations]);

  const clearGraph = useCallback(async () => {
    if (!window.confirm('Delete every node and edge in this workspace?')) return;
    selectNode(null);
    await applyOperations([{ op: 'clear_all', payload: {} }]);
  }, [applyOperations, selectNode]);

  const isEmpty = storeNodes.length === 0;

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'relative' }} onClick={() => edgeMenu && setEdgeMenu(null)}>
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={autoLayout} style={{ ...toolBtn, display: 'flex', alignItems: 'center', gap: 6 }} title="Re-arrange (Shift+L)"><Sparkles size={14} /> Auto-layout</button>
        <button onClick={() => rfRef.current?.fitView({ padding: 0.2, duration: 400 })} style={{ ...toolBtn, display: 'flex', alignItems: 'center', gap: 6 }} title="Fit to view (F)"><Maximize2 size={14} /> Fit</button>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setExportMenuOpen((o) => !o)}
            disabled={isExporting || isEmpty}
            style={{ ...toolBtn, display: 'flex', alignItems: 'center', gap: 6, opacity: isExporting || isEmpty ? 0.5 : 1, cursor: isExporting || isEmpty ? 'default' : 'pointer' }}
            title="Export graph as PNG"
          >
            <Download size={14} /> {isExporting ? 'Export…' : 'Export PNG'} <ChevronDown size={13} />
          </button>
          {exportMenuOpen && !isExporting && (
            <ExportMenu
              settings={exportSettings}
              onChange={setExportSettings}
              onExport={() => { setExportMenuOpen(false); void exportGraphPng(exportSettings); }}
              onClose={() => setExportMenuOpen(false)}
            />
          )}
        </div>
        {/* Flow direction toggle */}
        <div style={{ ...toolBtn, display: 'flex', gap: 2, padding: 4 }} title="Flow direction">
          {(['DOWN', 'RIGHT'] as FlowDirection[]).map((d) => (
            <button key={d} onClick={() => setDirOverride(d)} style={miniBtn(layoutProfile.options['elk.direction'] === d)}>
              {d === 'DOWN' ? '↓' : '→'}
            </button>
          ))}
        </div>
        {/* Algorithm picker */}
        <select
          value={layoutProfile.options['elk.algorithm']}
          onChange={(e) => setAlgoOverride(e.target.value)}
          style={{ ...toolBtn, cursor: 'pointer' }}
          title="Layout algorithm"
        >
          {LAYOUT_ALGORITHMS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={clearGraph} style={{ ...toolBtn, color: '#dc2626', borderColor: '#fecaca', display: 'flex', alignItems: 'center', gap: 6 }}><Trash2 size={14} /> Clear</button>
        {edgeRelations.length > 0 && (
          <label style={{ ...toolBtn, display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }} title="Relation type used for new connections">
            <span style={{ display: 'flex', color: T.textMuted }}><Link2 size={13} /></span>
            <select
              value={activeRelation ?? ''}
              onChange={(e) => setActiveRelation(e.target.value || null)}
              style={{ border: 'none', background: 'transparent', fontSize: 13, cursor: 'pointer', outline: 'none', color: T.text }}
            >
              {edgeRelations.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <MarkerDefs />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={(inst) => { rfRef.current = inst; }}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneClick={() => { selectNode(null); setEdgeMenu(null); }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color={T.border} gap={18} />
        <Controls />
        <MiniMap
          pannable zoomable
          nodeColor={(n) => (n.data as ArchiNodeData).render?.accent ?? (n.data as ArchiNodeData).style?.color ?? '#94a3b8'}
          style={{ background: 'var(--surface-alt)' }}
        />
      </ReactFlow>

      {/* Edge relation context menu */}
      {edgeMenu && (
        <div style={{
          position: 'absolute', left: edgeMenu.x, top: edgeMenu.y, zIndex: 30,
          background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8,
          boxShadow: T.shadowLg, overflow: 'hidden', minWidth: 140,
        }}>
          <div style={{ padding: '6px 10px', fontSize: 11, color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>Change relation</div>
          {edgeRelations.map((t) => (
            <button
              key={t.id}
              onClick={() => changeEdgeRelation(edgeMenu.id, t.id)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', background: 'transparent', color: T.text, cursor: 'pointer', fontSize: 13 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-alt)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {t.label} <span style={{ color: T.textMuted, fontSize: 11 }}>— {t.id}</span>
            </button>
          ))}
        </div>
      )}

      {/* Export-in-progress overlay */}
      {isExporting && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.15)', color: T.text, fontSize: 14, fontWeight: 600, pointerEvents: 'none',
        }}>
          Exporting PNG…
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none', color: T.textMuted }}>
          <Puzzle size={40} />
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Empty canvas</div>
          <div style={{ fontSize: 13 }}>Drag a type from the palette, or press <kbd>⌘K</kbd> to add one.</div>
        </div>
      )}
    </div>
  );
}

const toolBtn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.text,
  cursor: 'pointer', fontSize: 13, boxShadow: T.shadow,
};
const miniBtn = (active: boolean): React.CSSProperties => ({
  padding: '2px 8px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 13,
  background: active ? T.accent : 'transparent', color: active ? '#fff' : T.textMuted,
});

// ─── Export settings popover ────────────────────────────────────────────────

const segBtn = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: '4px 8px', borderRadius: 6, border: `1px solid ${active ? T.accent : T.border}`,
  background: active ? T.accent : 'transparent', color: active ? '#fff' : T.text,
  cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
});

function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: Array<{ v: T; label: string }>; onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map((o) => (
        <button key={o.v} style={segBtn(value === o.v)} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</span>
      {children}
    </div>
  );
}

function ExportMenu({ settings, onChange, onExport, onClose }: {
  settings: ExportSettings;
  onChange: (s: ExportSettings) => void;
  onExport: () => void;
  onClose: () => void;
}) {
  const set = <K extends keyof ExportSettings>(k: K, v: ExportSettings[K]) => onChange({ ...settings, [k]: v });
  return (
    <>
      {/* click-away catcher */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={onClose} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 20, width: 280,
          background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 10,
          boxShadow: T.shadowLg, padding: 14, display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700 }}>Paramètres d'export</div>

        <Field label="Résolution">
          <Segmented
            value={String(settings.scale)}
            options={[{ v: '1', label: '1x' }, { v: '2', label: '2x' }, { v: '3', label: '3x' }]}
            onChange={(v) => set('scale', Number(v) as ExportSettings['scale'])}
          />
        </Field>

        <Field label="Fond">
          <Segmented<ExportBackground>
            value={settings.background}
            options={[{ v: 'transparent', label: 'Transparent' }, { v: 'white', label: 'Blanc' }, { v: 'black', label: 'Noir' }]}
            onChange={(v) => set('background', v)}
          />
        </Field>

        <Field label="Épaisseur des liens">
          <Segmented<ExportEdgeWeight>
            value={settings.edgeWeight}
            options={[{ v: 'thin', label: 'Fin' }, { v: 'normal', label: 'Normal' }, { v: 'thick', label: 'Épais' }]}
            onChange={(v) => set('edgeWeight', v)}
          />
        </Field>

        <Field label="Disposition">
          <Segmented
            value={settings.layout}
            options={[{ v: 'current', label: 'Écran actuel' }, { v: 'auto', label: 'Auto (ELK)' }]}
            onChange={(v) => set('layout', v as ExportSettings['layout'])}
          />
        </Field>

        <Field label="Portée">
          <Segmented
            value={settings.scope}
            options={[{ v: 'visible', label: 'Graphe visible' }, { v: 'subgraphs', label: '+ sous-graphes' }]}
            onChange={(v) => set('scope', v as ExportSettings['scope'])}
          />
        </Field>

        {settings.scope === 'subgraphs' && (
          <>
            <Field label="Sortie">
              <Segmented
                value={settings.mode}
                options={[{ v: 'merged', label: '1 image' }, { v: 'per-graph', label: '1 / graphe' }]}
                onChange={(v) => set('mode', v as ExportSettings['mode'])}
              />
            </Field>
            {settings.mode === 'merged' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.linkParent} onChange={(e) => set('linkParent', e.target.checked)} />
                Relier parent ↔ sous-graphe (peut déformer)
              </label>
            )}
          </>
        )}

        <button
          onClick={onExport}
          style={{ marginTop: 2, padding: '8px 12px', borderRadius: 8, border: 'none', background: T.accent, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Download size={14} /> Exporter
        </button>
      </div>
    </>
  );
}
