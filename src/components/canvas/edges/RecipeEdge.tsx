import {
  BaseEdge,
  getBezierPath,
  getStraightPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { type EdgeControlPoint, type RecipeEdgeData } from '../../../types/edges';
import { useEdgeThemeStore } from '../../../stores/useEdgeThemeStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { getEffectiveToggleId, useUIStore } from '../../../stores/useUIStore';
import { parseHandleId } from '../../../utils/idGenerator';
import {
  buildOrthogonalPathPoints,
  buildOrthogonalSegments,
  deleteOrthogonalTurnPair,
  findOrthogonalSegmentByIndex,
  moveOrthogonalSegment,
  normalizeOrthogonalTurns,
  type OrthogonalRouteAnchors,
  type OrthogonalSegment,
} from '../../../utils/canvas/orthogonalEdgeRouting';
import {
  arePointsAtSamePosition,
  projectPointOntoSegment,
  toFinitePoints,
} from '../../../utils/canvas/edgeGeometry';
import styles from './RecipeEdge.module.css';

const EDGE_INTERACTION_WIDTH = 8;
const EDGE_CONTROL_POINT_RADIUS = 4;
const ORTHOGONAL_SEGMENT_HITBOX_WIDTH = 14;
const ORTHOGONAL_ZERO_SEGMENT_HITBOX_RADIUS = 9;
const ORTHOGONAL_HANDLE_LENGTH = 18;
const ORTHOGONAL_HANDLE_THICKNESS = 8;

const POSITION_EPSILON = 0.001;

interface DragListeners {
  onMouseMove: (event: MouseEvent) => void;
  onMouseUp: () => void;
}

function toSvgPathNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function buildCatmullRomPath(points: EdgeControlPoint[]): string {
  if (points.length < 2) return '';

  const firstPoint = points[0];
  let path = `M ${toSvgPathNumber(firstPoint.x)} ${toSvgPathNumber(firstPoint.y)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const cp1X = p1.x + (p2.x - p0.x) / 6;
    const cp1Y = p1.y + (p2.y - p0.y) / 6;
    const cp2X = p2.x - (p3.x - p1.x) / 6;
    const cp2Y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${toSvgPathNumber(cp1X)} ${toSvgPathNumber(cp1Y)} ${toSvgPathNumber(cp2X)} ${toSvgPathNumber(
      cp2Y,
    )} ${toSvgPathNumber(p2.x)} ${toSvgPathNumber(p2.y)}`;
  }

  return path;
}

function buildPolylinePath(points: EdgeControlPoint[]): string {
  if (points.length < 2) return '';

  let path = `M ${toSvgPathNumber(points[0].x)} ${toSvgPathNumber(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${toSvgPathNumber(points[i].x)} ${toSvgPathNumber(points[i].y)}`;
  }

  return path;
}

function arePointArraysEqual(a: EdgeControlPoint[], b: EdgeControlPoint[]): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (
      Math.abs(a[i].x - b[i].x) >= POSITION_EPSILON ||
      Math.abs(a[i].y - b[i].y) >= POSITION_EPSILON
    ) {
      return false;
    }
  }

  return true;
}

function isZeroLengthSegment(segment: OrthogonalSegment): boolean {
  return arePointsAtSamePosition(segment.start, segment.end);
}

