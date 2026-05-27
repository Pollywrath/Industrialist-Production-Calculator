import type { ReactFlowNode, ReactFlowEdge } from '../types/solver';
import { buildHandleId } from './idGenerator';
import { buildEdgeLookupMap, resolveHandleProduct, type EdgeLookupMap } from './productResolver';

export interface GraphResolveHelpers {
  resolveProduct: (side: 'input' | 'output', index: number) => string;
  hasConnection: (side: 'input' | 'output', index: number) => boolean;
}

export interface GraphResolutionContext {
  nodesMap: Map<string, ReactFlowNode>;
  edgeLookup: EdgeLookupMap;
  createHelpers: (nodeId: string) => GraphResolveHelpers;
}

export function createGraphResolutionContext(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
): GraphResolutionContext {
  const nodesMap = new Map<string, ReactFlowNode>(nodes.map((node) => [node.id, node]));
  const edgeLookup = buildEdgeLookupMap(edges);
  const productCache = new Map<string, string>();

  return {
    nodesMap,
    edgeLookup,
    createHelpers: (nodeId: string): GraphResolveHelpers => ({
      resolveProduct: (side: 'input' | 'output', index: number) =>
        resolveHandleProduct(nodeId, side, index, nodesMap, edgeLookup, new Set(), productCache),
      hasConnection: (side: 'input' | 'output', index: number) => {
        const handleId = buildHandleId(nodeId, side, index);
        return (edgeLookup.get(handleId)?.length ?? 0) > 0;
      },
    }),
  };
}
