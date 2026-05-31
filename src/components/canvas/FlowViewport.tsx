import { useEffect } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useReactFlow,
  ConnectionLineType,
  type Edge,
  type Connection,
  type InternalNode,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { RecipeNode } from './nodes/RecipeNode';
import { RecipeEdge } from './edges/RecipeEdge';
import { getProduct } from '../../data/lookup';
import type { EdgeControlPoint } from '../../types/edges';
import { createGraphResolutionContext } from '../../utils/graphResolutionContext';
import { useFlowStore } from '../../stores/useFlowStore';
import { useFlowResultStore } from '../../stores/useFlowResultStore';
import { useEdgeThemeStore } from '../../stores/useEdgeThemeStore';
import { useUIStore, getEffectiveToggleId } from '../../stores/useUIStore';
import { useFlowSolver } from '../../hooks/useFlowSolver';
import { parseHandleId } from '../../utils/idGenerator';
import { SNAP_GRID, GRID_DOT_SIZE } from '../shared/layoutConstants';

const nodeTypes = {
  recipe: RecipeNode,
};
const edgeTypes = {
  recipe: RecipeEdge,
};

const CONTROL_POINT_MIN_DISTANCE = 10;
const CONTROL_POINT_DELETE_HIT_RADIUS = 7;
const CATMULL_SEGMENT_SAMPLES = 16;

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

function isNearExistingPoint(
  controlPoints: EdgeControlPoint[],
  candidate: EdgeControlPoint,
  threshold: number,
): boolean {
  const thresholdSquared = threshold * threshold;
  for (let i = 0; i < controlPoints.length; i++) {
    const point = controlPoints[i];
    const dx = point.x - candidate.x;
    const dy = point.y - candidate.y;
    if (dx * dx + dy * dy <= thresholdSquared) return true;
  }
  return false;
}

