import { useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  ViewportPortal,
  useReactFlow,
  ConnectionLineType,
  type Edge,
  type Connection,
  type InternalNode,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { RecipeNode } from './nodes/RecipeNode';
import { GroupNode } from './nodes/GroupNode';
import { RecipeEdge } from './edges/RecipeEdge';
import type { EdgeControlPoint } from '../../types/edges';
import { createGraphResolutionContext } from '../../utils/graphResolutionContext';
import { useFlowStore } from '../../stores/useFlowStore';
import { useFlowResultStore } from '../../stores/useFlowResultStore';
import { useEdgeThemeStore } from '../../stores/useEdgeThemeStore';
import { useUIStore, getEffectiveToggleId } from '../../stores/useUIStore';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
  useTutorialStore,
} from '../../stores/useTutorialStore';
import { useFlowSolver } from '../../hooks/useFlowSolver';
import { parseHandleId } from '../../utils/idGenerator';
import { SNAP_GRID, GRID_DOT_SIZE } from '../shared/layoutConstants';
import { isGroupNode, isRecipeNode } from '../../types/nodes';
import type { CanvasNode, RecipeNodeType } from '../../types/nodes';
import {
  computeBoundsFromMembersWithMovedMember,
  getRecipeMemberBounds,
} from '../../utils/groupBounds';
import type { GroupBounds, GroupMemberBounds } from '../../utils/groupBounds';
import previewStyles from './GroupBoundsPreview.module.css';
import { TUTORIAL_DRIVER_REFRESH_EVENT } from '../tutorial/tutorialHighlightUtils';

const nodeTypes = {
  recipe: RecipeNode,
  group: GroupNode,
};

const edgeTypes = {
  recipe: RecipeEdge,
};

const CATMULL_SEGMENT_SAMPLES = 16;
const REACT_FLOW_MIN_ZOOM = 0.15;
const REACT_FLOW_MAX_ZOOM = 2;
const TUTORIAL_DRIVER_REFRESH_INTERVAL_MS = 80;
let tutorialDriverRefreshFrame: number | null = null;
let tutorialDriverRefreshTimeout: number | null = null;
let tutorialDriverLastRefreshAt = 0;

function requestTutorialDriverRefresh() {
  if (!isTutorialActive() || typeof window === 'undefined') {
    return;
  }

  const now = window.performance.now();
  const elapsed = now - tutorialDriverLastRefreshAt;
  if (elapsed < TUTORIAL_DRIVER_REFRESH_INTERVAL_MS) {
    if (tutorialDriverRefreshTimeout != null) return;

    tutorialDriverRefreshTimeout = window.setTimeout(() => {
      tutorialDriverRefreshTimeout = null;
      requestTutorialDriverRefresh();
    }, TUTORIAL_DRIVER_REFRESH_INTERVAL_MS - elapsed);
    return;
  }

  if (tutorialDriverRefreshFrame != null) return;

  tutorialDriverRefreshFrame = window.requestAnimationFrame(() => {
    tutorialDriverRefreshFrame = null;
    if (!isTutorialActive()) return;

    tutorialDriverLastRefreshAt = window.performance.now();
    window.dispatchEvent(new Event(TUTORIAL_DRIVER_REFRESH_EVENT));
  });
}

function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

function canUseTutorialTextInput(e: KeyboardEvent): boolean {
  if (!isEditableTarget(e.target)) return false;
  if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'Enter') return false;

  const action = useTutorialStore.getState().getCurrentStep()?.action;
  if (!action) return false;

  if (action.type === 'selector-search') {
    return !!e.target.closest('[data-tutorial-selector-search]');
  }

  if (action.type === 'save-name') {
    return !!e.target.closest('[data-tutorial-save="name"]');
  }

  if (action.type === 'node-editor-machine-count') {
    return !!e.target.closest('[data-tutorial-node-editor="machine-count"]');
  }

  if (action.type === 'node-editor-setting') {
    const editorField = e.target.closest('[data-tutorial-node-editor]');
    return editorField?.getAttribute('data-tutorial-node-editor') === `setting-${action.key}`;
  }

  if (action.type === 'data-search') {
    const dataSearch = e.target.closest('[data-tutorial-data-search]');
    return dataSearch?.getAttribute('data-tutorial-data-search') === action.entity;
  }

  if (action.type === 'data-field') {
    const dataField = e.target.closest('[data-tutorial-data-field]');
    return dataField?.getAttribute('data-tutorial-data-field') === action.field;
  }

  return false;
}

