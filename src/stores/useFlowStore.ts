import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
} from '@xyflow/react';
import { isGroupNode, isRecipeNode } from '../types/nodes';
import type {
  CanvasNode,
  GroupNodeData,
  GroupNodeType,
  RecipeNodeData,
  RecipeNodeType,
} from '../types/nodes';
import { nextNodeId, nextEdgeId, parseHandleId, buildHandleId } from '../utils/idGenerator';
import { getProductName, getRecipe } from '../data/lookup';
import { clearFlowCache } from '../solver/flowSolver';
import {
  buildEdgeLookupMap,
  resolveHandleProduct,
  resolveHandleType,
} from '../utils/productResolver';
import {
  RECT_HEIGHT,
  RECT_GAP,
  BASE_INFO_HEIGHT,
  BOTTOM_PADDING,
  IO_COLUMN_PADDING,
  NODE_CSS_WIDTH,
} from '../components/shared/layoutConstants';
import {
  EMPTY_GROUP_HEIGHT,
  EMPTY_GROUP_WIDTH,
  computeGroupBoundsByGroupId,
  computeBoundsFromMembers,
  getRecipeMemberBounds,
  getCollapsedGroupHeight,
} from '../utils/groupBounds';
import type { GroupMemberBounds } from '../utils/groupBounds';
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
const GROUP_NODE_Z_INDEX = 0;
const EDGE_Z_INDEX = 1;
const RECIPE_NODE_MIN_Z_INDEX = 2;

interface SetGraphOptions {
  recordHistory?: boolean;
  resetHistory?: boolean;
  visualOnly?: boolean;
}

interface FlowState {
  nodes: CanvasNode[];
  nodesMap: Map<string, CanvasNode>;
  groupMemberIds: Record<string, string[]>;
  edges: Edge[];
  graphVersion: number;
  solutionVersion: number;
  markSolutionCommitted: () => void;

  historyPast: HistoryEntry<CanvasNode, Edge>[];
  historyFuture: HistoryEntry<CanvasNode, Edge>[];
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
  createGroupFromSelection: () => string | null;

  onNodesChange: OnNodesChange<CanvasNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;

  setNodes: (nodes: CanvasNode[], options?: SetGraphOptions) => void;
  setEdges: (edges: Edge[], options?: SetGraphOptions) => void;
  setNodesAndEdges: (
    nodes: CanvasNode[],
    edges: Edge[],
    options?: SetGraphOptions,
  ) => void;
  applyAutoLayoutResult: (
    nodes: CanvasNode[],
    edges: Edge[],
    expectedGraphVersion: number,
  ) => boolean;

  updateNodeData: (nodeId: string, data: Partial<RecipeNodeData>) => void;
  updateGroupNodeData: (
    nodeId: string,
    data: Partial<GroupNodeData>,
    options?: { recordHistory?: boolean },
  ) => void;
  collapseGroup: (groupId: string) => void;
  expandGroup: (groupId: string) => void;
  deleteNode: (nodeId: string) => void;
  deleteEdgesConnectedToHandle: (handleId: string) => void;
  deleteEdgesForHandles: (handleIds: string[]) => void;
  updateNodeDataAndDeleteEdges: (
    nodeId: string,
    data: Partial<RecipeNodeData>,
    handleIds: string[],
  ) => void;
}

const enrichRecipeNodeDimensions = (node: RecipeNodeType): RecipeNodeType => {
  const recipe = getRecipe(node.data.recipeId);
  const leftCount = node.data.inputOrder ? node.data.inputOrder.length : recipe?.inputs.length || 0;
  const rightCount = node.data.outputOrder
    ? node.data.outputOrder.length
    : recipe?.outputs.length || 0;
  const maxCount = Math.max(leftCount, rightCount, 1);

  const ioAreaHeight = maxCount * RECT_HEIGHT + (maxCount - 1) * RECT_GAP + IO_COLUMN_PADDING;
  const height = BASE_INFO_HEIGHT + ioAreaHeight + BOTTOM_PADDING;
  const zIndex = Math.max(node.zIndex ?? RECIPE_NODE_MIN_Z_INDEX, RECIPE_NODE_MIN_Z_INDEX);

  if (node.width === NODE_CSS_WIDTH && node.height === height && node.zIndex === zIndex) {
    return node;
  }

  return {
    ...node,
    width: NODE_CSS_WIDTH,
    height,
    zIndex,
  };
};

const prepareGroupNode = (node: GroupNodeType): GroupNodeType => {
  const isCollapsed = !!node.data.collapsed;
  const width = isCollapsed ? NODE_CSS_WIDTH : (node.width ?? EMPTY_GROUP_WIDTH);
  const height = isCollapsed
    ? getCollapsedGroupHeight(
      node.data.inputProxyHandleIds.length,
      node.data.outputProxyHandleIds.length,
    )
    : (node.height ?? EMPTY_GROUP_HEIGHT);

  if (
    node.connectable === isCollapsed &&
    node.draggable === true &&
    node.selectable === false &&
    node.zIndex === GROUP_NODE_Z_INDEX &&
    node.width === width &&
    node.height === height
  ) {
    return node;
  }

  return {
    ...node,
    connectable: isCollapsed,
    draggable: true,
    height,
    selectable: false,
    width,
    zIndex: GROUP_NODE_Z_INDEX,
  };
};

const normalizeRecipeEdgeLayer = (edge: Edge): Edge => {
  if (edge.type === 'recipe' && edge.zIndex === EDGE_Z_INDEX) {
    return edge;
  }

  return {
    ...edge,
    type: 'recipe',
    zIndex: EDGE_Z_INDEX,
  };
};

const prepareRecipeEdge = (edge: Edge, hidden: boolean | undefined): Edge => {
  if (edge.type === 'recipe' && edge.zIndex === EDGE_Z_INDEX && edge.hidden === hidden) {
    return edge;
  }

  return {
    ...edge,
    hidden,
    type: 'recipe',
    zIndex: EDGE_Z_INDEX,
  };
};

const stripRouteData = (data: Edge['data']): Record<string, unknown> => {
  const nextData = { ...(data as Record<string, unknown> | undefined) };
  delete nextData.orthogonalTurns;
  delete nextData.controlPoints;
  return nextData;
};

const PLACEHOLDER_PRODUCT_IDS = new Set(['any_fluid', 'any_item']);

