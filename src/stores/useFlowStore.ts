import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  addEdge,
  type Connection,
} from '@xyflow/react';
import type { RecipeNodeData } from '../types/nodes';
import { nextNodeId, nextEdgeId, parseHandleId, buildHandleId } from '../utils/idGenerator';
import { getRecipe } from '../data/lookup';
import { clearFlowCache } from '../solver/flowSolver';
import { computeResolvedProducts } from '../utils/productResolver';
import {
  RECT_HEIGHT,
  RECT_GAP,
  BASE_INFO_HEIGHT,
  BOTTOM_PADDING,
  IO_COLUMN_PADDING,
  NODE_CSS_WIDTH,
} from '../components/shared/layoutConstants';

interface FlowState {
  nodes: Node<RecipeNodeData>[];
  nodesMap: Map<string, Node<RecipeNodeData>>;
  edges: Edge[];
  solverVersion: number;
  resolvedProducts: Record<string, string>;

  onNodesChange: OnNodesChange<Node<RecipeNodeData>>;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;

  setNodes: (nodes: Node<RecipeNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  setNodesAndEdges: (nodes: Node<RecipeNodeData>[], edges: Edge[]) => void;

  updateNodeData: (nodeId: string, data: Partial<RecipeNodeData>) => void;
  deleteNode: (nodeId: string) => void;
  deleteEdgesConnectedToHandle: (handleId: string) => void;
}

const enrichNodeDimensions = (node: Node<RecipeNodeData>): Node<RecipeNodeData> => {
  const recipe = getRecipe(node.data.recipeId);
  const leftCount = node.data.inputOrder ? node.data.inputOrder.length : recipe?.inputs.length || 0;
  const rightCount = node.data.outputOrder
    ? node.data.outputOrder.length
    : recipe?.outputs.length || 0;
  const maxCount = Math.max(leftCount, rightCount, 1);

  const ioAreaHeight = maxCount * RECT_HEIGHT + (maxCount - 1) * RECT_GAP + IO_COLUMN_PADDING;
  const height = BASE_INFO_HEIGHT + ioAreaHeight + BOTTOM_PADDING;

  if (node.width === NODE_CSS_WIDTH && node.height === height) {
    return node;
  }

  return {
    ...node,
    width: NODE_CSS_WIDTH,
    height,
  };
};

const createNodesMap = (nodes: Node<RecipeNodeData>[]): Map<string, Node<RecipeNodeData>> => {
  const map = new Map<string, Node<RecipeNodeData>>();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    map.set(node.id, node);
  }
  return map;
};

const ensureGraphIntegrity = (
  nodes: Node<RecipeNodeData>[],
  edges: Edge[],
): { nodes: Node<RecipeNodeData>[]; edges: Edge[] } => {
  const seenNodeIds = new Set<string>();
  const nodeIdMap = new Map<string, string>();
  const sanitizedNodes: Node<RecipeNodeData>[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (seenNodeIds.has(node.id) || !node.id) {
      const newId = nextNodeId();
      nodeIdMap.set(node.id, newId);
      sanitizedNodes.push({ ...node, id: newId });
      seenNodeIds.add(newId);
    } else {
      sanitizedNodes.push(node);
      seenNodeIds.add(node.id);
    }
  }

  const seenEdgeIds = new Set<string>();
  const sanitizedEdges: Edge[] = [];

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];

    let finalEdgeId = edge.id;
    if (seenEdgeIds.has(finalEdgeId) || !finalEdgeId) {
      finalEdgeId = nextEdgeId();
    }
    seenEdgeIds.add(finalEdgeId);

    const newSource = nodeIdMap.get(edge.source);
    const newTarget = nodeIdMap.get(edge.target);

    if (!newSource && !newTarget && finalEdgeId === edge.id) {
      sanitizedEdges.push(edge);
      continue;
    }

    const sourceId = newSource ?? edge.source;
    const targetId = newTarget ?? edge.target;

    const sourceParsed = edge.sourceHandle ? parseHandleId(edge.sourceHandle) : null;
    const targetParsed = edge.targetHandle ? parseHandleId(edge.targetHandle) : null;

    sanitizedEdges.push({
      ...edge,
      id: finalEdgeId,
      source: sourceId,
      target: targetId,
      sourceHandle:
        sourceParsed && newSource
          ? buildHandleId(sourceId, sourceParsed.side, sourceParsed.index)
          : edge.sourceHandle,
      targetHandle:
        targetParsed && newTarget
          ? buildHandleId(targetId, targetParsed.side, targetParsed.index)
          : edge.targetHandle,
    });
  }

  return { nodes: sanitizedNodes, edges: sanitizedEdges };
};