function isFiniteControlPoint(value: unknown): value is EdgeControlPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as { x?: number; y?: number };
  return (
    typeof point.x === 'number' &&
    Number.isFinite(point.x) &&
    typeof point.y === 'number' &&
    Number.isFinite(point.y)
  );
}

function toControlPoints(data: unknown): EdgeControlPoint[] {
  if (!data || typeof data !== 'object') return [];
  const raw = (data as { controlPoints?: unknown }).controlPoints;
  if (!Array.isArray(raw)) return [];

  const points: EdgeControlPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!isFiniteControlPoint(item)) continue;
    points.push({ x: item.x, y: item.y });
  }

  return points;
}

function distanceSquaredBetweenPoints(a: EdgeControlPoint, b: EdgeControlPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function distanceSquaredPointToSegment(
  point: EdgeControlPoint,
  segmentStart: EdgeControlPoint,
  segmentEnd: EdgeControlPoint,
): number {
  const segmentX = segmentEnd.x - segmentStart.x;
  const segmentY = segmentEnd.y - segmentStart.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (segmentLengthSquared <= 0) {
    return distanceSquaredBetweenPoints(point, segmentStart);
  }

  const t =
    ((point.x - segmentStart.x) * segmentX + (point.y - segmentStart.y) * segmentY) /
    segmentLengthSquared;
  if (t <= 0) {
    return distanceSquaredBetweenPoints(point, segmentStart);
  }
  if (t >= 1) {
    return distanceSquaredBetweenPoints(point, segmentEnd);
  }

  const projection: EdgeControlPoint = {
    x: segmentStart.x + segmentX * t,
    y: segmentStart.y + segmentY * t,
  };
  return distanceSquaredBetweenPoints(point, projection);
}

function evaluateCatmullRomPoint(
  p0: EdgeControlPoint,
  p1: EdgeControlPoint,
  p2: EdgeControlPoint,
  p3: EdgeControlPoint,
  t: number,
): EdgeControlPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

function findNearestCatmullSegmentIndex(
  pathPoints: EdgeControlPoint[],
  candidate: EdgeControlPoint,
): number {
  if (pathPoints.length < 2) return 0;
  if (pathPoints.length === 2) return 0;

  let bestSegmentIndex = 0;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;

  for (let i = 0; i < pathPoints.length - 1; i++) {
    const p0 = pathPoints[i - 1] ?? pathPoints[i];
    const p1 = pathPoints[i];
    const p2 = pathPoints[i + 1];
    const p3 = pathPoints[i + 2] ?? p2;

    let previous = p1;
    for (let step = 1; step <= CATMULL_SEGMENT_SAMPLES; step++) {
      const t = step / CATMULL_SEGMENT_SAMPLES;
      const current = evaluateCatmullRomPoint(p0, p1, p2, p3, t);
      const distanceSquared = distanceSquaredPointToSegment(candidate, previous, current);
      if (distanceSquared < bestDistanceSquared) {
        bestDistanceSquared = distanceSquared;
        bestSegmentIndex = i;
      }
      previous = current;
    }
  }

  return bestSegmentIndex;
}

function findNearestPolylineSegmentIndex(
  pathPoints: EdgeControlPoint[],
  candidate: EdgeControlPoint,
): number {
  if (pathPoints.length < 2) return 0;

  let bestSegmentIndex = 0;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;

  for (let i = 0; i < pathPoints.length - 1; i++) {
    const distanceSquared = distanceSquaredPointToSegment(
      candidate,
      pathPoints[i],
      pathPoints[i + 1],
    );
    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      bestSegmentIndex = i;
    }
  }

  return bestSegmentIndex;
}

function resolveHandleCenter(
  node: InternalNode<Node> | undefined,
  handleType: 'source' | 'target',
  handleId: string | null | undefined,
): EdgeControlPoint | null {
  if (!node) return null;

  const handles = node.internals.handleBounds?.[handleType];
  if (!handles || handles.length === 0) return null;

  let selectedHandle = handles[0];
  if (handleId != null) {
    const matched = handles.find((handle) => handle.id === handleId);
    if (matched) {
      selectedHandle = matched;
    }
  }

  return {
    x: node.internals.positionAbsolute.x + selectedHandle.x + selectedHandle.width / 2,
    y: node.internals.positionAbsolute.y + selectedHandle.y + selectedHandle.height / 2,
  };
}

