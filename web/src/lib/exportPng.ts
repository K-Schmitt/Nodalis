import { toPng } from 'html-to-image';
import { getViewportForBounds, type Node, type Edge, type Rect } from '@xyflow/react';
import { API_BASE_URL } from '../config';
import { type ArchiNodeData } from '../components/nodes/shared';

export type ExportBackground = 'transparent' | 'white' | 'black';
export type ExportEdgeWeight = 'thin' | 'normal' | 'thick';
/** 'visible' = current graph only; 'subgraphs' = descend into sub-graphs. */
export type ExportScope = 'visible' | 'subgraphs';
/** With sub-graphs: 'merged' = one image; 'per-graph' = one image per graph. */
export type ExportMode = 'merged' | 'per-graph';

/** 'auto' = re-run ELK layout; 'current' = keep on-screen/stored positions. */
export type ExportLayout = 'auto' | 'current';

export interface ExportSettings {
  scale: 1 | 2 | 3;
  background: ExportBackground;
  edgeWeight: ExportEdgeWeight;
  scope: ExportScope;
  mode: ExportMode;
  /** Draw the dashed owner→sub-graph connector in merged mode (deforms layout). */
  linkParent: boolean;
  layout: ExportLayout;
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  scale: 2,
  background: 'transparent',
  edgeWeight: 'normal',
  scope: 'subgraphs',
  mode: 'merged',
  linkParent: false,
  layout: 'current',
};

const BG_COLOR: Record<ExportBackground, string | undefined> = {
  transparent: undefined,
  white: '#ffffff',
  black: '#0b0e14',
};
const EDGE_WIDTH_MULT: Record<ExportEdgeWeight, number> = { thin: 1, normal: 1.7, thick: 2.6 };
// The default React Flow edge stroke (#b1b1b7) is too faint on export — darken.
const FAINT_EDGE = new Set(['rgb(177, 177, 183)', '#b1b1b7', '#b1b1b7ff']);

interface SubgraphResponse {
  nodes: Node[];
  edges: Edge[];
  presetId: string | null;
}

