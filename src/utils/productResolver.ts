import type { ReactFlowNode, ReactFlowEdge } from '../types/solver';
import type { HandleDataType } from '../types/data';
import { getProduct, resolveActiveRecipe } from '../data/lookup';
import {
  getRecipeEntryHandleType,
  productTypeToHandleDataType,
} from './handleTypes';
import { parseHandleId, buildHandleId } from './idGenerator';

export type EdgeLookupMap = Map<string, ReactFlowEdge[]>;

let lastEdges: ReactFlowEdge[] | null = null;
let lastLookup: EdgeLookupMap | null = null;

export function buildEdgeLookupMap(edges: ReactFlowEdge[]): EdgeLookupMap {
  if (edges === lastEdges && lastLookup) {
    return lastLookup;
  }
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
  cache: Map<string, string> = new Map(),
  globalSettings?: Record<string, unknown>,
): string {
  const handleId = buildHandleId(nodeId, side, index);
  if (visited.has(handleId)) {
    return '';
  }

  const cached = cache.get(handleId);
  if (cached !== undefined) {
    return cached;
  }

  visited.add(handleId);

  const node = nodesMap.get(nodeId);
  if (!node) return '';

  const edgeLookup =
    edgesOrLookup instanceof Map ? edgesOrLookup : buildEdgeLookupMap(edgesOrLookup);

  const resolveFromConnectedHandles = (s: 'input' | 'output', idx: number): string => {
    const currentHandleId = buildHandleId(nodeId, s, idx);
    const connectedEdges = edgeLookup.get(currentHandleId) ?? [];

    for (let i = 0; i < connectedEdges.length; i++) {
      const edge = connectedEdges[i];
      const otherNodeId = s === 'input' ? edge.source : edge.target;
      const otherHandleId = s === 'input' ? edge.sourceHandle : edge.targetHandle;
      if (!otherHandleId) continue;

      const parsed = parseHandleId(otherHandleId);
      if (!parsed) continue;

      const resolved = resolveHandleProduct(
        otherNodeId,
        parsed.side,
        parsed.index,
        nodesMap,
        edgeLookup,
        new Set(visited),
        cache,
        globalSettings,
      );

      if (resolved && resolved !== 'any_fluid' && resolved !== 'any_item') {
        return resolved;
      }
    }

    return '';
  };

  const helpers = {
    resolveProduct: (s: 'input' | 'output', idx: number) => {
      const requestedHandleId = buildHandleId(nodeId, s, idx);
      if (requestedHandleId === handleId) {
        return resolveFromConnectedHandles(s, idx);
      }
      return resolveHandleProduct(nodeId, s, idx, nodesMap, edgeLookup, visited, cache, globalSettings);
    },
    hasConnection: (s: 'input' | 'output', idx: number) => {
      const hId = buildHandleId(nodeId, s, idx);
      return (edgeLookup.get(hId)?.length ?? 0) > 0;
    },
  };
  const recipe = resolveActiveRecipe(node.data.recipeId, node.data.settings, nodeId, helpers, {
    suppressStoreTemperatureOverrides: true,
    globalSettings,
  });
  if (!recipe) return '';

  const list = side === 'input' ? recipe.inputs : recipe.outputs;
  const entry = list[index];
  if (!entry) return '';

  const baseProductId = entry.product_id;
  if (baseProductId !== 'any_fluid' && baseProductId !== 'any_item') {
    cache.set(handleId, baseProductId);
    return baseProductId;
  }

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
      cache,
      globalSettings,
    );

    if (resolved && resolved !== 'any_fluid' && resolved !== 'any_item') {
      cache.set(handleId, resolved);
      return resolved;
    }
  }

  cache.set(handleId, baseProductId);
  return baseProductId;
}

export function resolveHandleType(
  nodeId: string,
  side: 'input' | 'output',
  index: number,
  nodesMap: Map<string, ReactFlowNode>,
  edgesOrLookup: ReactFlowEdge[] | EdgeLookupMap,
  productCache: Map<string, string> = new Map(),
  globalSettings?: Record<string, unknown>,
): HandleDataType | '' {
  const node = nodesMap.get(nodeId);
  if (!node) return '';

  const edgeLookup =
    edgesOrLookup instanceof Map ? edgesOrLookup : buildEdgeLookupMap(edgesOrLookup);
  const helpers = {
    resolveProduct: (s: 'input' | 'output', idx: number) =>
      resolveHandleProduct(
        nodeId,
        s,
        idx,
        nodesMap,
        edgeLookup,
        new Set(),
        productCache,
        globalSettings,
      ),
    hasConnection: (s: 'input' | 'output', idx: number) => {
      const hId = buildHandleId(nodeId, s, idx);
      return (edgeLookup.get(hId)?.length ?? 0) > 0;
    },
  };
  const recipe = resolveActiveRecipe(node.data.recipeId, node.data.settings, nodeId, helpers, {
    suppressStoreTemperatureOverrides: true,
    globalSettings,
  });
  const list = side === 'input' ? recipe?.inputs : recipe?.outputs;
  const entry = list?.[index];
  const override = getRecipeEntryHandleType(entry);
  if (override) return override;

  const productId = resolveHandleProduct(
    nodeId,
    side,
    index,
    nodesMap,
    edgeLookup,
    new Set(),
    productCache,
    globalSettings,
  );
  const product = getProduct(productId || entry?.product_id || '');
  return productTypeToHandleDataType(product?.type) ?? '';
}

export function computeResolvedProducts(
  nodesMap: Map<string, ReactFlowNode>,
  edges: ReactFlowEdge[],
  globalSettings?: Record<string, unknown>,
): Record<string, string> {
  const edgeLookup = buildEdgeLookupMap(edges);
  const resolved: Record<string, string> = {};
  const cache = new Map<string, string>();

  for (const node of nodesMap.values()) {
    const helpers = {
      resolveProduct: (s: 'input' | 'output', idx: number) =>
        resolveHandleProduct(node.id, s, idx, nodesMap, edgeLookup, new Set(), cache, globalSettings),
      hasConnection: (s: 'input' | 'output', idx: number) => {
        const hId = buildHandleId(node.id, s, idx);
        return (edgeLookup.get(hId)?.length ?? 0) > 0;
      },
    };
    const recipe = resolveActiveRecipe(node.data.recipeId, node.data.settings, node.id, helpers, {
      suppressStoreTemperatureOverrides: true,
      globalSettings,
    });
    if (!recipe) continue;

    for (let idx = 0; idx < recipe.inputs.length; idx++) {
      const handleId = buildHandleId(node.id, 'input', idx);
      resolved[handleId] = resolveHandleProduct(node.id, 'input', idx, nodesMap, edgeLookup, new Set(), cache, globalSettings);
    }
    for (let idx = 0; idx < recipe.outputs.length; idx++) {
      const handleId = buildHandleId(node.id, 'output', idx);
      resolved[handleId] = resolveHandleProduct(node.id, 'output', idx, nodesMap, edgeLookup, new Set(), cache, globalSettings);
    }
  }

  return resolved;
}