const onNodeClick = (event: React.MouseEvent, node: CanvasNode) => {
  if (isTutorialActive()) {
    const currentAction = useTutorialStore.getState().getCurrentStep()?.action;
    if (
      currentAction?.type === 'node-multi-select' &&
      isRecipeNode(node) &&
      canPerformTutorialAction({ type: 'node-multi-select', nodeId: node.id })
    ) {
      event.stopPropagation();
      if (node.data.isMultiSelected) return;
      const flowStore = useFlowStore.getState();
      flowStore.toggleNodeSelection(node.id);
      const selectedNodeIds = useFlowStore.getState().nodes
        .filter((currentNode) => isRecipeNode(currentNode) && currentNode.data.isMultiSelected)
        .map((currentNode) => currentNode.id);
      completeTutorialAction({ type: 'node-multi-select', nodeIds: selectedNodeIds });
      return;
    }

    if (
      isRecipeNode(node) &&
      canPerformTutorialAction({ type: 'target-node', nodeId: node.id })
    ) {
      event.stopPropagation();
      useFlowStore.getState().updateNodeData(node.id, { isTarget: true });
      completeTutorialAction({ type: 'target-node', nodeId: node.id });
    }
    return;
  }

  const toggleId = getEffectiveToggleId(useUIStore.getState());
  if (toggleId === 'delete_mode') {
    useFlowStore.getState().deleteNode(node.id);
  } else if (toggleId === 'multi_select') {
    useFlowStore.getState().toggleNodeSelection(node.id);
  } else if (toggleId === 'target' && isRecipeNode(node)) {
    const isTarget = !!node.data?.isTarget;
    useFlowStore.getState().updateNodeData(node.id, { isTarget: !isTarget });
  }
};

interface FlowViewportCanvasProps {
  isZoomedOut: boolean;
}

interface BatchDragState {
  nodeIds: string[];
  startPositions: Map<string, { x: number; y: number }>;
  draggedNodeId: string;
  draggedStartPosition: { x: number; y: number };
  groupPreview: GroupBoundsPreviewState | null;
}

interface GroupBoundsPreviewState {
  draggedNodeId: string;
  members: GroupMemberBounds[];
}

interface ConnectionValidationCache {
  nodes: CanvasNode[];
  edges: Edge[];
  resolutionContext: ReturnType<typeof createGraphResolutionContext>;
}

function applyGroupBoundsPreview(element: HTMLDivElement | null, bounds: GroupBounds | null): void {
  if (!element || !bounds) return;

  element.style.setProperty('--group-preview-x', `${bounds.x}px`);
  element.style.setProperty('--group-preview-y', `${bounds.y}px`);
  element.style.setProperty('--group-preview-width', `${bounds.width}px`);
  element.style.setProperty('--group-preview-height', `${bounds.height}px`);
  element.dataset.visible = 'true';
}

function hideGroupBoundsPreview(element: HTMLDivElement | null): void {
  if (!element) return;
  delete element.dataset.visible;
}

