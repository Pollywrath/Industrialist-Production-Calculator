import { useEffect, useRef, useState } from 'react';
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
import type { EdgeControlPoint } from '../../../types/edges';
import { isAppConnectionValid } from '../../../canvas/connectionValidation';
import { useFlowStore } from '../../../stores/useFlowStore';
import {
  registerCanvasAdapter,
  type CanvasBounds,
  type CanvasPoint,
  type CanvasViewState,
} from '../../../canvas/canvasAdapterApi';
import { parseHandleId } from '../../../utils/idGenerator';
import { useEdgeThemeStore } from '../../../stores/useEdgeThemeStore';
import { useUIStore, getEffectiveToggleId } from '../../../stores/useUIStore';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
  useTutorialStore,
} from '../../../stores/useTutorialStore';
import {
  insertOrthogonalTurnPair,
  type OrthogonalRouteAnchors,
} from '../../../utils/canvas/orthogonalEdgeRouting';
import {
  distanceSquaredPointToSegment,
  findNearestSegmentIndex,
  getPointArray,
} from '../../../utils/canvas/edgeGeometry';
import { SNAP_GRID, GRID_DOT_SIZE } from '../../../constants/layoutConstants';
import { isGroupNode, isRecipeNode } from '../../../types/nodes';
import type { CanvasNode } from '../../../types/nodes';
import {
  computeBoundsFromMembersWithMovedMember,
  getRecipeMemberBounds,
} from '../../../utils/groupBounds';
import type { GroupBounds, GroupMemberBounds } from '../../../utils/groupBounds';
import previewStyles from './GroupBoundsPreview.module.css';
import { TUTORIAL_DRIVER_REFRESH_EVENT } from '../../tutorial/tutorialHighlightUtils';
import { EdgeInfoPopup } from '../shared/EdgeInfoPopup';

interface EdgeInfoPopupState {
  edgeId: string;
  x: number;
  y: number;
}

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
      const selectedNodeIds = useFlowStore
        .getState()
        .nodes.filter(
          (currentNode) => isRecipeNode(currentNode) && currentNode.data.isMultiSelected,
        )
        .map((currentNode) => currentNode.id);
      completeTutorialAction({ type: 'node-multi-select', nodeIds: selectedNodeIds });
      return;
    }

    if (isRecipeNode(node) && canPerformTutorialAction({ type: 'target-node', nodeId: node.id })) {
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
  groupId?: string;
  groupPreview: GroupBoundsPreviewState | null;
}

interface GroupBoundsPreviewState {
  draggedNodeId: string;
  members: GroupMemberBounds[];
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
  const [edgeInfoPopup, setEdgeInfoPopup] = useState<EdgeInfoPopupState | null>(null);
  const {
    screenToFlowPosition,
    flowToScreenPosition,
    getInternalNode,
    getViewport,
    fitView,
    setCenter,
  } = useReactFlow<CanvasNode, Edge>();

  const batchDragRef = useRef<BatchDragState | null>(null);
  const groupBoundsPreviewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const toScreenBounds = (bounds: CanvasBounds): CanvasBounds => {
      const topLeft = flowToScreenPosition({ x: bounds.x, y: bounds.y });
      const bottomRight = flowToScreenPosition({
        x: bounds.x + bounds.width,
        y: bounds.y + bounds.height,
      });
      return {
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
      };
    };

    const getPortBounds = (
      nodeId: string,
      portId: string,
      space: 'graph' | 'screen' = 'graph',
    ): CanvasBounds | null => {
      const node = getInternalNode(nodeId);
      const parsedPort = parseHandleId(portId);
      if (!node || !parsedPort || parsedPort.nodeId !== nodeId) return null;
      const type = parsedPort.side === 'input' ? 'target' : 'source';
      const handle = node.internals.handleBounds?.[type]?.find((item) => item.id === portId);
      if (!handle) return null;
      const bounds = {
        x: node.internals.positionAbsolute.x + handle.x,
        y: node.internals.positionAbsolute.y + handle.y,
        width: handle.width,
        height: handle.height,
      };
      return space === 'screen' ? toScreenBounds(bounds) : bounds;
    };