const useFlowStore = create(
  subscribeWithSelector<FlowState>((set, get) => ({
    nodes: [],
    nodesMap: new Map(),
    edges: [],
    solverVersion: 0,
    resolvedProducts: {},

    onNodesChange: (changes) => {
      const nextNodes = applyNodeChanges(changes, get().nodes);
      let needsEnrichment = false;
      let hasStructuralChange = false;

      for (let i = 0; i < changes.length; i++) {
        const type = changes[i].type;
        if (type !== 'position' && type !== 'select') {
          needsEnrichment = true;
          if (type !== 'dimensions') {
            hasStructuralChange = true;
          }
        }
      }

      const finalNodes = needsEnrichment ? nextNodes.map(enrichNodeDimensions) : nextNodes;
      const nextNodesMap = hasStructuralChange ? createNodesMap(finalNodes) : get().nodesMap;
      const nextSolverVersion = hasStructuralChange ? get().solverVersion + 1 : get().solverVersion;

      if (hasStructuralChange) {
        set({
          nodes: finalNodes,
          nodesMap: nextNodesMap,
          solverVersion: nextSolverVersion,
          resolvedProducts: computeResolvedProducts(nextNodesMap, get().edges),
        });
      } else {
        set({
          nodes: finalNodes,
        });
      }
    },

    onEdgesChange: (changes) => {
      const nextEdges = applyEdgeChanges(changes, get().edges);
      let hasStructuralChange = false;
      for (let i = 0; i < changes.length; i++) {
        const type = changes[i].type;
        if (type !== 'select') {
          hasStructuralChange = true;
          break;
        }
      }

      if (hasStructuralChange) {
        set({
          edges: nextEdges,
          solverVersion: get().solverVersion + 1,
          resolvedProducts: computeResolvedProducts(get().nodesMap, nextEdges),
        });
      } else {
        set({
          edges: nextEdges,
        });
      }
    },

    onConnect: (connection) => {
      if (!connection.sourceHandle || !connection.targetHandle) return;
      if (!parseHandleId(connection.sourceHandle) || !parseHandleId(connection.targetHandle))
        return;

      const currentEdges = get().edges;
      for (let i = 0; i < currentEdges.length; i++) {
        const e = currentEdges[i];
        if (
          e.sourceHandle === connection.sourceHandle &&
          e.targetHandle === connection.targetHandle
        ) {
          return;
        }
      }

      const newEdge = { ...connection, id: nextEdgeId() } as Edge;
      const nextEdges = addEdge(newEdge, currentEdges);
      set({
        edges: nextEdges,
        solverVersion: get().solverVersion + 1,
        resolvedProducts: computeResolvedProducts(get().nodesMap, nextEdges),
      });
    },

    setNodes: (nodes) => {
      clearFlowCache();
      const { nodes: sanitizedNodes } = ensureGraphIntegrity(nodes, get().edges);
      const enriched = sanitizedNodes.map(enrichNodeDimensions);
      const nextNodesMap = createNodesMap(enriched);
      set({
        nodes: enriched,
        nodesMap: nextNodesMap,
        solverVersion: get().solverVersion + 1,
        resolvedProducts: computeResolvedProducts(nextNodesMap, get().edges),
      });
    },
    setEdges: (edges) => {
      clearFlowCache();
      const { edges: sanitizedEdges } = ensureGraphIntegrity(get().nodes, edges);
      set({
        edges: sanitizedEdges,
        solverVersion: get().solverVersion + 1,
        resolvedProducts: computeResolvedProducts(get().nodesMap, sanitizedEdges),
      });
    },
    setNodesAndEdges: (nodes, edges) => {
      clearFlowCache();
      const { nodes: sanitizedNodes, edges: sanitizedEdges } = ensureGraphIntegrity(nodes, edges);
      const len = sanitizedNodes.length;
      const enriched = new Array<Node<RecipeNodeData>>(len);
      const map = new Map<string, Node<RecipeNodeData>>();
      for (let i = 0; i < len; i++) {
        const node = enrichNodeDimensions(sanitizedNodes[i]);
        enriched[i] = node;
        map.set(node.id, node);
      }
      set({
        nodes: enriched,
        nodesMap: map,
        edges: sanitizedEdges,
        solverVersion: get().solverVersion + 1,
        resolvedProducts: computeResolvedProducts(map, sanitizedEdges),
      });
    },

    updateNodeData: (nodeId, data) => {
      const oldNodes = get().nodes;
      const nextNodes = new Array<Node<RecipeNodeData>>(oldNodes.length);
      let updatedNode: Node<RecipeNodeData> | null = null;

      for (let i = 0; i < oldNodes.length; i++) {
        const node = oldNodes[i];
        if (node.id === nodeId) {
          updatedNode = enrichNodeDimensions({ ...node, data: { ...node.data, ...data } });
          nextNodes[i] = updatedNode;
        } else {
          nextNodes[i] = node;
        }
      }

      if (!updatedNode) return;

      const nextNodesMap = new Map(get().nodesMap);
      nextNodesMap.set(nodeId, updatedNode);

      set({
        nodes: nextNodes,
        nodesMap: nextNodesMap,
        solverVersion: get().solverVersion + 1,
        resolvedProducts: computeResolvedProducts(nextNodesMap, get().edges),
      });
    },

    deleteNode: (nodeId) => {
      const oldNodes = get().nodes;
      const oldNodesMap = get().nodesMap;

      const nextNodesMap = new Map(oldNodesMap);
      nextNodesMap.delete(nodeId);

      const nextNodes = new Array<Node<RecipeNodeData>>(Math.max(0, oldNodes.length - 1));
      let idx = 0;
      for (let i = 0; i < oldNodes.length; i++) {
        const node = oldNodes[i];
        if (node.id !== nodeId) {
          nextNodes[idx++] = node;
        }
      }

      const nextEdges = get().edges.filter((e) => e.source !== nodeId && e.target !== nodeId);

      set({
        nodes: nextNodes,
        nodesMap: nextNodesMap,
        edges: nextEdges,
        solverVersion: get().solverVersion + 1,
        resolvedProducts: computeResolvedProducts(nextNodesMap, nextEdges),
      });
    },

    deleteEdgesConnectedToHandle: (handleId) => {
      const oldEdges = get().edges;
      const nextEdges = oldEdges.filter(
        (edge) => edge.sourceHandle !== handleId && edge.targetHandle !== handleId,
      );
      if (nextEdges.length !== oldEdges.length) {
        set({
          edges: nextEdges,
          solverVersion: get().solverVersion + 1,
          resolvedProducts: computeResolvedProducts(get().nodesMap, nextEdges),
        });
      }
    },
  })),
);

export { useFlowStore };