export function RecipeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  markerEnd,
  selected,
  data,
}: EdgeProps<Edge<RecipeEdgeData>>) {
  const lineStyle = useEdgeThemeStore((s) => s.lineStyle);
  const pathStyle = useEdgeThemeStore((s) => s.pathStyle);
  const { screenToFlowPosition } = useReactFlow();

  const [previewControlPoints, setPreviewControlPoints] = useState<EdgeControlPoint[] | null>(null);
  const [previewOrthogonalTurns, setPreviewOrthogonalTurns] = useState<EdgeControlPoint[] | null>(
    null,
  );
  const [hoveredOrthSegmentIndex, setHoveredOrthSegmentIndex] = useState<number | null>(null);
  const [hoveredOrthHandlePoint, setHoveredOrthHandlePoint] = useState<EdgeControlPoint | null>(
    null,
  );
  const [draggingOrthSegmentIndex, setDraggingOrthSegmentIndex] = useState<number | null>(null);
  const controlDragListenersRef = useRef<DragListeners | null>(null);
  const orthDragListenersRef = useRef<DragListeners | null>(null);

  const clearControlDragListeners = () => {
    const listeners = controlDragListenersRef.current;
    if (!listeners) return;
    window.removeEventListener('mousemove', listeners.onMouseMove);
    window.removeEventListener('mouseup', listeners.onMouseUp);
    controlDragListenersRef.current = null;
  };

  const clearOrthDragListeners = () => {
    const listeners = orthDragListenersRef.current;
    if (!listeners) return;
    window.removeEventListener('mousemove', listeners.onMouseMove);
    window.removeEventListener('mouseup', listeners.onMouseUp);
    orthDragListenersRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearControlDragListeners();
      clearOrthDragListeners();
    };
  }, []);

  const isOrthogonalPath = pathStyle === 'orthogonal';
  const isControlPointPath = pathStyle === 'bezier' || pathStyle === 'straight';
  const showOrthogonalEditor = isOrthogonalPath && selected;
  const controlPoints = isControlPointPath
    ? (previewControlPoints ?? toFinitePoints(data?.controlPoints))
    : [];
  const orthogonalRoute: OrthogonalRouteAnchors = { sourceX, sourceY, targetX, targetY };
  const orthogonalTurns = isOrthogonalPath
    ? normalizeOrthogonalTurns(previewOrthogonalTurns ?? data?.orthogonalTurns, orthogonalRoute)
    : [];

  const setEdgePointArray = (
    edgeId: string,
    key: 'controlPoints' | 'orthogonalTurns',
    nextPoints: EdgeControlPoint[],
    options?: { recordHistory?: boolean; visualOnly?: boolean },
  ) => {
    const flowStore = useFlowStore.getState();
    const finitePoints = toFinitePoints(nextPoints);
    const normalizedPoints =
      key === 'orthogonalTurns'
        ? normalizeOrthogonalTurns(finitePoints, orthogonalRoute)
        : finitePoints;

    const isProxy = edgeId.startsWith('proxy-');
    const realId = isProxy ? edgeId.substring(6) : edgeId;
    const proxyId = isProxy ? edgeId : `proxy-${edgeId}`;

    const nextEdges = flowStore.edges.map((edge) => {
      if (edge.id !== realId && edge.id !== proxyId) return edge;

      const nextData: Record<string, unknown> = {
        ...(edge.data as Record<string, unknown> | undefined),
      };

      if (normalizedPoints.length > 0) {
        nextData[key] = normalizedPoints;
      } else {
        delete nextData[key];
      }

      return {
        ...edge,
        type: 'recipe',
        data: nextData,
      };
    });

    flowStore.setEdges(nextEdges, options);
  };

  const handleControlPointClick = (
    controlPointIndex: number,
    event: React.MouseEvent<SVGCircleElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (getEffectiveToggleId(useUIStore.getState()) !== 'delete_mode') {
      return;
    }
    if (controlPointIndex < 0 || controlPointIndex >= controlPoints.length) {
      return;
    }

    const next = controlPoints.filter((_, index) => index !== controlPointIndex);
    setEdgePointArray(id, 'controlPoints', next, { visualOnly: true });
  };

  const handleControlPointMouseDown = (
    controlPointIndex: number,
    event: React.MouseEvent<SVGCircleElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (getEffectiveToggleId(useUIStore.getState()) === 'delete_mode') {
      return;
    }
    if (event.button !== 0) {
      return;
    }

    const basePoints = toFinitePoints(data?.controlPoints);
    if (controlPointIndex < 0 || controlPointIndex >= basePoints.length) {
      return;
    }

    let isDragging = true;
    let draggedPoints = basePoints;
    let didMove = false;

    const updateAtPointer = (clientX: number, clientY: number) => {
      const flowPosition = screenToFlowPosition({ x: clientX, y: clientY });
      const nextPoints = draggedPoints.slice();
      const currentPoint = nextPoints[controlPointIndex];
      if (!currentPoint) return;

      if (currentPoint.x === flowPosition.x && currentPoint.y === flowPosition.y) {
        return;
      }

      nextPoints[controlPointIndex] = {
        x: flowPosition.x,
        y: flowPosition.y,
      };
      draggedPoints = nextPoints;
      didMove = true;
      setPreviewControlPoints(nextPoints);
    };

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging) return;
      moveEvent.preventDefault();
      updateAtPointer(moveEvent.clientX, moveEvent.clientY);
    };

    const finishDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      clearControlDragListeners();
      setPreviewControlPoints(null);

      if (!didMove) return;
      setEdgePointArray(id, 'controlPoints', draggedPoints, { visualOnly: true });
    };

    clearControlDragListeners();
    controlDragListenersRef.current = { onMouseMove, onMouseUp: finishDrag };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', finishDrag);
  };

  const handleOrthogonalBendPointClick = (
    bendPointIndex: number,
    event: React.MouseEvent<SVGCircleElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (getEffectiveToggleId(useUIStore.getState()) !== 'delete_mode') {
      return;
    }

    const nextTurns = deleteOrthogonalTurnPair(orthogonalTurns, bendPointIndex, orthogonalRoute);
    if (!nextTurns) return;

    setEdgePointArray(id, 'orthogonalTurns', nextTurns, { visualOnly: true });
  };

  const orthogonalPathPoints = isOrthogonalPath
    ? buildOrthogonalPathPoints(orthogonalRoute, orthogonalTurns)
    : [];
  const orthogonalSegments = showOrthogonalEditor
    ? buildOrthogonalSegments(orthogonalPathPoints)
    : [];
  const orthogonalPath = isOrthogonalPath ? buildPolylinePath(orthogonalPathPoints) : '';

  const handleOrthogonalSegmentMouseEnter = (
    segment: OrthogonalSegment,
    event: React.MouseEvent<SVGElement>,
  ) => {
    if (!selected || !segment.editable) return;

    const flowPosition = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    const projectedPoint = projectPointOntoSegment(flowPosition, segment.start, segment.end);

    setHoveredOrthSegmentIndex(segment.index);
    setHoveredOrthHandlePoint(projectedPoint);
  };

  const handleOrthogonalOverlayLeave = () => {
    if (draggingOrthSegmentIndex !== null) return;
    setHoveredOrthSegmentIndex(null);
    setHoveredOrthHandlePoint(null);
  };

  const handleOrthogonalSegmentDragStart = (
    segmentIndex: number,
    event: React.MouseEvent<SVGElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (getEffectiveToggleId(useUIStore.getState()) === 'delete_mode') {
      return;
    }
    if (event.button !== 0) {
      return;
    }

    const segment = findOrthogonalSegmentByIndex(orthogonalSegments, segmentIndex);
    if (!segment || !segment.editable) {
      return;
    }

    const startFlowPosition = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    setHoveredOrthHandlePoint(
      projectPointOntoSegment(startFlowPosition, segment.start, segment.end),
    );

    const baseTurns = orthogonalTurns.map((point) => ({ x: point.x, y: point.y }));
    let isDragging = true;
    let didMove = false;
    let draggedTurns = baseTurns;

    const updateAtPointer = (clientX: number, clientY: number) => {
      const flowPosition = screenToFlowPosition({ x: clientX, y: clientY });
      const normalizedTurns = moveOrthogonalSegment(
        draggedTurns,
        segment.index,
        flowPosition,
        orthogonalRoute,
      );
      if (!normalizedTurns || arePointArraysEqual(draggedTurns, normalizedTurns)) return;

      draggedTurns = normalizedTurns;
      didMove = true;
      setPreviewOrthogonalTurns(normalizedTurns);

      const nextPathPoints = buildOrthogonalPathPoints(orthogonalRoute, normalizedTurns);
      const nextSegments = buildOrthogonalSegments(nextPathPoints);
      const nextSegment = findOrthogonalSegmentByIndex(nextSegments, segment.index);
      if (nextSegment) {
        const projectedPoint = projectPointOntoSegment(
          flowPosition,
          nextSegment.start,
          nextSegment.end,
        );
        setHoveredOrthHandlePoint(projectedPoint);
      }
    };

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging) return;
      moveEvent.preventDefault();
      updateAtPointer(moveEvent.clientX, moveEvent.clientY);
    };

    const finishDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      clearOrthDragListeners();

      setDraggingOrthSegmentIndex(null);
      setPreviewOrthogonalTurns(null);

      if (!didMove) return;
      setEdgePointArray(id, 'orthogonalTurns', draggedTurns, { visualOnly: true });
    };

    setDraggingOrthSegmentIndex(segmentIndex);
    setHoveredOrthSegmentIndex(segmentIndex);
    clearOrthDragListeners();
    orthDragListenersRef.current = { onMouseMove, onMouseUp: finishDrag };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', finishDrag);
  };

  const catmullPoints: EdgeControlPoint[] = !isControlPointPath
    ? []
    : [{ x: sourceX, y: sourceY }, ...controlPoints, { x: targetX, y: targetY }];

  const catmullPath =
    pathStyle === 'bezier' && controlPoints.length > 0 ? buildCatmullRomPath(catmullPoints) : '';
  const straightControlPath =
    pathStyle === 'straight' && controlPoints.length > 0 ? buildPolylinePath(catmullPoints) : '';

  const [edgePath] = isOrthogonalPath
    ? [orthogonalPath]
    : catmullPath
      ? [catmullPath]
      : straightControlPath
        ? [straightControlPath]
        : pathStyle === 'straight'
          ? getStraightPath({
              sourceX,
              sourceY,
              targetX,
              targetY,
            })
          : getBezierPath({
              sourceX,
              sourceY,
              sourcePosition,
              targetX,
              targetY,
              targetPosition,
            });

  const activeOrthSegmentIndex =
    draggingOrthSegmentIndex !== null ? draggingOrthSegmentIndex : hoveredOrthSegmentIndex;

  const activeOrthSegment =
    isOrthogonalPath && activeOrthSegmentIndex !== null
      ? findOrthogonalSegmentByIndex(orthogonalSegments, activeOrthSegmentIndex)
      : null;

  const showOrthogonalHandle =
    showOrthogonalEditor && activeOrthSegment !== null && activeOrthSegment.editable;
  const showControlPointEditor = selected && isControlPointPath;
  const orthogonalHandleDimensions =
    showOrthogonalHandle && activeOrthSegment
      ? activeOrthSegment.orientation === 'horizontal'
        ? { width: ORTHOGONAL_HANDLE_LENGTH, height: ORTHOGONAL_HANDLE_THICKNESS }
        : { width: ORTHOGONAL_HANDLE_THICKNESS, height: ORTHOGONAL_HANDLE_LENGTH }
      : null;
  const activeOrthHandlePoint =
    showOrthogonalHandle && activeOrthSegment
      ? (hoveredOrthHandlePoint ?? activeOrthSegment.midpoint)
      : null;
  const sourceHandleParsed = sourceHandleId ? parseHandleId(sourceHandleId) : null;
  const targetHandleParsed = targetHandleId ? parseHandleId(targetHandleId) : null;

  return (
    <Fragment>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        data-tutorial-edge-source={source}
        data-tutorial-edge-target={target}
        data-tutorial-edge-source-index={sourceHandleParsed?.index}
        data-tutorial-edge-target-index={targetHandleParsed?.index}
        className={`${styles['edge-path']} ${styles[`line-style-${lineStyle}`]}`}
        style={
          {
            stroke: selected
              ? 'var(--theme-color-edge-selected-stroke)'
              : 'var(--theme-color-edge-stroke)',
            strokeWidth: 2,
            strokeDasharray:
              lineStyle === 'dashed' ? '10 8' : lineStyle === 'dotted' ? '1 8' : undefined,
            strokeLinecap: lineStyle === 'dotted' ? 'round' : undefined,
          } as CSSProperties
        }
        interactionWidth={EDGE_INTERACTION_WIDTH}
      />

      {showOrthogonalEditor && (
        <g className={styles['edge-orth-overlay']} onMouseLeave={handleOrthogonalOverlayLeave}>
          {orthogonalSegments.map((segment) =>
            segment.editable && isZeroLengthSegment(segment) ? (
              <circle
                key={`${id}-orth-segment-${segment.index}`}
                cx={segment.midpoint.x}
                cy={segment.midpoint.y}
                r={ORTHOGONAL_ZERO_SEGMENT_HITBOX_RADIUS}
                className={styles['edge-orth-zero-segment-hitbox']}
                onMouseEnter={(event) => handleOrthogonalSegmentMouseEnter(segment, event)}
                onMouseMove={(event) => handleOrthogonalSegmentMouseEnter(segment, event)}
              />
            ) : segment.editable ? (
              <line
                key={`${id}-orth-segment-${segment.index}`}
                x1={segment.start.x}
                y1={segment.start.y}
                x2={segment.end.x}
                y2={segment.end.y}
                className={styles['edge-orth-segment-hitbox']}
                strokeWidth={ORTHOGONAL_SEGMENT_HITBOX_WIDTH}
                onMouseEnter={(event) => handleOrthogonalSegmentMouseEnter(segment, event)}
                onMouseMove={(event) => handleOrthogonalSegmentMouseEnter(segment, event)}
              />
            ) : null,
          )}

          {showOrthogonalHandle &&
            activeOrthHandlePoint &&
            activeOrthSegment &&
            orthogonalHandleDimensions && (
              <rect
                className={styles['edge-orth-handle']}
                data-orth-handle="true"
                data-orientation={activeOrthSegment.orientation}
                x={activeOrthHandlePoint.x - orthogonalHandleDimensions.width / 2}
                y={activeOrthHandlePoint.y - orthogonalHandleDimensions.height / 2}
                width={orthogonalHandleDimensions.width}
                height={orthogonalHandleDimensions.height}
                rx={
                  Math.min(orthogonalHandleDimensions.width, orthogonalHandleDimensions.height) / 2
                }
                ry={
                  Math.min(orthogonalHandleDimensions.width, orthogonalHandleDimensions.height) / 2
                }
                onMouseDown={(event) =>
                  handleOrthogonalSegmentDragStart(activeOrthSegment.index, event)
                }
              />
            )}

          {orthogonalTurns.map((point, index) => (
            <circle
              key={`${id}-orth-bend-${index}`}
              className={styles['edge-orth-bend-point']}
              data-edge-orth-bend-point="true"
              cx={point.x}
              cy={point.y}
              r={EDGE_CONTROL_POINT_RADIUS}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => handleOrthogonalBendPointClick(index, event)}
            />
          ))}
        </g>
      )}

      {showControlPointEditor &&
        controlPoints.map((point, index) => (
          <circle
            key={`${id}-cp-${index}`}
            className={styles['edge-control-point']}
            data-edge-control-point="true"
            cx={point.x}
            cy={point.y}
            r={EDGE_CONTROL_POINT_RADIUS}
            onMouseDown={(event) => handleControlPointMouseDown(index, event)}
            onClick={(event) => handleControlPointClick(index, event)}
          />
        ))}
    </Fragment>
  );
}