const filterCompatibleRecipeEdges = (nodes: CanvasNode[], edges: Edge[]): Edge[] => {
  const recipeNodes = nodes.filter(isRecipeNode);
  const recipeNodeIds = new Set(recipeNodes.map((node) => node.id));
  const nodesMap = new Map(recipeNodes.map((node) => [node.id, node]));
  const recipeEdges = edges.filter(
    (edge) =>
      !edge.id.startsWith('proxy-') &&
      recipeNodeIds.has(edge.source) &&
      recipeNodeIds.has(edge.target),
  );
  if (recipeEdges.length === 0) return edges;

  const edgeLookup = buildEdgeLookupMap(recipeEdges);
  const productCache = new Map<string, string>();
  const removedEdgeIds = new Set<string>();

  for (let i = 0; i < recipeEdges.length; i++) {
    const edge = recipeEdges[i];
    if (!edge.sourceHandle || !edge.targetHandle) {
      removedEdgeIds.add(edge.id);
      removedEdgeIds.add(`proxy-${edge.id}`);
      continue;
    }

    const sourceParsed = parseHandleId(edge.sourceHandle);
    const targetParsed = parseHandleId(edge.targetHandle);
    if (
      !sourceParsed ||
      !targetParsed ||
      sourceParsed.side !== 'output' ||
      targetParsed.side !== 'input'
    ) {
      removedEdgeIds.add(edge.id);
      removedEdgeIds.add(`proxy-${edge.id}`);
      continue;
    }

    const sourceProductId = resolveHandleProduct(
      edge.source,
      'output',
      sourceParsed.index,
      nodesMap,
      edgeLookup,
      new Set(),
      productCache,
    );
    const targetProductId = resolveHandleProduct(
      edge.target,
      'input',
      targetParsed.index,
      nodesMap,
      edgeLookup,
      new Set(),
      productCache,
    );
    const sourceHandleType = resolveHandleType(
      edge.source,
      'output',
      sourceParsed.index,
      nodesMap,
      edgeLookup,
      productCache,
    );
    const targetHandleType = resolveHandleType(
      edge.target,
      'input',
      targetParsed.index,
      nodesMap,
      edgeLookup,
      productCache,
    );

    const isTypeCompatible =
      !!sourceHandleType && !!targetHandleType && sourceHandleType === targetHandleType;
    const isProductCompatible =
      !!sourceProductId &&
      !!targetProductId &&
      (sourceProductId === targetProductId ||
        PLACEHOLDER_PRODUCT_IDS.has(sourceProductId) ||
        PLACEHOLDER_PRODUCT_IDS.has(targetProductId));

    if (!isTypeCompatible || !isProductCompatible) {
      removedEdgeIds.add(edge.id);
      removedEdgeIds.add(`proxy-${edge.id}`);
    }
  }

  if (removedEdgeIds.size === 0) return edges;
  return edges.filter((edge) => !removedEdgeIds.has(edge.id));
};

const syncProxyEdges = (nodes: CanvasNode[], edges: Edge[]): Edge[] => {
  const recipeNodes = nodes.filter(isRecipeNode);
  const recipeNodeMap = new Map(recipeNodes.map((rn) => [rn.id, rn]));
  const groupNodes = nodes.filter(isGroupNode);
  const groupNodeMap = new Map(groupNodes.map((gn) => [gn.id, gn]));
  const existingProxyEdgeMap = new Map<string, Edge>();

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (edge.id.startsWith('proxy-')) {
      existingProxyEdgeMap.set(edge.id, edge);
    }
  }

  const realEdges: Edge[] = [];
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (edge.id.startsWith('proxy-')) continue;
    if (!recipeNodeMap.has(edge.source) || !recipeNodeMap.has(edge.target)) continue;

    const sourceNode = recipeNodeMap.get(edge.source);
    const targetNode = recipeNodeMap.get(edge.target);
    const isHidden = !!(sourceNode?.hidden || targetNode?.hidden);
    realEdges.push(prepareRecipeEdge(edge, isHidden ? true : undefined));
  }

  const nextEdges = [...realEdges];
  const proxyEdges: Edge[] = [];

  for (let i = 0; i < realEdges.length; i++) {
    const edge = realEdges[i];
    if (!edge.hidden) continue;

    const sourceNode = recipeNodeMap.get(edge.source);
    const targetNode = recipeNodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const sourceGroupId = sourceNode.data.groupId;
    const targetGroupId = targetNode.data.groupId;
    if (sourceGroupId && sourceGroupId === targetGroupId) continue;

    const sourceGroup = sourceGroupId ? groupNodeMap.get(sourceGroupId) : null;
    const targetGroup = targetGroupId ? groupNodeMap.get(targetGroupId) : null;

    const isSourceCollapsed = !!sourceGroup?.data.collapsed;
    const isTargetCollapsed = !!targetGroup?.data.collapsed;

    if (isSourceCollapsed || isTargetCollapsed) {
      const isSourceReady = !isSourceCollapsed || !!sourceGroup?.data.handlesReady;
      const isTargetReady = !isTargetCollapsed || !!targetGroup?.data.handlesReady;

      if (!isSourceReady || !isTargetReady) {
        continue;
      }

      let finalSource = edge.source;
      let finalSourceHandle = edge.sourceHandle;
      let finalTarget = edge.target;
      let finalTargetHandle = edge.targetHandle;

      let sourceMapped = !isSourceCollapsed;
      let targetMapped = !isTargetCollapsed;

      if (isSourceCollapsed && sourceGroupId && sourceGroup) {
        const index = sourceGroup.data.outputProxyHandleIds.indexOf(edge.sourceHandle!);
        if (index !== -1) {
          finalSource = sourceGroupId;
          finalSourceHandle = buildHandleId(sourceGroupId, 'output', index);
          sourceMapped = true;
        }
      }

      if (isTargetCollapsed && targetGroupId && targetGroup) {
        const index = targetGroup.data.inputProxyHandleIds.indexOf(edge.targetHandle!);
        if (index !== -1) {
          finalTarget = targetGroupId;
          finalTargetHandle = buildHandleId(targetGroupId, 'input', index);
          targetMapped = true;
        }
      }

      if (sourceMapped && targetMapped && (finalSource !== edge.source || finalTarget !== edge.target)) {
        const proxyId = `proxy-${edge.id}`;
        const existingProxyEdge = existingProxyEdgeMap.get(proxyId);
        const proxyEndpointsUnchanged =
          !!existingProxyEdge &&
          existingProxyEdge.source === finalSource &&
          existingProxyEdge.sourceHandle === finalSourceHandle &&
          existingProxyEdge.target === finalTarget &&
          existingProxyEdge.targetHandle === finalTargetHandle;
        const nextData = proxyEndpointsUnchanged
          ? { ...(existingProxyEdge.data as Record<string, unknown> | undefined) }
          : existingProxyEdge
            ? stripRouteData(edge.data)
            : { ...(edge.data as Record<string, unknown> | undefined) };
        proxyEdges.push({
          id: proxyId,
          type: 'recipe',
          zIndex: EDGE_Z_INDEX,
          source: finalSource,
          sourceHandle: finalSourceHandle,
          target: finalTarget,
          targetHandle: finalTargetHandle,
          data: nextData,
        });
      }
    }
  }

  nextEdges.push(...proxyEdges);
  return nextEdges;
};

const enrichNodeDimensions = (node: CanvasNode): CanvasNode => {
  return isRecipeNode(node) ? enrichRecipeNodeDimensions(node) : prepareGroupNode(node);
};

const createNodesMap = (nodes: CanvasNode[]): Map<string, CanvasNode> => {
  return createNodeMap(nodes);
};

const createGroupMemberIds = (nodes: readonly CanvasNode[]): Record<string, string[]> => {
  const groupMemberIds: Record<string, string[]> = {};

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!isRecipeNode(node) || !node.data.groupId) continue;

    const members = groupMemberIds[node.data.groupId] ?? [];
    members.push(node.id);
    groupMemberIds[node.data.groupId] = members;
  }

  return groupMemberIds;
};

const createNodeIndexes = (
  nodes: CanvasNode[],
): { nodesMap: Map<string, CanvasNode>; groupMemberIds: Record<string, string[]> } => ({
  nodesMap: createNodesMap(nodes),
  groupMemberIds: createGroupMemberIds(nodes),
});

