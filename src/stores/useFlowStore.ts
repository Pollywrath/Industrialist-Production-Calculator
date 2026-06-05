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
import {
  RECT_HEIGHT,
  RECT_GAP,
  BASE_INFO_HEIGHT,
  BOTTOM_PADDING,
  IO_COLUMN_PADDING,
  NODE_CSS_WIDTH,
} from '../components/shared/layoutConstants';
import {
  type HistoryEntry,
  type PositionHistoryEntry,
  type PositionSnapshot,
  arePositionsEqual,
  applyGraphHistoryEntry,
  applyPositionHistoryEntry,
  buildGraphHistoryEntry,
  createNodeMap,
  toPositionSnapshot,
} from './flowHistory';

const HISTORY_LIMIT = 50;

interface SetGraphOptions {
  recordHistory?: boolean;
  resetHistory?: boolean;
  visualOnly?: boolean;
}

interface FlowState {
  nodes: Node<RecipeNodeData>[];
  nodesMap: Map<string, Node<RecipeNodeData>>;
  edges: Edge[];
  graphVersion: number;
  solutionVersion: number;
  markSolutionCommitted: () => void;

  historyPast: HistoryEntry<Node<RecipeNodeData>, Edge>[];
  historyFuture: HistoryEntry<Node<RecipeNodeData>, Edge>[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  beginTransaction: () => void;
  endTransaction: () => void;
  runTransaction: (fn: () => void) => void;
  captureDragStart: (nodeIds: string[]) => void;
  commitDragStop: (nodeIds: string[]) => void;
  moveNodesFromSnapshots: (
    startPositions: Map<string, PositionSnapshot>,
    deltaX: number,
    deltaY: number,
  ) => void;
  toggleNodeSelection: (nodeId: string) => void;
  clearNodeSelection: () => void;

  onNodesChange: OnNodesChange<Node<RecipeNodeData>>;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;

  setNodes: (nodes: Node<RecipeNodeData>[], options?: SetGraphOptions) => void;
  setEdges: (edges: Edge[], options?: SetGraphOptions) => void;
  setNodesAndEdges: (
    nodes: Node<RecipeNodeData>[],
    edges: Edge[],
    options?: SetGraphOptions,
  ) => void;

  updateNodeData: (nodeId: string, data: Partial<RecipeNodeData>) => void;
  deleteNode: (nodeId: string) => void;
  deleteEdgesConnectedToHandle: (handleId: string) => void;
  deleteEdgesForHandles: (handleIds: string[]) => void;
  updateNodeDataAndDeleteEdges: (
    nodeId: string,
    data: Partial<RecipeNodeData>,
    handleIds: string[],
  ) => void;
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
  return createNodeMap(nodes);
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
      sanitizedEdges.push({ ...edge, type: 'recipe' });
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
      type: 'recipe',
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
  subscribeWithSelector<FlowState>((set, get) => {
    let isApplyingHistory = false;
    let transactionDepth = 0;
    let transactionStart: { nodes: Node<RecipeNodeData>[]; edges: Edge[] } | null = null;
    let dragStartPositions: Map<string, PositionSnapshot> | null = null;

    const pushHistoryEntry = (entry: HistoryEntry<Node<RecipeNodeData>, Edge> | null) => {
      if (!entry) return;

      set((state) => {
        const overflow = Math.max(0, state.historyPast.length - (HISTORY_LIMIT - 1));
        const trimmedPast = overflow > 0 ? state.historyPast.slice(overflow) : state.historyPast;
        const nextPast = [...trimmedPast, entry];
        return {
          historyPast: nextPast,
          historyFuture: [],
          canUndo: nextPast.length > 0,
          canRedo: false,
        };
      });
    };

    const shouldRecordHistory = (options?: SetGraphOptions): boolean =>
      !isApplyingHistory &&
      transactionDepth === 0 &&
      options?.recordHistory !== false &&
      options?.resetHistory !== true;

    const resetHistoryState = () => {
      transactionDepth = 0;
      transactionStart = null;
      dragStartPositions = null;
      set({
        historyPast: [],
        historyFuture: [],
        canUndo: false,
        canRedo: false,
      });
    };

    return {
      nodes: [],
      nodesMap: new Map(),
      edges: [],
      graphVersion: 0,
      solutionVersion: 0,
      historyPast: [],
      historyFuture: [],
      canUndo: false,
      canRedo: false,
      markSolutionCommitted: () => {
        set({ solutionVersion: get().solutionVersion + 1 });
      },

      undo: () => {
        if (isApplyingHistory) return;
        isApplyingHistory = true;
        try {
          set((state) => {
            const entry = state.historyPast[state.historyPast.length - 1];
            if (!entry) return {};

            const nextPast = state.historyPast.slice(0, -1);
            const nextFuture = [...state.historyFuture, entry];

            if (entry.kind === 'position') {
              const nextNodes = applyPositionHistoryEntry(entry, 'undo', state.nodes);
              return {
                nodes: nextNodes,
                historyPast: nextPast,
                historyFuture: nextFuture,
                canUndo: nextPast.length > 0,
                canRedo: nextFuture.length > 0,
              };
            }

            const applied = applyGraphHistoryEntry(entry, 'undo', state.nodes, state.edges);
            const nextNodesMap = createNodesMap(applied.nodes);
            return {
              nodes: applied.nodes,
              nodesMap: nextNodesMap,
              edges: applied.edges,
              graphVersion: state.graphVersion + 1,
              historyPast: nextPast,
              historyFuture: nextFuture,
              canUndo: nextPast.length > 0,
              canRedo: nextFuture.length > 0,
            };
          });
        } finally {
          isApplyingHistory = false;
        }
      },

      redo: () => {
        if (isApplyingHistory) return;
        isApplyingHistory = true;
        try {
          set((state) => {
            const entry = state.historyFuture[state.historyFuture.length - 1];
            if (!entry) return {};

            const nextFuture = state.historyFuture.slice(0, -1);
            const overflow = Math.max(0, state.historyPast.length - (HISTORY_LIMIT - 1));
            const trimmedPast = overflow > 0 ? state.historyPast.slice(overflow) : state.historyPast;
            const nextPast = [...trimmedPast, entry];

            if (entry.kind === 'position') {
              const nextNodes = applyPositionHistoryEntry(entry, 'redo', state.nodes);
              return {
                nodes: nextNodes,
                historyPast: nextPast,
                historyFuture: nextFuture,
                canUndo: nextPast.length > 0,
                canRedo: nextFuture.length > 0,
              };
            }

            const applied = applyGraphHistoryEntry(entry, 'redo', state.nodes, state.edges);
            const nextNodesMap = createNodesMap(applied.nodes);
            return {
              nodes: applied.nodes,
              nodesMap: nextNodesMap,
              edges: applied.edges,
              graphVersion: state.graphVersion + 1,
              historyPast: nextPast,
              historyFuture: nextFuture,
              canUndo: nextPast.length > 0,
              canRedo: nextFuture.length > 0,
            };
          });
        } finally {
          isApplyingHistory = false;
        }
      },

      clearHistory: () => {
        resetHistoryState();
      },

      beginTransaction: () => {
        if (isApplyingHistory) return;
        if (transactionDepth === 0) {
          const state = get();
          transactionStart = { nodes: state.nodes, edges: state.edges };
        }
        transactionDepth += 1;
      },

      endTransaction: () => {
        if (isApplyingHistory) return;
        if (transactionDepth === 0) return;
        transactionDepth -= 1;
        if (transactionDepth > 0) return;

        const start = transactionStart;
        transactionStart = null;
        if (!start) return;

        const state = get();
        pushHistoryEntry(buildGraphHistoryEntry(start.nodes, start.edges, state.nodes, state.edges));
      },

      runTransaction: (fn) => {
        get().beginTransaction();
        let didComplete = false;
        try {
          fn();
          didComplete = true;
        } finally {
          if (didComplete) {
            get().endTransaction();
          } else {
            transactionDepth = 0;
            transactionStart = null;
          }
        }
      },

      captureDragStart: (nodeIds) => {
        const uniqueIds = new Set<string>();
        for (let i = 0; i < nodeIds.length; i++) {
          uniqueIds.add(nodeIds[i]);
        }
        if (uniqueIds.size === 0) return;

        const nodesById = createNodesMap(get().nodes);
        const nextPositions = new Map<string, PositionSnapshot>();
        for (const id of uniqueIds) {
          const node = nodesById.get(id);
          if (!node) continue;
          nextPositions.set(id, toPositionSnapshot(node.position));
        }

        dragStartPositions = nextPositions.size > 0 ? nextPositions : null;
      },

      commitDragStop: (nodeIds) => {
        if (isApplyingHistory || transactionDepth > 0) {
          dragStartPositions = null;
          return;
        }

        const startPositions = dragStartPositions;
        dragStartPositions = null;
        if (!startPositions) return;

        const ids = new Set<string>();
        for (let i = 0; i < nodeIds.length; i++) {
          ids.add(nodeIds[i]);
        }
        if (ids.size === 0) {
          for (const id of startPositions.keys()) {
            ids.add(id);
          }
        }

        const nodesById = createNodesMap(get().nodes);
        const positionDiffs: PositionHistoryEntry['positions'] = [];
        for (const id of ids) {
          const start = startPositions.get(id);
          const currentNode = nodesById.get(id);
          if (!start || !currentNode) continue;

          const end = toPositionSnapshot(currentNode.position);
          if (!arePositionsEqual(start, end)) {
            positionDiffs.push({
              id,
              from: start,
              to: end,
            });
          }
        }

        if (positionDiffs.length === 0) return;
        pushHistoryEntry({
          kind: 'position',
          positions: positionDiffs,
        });
      },

      moveNodesFromSnapshots: (startPositions, deltaX, deltaY) => {
        if (startPositions.size === 0) return;

        const state = get();
        let changed = false;
        const nextNodes = new Array<Node<RecipeNodeData>>(state.nodes.length);

        for (let i = 0; i < state.nodes.length; i++) {
          const node = state.nodes[i];
          const start = startPositions.get(node.id);
          if (!start) {
            nextNodes[i] = node;
            continue;
          }

          const nextPosition = {
            x: start.x + deltaX,
            y: start.y + deltaY,
          };

          if (arePositionsEqual(toPositionSnapshot(node.position), nextPosition)) {
            nextNodes[i] = node;
            continue;
          }

          changed = true;
          nextNodes[i] = {
            ...node,
            position: nextPosition,
          };
        }

        if (!changed) return;
        set({ nodes: nextNodes });
      },

      toggleNodeSelection: (nodeId) => {
        const state = get();
        let changed = false;
        const nextNodes = new Array<Node<RecipeNodeData>>(state.nodes.length);

        for (let i = 0; i < state.nodes.length; i++) {
          const node = state.nodes[i];
          if (node.id === nodeId) {
            changed = true;
            nextNodes[i] = {
              ...node,
              data: {
                ...node.data,
                isMultiSelected: !node.data.isMultiSelected,
              },
            };
          } else {
            nextNodes[i] = node;
          }
        }

        if (!changed) return;
        set({ nodes: nextNodes });
      },

      clearNodeSelection: () => {
        const state = get();
        let changed = false;
        const nextNodes = new Array<Node<RecipeNodeData>>(state.nodes.length);

        for (let i = 0; i < state.nodes.length; i++) {
          const node = state.nodes[i];
          if (node.data.isMultiSelected) {
            changed = true;
            nextNodes[i] = {
              ...node,
              data: {
                ...node.data,
                isMultiSelected: false,
              },
            };
          } else {
            nextNodes[i] = node;
          }
        }

        if (!changed) return;
        set({ nodes: nextNodes });
      },

      onNodesChange: (changes) => {
        const state = get();
        const nextNodes = applyNodeChanges(changes, state.nodes);
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
        if (!hasStructuralChange) {
          set({
            nodes: finalNodes,
          });
          return;
        }

        const nextNodesMap = createNodesMap(finalNodes);
        set({
          nodes: finalNodes,
          nodesMap: nextNodesMap,
          graphVersion: state.graphVersion + 1,
        });

        if (!isApplyingHistory && transactionDepth === 0) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, finalNodes, state.edges));
        }
      },

      onEdgesChange: (changes) => {
        const state = get();
        const nextEdges = applyEdgeChanges(changes, state.edges);
        let hasStructuralChange = false;
        for (let i = 0; i < changes.length; i++) {
          const type = changes[i].type;
          if (type !== 'select') {
            hasStructuralChange = true;
            break;
          }
        }

        if (!hasStructuralChange) {
          set({
            edges: nextEdges,
          });
          return;
        }

        set({
          edges: nextEdges,
          graphVersion: state.graphVersion + 1,
        });

        if (!isApplyingHistory && transactionDepth === 0) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, state.nodes, nextEdges));
        }
      },

      onConnect: (connection) => {
        if (!connection.sourceHandle || !connection.targetHandle) return;
        if (!parseHandleId(connection.sourceHandle) || !parseHandleId(connection.targetHandle))
          return;

        const state = get();
        const currentEdges = state.edges;
        for (let i = 0; i < currentEdges.length; i++) {
          const e = currentEdges[i];
          if (
            e.sourceHandle === connection.sourceHandle &&
            e.targetHandle === connection.targetHandle
          ) {
            return;
          }
        }

        const newEdge = { ...connection, id: nextEdgeId(), type: 'recipe' } as Edge;
        const nextEdges = addEdge(newEdge, currentEdges);
        set({
          edges: nextEdges,
          graphVersion: state.graphVersion + 1,
        });

        if (!isApplyingHistory && transactionDepth === 0) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, state.nodes, nextEdges));
        }
      },

      setNodes: (nodes, options) => {
        clearFlowCache();
        const state = get();
        const { nodes: sanitizedNodes, edges: sanitizedEdges } = ensureGraphIntegrity(nodes, state.edges);
        const enriched = sanitizedNodes.map(enrichNodeDimensions);
        const nextNodesMap = createNodesMap(enriched);
        set({
          nodes: enriched,
          nodesMap: nextNodesMap,
          edges: sanitizedEdges,
          graphVersion: state.graphVersion + 1,
        });

        if (options?.resetHistory) {
          resetHistoryState();
          return;
        }
        if (shouldRecordHistory(options)) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, enriched, sanitizedEdges));
        }
      },

      setEdges: (edges, options) => {
        const state = get();
        const { edges: sanitizedEdges } = ensureGraphIntegrity(state.nodes, edges);

        if (options?.visualOnly) {
          set({
            edges: sanitizedEdges,
          });
        } else {
          clearFlowCache();
          set({
            edges: sanitizedEdges,
            graphVersion: state.graphVersion + 1,
          });
        }

        if (options?.resetHistory) {
          resetHistoryState();
          return;
        }
        if (shouldRecordHistory(options)) {
          pushHistoryEntry(
            buildGraphHistoryEntry(state.nodes, state.edges, state.nodes, sanitizedEdges),
          );
        }
      },

      setNodesAndEdges: (nodes, edges, options) => {
        const state = get();
        const { nodes: sanitizedNodes, edges: sanitizedEdges } = ensureGraphIntegrity(nodes, edges);
        const len = sanitizedNodes.length;
        const enriched = new Array<Node<RecipeNodeData>>(len);
        const map = new Map<string, Node<RecipeNodeData>>();
        for (let i = 0; i < len; i++) {
          const node = enrichNodeDimensions(sanitizedNodes[i]);
          enriched[i] = node;
          map.set(node.id, node);
        }
        if (options?.visualOnly) {
          set({
            nodes: enriched,
            nodesMap: map,
            edges: sanitizedEdges,
          });
        } else {
          clearFlowCache();
          set({
            nodes: enriched,
            nodesMap: map,
            edges: sanitizedEdges,
            graphVersion: state.graphVersion + 1,
          });
        }

        if (options?.resetHistory) {
          resetHistoryState();
          return;
        }
        if (shouldRecordHistory(options)) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, enriched, sanitizedEdges));
        }
      },

      updateNodeData: (nodeId, data) => {
        const state = get();
        const oldNodes = state.nodes;
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

        const nextNodesMap = new Map(state.nodesMap);
        nextNodesMap.set(nodeId, updatedNode);

        set({
          nodes: nextNodes,
          nodesMap: nextNodesMap,
          graphVersion: state.graphVersion + 1,
        });

        if (!isApplyingHistory && transactionDepth === 0) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, nextNodes, state.edges));
        }
      },

      deleteNode: (nodeId) => {
        const state = get();
        const oldNodes = state.nodes;
        const oldNodesMap = state.nodesMap;

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

        const nextEdges = state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);

        set({
          nodes: nextNodes,
          nodesMap: nextNodesMap,
          edges: nextEdges,
          graphVersion: state.graphVersion + 1,
        });

        if (!isApplyingHistory && transactionDepth === 0) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, nextNodes, nextEdges));
        }
      },

      deleteEdgesConnectedToHandle: (handleId) => {
        const state = get();
        const oldEdges = state.edges;
        const nextEdges = oldEdges.filter(
          (edge) => edge.sourceHandle !== handleId && edge.targetHandle !== handleId,
        );
        if (nextEdges.length === oldEdges.length) {
          return;
        }

        set({
          edges: nextEdges,
          graphVersion: state.graphVersion + 1,
        });

        if (!isApplyingHistory && transactionDepth === 0) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, state.nodes, nextEdges));
        }
      },

      deleteEdgesForHandles: (handleIds) => {
        if (handleIds.length === 0) return;
        const state = get();
        const oldEdges = state.edges;
        const handleIdSet = new Set(handleIds);
        const nextEdges = oldEdges.filter(
          (edge) =>
            !handleIdSet.has(edge.sourceHandle ?? '') &&
            !handleIdSet.has(edge.targetHandle ?? ''),
        );
        if (nextEdges.length === oldEdges.length) {
          return;
        }

        set({
          edges: nextEdges,
          graphVersion: state.graphVersion + 1,
        });

        if (!isApplyingHistory && transactionDepth === 0) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, state.nodes, nextEdges));
        }
      },

      updateNodeDataAndDeleteEdges: (nodeId, data, handleIds) => {
        const state = get();
        const oldNodes = state.nodes;
        const oldEdges = state.edges;

        const nextEdges =
          handleIds.length === 0
            ? oldEdges
            : oldEdges.filter(
                (edge) =>
                  !handleIds.includes(edge.sourceHandle ?? '') &&
                  !handleIds.includes(edge.targetHandle ?? ''),
              );

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

        const nextNodesMap = new Map(state.nodesMap);
        nextNodesMap.set(nodeId, updatedNode);

        const edgesChanged = nextEdges.length !== oldEdges.length;
        set({
          nodes: nextNodes,
          nodesMap: nextNodesMap,
          ...(edgesChanged ? { edges: nextEdges } : {}),
          graphVersion: state.graphVersion + 1,
        });

        if (!isApplyingHistory && transactionDepth === 0) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, nextNodes, nextEdges));
        }
      },
    };
  }),
);

export { useFlowStore };
