import type { ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { Node } from '@xyflow/react';
import { estimateNodeSize, type ArchiNodeData } from '../components/nodes/shared';

export interface LaidOut { x: number; y: number; width: number; height: number }

interface ElkLike {
  layout(graph: ElkNode): Promise<ElkNode>;
}

/**
 * Run a (possibly nested) ELK layout. Nodes carrying `data.parentId` are laid
 * out *inside* their container; ELK returns child coordinates relative to the
 * parent — exactly what React Flow expects for `parentId` nodes. Container
 * sizes are computed by ELK from their children.
 *
 * Returns a map id → { x, y, width, height } (x/y relative to parent, absolute
 * for top-level nodes).
 */
export async function layoutNested(
  elk: ElkLike,
  nodes: Node[],
  edges: Array<{ id: string; source: string; target: string }>,
  options: Record<string, string>,
  /** Optional size source (defaults to estimate); pass measured dims for precision. */
  sizeOf: (n: Node) => { width: number; height: number } = (n) => estimateNodeSize(n.data as ArchiNodeData),
): Promise<Map<string, LaidOut>> {
  const dataOf = (n: Node) => n.data as ArchiNodeData;
  const childrenByParent = new Map<string, Node[]>();
  for (const n of nodes) {
    const pid = dataOf(n).parentId;
    if (!pid) continue;
    (childrenByParent.get(pid) ?? childrenByParent.set(pid, []).get(pid)!).push(n);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const build = (n: Node): ElkNode => {
    const kids = childrenByParent.get(n.id) ?? [];
    if (kids.length > 0) {
      return {
        id: n.id,
        layoutOptions: { ...options, 'elk.padding': '[top=40,left=18,bottom=18,right=18]' },
        children: kids.map(build),
      };
    }
    const { width, height } = sizeOf(n);
    return { id: n.id, width, height };
  };

  const roots = nodes.filter((n) => !dataOf(n).parentId && byId.has(n.id));
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: options,
    children: roots.map(build),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const res = await elk.layout(graph);
  const out = new Map<string, LaidOut>();
  const walk = (children?: ElkNode[]) => {
    for (const c of children ?? []) {
      out.set(c.id, { x: c.x ?? 0, y: c.y ?? 0, width: c.width ?? 150, height: c.height ?? 80 });
      walk(c.children);
    }
  };
  walk(res.children);
  return out;
}

/** Container size from its children's bounding box (when not freshly laid out). */
export function containerSizeFromChildren(children: Node[]): { width: number; height: number } {
  if (children.length === 0) return { width: 320, height: 220 };
  let maxX = 0, maxY = 0;
  for (const c of children) {
    const { width, height } = estimateNodeSize(c.data as ArchiNodeData);
    maxX = Math.max(maxX, c.position.x + width);
    maxY = Math.max(maxY, c.position.y + height);
  }
  return { width: Math.max(280, maxX + 24), height: Math.max(180, maxY + 24) };
}
