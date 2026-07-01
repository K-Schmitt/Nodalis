import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ArchiNodeData } from './nodes/shared';
import { RecordNode } from './nodes/RecordNode';
import { ShapeNode } from './nodes/ShapeNode';
import { DeviceNode } from './nodes/DeviceNode';
import { BoxNode } from './nodes/BoxNode';
import { ContainerNode } from './nodes/ContainerNode';

/**
 * Single node type registered with React Flow. Acts as a dispatcher: it reads
 * the paradigm-aware `render.archetype` forwarded by the Core and delegates to
 * the matching generic renderer. No paradigm logic lives here — the archetype
 * is data, so an ERD table, a UML class and a BPMN gateway all flow through
 * this one component and still look authentic. Falls back to the legacy box
 * when a definition declares no `render`.
 */
export const UniversalNode = memo(({ data }: NodeProps) => {
  const d = data as ArchiNodeData;
  switch (d.render?.archetype) {
    case 'record':    return <RecordNode data={d} />;
    case 'shape':     return <ShapeNode data={d} />;
    case 'device':    return <DeviceNode data={d} />;
    case 'container': return <ContainerNode data={d} />;
    default:          return <BoxNode data={d} />;
  }
});

UniversalNode.displayName = 'UniversalNode';