const clearTransientNodeSelectionState = (nodes: CanvasNode[]): CanvasNode[] => {
  let changed = false;
  const nextNodes = new Array<CanvasNode>(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const hasFlowSelection = node.selected === true;
    const hasMultiSelection = isRecipeNode(node) && node.data.isMultiSelected === true;

    if (!hasFlowSelection && !hasMultiSelection) {
      nextNodes[i] = node;
      continue;
    }

    changed = true;
    if (isRecipeNode(node)) {
      nextNodes[i] = {
        ...node,
        selected: false,
        data: {
          ...node.data,
          isMultiSelected: false,
        },
      };
    } else {
      nextNodes[i] = {
        ...node,
        selected: false,
      };
    }
  }

  return changed ? nextNodes : nodes;
};

const collectGroupNodeIds = (nodes: readonly CanvasNode[]): Set<string> => {
  const groupIds = new Set<string>();
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (isGroupNode(node)) {
      groupIds.add(node.id);
    }
  }
  return groupIds;
};

const collectRecipeGroupIdsForNodeIds = (
  nodes: readonly CanvasNode[],
  nodeIds: ReadonlySet<string>,
): Set<string> => {
  const groupIds = new Set<string>();
  if (nodeIds.size === 0) return groupIds;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!nodeIds.has(node.id) || !isRecipeNode(node) || !node.data.groupId) continue;
    groupIds.add(node.data.groupId);
  }

  return groupIds;
};

const applyGroupBoundsForGroups = (
  nodes: readonly CanvasNode[],
  groupIds: ReadonlySet<string>,
): CanvasNode[] => {
  if (groupIds.size === 0) return nodes as CanvasNode[];

  const boundsByGroupId = computeGroupBoundsByGroupId(nodes, groupIds);
  let changed = false;
  const nextNodes = new Array<CanvasNode>(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!isGroupNode(node) || !groupIds.has(node.id)) {
      nextNodes[i] = node;
      continue;
    }

    const isCollapsed = !!node.data.collapsed;
    const bounds = isCollapsed ? undefined : boundsByGroupId.get(node.id);
    const nextPosition = bounds ? { x: bounds.x, y: bounds.y } : node.position;
    const nextWidth = isCollapsed ? NODE_CSS_WIDTH : (bounds?.width ?? node.width ?? EMPTY_GROUP_WIDTH);
    const nextHeight = isCollapsed
      ? getCollapsedGroupHeight(
        node.data.inputProxyHandleIds.length,
        node.data.outputProxyHandleIds.length,
      )
      : (bounds?.height ?? node.height ?? EMPTY_GROUP_HEIGHT);

    if (
      node.connectable === isCollapsed &&
      node.draggable === true &&
      node.selectable === false &&
      node.zIndex === GROUP_NODE_Z_INDEX &&
      node.width === nextWidth &&
      node.height === nextHeight &&
      arePositionsEqual(toPositionSnapshot(node.position), nextPosition)
    ) {
      nextNodes[i] = node;
      continue;
    }

    changed = true;
    nextNodes[i] = {
      ...node,
      connectable: isCollapsed,
      draggable: true,
      height: nextHeight,
      position: nextPosition,
      selectable: false,
      width: nextWidth,
      zIndex: GROUP_NODE_Z_INDEX,
    };
  }

  return changed ? nextNodes : (nodes as CanvasNode[]);
};

const syncAllGroupBounds = (nodes: CanvasNode[]): CanvasNode[] => {
  return applyGroupBoundsForGroups(nodes, collectGroupNodeIds(nodes));
};