    const registration = registerCanvasAdapter({
      canvasType: 'react-flow',
      screenToGraph(point: CanvasPoint) {
        return screenToFlowPosition(point);
      },
      getViewport() {
        return getViewport();
      },
      getViewState(): CanvasViewState | undefined {
        const bounds = document.querySelector('.react-flow')?.getBoundingClientRect();
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return undefined;
        return {
          center: screenToFlowPosition({
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2,
          }),
          zoom: getViewport().zoom,
        };
      },
      setViewState(viewState) {
        void setCenter(viewState.center.x, viewState.center.y, {
          zoom: viewState.zoom,
          duration: 0,
        });
      },
      centerOnGraphPoint(point, zoom, duration) {
        void setCenter(point.x, point.y, { zoom, duration });
      },
      fitGraph() {
        void fitView({ padding: 0.12 });
      },
      getNodeBounds(nodeId, space = 'graph') {
        const node = getInternalNode(nodeId);
        if (!node) return null;
        const width = node.measured?.width ?? node.width ?? 0;
        const height = node.measured?.height ?? node.height ?? 0;
        if (width <= 0 || height <= 0) return null;
        const bounds = {
          x: node.internals.positionAbsolute.x,
          y: node.internals.positionAbsolute.y,
          width,
          height,
        };
        return space === 'screen' ? toScreenBounds(bounds) : bounds;
      },
      getPortBounds(nodeId, portId, space = 'graph') {
        return getPortBounds(nodeId, portId, space);
      },
      getEdgeGeometry(edgeId, space = 'graph') {
        const edge = useFlowStore.getState().edges.find((item) => item.id === edgeId);
        if (!edge) return null;
        const source = getPortBounds(edge.source, edge.sourceHandle ?? '', 'graph');
        const target = getPortBounds(edge.target, edge.targetHandle ?? '', 'graph');
        if (!source || !target) return null;
        const points: CanvasPoint[] = [
          { x: source.x + source.width / 2, y: source.y + source.height / 2 },
        ];
        const routePoints = getPointArray(
          edge.data,
          edgePathStyle === 'orthogonal' ? 'orthogonalTurns' : 'controlPoints',
        );
        points.push(...routePoints);
        points.push({ x: target.x + target.width / 2, y: target.y + target.height / 2 });
        const screenPoints =
          space === 'screen' ? points.map((point) => flowToScreenPosition(point)) : points;
        const xs = screenPoints.map((point) => point.x);
        const ys = screenPoints.map((point) => point.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);
        return {
          points: screenPoints,
          bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        };
      },
      selectNodes(nodeIds, _primaryNodeId) {
        if (_primaryNodeId && !nodeIds.includes(_primaryNodeId)) return;
        const state = useFlowStore.getState();
        const selected = new Set(nodeIds);
        state.onNodesChange(
          state.nodes.map((node) => ({
            id: node.id,
            type: 'select' as const,
            selected: selected.has(node.id),
          })),
        );
      },
      selectEdge(edgeId) {
        const state = useFlowStore.getState();
        state.onEdgesChange(
          state.edges.map((edge) => ({
            id: edge.id,
            type: 'select' as const,
            selected: edge.id === edgeId,
          })),
        );
      },
      selectGroup(groupId) {
        const state = useFlowStore.getState();
        state.onNodesChange(
          state.nodes.map((node) => ({
            id: node.id,
            type: 'select' as const,
            selected: node.id === groupId,
          })),
        );
      },
    });

