import type { ReactFlowNode, ReactFlowEdge } from '../types/solver';
import { resolveActiveRecipe } from '../data/lookup';
import { parseHandleId } from './idGenerator';

export type EdgeLookupMap = Map<string, ReactFlowEdge[]>;

let lastEdges: ReactFlowEdge[] | null = null;
let lastLookup: EdgeLookupMap | null = null;
let lastNodesMap: Map<string, ReactFlowNode> | null = null;
let resolveCache = new Map<string, string>();

export function buildEdgeLookupMap(edges: ReactFlowEdge[]): EdgeLookupMap {
  if (edges === lastEdges && lastLookup) {
    return lastLookup;
  }
  resolveCache = new Map();
  const map = new Map<string, ReactFlowEdge[]>();
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (edge.sourceHandle) {
      let list = map.get(edge.sourceHandle);
      if (!list) {
        list = [];
        map.set(edge.sourceHandle, list);
      }
      list.push(edge);
    }
    if (edge.targetHandle) {
      let list = map.get(edge.targetHandle);
      if (!list) {
        list = [];
        map.set(edge.targetHandle, list);
      }
      list.push(edge);
    }
  }
  lastEdges = edges;
  lastLookup = map;
  return map;
}

export function resolveHandleProduct(
  nodeId: string,
  side: 'input' | 'output',
  index: number,
  nodesMap: Map<string, ReactFlowNode>,
  edgesOrLookup: ReactFlowEdge[] | EdgeLookupMap,
  visited: Set<string> = new Set(),
): string {
  const handleId = `${nodeId}-${side}-${index}`;
  if (visited.has(handleId)) {
    return '';
  }

  if (nodesMap !== lastNodesMap) {
    resolveCache = new Map();
    lastNodesMap = nodesMap;
  }

  const cached = resolveCache.get(handleId);
  if (cached !== undefined) {
    return cached;
  }

  visited.add(handleId);

  const node = nodesMap.get(nodeId);
  if (!node) return '';

  const recipe = resolveActiveRecipe(node.data.recipeId, node.data.settings);
  if (!recipe) return '';

  const list = side === 'input' ? recipe.inputs : recipe.outputs;
  const entry = list[index];
  if (!entry) return '';

  const baseProductId = entry.product_id;
  if (baseProductId !== 'any_fluid' && baseProductId !== 'any_item') {
    resolveCache.set(handleId, baseProductId);
    return baseProductId;
  }

  const edgeLookup =
    edgesOrLookup instanceof Map ? edgesOrLookup : buildEdgeLookupMap(edgesOrLookup);
  const connectedEdges = edgeLookup.get(handleId) ?? [];

  for (let i = 0; i < connectedEdges.length; i++) {
    const edge = connectedEdges[i];
    const otherNodeId = side === 'input' ? edge.source : edge.target;
    const otherHandleId = side === 'input' ? edge.sourceHandle : edge.targetHandle;
    if (!otherHandleId) continue;

    const parsed = parseHandleId(otherHandleId);
    if (!parsed) continue;

    const resolved = resolveHandleProduct(
      otherNodeId,
      parsed.side,
      parsed.index,
      nodesMap,
      edgeLookup,
      visited,
    );

    if (resolved && resolved !== 'any_fluid' && resolved !== 'any_item') {
      resolveCache.set(handleId, resolved);
      return resolved;
    }
  }

  resolveCache.set(handleId, baseProductId);
  return baseProductId;
}

export function computeResolvedProducts(
  nodesMap: Map<string, ReactFlowNode>,
  edges: ReactFlowEdge[],
): Record<string, string> {
  const edgeLookup = buildEdgeLookupMap(edges);
  const resolved: Record<string, string> = {};

  for (const node of nodesMap.values()) {
    const recipe = resolveActiveRecipe(node.data.recipeId, node.data.settings);
    if (!recipe) continue;

    for (let idx = 0; idx < recipe.inputs.length; idx++) {
      const handleId = `${node.id}-input-${idx}`;
      resolved[handleId] = resolveHandleProduct(node.id, 'input', idx, nodesMap, edgeLookup);
    }
    for (let idx = 0; idx < recipe.outputs.length; idx++) {
      const handleId = `${node.id}-output-${idx}`;
      resolved[handleId] = resolveHandleProduct(node.id, 'output', idx, nodesMap, edgeLookup);
    }
  }

  return resolved;
}