async function fetchSubgraph(nodeId: string): Promise<SubgraphResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/graph/nodes/${nodeId}/subgraph`);
    if (!res.ok) return null;
    return await res.json() as SubgraphResponse;
  } catch {
    return null;
  }
}

/**
 * Collects the current graph plus each sub-graph (recursively) as SEPARATE flat
 * graphs — used for the "one image per graph" export mode. Each entry renders
 * independently (no container nesting). Labels drive the per-file names.
 */
export async function collectGraphs(
  nodes: Node[],
  edges: Edge[],
  label = 'graphe',
  visited: Set<string> = new Set(),
  out: Array<{ label: string; nodes: Node[]; edges: Edge[] }> = [],
): Promise<Array<{ label: string; nodes: Node[]; edges: Edge[] }>> {
  out.push({ label, nodes, edges });
  for (const node of nodes) {
    const data = node.data as ArchiNodeData;
    if (!data.subgraph || visited.has(node.id)) continue;
    const sub = await fetchSubgraph(node.id);
    if (!sub || sub.nodes.length === 0) continue;
    visited.add(node.id);
    await collectGraphs(sub.nodes, sub.edges, data.label ?? 'sous-graphe', visited, out);
  }
  return out;
}

/**
 * Recursively fetches every node's sub-graph and splices it into the graph for
 * a single merged ELK-nested layout / PNG export.
 *
 * The owning node is kept AS-IS (a normal, fully-visible node). Its sub-graph is
 * placed in a separate synthetic `container` node — labeled after the owner and
 * badged with the sub-graph preset — that holds the sub-graph's children, plus a
 * dashed connector edge `owner → container` so the ownership is obvious.
 *
 * The sub-graph is expanded FIRST using real (server) ids — so a grandchild's
 * own sub-graph resolves too — and only then is the whole subtree namespaced
 * (`owner::…`) so ids stay unique across independent sub-graph files. Container
 * nodes are emitted before their children (React Flow requires it). A shared
 * visited-set guards against a cyclic chain.
 */
export async function mergeSubgraphs(
  nodes: Node[],
  edges: Edge[],
  opts: { linkParent?: boolean } = {},
  visited: Set<string> = new Set(),
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const outNodes: Node[] = [];
  const outEdges: Edge[] = [...edges];

  for (const node of nodes) {
    const data = node.data as ArchiNodeData;
    if (!data.subgraph || visited.has(node.id)) {
      outNodes.push(node);
      continue;
    }

    const sub = await fetchSubgraph(node.id);
    if (!sub || sub.nodes.length === 0) {
      outNodes.push(node);
      continue;
    }

    visited.add(node.id);
    // Keep the owner node exactly as it is — fully visible.
    outNodes.push(node);

    // Expand the sub-graph (real ids) so nested fetches resolve.
    const expanded = await mergeSubgraphs(sub.nodes, sub.edges, opts, visited);
    const prefix = `${node.id}::`;
    const containerId = `${node.id}::__sub`;

    // Synthetic container holding the sub-graph, labeled after the owner.
    outNodes.push({
      id: containerId,
      type: 'universal',
      position: { x: 0, y: 0 },
      data: {
        id: containerId,
        label: data.label ?? 'Sous-graphe',
        render: { archetype: 'container', accent: data.style?.color ?? data.render?.accent },
        style: data.style,
        subgraph: data.subgraph,
      } as ArchiNodeData as unknown as Record<string, unknown>,
    });

    for (const en of expanded.nodes) {
      const enData = en.data as ArchiNodeData;
      // Top-level sub-graph nodes nest under the synthetic container; already-
      // nested ones keep their (now namespaced) parent.
      const parentId = en.parentId ? `${prefix}${en.parentId}` : containerId;
      outNodes.push({
        ...en,
        id: `${prefix}${en.id}`,
        parentId,
        extent: 'parent' as const,
        data: { ...enData, parentId },
      });
    }
    for (const ee of expanded.edges) {
      outEdges.push({ ...ee, id: `${prefix}${ee.id}`, source: `${prefix}${ee.source}`, target: `${prefix}${ee.target}` });
    }
    // Optional dashed ownership connector: owner node → its sub-graph container.
    // Off by default — the connector forces ELK to pull the container next to
    // the owner, which distorts the whole layout. The container's label (= owner
    // name) + "⤵ sous-graphe" badge already convey ownership without it.
    if (opts.linkParent) {
      outEdges.push({
        id: `${node.id}::__owns`,
        source: node.id,
        target: containerId,
        style: { strokeDasharray: '6 4', stroke: '#4338ca' },
        data: {},
      });
    }
  }

  return { nodes: outNodes, edges: outEdges };
}

/**
 * Polls the live React Flow instance until every node has real measured DOM
 * dimensions (needed for accurate bounds), or a short timeout elapses.
 */
export async function waitForMeasuredNodes(getNodes: () => Node[], expected: number): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const cur = getNodes();
    if (cur.length >= expected && cur.every((n) => (n.measured?.width ?? 0) > 0 && (n.measured?.height ?? 0) > 0)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Waits until React Flow has actually drawn the edge paths in the DOM. Edge
 * paths bind to node handles a render *after* nodes are measured, so capturing
 * right after {@link waitForMeasuredNodes} can catch a frame with no edges.
 * Checks every expected edge has a `<path class="react-flow__edge-path">` with
 * a non-trivial `d`.
 */
export async function waitForEdgesRendered(container: HTMLElement, expected: number): Promise<void> {
  if (expected === 0) return;
  for (let i = 0; i < 60; i++) {
    const paths = container.querySelectorAll<SVGPathElement>('.react-flow__edge-path');
    const drawn = Array.from(paths).filter((p) => (p.getAttribute('d')?.length ?? 0) > 8);
    if (drawn.length >= expected) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Rasterizes the on-screen React Flow viewport to a PNG, framed to the given
 * (already absolute, measured) bounds with padding so nothing at the graph's
 * edges is clipped.
 *
 * @param bounds absolute node bounds — pass `instance.getNodesBounds(instance.getNodes())`
 *               so nested sub-graph positions resolve correctly.
 * @param opts   scale (pixel ratio), background fill, and edge-weight emphasis.
 */
export async function capturePng(
  container: HTMLElement,
  bounds: Rect,
  opts: Pick<ExportSettings, 'scale' | 'background' | 'edgeWeight'> = { scale: 2, background: 'transparent', edgeWeight: 'normal' },
): Promise<string> {
  const viewportEl = container.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewportEl) throw new Error('React Flow viewport not found');

  const padding = 48;
  const width = Math.ceil(bounds.width + padding * 2);
  const height = Math.ceil(bounds.height + padding * 2);
  const viewport = getViewportForBounds(bounds, width, height, 0.1, 2, `${padding}px`);

  // React Flow renders each edge in its own <svg> (inside `.react-flow__edges`)
  // with NO width/height — computed size defaults to 300×150, and the edge path
  // shows on-screen only via `overflow: visible`. html-to-image rasterizes SVGs
  // through a <foreignObject>, where that overflow is CLIPPED to 300×150, so
  // every edge whose path runs past that box disappears. Give each per-edge SVG
  // an explicit cover size for the capture, then restore. Cover accounts for
  // negative flow coordinates.
  const coverW = Math.ceil(Math.abs(bounds.x) + bounds.width + padding * 2 + width);
  const coverH = Math.ceil(Math.abs(bounds.y) + bounds.height + padding * 2 + height);
  // The per-edge SVGs live under `.react-flow__edges` — NOT the lucide icon
  // SVGs inside nodes.
  const svgs = Array.from(viewportEl.querySelectorAll<SVGSVGElement>('.react-flow__edges svg'));
  const restore = svgs.map((svg) => ({
    svg,
    w: svg.getAttribute('width'),
    h: svg.getAttribute('height'),
    overflow: svg.style.overflow,
  }));
  for (const svg of svgs) {
    svg.setAttribute('width', String(coverW));
    svg.setAttribute('height', String(coverH));
    svg.style.overflow = 'visible';
  }

  // Edge paths get their stroke from the CSS class `.react-flow__edge-path`, not
  // inline. html-to-image serializes inline <svg> without applying class-based
  // styles to svg children, so those paths export with the SVG default
  // `stroke:none` → invisible. Copy the computed stroke props inline for the
  // capture (lucide icons are unaffected — their stroke is a presentation attr).
  const EDGE_PROPS = ['stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-opacity', 'fill', 'opacity', 'marker-start', 'marker-end'];
  const widthMult = EDGE_WIDTH_MULT[opts.edgeWeight];
  const edgePaths = Array.from(container.querySelectorAll<SVGPathElement>('.react-flow__edge-path'));
  const edgeRestore = edgePaths.map((p) => {
    const prev = p.getAttribute('style');
    const cs = getComputedStyle(p);
    for (const prop of EDGE_PROPS) {
      const val = cs.getPropertyValue(prop);
      if (val && val !== 'none' && val !== 'normal') p.style.setProperty(prop, val);
    }
    // Emphasize edges for the export: thicken, and darken the faint default
    // stroke so links read clearly (esp. on transparent/white backgrounds).
    const w = parseFloat(cs.getPropertyValue('stroke-width')) || 1;
    p.style.setProperty('stroke-width', String(+(w * widthMult).toFixed(2)));
    const stroke = cs.getPropertyValue('stroke').trim().toLowerCase();
    if (FAINT_EDGE.has(stroke)) p.style.setProperty('stroke', opts.background === 'black' ? '#94a3b8' : '#475569');
    return { p, prev };
  });

  // MarkerDefs (edge arrowheads) sits outside .react-flow__viewport — clone it
  // in so captured edges keep their markers (url(#…) refs resolve in-subtree).
  const markerDefs = container.querySelector('svg[aria-hidden]');
  const clonedDefs = markerDefs?.cloneNode(true) as HTMLElement | undefined;
  if (clonedDefs) viewportEl.appendChild(clonedDefs);

  try {
    return await toPng(viewportEl, {
      width,
      height,
      pixelRatio: opts.scale,
      backgroundColor: BG_COLOR[opts.background],
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      },
    });
  } finally {
    if (clonedDefs) viewportEl.removeChild(clonedDefs);
    for (const r of restore) {
      if (r.w === null) r.svg.removeAttribute('width'); else r.svg.setAttribute('width', r.w);
      if (r.h === null) r.svg.removeAttribute('height'); else r.svg.setAttribute('height', r.h);
      r.svg.style.overflow = r.overflow;
    }
    for (const { p, prev } of edgeRestore) {
      if (prev === null) p.removeAttribute('style'); else p.setAttribute('style', prev);
    }
  }
}

export function downloadPng(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