function findControlPointIndexNear(
  controlPoints: EdgeControlPoint[],
  candidate: EdgeControlPoint,
  threshold: number,
): number {
  const thresholdSquared = threshold * threshold;
  for (let i = 0; i < controlPoints.length; i++) {
    const point = controlPoints[i];
    const dx = point.x - candidate.x;
    const dy = point.y - candidate.y;
    if (dx * dx + dy * dy <= thresholdSquared) return i;
  }
  return -1;
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
      ((2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      ((2 * p1.y) +
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

const onNodeClick = (_event: React.MouseEvent, node: Node) => {
  const toggleId = getEffectiveToggleId(useUIStore.getState());
  if (toggleId === 'delete_mode') {
    useFlowStore.getState().deleteNode(node.id);
  } else if (toggleId === 'target') {
    const isTarget = !!node.data?.isTarget;
    useFlowStore.getState().updateNodeData(node.id, { isTarget: !isTarget });
  }
};

interface FlowViewportCanvasProps {
  isZoomedOut: boolean;
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
  const { screenToFlowPosition, getInternalNode } = useReactFlow();
  const resolutionContext = createGraphResolutionContext(nodes, edges);

  const isValidConnection = (connection: Connection | Edge) => {
      if (
        !connection.source ||
        !connection.target ||
        !connection.sourceHandle ||
        !connection.targetHandle
      )
        return false;

      const sourceParsed = parseHandleId(connection.sourceHandle);
      const targetParsed = parseHandleId(connection.targetHandle);

      if (!sourceParsed || !targetParsed) {
        return false;
      }

      if (sourceParsed.side !== 'output' || targetParsed.side !== 'input') {
        return false;
      }

      const sourceHelpers = resolutionContext.createHelpers(connection.source);
      const targetHelpers = resolutionContext.createHelpers(connection.target);
      const committedResolvedProducts = useFlowResultStore.getState().resolvedProducts;
      const resolvedSourceProductId =
        committedResolvedProducts[connection.sourceHandle] ??
        sourceHelpers.resolveProduct('output', sourceParsed.index);
      const resolvedTargetProductId =
        committedResolvedProducts[connection.targetHandle] ??
        targetHelpers.resolveProduct('input', targetParsed.index);

      const sourceProdObj = getProduct(resolvedSourceProductId);
      const targetProdObj = getProduct(resolvedTargetProductId);

      if (!sourceProdObj || !targetProdObj) return false;

      if (resolvedSourceProductId === resolvedTargetProductId) return true;

      const isSourceAny =
        resolvedSourceProductId === 'any_fluid' || resolvedSourceProductId === 'any_item';
      const isTargetAny =
        resolvedTargetProductId === 'any_fluid' || resolvedTargetProductId === 'any_item';

      if (isSourceAny || isTargetAny) {
        return sourceProdObj.type === targetProdObj.type;
      }

      return false;
    };

  const handleNodeDragStart = (_event: React.MouseEvent, _node: Node, draggedNodes: Node[]) => {
    captureDragStart(draggedNodes.map((draggedNode) => draggedNode.id));
  };

  const handleNodeDragStop = (_event: React.MouseEvent, _node: Node, draggedNodes: Node[]) => {
    commitDragStop(draggedNodes.map((draggedNode) => draggedNode.id));
  };

  const handleSelectionDragStart = (_event: React.MouseEvent, draggedNodes: Node[]) => {
    captureDragStart(draggedNodes.map((draggedNode) => draggedNode.id));
  };

  const handleSelectionDragStop = (_event: React.MouseEvent, draggedNodes: Node[]) => {
    commitDragStop(draggedNodes.map((draggedNode) => draggedNode.id));
  };

  const onEdgeClick = (event: React.MouseEvent, edge: Edge) => {
    if (getEffectiveToggleId(useUIStore.getState()) !== 'delete_mode') {
      return;
    }

    const flowStore = useFlowStore.getState();
    const clickPosition = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const currentEdge = flowStore.edges.find((existingEdge) => existingEdge.id === edge.id);
    if (currentEdge) {
      const existingPoints = toControlPoints(currentEdge.data);
      const controlPointIndex = findControlPointIndexNear(
        existingPoints,
        clickPosition,
        CONTROL_POINT_DELETE_HIT_RADIUS,
      );

      if (controlPointIndex !== -1) {
        const nextEdges = flowStore.edges.map((existingEdge) => {
          if (existingEdge.id !== edge.id) return existingEdge;

          const points = toControlPoints(existingEdge.data);
          if (controlPointIndex < 0 || controlPointIndex >= points.length) return existingEdge;
          const nextPoints = points.filter((_, index) => index !== controlPointIndex);

          const nextData: Record<string, unknown> = {
            ...(existingEdge.data as Record<string, unknown> | undefined),
          };
          if (nextPoints.length > 0) {
            nextData.controlPoints = nextPoints;
          } else {
            delete nextData.controlPoints;
          }

          return {
            ...existingEdge,
            type: 'recipe',
            data: nextData,
          };
        });

        flowStore.setEdges(nextEdges, { visualOnly: true });
        return;
      }
    }

    flowStore.setEdges(flowStore.edges.filter((existingEdge) => existingEdge.id !== edge.id));
  };

  const onEdgeDoubleClick = (event: React.MouseEvent, edge: Edge) => {
    if (edgePathStyle !== 'bezier' && edgePathStyle !== 'straight') return;
    if (getEffectiveToggleId(useUIStore.getState()) === 'delete_mode') return;

    const clickPosition = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    const nextPoint: EdgeControlPoint = { x: clickPosition.x, y: clickPosition.y };

    const flowStore = useFlowStore.getState();
    const nextEdges = flowStore.edges.map((currentEdge) => {
      if (currentEdge.id !== edge.id) return currentEdge;

      const existingPoints = toControlPoints(currentEdge.data);
      if (isNearExistingPoint(existingPoints, nextPoint, CONTROL_POINT_MIN_DISTANCE)) {
        return currentEdge;
      }

      const sourcePoint = resolveHandleCenter(
        getInternalNode(currentEdge.source),
        'source',
        currentEdge.sourceHandle,
      );
      const targetPoint = resolveHandleCenter(
        getInternalNode(currentEdge.target),
        'target',
        currentEdge.targetHandle,
      );

      if (!sourcePoint || !targetPoint) {
        const fallbackControlPoints = [...existingPoints, nextPoint];
        return {
          ...currentEdge,
          type: 'recipe',
          data: {
            ...(currentEdge.data as Record<string, unknown> | undefined),
            controlPoints: fallbackControlPoints,
          },
        };
      }

      const pathPoints: EdgeControlPoint[] = [sourcePoint, ...existingPoints, targetPoint];
      const nearestSegmentIndex =
        edgePathStyle === 'straight'
          ? findNearestPolylineSegmentIndex(pathPoints, nextPoint)
          : findNearestCatmullSegmentIndex(pathPoints, nextPoint);
      const insertIndex = Math.max(0, Math.min(existingPoints.length, nearestSegmentIndex));
      const nextControlPoints = existingPoints.slice();
      nextControlPoints.splice(insertIndex, 0, nextPoint);

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

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeDragStart={handleNodeDragStart}
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
      minZoom={0.15}
      onMove={(_e, viewport) => {
        const nextZoomedOut = viewport.zoom < 0.35;
        if (nextZoomedOut !== useUIStore.getState().isZoomedOut) {
          useUIStore.getState().setIsZoomedOut(nextZoomedOut);
        }
      }}
      onMoveStart={() => useUIStore.getState().setIsTransforming(true)}
      onMoveEnd={() => useUIStore.getState().setIsTransforming(false)}
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

  return (
    <FlowViewportCanvas isZoomedOut={isZoomedOut} />
  );
}