    return registration;
  }, [
    edgePathStyle,
    fitView,
    flowToScreenPosition,
    getInternalNode,
    getViewport,
    screenToFlowPosition,
    setCenter,
  ]);

  useEffect(() => {
    if (!edgeInfoPopup) return;

    const dismissOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        (target.closest('.react-flow__edge') || target.closest('[data-edge-info-popup]'))
      ) {
        return;
      }
      setEdgeInfoPopup(null);
    };
    const dismissOnKeyDown = () => setEdgeInfoPopup(null);
    const dismissOnWheel = () => setEdgeInfoPopup(null);
    document.addEventListener('pointerdown', dismissOnPointerDown, true);
    window.addEventListener('keydown', dismissOnKeyDown, true);
    window.addEventListener('wheel', dismissOnWheel, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', dismissOnPointerDown, true);
      window.removeEventListener('keydown', dismissOnKeyDown, true);
      window.removeEventListener('wheel', dismissOnWheel, true);
    };
  }, [edgeInfoPopup]);

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

  const isValidConnection = (connection: Connection | Edge) => {
    const flowStore = useFlowStore.getState();
    return isAppConnectionValid(connection, {
      nodes: flowStore.nodes,
      edges: flowStore.edges,
    });
  };

  const handleNodeDragStart = (_event: React.MouseEvent, node: Node) => {
    if (isTutorialActive()) {
      const action = isGroupNode(node)
        ? { type: 'group-move' as const, groupId: node.id }
        : { type: 'node-move' as const, nodeId: node.id };
      if (!canPerformTutorialAction(action)) return;
    }
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
      groupId: shouldDragGroup ? node.id : undefined,
      groupPreview,
    };

    captureDragStart(nodeIds, shouldDragGroup ? node.id : undefined);
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
    const batchDrag = batchDragRef.current;
    if (isTutorialActive() && !batchDrag) {
      hideGroupBoundsPreview(groupBoundsPreviewRef.current);
      return;
    }
    const nodeIds = batchDrag?.nodeIds ?? draggedNodes.map((draggedNode) => draggedNode.id);
    batchDragRef.current = null;
    hideGroupBoundsPreview(groupBoundsPreviewRef.current);
    commitDragStop(nodeIds);
    if (isTutorialActive() && batchDrag) {
      const didMove = [...batchDrag.startPositions].some(([id, start]) => {
        const current = useFlowStore.getState().nodesMap.get(id);
        return !!current && (current.position.x !== start.x || current.position.y !== start.y);
      });
      if (didMove) {
        const event = batchDrag.groupId
          ? { type: 'group-move' as const, groupId: batchDrag.groupId }
          : { type: 'node-move' as const, nodeId: batchDrag.draggedNodeId };
        completeTutorialAction(event);
      }
    }
    requestTutorialDriverRefresh();
  };

  const handleSelectionDragStart = (_event: React.MouseEvent, draggedNodes: Node[]) => {
    if (isTutorialActive()) return;
    captureDragStart(draggedNodes.map((draggedNode) => draggedNode.id));
  };

  const handleSelectionDragStop = (_event: React.MouseEvent, draggedNodes: Node[]) => {
    if (isTutorialActive()) return;
    commitDragStop(draggedNodes.map((draggedNode) => draggedNode.id));
    requestTutorialDriverRefresh();
  };

  const handleNodesChange: typeof onNodesChange = (changes) => {
    const acceptedChanges = isTutorialActive()
      ? changes.filter((change) => {
          if (change.type !== 'position' || change.dragging !== true) return true;
          const node = useFlowStore.getState().nodesMap.get(change.id);
          if (isGroupNode(node)) {
            return canPerformTutorialAction({ type: 'group-move', groupId: node.id });
          }
          return (
            isRecipeNode(node) && canPerformTutorialAction({ type: 'node-move', nodeId: node.id })
          );
        })
      : changes;
    if (acceptedChanges.length === 0) return;

    let hasSelectionChange = false;
    for (let i = 0; i < acceptedChanges.length; i++) {
      if (acceptedChanges[i].type === 'select') {
        hasSelectionChange = true;
        break;
      }
    }

    if (!hasSelectionChange) {
      onNodesChange(acceptedChanges);
      return;
    }

    const nonSelectionChanges = [];
    for (let i = 0; i < acceptedChanges.length; i++) {
      const change = acceptedChanges[i];
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
      setEdgeInfoPopup(null);
      event.stopPropagation();
      onEdgesChange([{ type: 'remove', id: edge.id }]);
      return;
    }

    setEdgeInfoPopup({ edgeId: edge.id, x: event.clientX + 14, y: event.clientY + 14 });
  };

  const onEdgeDoubleClick = (event: React.MouseEvent, clickedEdge: Edge) => {
    event.stopPropagation();
    setEdgeInfoPopup(null);
    if (isTutorialActive()) return;
    if (!clickedEdge.selected) return;

    const flowStore = useFlowStore.getState();
    const nextPoint = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const existingPoints = getPointArray(clickedEdge.data, 'controlPoints');
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

    const isProxy = clickedEdge.id.startsWith('proxy-');
    const realId = isProxy ? clickedEdge.id.substring(6) : clickedEdge.id;
    const proxyId = isProxy ? clickedEdge.id : `proxy-${clickedEdge.id}`;

    if (edgePathStyle === 'orthogonal') {
      if (!sourcePoint || !targetPoint) return;

      const orthogonalRoute: OrthogonalRouteAnchors = {
        sourceX: sourcePoint.x,
        sourceY: sourcePoint.y,
        targetX: targetPoint.x,
        targetY: targetPoint.y,
      };
      const nextOrthogonalTurns = insertOrthogonalTurnPair(
        getPointArray(clickedEdge.data, 'orthogonalTurns'),
        nextPoint,
        orthogonalRoute,
      );

      const nextEdges = edges.map((currentEdge) => {
        if (currentEdge.id !== realId && currentEdge.id !== proxyId) return currentEdge;

        return {
          ...currentEdge,
          type: 'recipe',
          data: {
            ...(currentEdge.data as Record<string, unknown> | undefined),
            orthogonalTurns: nextOrthogonalTurns,
          },
        };
      });

      flowStore.setEdges(nextEdges, { visualOnly: true });
      return;
    }

    let nextControlPoints = [...existingPoints, nextPoint];

    if (sourcePoint && targetPoint) {
      const pathPoints: EdgeControlPoint[] = [sourcePoint, ...existingPoints, targetPoint];
      const nearestSegmentIndex =
        edgePathStyle === 'straight'
          ? findNearestSegmentIndex(pathPoints, nextPoint)
          : findNearestCatmullSegmentIndex(pathPoints, nextPoint);
      const insertIndex = Math.max(0, Math.min(existingPoints.length, nearestSegmentIndex));
      nextControlPoints = existingPoints.slice();
      nextControlPoints.splice(insertIndex, 0, nextPoint);
    }

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
      onMoveStart={() => {
        setEdgeInfoPopup(null);
        useUIStore.getState().setIsTransforming(true);
      }}
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
      {edgeInfoPopup && (
        <EdgeInfoPopup
          edgeId={edgeInfoPopup.edgeId}
          anchorX={edgeInfoPopup.x}
          anchorY={edgeInfoPopup.y}
          onDismiss={() => setEdgeInfoPopup(null)}
        />
      )}
    </ReactFlow>
  );
}

export function FlowViewport() {
  const isZoomedOut = useUIStore((s) => s.isZoomedOut);

  return <FlowViewportCanvas isZoomedOut={isZoomedOut} />;
}