const ensureGraphIntegrity = (
  nodes: CanvasNode[],
  edges: Edge[],
): { nodes: CanvasNode[]; edges: Edge[] } => {
  const seenNodeIds = new Set<string>();
  const nodeIdMap = new Map<string, string>();
  const sanitizedNodes: CanvasNode[] = [];

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
      sanitizedEdges.push(normalizeRecipeEdgeLayer(edge));
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
      zIndex: EDGE_Z_INDEX,
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

const areNumberArraysEqual = (
  a: readonly number[] | undefined,
  b: readonly number[] | undefined,
): boolean => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const areStringArraysEqual = (a: readonly string[], b: readonly string[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const patchCommonAutoLayoutNodeFields = <T extends CanvasNode>(
  currentNode: T,
  layoutNode: CanvasNode,
): T => {
  let nextNode = currentNode;

  if (!arePositionsEqual(toPositionSnapshot(currentNode.position), layoutNode.position)) {
    nextNode = {
      ...nextNode,
      position: layoutNode.position,
    };
  }

  if (layoutNode.width !== undefined && currentNode.width !== layoutNode.width) {
    nextNode = {
      ...nextNode,
      width: layoutNode.width,
    };
  }

  if (layoutNode.height !== undefined && currentNode.height !== layoutNode.height) {
    nextNode = {
      ...nextNode,
      height: layoutNode.height,
    };
  }

  return nextNode;
};

const patchNodeWithAutoLayoutResult = (
  currentNode: CanvasNode,
  layoutNode: CanvasNode,
): CanvasNode => {
  if (isRecipeNode(currentNode) && isRecipeNode(layoutNode)) {
    const commonNode = patchCommonAutoLayoutNodeFields(currentNode, layoutNode);
    const shouldPatchInputOrder = !areNumberArraysEqual(
      currentNode.data.inputOrder,
      layoutNode.data.inputOrder,
    );
    const shouldPatchOutputOrder = !areNumberArraysEqual(
      currentNode.data.outputOrder,
      layoutNode.data.outputOrder,
    );

    if (!shouldPatchInputOrder && !shouldPatchOutputOrder) return commonNode;

    return {
      ...commonNode,
      data: {
        ...commonNode.data,
        inputOrder: layoutNode.data.inputOrder,
        outputOrder: layoutNode.data.outputOrder,
      },
    };
  }

  if (isGroupNode(currentNode) && isGroupNode(layoutNode)) {
    const commonNode = patchCommonAutoLayoutNodeFields(currentNode, layoutNode);
    const shouldPatchInputProxyIds = !areStringArraysEqual(
      currentNode.data.inputProxyHandleIds,
      layoutNode.data.inputProxyHandleIds,
    );
    const shouldPatchOutputProxyIds = !areStringArraysEqual(
      currentNode.data.outputProxyHandleIds,
      layoutNode.data.outputProxyHandleIds,
    );

    if (!shouldPatchInputProxyIds && !shouldPatchOutputProxyIds) return commonNode;

    return {
      ...commonNode,
      data: {
        ...commonNode.data,
        inputProxyHandleIds: layoutNode.data.inputProxyHandleIds,
        outputProxyHandleIds: layoutNode.data.outputProxyHandleIds,
      },
    };
  }

  return patchCommonAutoLayoutNodeFields(currentNode, layoutNode);
};

const patchEdgeWithAutoLayoutResult = (currentEdge: Edge, layoutEdge: Edge): Edge => {
  const layoutData = layoutEdge.data as Record<string, unknown> | undefined;
  if (!layoutData) return currentEdge;

  const currentData = currentEdge.data as Record<string, unknown> | undefined;
  const nextData: Record<string, unknown> = {
    ...(currentData ?? {}),
  };
  let changed = false;

  if ('orthogonalTurns' in layoutData && nextData.orthogonalTurns !== layoutData.orthogonalTurns) {
    nextData.orthogonalTurns = layoutData.orthogonalTurns;
    changed = true;
  } else if (!('orthogonalTurns' in layoutData) && 'orthogonalTurns' in nextData) {
    delete nextData.orthogonalTurns;
    changed = true;
  }

  if ('controlPoints' in layoutData && nextData.controlPoints !== layoutData.controlPoints) {
    nextData.controlPoints = layoutData.controlPoints;
    changed = true;
  } else if (!('controlPoints' in layoutData) && 'controlPoints' in nextData) {
    delete nextData.controlPoints;
    changed = true;
  }

  if (!changed) return currentEdge;

  return {
    ...currentEdge,
    data: nextData,
    type: layoutEdge.type ?? currentEdge.type,
  };
};

const removeProxyHandleIdsForNode = (handleIds: string[], nodeId: string): string[] => {
  let changed = false;
  const nextHandleIds: string[] = [];

  for (let i = 0; i < handleIds.length; i++) {
    const handleId = handleIds[i];
    const parsed = parseHandleId(handleId);
    if (parsed?.nodeId === nodeId) {
      changed = true;
      continue;
    }
    nextHandleIds.push(handleId);
  }

  return changed ? nextHandleIds : handleIds;
};

const addUniqueHandleId = (handleIds: string[], handleId: string | null | undefined): void => {
  if (!handleId || handleIds.includes(handleId)) return;
  handleIds.push(handleId);
};

const buildGroupLabelFromExternalOutputs = (
  selectedIds: ReadonlySet<string>,
  nodes: readonly CanvasNode[],
  edges: readonly Edge[],
): string => {
  const recipeNodes = nodes.filter(isRecipeNode);
  const recipeNodeMap = new Map(recipeNodes.map((node) => [node.id, node]));
  const recipeEdges = edges.filter(
    (edge) =>
      !edge.id.startsWith('proxy-') &&
      recipeNodeMap.has(edge.source) &&
      recipeNodeMap.has(edge.target),
  );
  if (recipeEdges.length === 0) return 'Group';

  const edgeLookup = buildEdgeLookupMap(recipeEdges);
  const productCache = new Map<string, string>();
  const productIds: string[] = [];
  const seenProductIds = new Set<string>();

  for (let i = 0; i < recipeEdges.length; i++) {
    const edge = recipeEdges[i];
    if (!selectedIds.has(edge.source) || selectedIds.has(edge.target)) continue;
    if (!edge.sourceHandle) continue;

    const sourceParsed = parseHandleId(edge.sourceHandle);
    if (!sourceParsed || sourceParsed.side !== 'output') continue;

    const productId = resolveHandleProduct(
      edge.source,
      'output',
      sourceParsed.index,
      recipeNodeMap,
      edgeLookup,
      new Set(),
      productCache,
    );
    if (!productId || PLACEHOLDER_PRODUCT_IDS.has(productId) || seenProductIds.has(productId)) {
      continue;
    }

    seenProductIds.add(productId);
    productIds.push(productId);
  }

  if (productIds.length === 0) return 'Group';
  return productIds.map((productId) => getProductName(productId)).join(', ');
};

const useFlowStore = create(
  subscribeWithSelector<FlowState>((set, get) => {
    let isApplyingHistory = false;
    let transactionDepth = 0;
    let transactionStart: { nodes: CanvasNode[]; edges: Edge[] } | null = null;
    let dragStartPositions: Map<string, PositionSnapshot> | null = null;

    const pushHistoryEntry = (entry: HistoryEntry<CanvasNode, Edge> | null) => {
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
      groupMemberIds: {},
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
              const nextNodes = syncAllGroupBounds(
                clearTransientNodeSelectionState(
                  applyPositionHistoryEntry(entry, 'undo', state.nodes),
                ),
              );
              const nextIndexes = createNodeIndexes(nextNodes);
              return {
                nodes: nextNodes,
                nodesMap: nextIndexes.nodesMap,
                groupMemberIds: nextIndexes.groupMemberIds,
                historyPast: nextPast,
                historyFuture: nextFuture,
                canUndo: nextPast.length > 0,
                canRedo: nextFuture.length > 0,
              };
            }

            const applied = applyGraphHistoryEntry(entry, 'undo', state.nodes, state.edges);
            const nextNodes = syncAllGroupBounds(clearTransientNodeSelectionState(applied.nodes));
            const nextIndexes = createNodeIndexes(nextNodes);
            return {
              nodes: nextNodes,
              nodesMap: nextIndexes.nodesMap,
              groupMemberIds: nextIndexes.groupMemberIds,
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
              const nextNodes = syncAllGroupBounds(
                clearTransientNodeSelectionState(
                  applyPositionHistoryEntry(entry, 'redo', state.nodes),
                ),
              );
              const nextIndexes = createNodeIndexes(nextNodes);
              return {
                nodes: nextNodes,
                nodesMap: nextIndexes.nodesMap,
                groupMemberIds: nextIndexes.groupMemberIds,
                historyPast: nextPast,
                historyFuture: nextFuture,
                canUndo: nextPast.length > 0,
                canRedo: nextFuture.length > 0,
              };
            }

            const applied = applyGraphHistoryEntry(entry, 'redo', state.nodes, state.edges);
            const nextNodes = syncAllGroupBounds(clearTransientNodeSelectionState(applied.nodes));
            const nextIndexes = createNodeIndexes(nextNodes);
            return {
              nodes: nextNodes,
              nodesMap: nextIndexes.nodesMap,
              groupMemberIds: nextIndexes.groupMemberIds,
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

        const stateBeforeBoundsCommit = get();
        const affectedGroupIds = collectRecipeGroupIdsForNodeIds(
          stateBeforeBoundsCommit.nodes,
          ids,
        );
        if (affectedGroupIds.size > 0) {
          const boundedNodes = applyGroupBoundsForGroups(
            stateBeforeBoundsCommit.nodes,
            affectedGroupIds,
          );
          if (boundedNodes !== stateBeforeBoundsCommit.nodes) {
            const boundedIndexes = createNodeIndexes(boundedNodes);
            set({
              nodes: boundedNodes,
              nodesMap: boundedIndexes.nodesMap,
              groupMemberIds: boundedIndexes.groupMemberIds,
            });
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
        const nextNodes = new Array<CanvasNode>(state.nodes.length);

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
        const nextNodes = new Array<CanvasNode>(state.nodes.length);

        for (let i = 0; i < state.nodes.length; i++) {
          const node = state.nodes[i];
          if (node.id === nodeId && isRecipeNode(node) && !node.data.groupId) {
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
        const nextNodes = new Array<CanvasNode>(state.nodes.length);

        for (let i = 0; i < state.nodes.length; i++) {
          const node = state.nodes[i];
          if (isRecipeNode(node) && node.data.isMultiSelected) {
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

      createGroupFromSelection: () => {
        const state = get();
        const selectedNodes: RecipeNodeType[] = [];
        const selectedIds = new Set<string>();

        for (let i = 0; i < state.nodes.length; i++) {
          const node = state.nodes[i];
          if (isRecipeNode(node) && node.data.isMultiSelected && !node.data.groupId) {
            selectedNodes.push(node);
            selectedIds.add(node.id);
          }
        }

        if (selectedNodes.length === 0) return null;

        const groupId = nextNodeId();
        const inputProxyHandleIds: string[] = [];
        const outputProxyHandleIds: string[] = [];

        for (let i = 0; i < state.edges.length; i++) {
          const edge = state.edges[i];
          const sourceSelected = selectedIds.has(edge.source);
          const targetSelected = selectedIds.has(edge.target);

          if (sourceSelected && !targetSelected) {
            addUniqueHandleId(outputProxyHandleIds, edge.sourceHandle);
          } else if (!sourceSelected && targetSelected) {
            addUniqueHandleId(inputProxyHandleIds, edge.targetHandle);
          }
        }

        const selectedMemberBounds = new Array<GroupMemberBounds>(selectedNodes.length);
        for (let i = 0; i < selectedNodes.length; i++) {
          selectedMemberBounds[i] = getRecipeMemberBounds(selectedNodes[i]);
        }

        const bounds = computeBoundsFromMembers(selectedMemberBounds);
        if (!bounds) return null;

        const groupLabel = buildGroupLabelFromExternalOutputs(
          selectedIds,
          state.nodes,
          state.edges,
        );

        const groupNode: GroupNodeType = {
          id: groupId,
          type: 'group',
          connectable: false,
          draggable: true,
          position: { x: bounds.x, y: bounds.y },
          selectable: false,
          selected: false,
          width: bounds.width,
          height: bounds.height,
          zIndex: GROUP_NODE_Z_INDEX,
          data: {
            label: groupLabel,
            collapsed: false,
            handlesReady: false,
            inputProxyHandleIds,
            outputProxyHandleIds,
          },
        };

        const nextNodes = new Array<CanvasNode>(state.nodes.length + 1);
        for (let i = 0; i < state.nodes.length; i++) {
          const node = state.nodes[i];
          if (selectedIds.has(node.id) && isRecipeNode(node)) {
            nextNodes[i] = {
              ...node,
              selected: false,
              zIndex: Math.max(node.zIndex ?? RECIPE_NODE_MIN_Z_INDEX, RECIPE_NODE_MIN_Z_INDEX),
              data: {
                ...node.data,
                groupId,
                isMultiSelected: false,
              },
            };
          } else {
            nextNodes[i] = node;
          }
        }
        nextNodes[state.nodes.length] = groupNode;

        const nextIndexes = createNodeIndexes(nextNodes);
        clearFlowCache();
        set({
          nodes: nextNodes,
          nodesMap: nextIndexes.nodesMap,
          groupMemberIds: nextIndexes.groupMemberIds,
          graphVersion: state.graphVersion + 1,
        });

        if (!isApplyingHistory && transactionDepth === 0) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, nextNodes, state.edges));
        }

        return groupId;
      },

      onNodesChange: (changes) => {
        const state = get();
        const nextNodes = applyNodeChanges(changes, state.nodes);
        let needsEnrichment = false;
        let hasStructuralChange = false;
        const dimensionChangedNodeIds = new Set<string>();

        for (let i = 0; i < changes.length; i++) {
          const change = changes[i];
          const type = change.type;
          if (type === 'dimensions' && 'id' in change) {
            dimensionChangedNodeIds.add(change.id);
          }
          if (type !== 'position' && type !== 'select') {
            needsEnrichment = true;
            if (type !== 'dimensions') {
              hasStructuralChange = true;
            }
          }
        }

        let finalNodes = needsEnrichment ? nextNodes.map(enrichNodeDimensions) : nextNodes;
        const affectedGroupIds = hasStructuralChange
          ? collectGroupNodeIds(finalNodes)
          : collectRecipeGroupIdsForNodeIds(finalNodes, dimensionChangedNodeIds);
        finalNodes = applyGroupBoundsForGroups(finalNodes, affectedGroupIds);

        if (!hasStructuralChange) {
          const nextIndexes =
            affectedGroupIds.size > 0 ? createNodeIndexes(finalNodes) : undefined;
          set({
            nodes: finalNodes,
            ...(nextIndexes
              ? {
                  nodesMap: nextIndexes.nodesMap,
                  groupMemberIds: nextIndexes.groupMemberIds,
                }
              : {}),
          });
          return;
        }


        const nextIndexes = createNodeIndexes(finalNodes);
        set({
          nodes: finalNodes,
          nodesMap: nextIndexes.nodesMap,
          groupMemberIds: nextIndexes.groupMemberIds,
          graphVersion: state.graphVersion + 1,
        });

        if (!isApplyingHistory && transactionDepth === 0) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, finalNodes, state.edges));
        }
      },

      onEdgesChange: (changes) => {
        const state = get();
        let modifiedChanges = [...changes];
        const extraRemovals: typeof changes = [];

        for (let i = 0; i < changes.length; i++) {
          const change = changes[i];
          if (change.type === 'remove') {
            if (change.id.startsWith('proxy-')) {
              const realEdgeId = change.id.substring(6);
              extraRemovals.push({ type: 'remove', id: realEdgeId });
            } else {
              const proxyEdgeId = `proxy-${change.id}`;
              extraRemovals.push({ type: 'remove', id: proxyEdgeId });
            }
          }
        }

        if (extraRemovals.length > 0) {
          modifiedChanges = [...changes, ...extraRemovals];
        }

        const nextEdges = applyEdgeChanges(modifiedChanges, state.edges);
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
        if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;

        let sourceHandle = connection.sourceHandle;
        let targetHandle = connection.targetHandle;
        let sourceNodeId = connection.source;
        let targetNodeId = connection.target;

        let sourceParsed = parseHandleId(sourceHandle);
        let targetParsed = parseHandleId(targetHandle);
        if (!sourceParsed || !targetParsed) return;

        if (sourceParsed.side === 'input' && targetParsed.side === 'output') {
          const tempHandle = sourceHandle;
          sourceHandle = targetHandle;
          targetHandle = tempHandle;

          const tempNodeId = sourceNodeId;
          sourceNodeId = targetNodeId;
          targetNodeId = tempNodeId;

          const tempParsed = sourceParsed;
          sourceParsed = targetParsed;
          targetParsed = tempParsed;
        }

        const state = get();
        const sourceNode = state.nodesMap.get(sourceNodeId);
        const targetNode = state.nodesMap.get(targetNodeId);
        if (!sourceNode || !targetNode) return;

        let realSourceNodeId = sourceNodeId;
        let realSourceHandle = sourceHandle;
        let realTargetNodeId = targetNodeId;
        let realTargetHandle = targetHandle;

        if (isGroupNode(sourceNode)) {
          if (!sourceNode.data.collapsed) return;
          const original = sourceNode.data.outputProxyHandleIds[sourceParsed.index];
          if (!original) return;
          const parsed = parseHandleId(original);
          if (!parsed) return;
          realSourceNodeId = parsed.nodeId;
          realSourceHandle = original;
        }

        if (isGroupNode(targetNode)) {
          if (!targetNode.data.collapsed) return;
          const original = targetNode.data.inputProxyHandleIds[targetParsed.index];
          if (!original) return;
          const parsed = parseHandleId(original);
          if (!parsed) return;
          realTargetNodeId = parsed.nodeId;
          realTargetHandle = original;
        }

        const resolvedSource = state.nodesMap.get(realSourceNodeId);
        const resolvedTarget = state.nodesMap.get(realTargetNodeId);
        if (!isRecipeNode(resolvedSource) || !isRecipeNode(resolvedTarget)) return;

        const currentEdges = state.edges;
        for (let i = 0; i < currentEdges.length; i++) {
          const e = currentEdges[i];
          if (
            e.sourceHandle === realSourceHandle &&
            e.targetHandle === realTargetHandle
          ) {
            return;
          }
        }

        const edgeId = nextEdgeId();
        const isCollapsedGroupConnection = isGroupNode(sourceNode) || isGroupNode(targetNode);

        const realEdge = {
          id: edgeId,
          type: 'recipe',
          zIndex: EDGE_Z_INDEX,
          source: realSourceNodeId,
          sourceHandle: realSourceHandle,
          target: realTargetNodeId,
          targetHandle: realTargetHandle,
          hidden: isCollapsedGroupConnection ? true : undefined,
        } as Edge;

        let nextEdges = [...currentEdges, realEdge];

        if (isCollapsedGroupConnection) {
          const proxyEdge = {
            id: `proxy-${edgeId}`,
            type: 'recipe',
            zIndex: EDGE_Z_INDEX,
            source: sourceNodeId,
            sourceHandle: sourceHandle,
            target: targetNodeId,
            targetHandle: targetHandle,
          } as Edge;
          nextEdges.push(proxyEdge);
        }

        nextEdges = filterCompatibleRecipeEdges(state.nodes, nextEdges);
        if (!nextEdges.some((edge) => edge.id === edgeId)) {
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

      setNodes: (nodes, options) => {
        clearFlowCache();
        const state = get();
        const { nodes: sanitizedNodes, edges: sanitizedEdges } = ensureGraphIntegrity(nodes, state.edges);
        const enriched = syncAllGroupBounds(sanitizedNodes.map(enrichNodeDimensions));
        const nextEdges = syncProxyEdges(enriched, sanitizedEdges);
        const nextIndexes = createNodeIndexes(enriched);
        set({
          nodes: enriched,
          nodesMap: nextIndexes.nodesMap,
          groupMemberIds: nextIndexes.groupMemberIds,
          edges: nextEdges,
          graphVersion: state.graphVersion + 1,
        });

        if (options?.resetHistory) {
          resetHistoryState();
          return;
        }
        if (shouldRecordHistory(options)) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, enriched, nextEdges));
        }
      },

      setEdges: (edges, options) => {
        const state = get();
        const { edges: sanitizedEdges } = ensureGraphIntegrity(state.nodes, edges);
        const nextEdges = syncProxyEdges(state.nodes, sanitizedEdges);

        if (options?.visualOnly) {
          set({
            edges: nextEdges,
          });
        } else {
          clearFlowCache();
          set({
            edges: nextEdges,
            graphVersion: state.graphVersion + 1,
          });
        }

        if (options?.resetHistory) {
          resetHistoryState();
          return;
        }
        if (shouldRecordHistory(options)) {
          pushHistoryEntry(
            buildGraphHistoryEntry(state.nodes, state.edges, state.nodes, nextEdges),
          );
        }
      },

      setNodesAndEdges: (nodes, edges, options) => {
        const state = get();
        const { nodes: sanitizedNodes, edges: sanitizedEdges } = ensureGraphIntegrity(nodes, edges);
        const len = sanitizedNodes.length;
        const enrichedNodes = new Array<CanvasNode>(len);
        for (let i = 0; i < len; i++) {
          enrichedNodes[i] = enrichNodeDimensions(sanitizedNodes[i]);
        }
        const enriched = syncAllGroupBounds(enrichedNodes);
        const nextEdges = syncProxyEdges(enriched, sanitizedEdges);
        const indexes = createNodeIndexes(enriched);
        if (options?.visualOnly) {
          set({
            nodes: enriched,
            nodesMap: indexes.nodesMap,
            groupMemberIds: indexes.groupMemberIds,
            edges: nextEdges,
          });
        } else {
          clearFlowCache();
          set({
            nodes: enriched,
            nodesMap: indexes.nodesMap,
            groupMemberIds: indexes.groupMemberIds,
            edges: nextEdges,
            graphVersion: state.graphVersion + 1,
          });
        }

        if (options?.resetHistory) {
          resetHistoryState();
          return;
        }
        if (shouldRecordHistory(options)) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, enriched, nextEdges));
        }
      },

      applyAutoLayoutResult: (layoutNodes, layoutEdges, expectedGraphVersion) => {
        const state = get();
        if (state.graphVersion !== expectedGraphVersion) return false;

        const layoutNodeMap = createNodesMap(layoutNodes);
        const layoutEdgeMap = new Map(layoutEdges.map((edge) => [edge.id, edge]));

        let nodesChanged = false;
        const patchedNodes = new Array<CanvasNode>(state.nodes.length);
        for (let i = 0; i < state.nodes.length; i++) {
          const node = state.nodes[i];
          const layoutNode = layoutNodeMap.get(node.id);
          const patchedNode = layoutNode
            ? patchNodeWithAutoLayoutResult(node, layoutNode)
            : node;
          if (patchedNode !== node) {
            nodesChanged = true;
          }
          patchedNodes[i] = patchedNode;
        }

        const boundedNodes = syncAllGroupBounds(patchedNodes);
        const nextNodes = boundedNodes;
        const nextEdgesBase = new Array<Edge>(state.edges.length);
        let edgesChanged = false;
        for (let i = 0; i < state.edges.length; i++) {
          const edge = state.edges[i];
          const layoutEdge = layoutEdgeMap.get(edge.id);
          const patchedEdge = layoutEdge
            ? patchEdgeWithAutoLayoutResult(edge, layoutEdge)
            : edge;
          if (patchedEdge !== edge) {
            edgesChanged = true;
          }
          nextEdgesBase[i] = patchedEdge;
        }

        const nextEdges = syncProxyEdges(nextNodes, nextEdgesBase);
        const shouldUpdateNodes = nodesChanged || nextNodes !== state.nodes;
        const shouldUpdateEdges = edgesChanged || nextEdges !== state.edges;
        if (!shouldUpdateNodes && !shouldUpdateEdges) return true;
        get().setNodesAndEdges(nextNodes, nextEdges);

        return true;
      },

      updateNodeData: (nodeId, data) => {
        const state = get();
        const oldNodes = state.nodes;
        const nextNodes = new Array<CanvasNode>(oldNodes.length);
        let updatedNode: RecipeNodeType | null = null;
        let previousGroupId: string | undefined;

        for (let i = 0; i < oldNodes.length; i++) {
          const node = oldNodes[i];
          if (node.id === nodeId && isRecipeNode(node)) {
            previousGroupId = node.data.groupId;
            updatedNode = enrichRecipeNodeDimensions({
              ...node,
              data: { ...node.data, ...data },
            });
            nextNodes[i] = updatedNode;
          } else {
            nextNodes[i] = node;
          }
        }

        if (!updatedNode) return;

        const affectedGroupIds = new Set<string>();
        if (previousGroupId) affectedGroupIds.add(previousGroupId);
        if (updatedNode.data.groupId) affectedGroupIds.add(updatedNode.data.groupId);
        const finalNodes = applyGroupBoundsForGroups(nextNodes, affectedGroupIds);
        const nextIndexes = createNodeIndexes(finalNodes);

        set({
          nodes: finalNodes,
          nodesMap: nextIndexes.nodesMap,
          groupMemberIds: nextIndexes.groupMemberIds,
          graphVersion: state.graphVersion + 1,
        });

        if (!isApplyingHistory && transactionDepth === 0) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, finalNodes, state.edges));
        }
      },

      updateGroupNodeData: (nodeId, data, options) => {
        const state = get();
        const oldNode = state.nodes.find((n) => n.id === nodeId && isGroupNode(n)) as GroupNodeType | undefined;
        if (!oldNode) return;

        if (data.collapsed !== undefined && data.collapsed !== oldNode.data.collapsed) {
          if (data.collapsed) {
            get().collapseGroup(nodeId);
          } else {
            get().expandGroup(nodeId);
          }
          if (data.label !== undefined && data.label !== oldNode.data.label) {
            set((s) => {
              const nextNodes = s.nodes.map((node) =>
                node.id === nodeId && isGroupNode(node)
                  ? { ...node, data: { ...node.data, label: data.label! } }
                  : node
              );
              const nextIndexes = createNodeIndexes(nextNodes);
              return {
                nodes: nextNodes,
                nodesMap: nextIndexes.nodesMap,
                groupMemberIds: nextIndexes.groupMemberIds,
              };
            });
          }
          return;
        }

        const oldNodes = state.nodes;
        const nextNodes = new Array<CanvasNode>(oldNodes.length);
        let updatedNode: GroupNodeType | null = null;

        for (let i = 0; i < oldNodes.length; i++) {
          const node = oldNodes[i];
          if (node.id === nodeId && isGroupNode(node)) {
            updatedNode = prepareGroupNode({
              ...node,
              data: { ...node.data, ...data },
            });
            nextNodes[i] = updatedNode;
          } else {
            nextNodes[i] = node;
          }
        }

        if (!updatedNode) return;

        const nextIndexes = createNodeIndexes(nextNodes);
        const nextEdges = syncProxyEdges(nextNodes, state.edges);
        set({
          nodes: nextNodes,
          nodesMap: nextIndexes.nodesMap,
          groupMemberIds: nextIndexes.groupMemberIds,
          edges: nextEdges,
          graphVersion: state.graphVersion + 1,
        });

        if (!isApplyingHistory && transactionDepth === 0 && options?.recordHistory !== false) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, nextNodes, nextEdges));
        }
      },

      collapseGroup: (groupId: string) => {
        const state = get();
        const groupNode = state.nodes.find((n) => n.id === groupId && isGroupNode(n)) as GroupNodeType | undefined;
        if (!groupNode || groupNode.data.collapsed) return;

        get().runTransaction(() => {
          const nodes = get().nodes;
          const edges = get().edges;

          const recipeNodeIdsInGroup = new Set(
            nodes.filter((n) => isRecipeNode(n) && n.data.groupId === groupId).map((n) => n.id)
          );

          const inputProxyHandleIds: string[] = [];
          const outputProxyHandleIds: string[] = [];

          for (let i = 0; i < edges.length; i++) {
            const edge = edges[i];
            if (edge.id.startsWith('proxy-')) continue;

            const isSourceInGroup = recipeNodeIdsInGroup.has(edge.source);
            const isTargetInGroup = recipeNodeIdsInGroup.has(edge.target);

            if (isSourceInGroup && !isTargetInGroup) {
              if (edge.sourceHandle && !outputProxyHandleIds.includes(edge.sourceHandle)) {
                outputProxyHandleIds.push(edge.sourceHandle);
              }
            } else if (!isSourceInGroup && isTargetInGroup) {
              if (edge.targetHandle && !inputProxyHandleIds.includes(edge.targetHandle)) {
                inputProxyHandleIds.push(edge.targetHandle);
              }
            }
          }

          const nextNodes = nodes.map((node) => {
            if (isRecipeNode(node) && node.data.groupId === groupId) {
              return { ...node, hidden: true };
            }
            if (node.id === groupId && isGroupNode(node)) {
              const inputCount = inputProxyHandleIds.length;
              const outputCount = outputProxyHandleIds.length;
              const maxCount = Math.max(inputCount, outputCount, 1);
              const ioAreaHeight = maxCount * RECT_HEIGHT + (maxCount - 1) * RECT_GAP + IO_COLUMN_PADDING;
              const collapsedHeight = BASE_INFO_HEIGHT + ioAreaHeight + BOTTOM_PADDING;

              return {
                ...node,
                width: NODE_CSS_WIDTH,
                height: collapsedHeight,
                data: {
                  ...node.data,
                  collapsed: true,
                  handlesReady: false,
                  inputProxyHandleIds,
                  outputProxyHandleIds,
                },
              };
            }
            return node;
          });

          const nextEdges = syncProxyEdges(nextNodes, edges);
          const boundedNodes = syncAllGroupBounds(nextNodes);
          const boundedIndexes = createNodeIndexes(boundedNodes);

          set({
            nodes: boundedNodes,
            nodesMap: boundedIndexes.nodesMap,
            groupMemberIds: boundedIndexes.groupMemberIds,
            edges: nextEdges,
            graphVersion: get().graphVersion + 1,
          });
        });
      },

      expandGroup: (groupId: string) => {
        const state = get();
        const groupNode = state.nodes.find((n) => n.id === groupId && isGroupNode(n)) as GroupNodeType | undefined;
        if (!groupNode || !groupNode.data.collapsed) return;

        get().runTransaction(() => {
          const nodes = get().nodes;
          const edges = get().edges;

          const nextNodes = nodes.map((node) => {
            if (isRecipeNode(node) && node.data.groupId === groupId) {
              return { ...node, hidden: false };
            }
            if (node.id === groupId && isGroupNode(node)) {
              return {
                ...node,
                data: {
                  ...node.data,
                  collapsed: false,
                  handlesReady: false,
                },
              };
            }
            return node;
          });

          const nextEdges = syncProxyEdges(nextNodes, edges);
          const boundedNodes = syncAllGroupBounds(nextNodes);
          const boundedIndexes = createNodeIndexes(boundedNodes);

          set({
            nodes: boundedNodes,
            nodesMap: boundedIndexes.nodesMap,
            groupMemberIds: boundedIndexes.groupMemberIds,
            edges: nextEdges,
            graphVersion: get().graphVersion + 1,
          });
        });
      },

      deleteNode: (nodeId) => {
        const state = get();
        const oldNodes = state.nodes;
        const oldNodesMap = state.nodesMap;
        const deletedNode = oldNodesMap.get(nodeId);
        if (!deletedNode) return;
        const shouldClearGroupMembership = isGroupNode(deletedNode);
        const isCollapsedGroupDelete = isGroupNode(deletedNode) && deletedNode.data.collapsed;

        const nextNodes: CanvasNode[] = [];
        const deletedMemberIds = new Set<string>();

        if (isCollapsedGroupDelete) {
          for (let i = 0; i < oldNodes.length; i++) {
            const n = oldNodes[i];
            if (isRecipeNode(n) && n.data.groupId === nodeId) {
              deletedMemberIds.add(n.id);
            }
          }
        }

        for (let i = 0; i < oldNodes.length; i++) {
          const node = oldNodes[i];
          if (node.id === nodeId || deletedMemberIds.has(node.id)) {
            continue;
          }

          let nextNode = node;
          if (shouldClearGroupMembership && !isCollapsedGroupDelete && isRecipeNode(node) && node.data.groupId === nodeId) {
            nextNode = {
              ...node,
              hidden: false,
              data: {
                ...node.data,
                groupId: undefined,
              },
            };
          } else if (isGroupNode(node)) {
            const inputProxyHandleIds = removeProxyHandleIdsForNode(
              node.data.inputProxyHandleIds,
              nodeId,
            );
            const outputProxyHandleIds = removeProxyHandleIdsForNode(
              node.data.outputProxyHandleIds,
              nodeId,
            );

            let finalInputProxy = inputProxyHandleIds;
            let finalOutputProxy = outputProxyHandleIds;
            if (isCollapsedGroupDelete) {
              for (const memberId of deletedMemberIds) {
                finalInputProxy = removeProxyHandleIdsForNode(finalInputProxy, memberId);
                finalOutputProxy = removeProxyHandleIdsForNode(finalOutputProxy, memberId);
              }
            }

            if (
              finalInputProxy !== node.data.inputProxyHandleIds ||
              finalOutputProxy !== node.data.outputProxyHandleIds
            ) {
              nextNode = {
                ...node,
                data: {
                  ...node.data,
                  inputProxyHandleIds: finalInputProxy,
                  outputProxyHandleIds: finalOutputProxy,
                },
              };
            }
          }
          nextNodes.push(nextNode);
        }

        const affectedGroupIds = collectGroupNodeIds(nextNodes);
        const finalNodes = applyGroupBoundsForGroups(nextNodes, affectedGroupIds);
        const nextIndexes = createNodeIndexes(finalNodes);

        const filteredEdges = state.edges
          .filter((e) => {
            if (e.source === nodeId || e.target === nodeId) return false;
            if (isCollapsedGroupDelete && (deletedMemberIds.has(e.source) || deletedMemberIds.has(e.target))) {
              return false;
            }
            if (e.id.startsWith('proxy-')) {
              const realId = e.id.substring(6);
              const realEdge = state.edges.find((re) => re.id === realId);
              if (realEdge) {
                if (realEdge.source === nodeId || realEdge.target === nodeId) return false;
                if (isCollapsedGroupDelete && (deletedMemberIds.has(realEdge.source) || deletedMemberIds.has(realEdge.target))) {
                  return false;
                }
              }
            }
            return true;
          })
          .map((e) => {
            const srcNode = state.nodesMap.get(e.source);
            const tgtNode = state.nodesMap.get(e.target);
            const isSourceMember = isRecipeNode(srcNode) && srcNode.data.groupId === nodeId;
            const isTargetMember = isRecipeNode(tgtNode) && tgtNode.data.groupId === nodeId;
            if (!isCollapsedGroupDelete && (isSourceMember || isTargetMember)) {
              return { ...e, hidden: false };
            }
            return e;
          });

        const nextEdges = syncProxyEdges(finalNodes, filteredEdges);

        set({
          nodes: finalNodes,
          nodesMap: nextIndexes.nodesMap,
          groupMemberIds: nextIndexes.groupMemberIds,
          edges: nextEdges,
          graphVersion: state.graphVersion + 1,
        });

        if (!isApplyingHistory && transactionDepth === 0) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, finalNodes, nextEdges));
        }
      },

      deleteEdgesConnectedToHandle: (handleId) => {
        const state = get();
        const oldEdges = state.edges;

        const removedEdgeIds = new Set<string>();
        for (let i = 0; i < oldEdges.length; i++) {
          const edge = oldEdges[i];
          if (edge.sourceHandle === handleId || edge.targetHandle === handleId) {
            removedEdgeIds.add(edge.id);
            if (edge.id.startsWith('proxy-')) {
              removedEdgeIds.add(edge.id.substring(6));
            } else {
              removedEdgeIds.add(`proxy-${edge.id}`);
            }
          }
        }

        if (removedEdgeIds.size === 0) return;

        const nextEdges = oldEdges.filter((edge) => !removedEdgeIds.has(edge.id));

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

        const removedEdgeIds = new Set<string>();
        for (let i = 0; i < oldEdges.length; i++) {
          const edge = oldEdges[i];
          if (
            handleIdSet.has(edge.sourceHandle ?? '') ||
            handleIdSet.has(edge.targetHandle ?? '')
          ) {
            removedEdgeIds.add(edge.id);
            if (edge.id.startsWith('proxy-')) {
              removedEdgeIds.add(edge.id.substring(6));
            } else {
              removedEdgeIds.add(`proxy-${edge.id}`);
            }
          }
        }

        if (removedEdgeIds.size === 0) return;

        const nextEdges = oldEdges.filter((edge) => !removedEdgeIds.has(edge.id));

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

        const removedEdgeIds = new Set<string>();
        if (handleIds.length > 0) {
          for (let i = 0; i < oldEdges.length; i++) {
            const edge = oldEdges[i];
            if (
              handleIds.includes(edge.sourceHandle ?? '') ||
              handleIds.includes(edge.targetHandle ?? '')
            ) {
              removedEdgeIds.add(edge.id);
              if (edge.id.startsWith('proxy-')) {
                removedEdgeIds.add(edge.id.substring(6));
              } else {
                removedEdgeIds.add(`proxy-${edge.id}`);
              }
            }
          }
        }

        const prunedEdges =
          removedEdgeIds.size === 0
            ? oldEdges
            : oldEdges.filter((edge) => !removedEdgeIds.has(edge.id));

        const nextNodes = new Array<CanvasNode>(oldNodes.length);
        let updatedNode: RecipeNodeType | null = null;
        let previousGroupId: string | undefined;

        for (let i = 0; i < oldNodes.length; i++) {
          const node = oldNodes[i];
          if (node.id === nodeId && isRecipeNode(node)) {
            previousGroupId = node.data.groupId;
            updatedNode = enrichRecipeNodeDimensions({
              ...node,
              data: { ...node.data, ...data },
            });
            nextNodes[i] = updatedNode;
          } else {
            nextNodes[i] = node;
          }
        }

        if (!updatedNode) return;

        const affectedGroupIds = new Set<string>();
        if (previousGroupId) affectedGroupIds.add(previousGroupId);
        if (updatedNode.data.groupId) affectedGroupIds.add(updatedNode.data.groupId);
        const finalNodes = applyGroupBoundsForGroups(nextNodes, affectedGroupIds);
        const nextIndexes = createNodeIndexes(finalNodes);
        const nextEdges = filterCompatibleRecipeEdges(finalNodes, prunedEdges);

        const edgesChanged = nextEdges !== oldEdges;
        set({
          nodes: finalNodes,
          nodesMap: nextIndexes.nodesMap,
          groupMemberIds: nextIndexes.groupMemberIds,
          ...(edgesChanged ? { edges: nextEdges } : {}),
          graphVersion: state.graphVersion + 1,
        });

        if (!isApplyingHistory && transactionDepth === 0) {
          pushHistoryEntry(buildGraphHistoryEntry(state.nodes, state.edges, finalNodes, nextEdges));
        }
      },
    };
  }),
);

export { useFlowStore };