function FlowViewportCanvas({ isZoomedOut }: FlowViewportCanvasProps) {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const edgePathStyle = useEdgeThemeStore((s) => s.pathStyle);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const captureDragStart = useFlowStore((s) => s.captureDragStart);
  const commitDragStop = useFlowStore((s) => s.commitDragStop);
  const moveNodesFromSnapshots = useFlowStore((s) => s.moveNodesFromSnapshots);
  const fitViewRequestId = useUIStore((s) => s.fitViewRequestId);
  const { screenToFlowPosition, getInternalNode, fitView } = useReactFlow();

  const batchDragRef = useRef<BatchDragState | null>(null);
  const groupBoundsPreviewRef = useRef<HTMLDivElement | null>(null);
  const connectionValidationCacheRef = useRef<ConnectionValidationCache | null>(null);

  useEffect(() => {
    let wasMultiSelectMode = getEffectiveToggleId(useUIStore.getState()) === 'multi_select';

    return useUIStore.subscribe((state) => {
      const isMultiSelectMode = getEffectiveToggleId(state) === 'multi_select';
      if (wasMultiSelectMode && !isMultiSelectMode) {
        useFlowStore.getState().clearNodeSelection();
      }
      wasMultiSelectMode = isMultiSelectMode;
    });
  }, []);

  useEffect(() => {
    if (fitViewRequestId === 0) return;

    const frame = window.requestAnimationFrame(() => {
      void fitView({ padding: 0.12 });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [fitView, fitViewRequestId]);

  const getConnectionValidationContext = (flowStore: ReturnType<typeof useFlowStore.getState>) => {
    const cached = connectionValidationCacheRef.current;
    if (cached && cached.nodes === flowStore.nodes && cached.edges === flowStore.edges) {
      return cached.resolutionContext;
    }

    const recipeNodes: RecipeNodeType[] = [];
    const recipeNodeIds = new Set<string>();
    for (let i = 0; i < flowStore.nodes.length; i++) {
      const node = flowStore.nodes[i];
      if (!isRecipeNode(node)) continue;
      recipeNodes.push(node);
      recipeNodeIds.add(node.id);
    }

    const recipeEdges: Edge[] = [];
    for (let i = 0; i < flowStore.edges.length; i++) {
      const edge = flowStore.edges[i];
      if (recipeNodeIds.has(edge.source) && recipeNodeIds.has(edge.target)) {
        recipeEdges.push(edge);
      }
    }

    const resolutionContext = createGraphResolutionContext(recipeNodes, recipeEdges);
    connectionValidationCacheRef.current = {
      nodes: flowStore.nodes,
      edges: flowStore.edges,
      resolutionContext,
    };
    return resolutionContext;
  };

  const isValidConnection = (connection: Connection | Edge) => {
    if (
      !connection.source ||
      !connection.target ||
      !connection.sourceHandle ||
      !connection.targetHandle
    )
      return false;

    const flowStore = useFlowStore.getState();

    const resolveEndpoint = (nodeId: string, handleId: string) => {
      const node = flowStore.nodesMap.get(nodeId);
      if (!node) return null;
      if (isGroupNode(node)) {
        if (!node.data.collapsed) return null;
        const parsed = parseHandleId(handleId);
        if (!parsed) return null;
        const original =
          parsed.side === 'input'
            ? node.data.inputProxyHandleIds[parsed.index]
            : node.data.outputProxyHandleIds[parsed.index];
        if (!original) return null;
        const parsedOriginal = parseHandleId(original);
        if (!parsedOriginal) return null;
        return { nodeId: parsedOriginal.nodeId, handleId: original, parsed: parsedOriginal };
      }
      const parsed = parseHandleId(handleId);
      if (!parsed) return null;
      return { nodeId, handleId, parsed };
    };

    const sourceRes = resolveEndpoint(connection.source, connection.sourceHandle);
    const targetRes = resolveEndpoint(connection.target, connection.targetHandle);

    if (!sourceRes || !targetRes) return false;

    let outRes = sourceRes;
    let inRes = targetRes;

    if (sourceRes.parsed.side === 'input' && targetRes.parsed.side === 'output') {
      outRes = targetRes;
      inRes = sourceRes;
    } else if (sourceRes.parsed.side !== 'output' || targetRes.parsed.side !== 'input') {
      return false;
    }

    const sourceNode = flowStore.nodesMap.get(outRes.nodeId);
    const targetNode = flowStore.nodesMap.get(inRes.nodeId);
    if (!isRecipeNode(sourceNode) || !isRecipeNode(targetNode)) {
      return false;
    }

    const resolutionContext = getConnectionValidationContext(flowStore);
    const sourceHelpers = resolutionContext.createHelpers(outRes.nodeId);
    const targetHelpers = resolutionContext.createHelpers(inRes.nodeId);
    const committedResolvedProducts = useFlowResultStore.getState().resolvedProducts;
    const resolvedSourceProductId =
      committedResolvedProducts[outRes.handleId] ??
      sourceHelpers.resolveProduct('output', outRes.parsed.index);
    const resolvedTargetProductId =
      committedResolvedProducts[inRes.handleId] ??
      targetHelpers.resolveProduct('input', inRes.parsed.index);

    const resolvedSourceHandleType = sourceHelpers.resolveHandleType('output', outRes.parsed.index);
    const resolvedTargetHandleType = targetHelpers.resolveHandleType('input', inRes.parsed.index);

    if (
      !resolvedSourceHandleType ||
      !resolvedTargetHandleType ||
      resolvedSourceHandleType !== resolvedTargetHandleType
    ) {
      return false;
    }

    if (resolvedSourceProductId === resolvedTargetProductId) return true;

    const isSourceAny =
      resolvedSourceProductId === 'any_fluid' || resolvedSourceProductId === 'any_item';
    const isTargetAny =
      resolvedTargetProductId === 'any_fluid' || resolvedTargetProductId === 'any_item';

    if (isSourceAny || isTargetAny) return true;

    return false;
  };

  const handleNodeDragStart = (_event: React.MouseEvent, node: Node) => {
    const isMultiSelectMode = getEffectiveToggleId(useUIStore.getState()) === 'multi_select';
    const shouldBatchDrag = isRecipeNode(node) && node.data.isMultiSelected && isMultiSelectMode;
    const shouldDragGroup = isGroupNode(node);
    const nodeIds: string[] = [];
    const startPositions = new Map<string, { x: number; y: number }>();
    let groupPreview: GroupBoundsPreviewState | null = null;

    if (isRecipeNode(node) && node.data.groupId) {
      const members: GroupMemberBounds[] = [];
      for (let i = 0; i < nodes.length; i++) {
        const currentNode = nodes[i];
        if (isRecipeNode(currentNode) && currentNode.data.groupId === node.data.groupId) {
          members.push(getRecipeMemberBounds(currentNode));
        }
      }
      groupPreview = members.length > 0 ? { draggedNodeId: node.id, members } : null;
    }

    for (let i = 0; i < nodes.length; i++) {
      const currentNode = nodes[i];
      let shouldIncludeNode = currentNode.id === node.id;
      if (shouldDragGroup) {
        shouldIncludeNode =
          currentNode.id === node.id ||
          (isRecipeNode(currentNode) && currentNode.data.groupId === node.id);
      } else if (shouldBatchDrag) {
        shouldIncludeNode = isRecipeNode(currentNode) && !!currentNode.data.isMultiSelected;
      }

      if (!shouldIncludeNode) {
        continue;
      }

      nodeIds.push(currentNode.id);
      startPositions.set(currentNode.id, {
        x: currentNode.position.x,
        y: currentNode.position.y,
      });
    }

    const draggedStartPosition = startPositions.get(node.id) ?? {
      x: node.position.x,
      y: node.position.y,
    };
    batchDragRef.current = {
      nodeIds,
      startPositions,
      draggedNodeId: node.id,
      draggedStartPosition,
      groupPreview,
    };

    captureDragStart(nodeIds);
  };

  const handleNodeDrag = (_event: React.MouseEvent, node: Node) => {
    const batchDrag = batchDragRef.current;
    if (!batchDrag || batchDrag.draggedNodeId !== node.id) return;

    const deltaX = node.position.x - batchDrag.draggedStartPosition.x;
    const deltaY = node.position.y - batchDrag.draggedStartPosition.y;

    if (batchDrag.groupPreview) {
      applyGroupBoundsPreview(
        groupBoundsPreviewRef.current,
        computeBoundsFromMembersWithMovedMember(
          batchDrag.groupPreview.members,
          batchDrag.groupPreview.draggedNodeId,
          deltaX,
          deltaY,
        ),
      );
    }

    if (batchDrag.nodeIds.length > 1) {
      moveNodesFromSnapshots(batchDrag.startPositions, deltaX, deltaY);
    }

    requestTutorialDriverRefresh();
  };

  const handleNodeDragStop = (_event: React.MouseEvent, _node: Node, draggedNodes: Node[]) => {
    const nodeIds =
      batchDragRef.current?.nodeIds ?? draggedNodes.map((draggedNode) => draggedNode.id);
    batchDragRef.current = null;
    hideGroupBoundsPreview(groupBoundsPreviewRef.current);
    commitDragStop(nodeIds);
    requestTutorialDriverRefresh();
  };

  const handleSelectionDragStart = (_event: React.MouseEvent, draggedNodes: Node[]) => {
    captureDragStart(draggedNodes.map((draggedNode) => draggedNode.id));
  };

  const handleSelectionDragStop = (_event: React.MouseEvent, draggedNodes: Node[]) => {
    commitDragStop(draggedNodes.map((draggedNode) => draggedNode.id));
    requestTutorialDriverRefresh();
  };

  const handleNodesChange: typeof onNodesChange = (changes) => {
    let hasSelectionChange = false;
    for (let i = 0; i < changes.length; i++) {
      if (changes[i].type === 'select') {
        hasSelectionChange = true;
        break;
      }
    }

    if (!hasSelectionChange) {
      onNodesChange(changes);
      return;
    }

    const nonSelectionChanges = [];
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      if (change.type !== 'select') {
        nonSelectionChanges.push(change);
      }
    }

    if (nonSelectionChanges.length > 0) {
      onNodesChange(nonSelectionChanges);
    }
  };

  const onEdgeClick = (event: React.MouseEvent, edge: Edge) => {
    if (isTutorialActive()) {
      event.stopPropagation();
      return;
    }

    const toggleId = getEffectiveToggleId(useUIStore.getState());
    if (toggleId === 'delete_mode') {
      event.stopPropagation();
      onEdgesChange([{ type: 'remove', id: edge.id }]);
    }
  };

  const onEdgeDoubleClick = (event: React.MouseEvent, clickedEdge: Edge) => {
    event.stopPropagation();
    if (isTutorialActive()) return;

    const flowStore = useFlowStore.getState();
    const nextPoint = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const existingPoints = toControlPoints(clickedEdge.data);
    const sourcePoint = resolveHandleCenter(
      getInternalNode(clickedEdge.source),
      'source',
      clickedEdge.sourceHandle,
    );
    const targetPoint = resolveHandleCenter(
      getInternalNode(clickedEdge.target),
      'target',
      clickedEdge.targetHandle,
    );

    let nextControlPoints = [...existingPoints, nextPoint];

    if (sourcePoint && targetPoint) {
      const pathPoints: EdgeControlPoint[] = [sourcePoint, ...existingPoints, targetPoint];
      const nearestSegmentIndex =
        edgePathStyle === 'straight'
          ? findNearestPolylineSegmentIndex(pathPoints, nextPoint)
          : findNearestCatmullSegmentIndex(pathPoints, nextPoint);
      const insertIndex = Math.max(0, Math.min(existingPoints.length, nearestSegmentIndex));
      nextControlPoints = existingPoints.slice();
      nextControlPoints.splice(insertIndex, 0, nextPoint);
    }

    const isProxy = clickedEdge.id.startsWith('proxy-');
    const realId = isProxy ? clickedEdge.id.substring(6) : clickedEdge.id;
    const proxyId = isProxy ? clickedEdge.id : `proxy-${clickedEdge.id}`;

    const nextEdges = edges.map((currentEdge) => {
      if (currentEdge.id !== realId && currentEdge.id !== proxyId) return currentEdge;

      return {
        ...currentEdge,
        type: 'recipe',
        data: {
          ...(currentEdge.data as Record<string, unknown> | undefined),
          controlPoints: nextControlPoints,
        },
      };
    });

    flowStore.setEdges(nextEdges, { visualOnly: true });
  };

  const handleConnect = (connection: Connection) => {
    if (isTutorialActive()) {
      const sourceParsed = connection.sourceHandle ? parseHandleId(connection.sourceHandle) : null;
      const targetParsed = connection.targetHandle ? parseHandleId(connection.targetHandle) : null;
      const event = {
        type: 'edge-connect' as const,
        sourceNodeId: sourceParsed?.nodeId ?? connection.source,
        sourceIndex: sourceParsed?.index ?? -1,
        targetNodeId: targetParsed?.nodeId ?? connection.target,
        targetIndex: targetParsed?.index ?? -1,
      };
      if (!canPerformTutorialAction(event)) return;
      onConnect(connection);
      const didCreateOrFindEdge = useFlowStore.getState().edges.some((edge) => {
        const edgeSource = edge.sourceHandle ? parseHandleId(edge.sourceHandle) : null;
        const edgeTarget = edge.targetHandle ? parseHandleId(edge.targetHandle) : null;
        if (!edgeSource || !edgeTarget) return false;
        return (
          edgeSource.nodeId === event.sourceNodeId &&
          edgeTarget.nodeId === event.targetNodeId &&
          edgeSource.index === event.sourceIndex &&
          edgeTarget.index === event.targetIndex
        );
      });
      if (didCreateOrFindEdge) {
        completeTutorialAction(event);
      }
      return;
    }

    onConnect(connection);
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={handleNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={handleConnect}
      onNodeDragStart={handleNodeDragStart}
      onNodeDrag={handleNodeDrag}
      onNodeDragStop={handleNodeDragStop}
      onSelectionDragStart={handleSelectionDragStart}
      onSelectionDragStop={handleSelectionDragStop}
      onEdgeClick={onEdgeClick}
      onEdgeDoubleClick={onEdgeDoubleClick}
      onNodeClick={onNodeClick}
      isValidConnection={isValidConnection}
      snapToGrid={true}
      snapGrid={SNAP_GRID}
      elevateNodesOnSelect={true}
      fitView={true}
      minZoom={REACT_FLOW_MIN_ZOOM}
      maxZoom={REACT_FLOW_MAX_ZOOM}
      connectOnClick={false}
      onMove={(_e, viewport) => {
        const nextZoomedOut = viewport.zoom < 0.35;
        if (nextZoomedOut !== useUIStore.getState().isZoomedOut) {
          useUIStore.getState().setIsZoomedOut(nextZoomedOut);
        }
        requestTutorialDriverRefresh();
      }}
      onMoveStart={() => useUIStore.getState().setIsTransforming(true)}
      onMoveEnd={() => {
        useUIStore.getState().setIsTransforming(false);
        requestTutorialDriverRefresh();
      }}
      onlyRenderVisibleElements={nodes.length > 250 && !isZoomedOut}
      deleteKeyCode={null}
      selectionKeyCode={null}
      multiSelectionKeyCode={null}
      panActivationKeyCode={null}
      connectionLineType={
        edgePathStyle === 'bezier'
          ? ConnectionLineType.Bezier
          : edgePathStyle === 'straight'
            ? ConnectionLineType.Straight
            : ConnectionLineType.SmoothStep
      }
      >
      <ViewportPortal>
        <div
          ref={groupBoundsPreviewRef}
          className={previewStyles['group-bounds-preview']}
          aria-hidden="true"
        />
      </ViewportPortal>
      <Background
        variant={BackgroundVariant.Dots}
        gap={SNAP_GRID}
        size={GRID_DOT_SIZE}
        color="var(--theme-color-grid-dots)"
      />
    </ReactFlow>
  );
}

export function FlowViewport() {
  const isZoomedOut = useUIStore((s) => s.isZoomedOut);

  useFlowSolver();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const uiStore = useUIStore.getState();
      if (isTutorialActive()) {
        if (canUseTutorialTextInput(e)) return;
        e.preventDefault();
        return;
      }
      if (uiStore.isRecipeSelectorOpen) return;

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isDragging = document.querySelector(
        '.react-flow__nodesselection-rect, .react-flow__connection-path, .react-flow__node.dragging',
      );
      if (isDragging) return;

      const key = e.key.toLowerCase();
      const hasCommandModifier = e.ctrlKey || e.metaKey;
      const isUndoShortcut = hasCommandModifier && !e.shiftKey && key === 'z';
      const isRedoShortcut = hasCommandModifier && ((e.shiftKey && key === 'z') || key === 'y');

      if (isUndoShortcut || isRedoShortcut) {
        if (e.repeat) return;
        e.preventDefault();
        const flowStore = useFlowStore.getState();
        if (isUndoShortcut) {
          flowStore.undo();
        } else {
          flowStore.redo();
        }
        return;
      }

      if (e.key === 'Alt') {
        e.preventDefault();
        uiStore.pushOverride('delete_mode');
      } else if (e.key === 'Control' || e.key === 'Meta') {
        e.preventDefault();
        uiStore.pushOverride('multi_select');
      } else if (e.key === 'Shift') {
        uiStore.pushOverride('target');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const uiStore = useUIStore.getState();
      if (isTutorialActive()) {
        if (canUseTutorialTextInput(e)) return;
        e.preventDefault();
        return;
      }
      if (uiStore.isRecipeSelectorOpen) return;

      if (e.key === 'Alt') {
        uiStore.popOverride('delete_mode');
      } else if (e.key === 'Control' || e.key === 'Meta') {
        uiStore.popOverride('multi_select');
      } else if (e.key === 'Shift') {
        uiStore.popOverride('target');
      }
    };

    const handleBlur = () => {
      useUIStore.setState({ temporaryOverrides: [] });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return <FlowViewportCanvas isZoomedOut={isZoomedOut} />;
}
