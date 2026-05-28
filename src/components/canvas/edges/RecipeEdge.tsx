import {
  BaseEdge,
  getBezierPath,
  getStraightPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { Fragment, useState } from 'react';
import type { CSSProperties } from 'react';
import { SNAP_GRID } from '../../shared/layoutConstants';
import { type EdgeControlPoint, type RecipeEdgeData } from '../../../types/edges';
import { useEdgeThemeStore } from '../../../stores/useEdgeThemeStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { getEffectiveToggleId, useUIStore } from '../../../stores/useUIStore';
import styles from './RecipeEdge.module.css';

const EDGE_STROKE_WIDTH = 2;
const EDGE_INTERACTION_WIDTH = 8;
const EDGE_CONTROL_POINT_RADIUS = 4;
const ORTHOGONAL_SEGMENT_HITBOX_WIDTH = 14;
const ORTHOGONAL_HANDLE_LENGTH = 18;
const ORTHOGONAL_HANDLE_THICKNESS = 8;
const ORTHOGONAL_MIN_SEGMENT_LENGTH = 12;
const ORTHOGONAL_LEFTWARD_OFFSET = Math.max(
  SNAP_GRID[0] * 4,
  ORTHOGONAL_MIN_SEGMENT_LENGTH * 2,
);
const POSITION_EPSILON = 0.001;

type OrthogonalLayout = 'three' | 'five';

interface OrthogonalSegment {
  index: number;
  start: EdgeControlPoint;
  end: EdgeControlPoint;
  orientation: 'horizontal' | 'vertical';
  midpoint: EdgeControlPoint;
  editable: boolean;
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

function isFinitePoint(point: EdgeControlPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function toFinitePoints(points: EdgeControlPoint[] | undefined): EdgeControlPoint[] {
  if (!points || points.length === 0) return [];

  const next: EdgeControlPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point || !isFinitePoint(point)) continue;
    next.push({ x: point.x, y: point.y });
  }

  return next;
}

function buildPolylinePath(points: EdgeControlPoint[]): string {
  if (points.length < 2) return '';

  let path = `M ${toSvgPathNumber(points[0].x)} ${toSvgPathNumber(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${toSvgPathNumber(points[i].x)} ${toSvgPathNumber(points[i].y)}`;
  }

  return path;
}

function snapToGrid(value: number, gridSize: number): number {
  if (!Number.isFinite(value) || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

function getOrthogonalLayout(sourceX: number, targetX: number): OrthogonalLayout {
  return targetX < sourceX - POSITION_EPSILON ? 'five' : 'three';
}

function buildDefaultOrthogonalTurns(
  layout: OrthogonalLayout,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): EdgeControlPoint[] {
  if (layout === 'three') {
    const midX = snapToGrid((sourceX + targetX) / 2, SNAP_GRID[0]);
    return [
      { x: midX, y: sourceY },
      { x: midX, y: targetY },
    ];
  }

  const xA = snapToGrid(sourceX + ORTHOGONAL_LEFTWARD_OFFSET, SNAP_GRID[0]);
  const xB = snapToGrid(targetX - ORTHOGONAL_LEFTWARD_OFFSET, SNAP_GRID[0]);
  const midY = snapToGrid((sourceY + targetY) / 2, SNAP_GRID[1]);

  return [
    { x: xA, y: sourceY },
    { x: xA, y: midY },
    { x: xB, y: midY },
    { x: xB, y: targetY },
  ];
}

function normalizeOrthogonalTurns(
  layout: OrthogonalLayout,
  rawTurns: EdgeControlPoint[] | undefined,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): EdgeControlPoint[] {
  const defaultTurns = buildDefaultOrthogonalTurns(layout, sourceX, sourceY, targetX, targetY);
  const finiteTurns = toFinitePoints(rawTurns);

  if (layout === 'three') {
    if (finiteTurns.length < 2) return defaultTurns;

    const midX = snapToGrid((finiteTurns[0].x + finiteTurns[1].x) / 2, SNAP_GRID[0]);
    return [
      { x: midX, y: sourceY },
      { x: midX, y: targetY },
    ];
  }

  if (finiteTurns.length < 4) return defaultTurns;

  const xA = snapToGrid((finiteTurns[0].x + finiteTurns[1].x) / 2, SNAP_GRID[0]);
  const xB = snapToGrid((finiteTurns[2].x + finiteTurns[3].x) / 2, SNAP_GRID[0]);
  const midY = snapToGrid((finiteTurns[1].y + finiteTurns[2].y) / 2, SNAP_GRID[1]);

  return [
    { x: xA, y: sourceY },
    { x: xA, y: midY },
    { x: xB, y: midY },
    { x: xB, y: targetY },
  ];
}

function buildOrthogonalPathPoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  turns: EdgeControlPoint[],
): EdgeControlPoint[] {
  return [{ x: sourceX, y: sourceY }, ...turns, { x: targetX, y: targetY }];
}

function isEditableOrthogonalSegment(layout: OrthogonalLayout, segmentIndex: number): boolean {
  return layout === 'three'
    ? segmentIndex === 1
    : segmentIndex === 1 || segmentIndex === 2 || segmentIndex === 3;
}

function buildOrthogonalSegments(
  points: EdgeControlPoint[],
  layout: OrthogonalLayout,
): OrthogonalSegment[] {
  const segments: OrthogonalSegment[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.abs(dx) < POSITION_EPSILON && Math.abs(dy) < POSITION_EPSILON) {
      continue;
    }

    const orientation = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
    segments.push({
      index: i,
      start,
      end,
      orientation,
      midpoint: {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
      },
      editable: isEditableOrthogonalSegment(layout, i),
    });
  }

  return segments;
}

function clampMovedCoordinate(
  proposed: number,
  previousAnchor: number,
  nextAnchor: number,
  currentValue: number,
): number {
  let next = proposed;

  const prevDirection = currentValue >= previousAnchor ? 1 : -1;
  if (Math.abs(next - previousAnchor) < ORTHOGONAL_MIN_SEGMENT_LENGTH) {
    next = previousAnchor + prevDirection * ORTHOGONAL_MIN_SEGMENT_LENGTH;
  }

  const nextDirection = currentValue >= nextAnchor ? 1 : -1;
  if (Math.abs(next - nextAnchor) < ORTHOGONAL_MIN_SEGMENT_LENGTH) {
    next = nextAnchor + nextDirection * ORTHOGONAL_MIN_SEGMENT_LENGTH;
  }

  return next;
}

function findOrthogonalSegmentByIndex(
  segments: OrthogonalSegment[],
  segmentIndex: number,
): OrthogonalSegment | null {
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].index === segmentIndex) return segments[i];
  }
  return null;
}

function projectPointOntoSegment(
  point: EdgeControlPoint,
  segmentStart: EdgeControlPoint,
  segmentEnd: EdgeControlPoint,
): EdgeControlPoint {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < POSITION_EPSILON) {
    return { x: segmentStart.x, y: segmentStart.y };
  }

  const tUnclamped =
    ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) /
    lengthSquared;
  const t = Math.max(0, Math.min(1, tUnclamped));
  return {
    x: segmentStart.x + dx * t,
    y: segmentStart.y + dy * t,
  };
}

export function RecipeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data,
}: EdgeProps<Edge<RecipeEdgeData>>) {
  const lineStyle = useEdgeThemeStore((s) => s.lineStyle);
  const pathStyle = useEdgeThemeStore((s) => s.pathStyle);
  const { screenToFlowPosition } = useReactFlow();

  const [previewControlPoints, setPreviewControlPoints] = useState<EdgeControlPoint[] | null>(null);
  const [previewOrthogonalTurns, setPreviewOrthogonalTurns] = useState<EdgeControlPoint[] | null>(null);
  const [hoveredOrthSegmentIndex, setHoveredOrthSegmentIndex] = useState<number | null>(null);
  const [hoveredOrthHandlePoint, setHoveredOrthHandlePoint] = useState<EdgeControlPoint | null>(null);
  const [draggingOrthSegmentIndex, setDraggingOrthSegmentIndex] = useState<number | null>(null);

  const controlPoints = previewControlPoints ?? toFinitePoints(data?.controlPoints);

  const orthogonalLayout = getOrthogonalLayout(sourceX, targetX);
  const orthogonalTurns = normalizeOrthogonalTurns(
    orthogonalLayout,
    previewOrthogonalTurns ?? data?.orthogonalTurns,
    sourceX,
    sourceY,
    targetX,
    targetY,
  );

  const setEdgePointArray = (
    edgeId: string,
    key: 'controlPoints' | 'orthogonalTurns',
    nextPoints: EdgeControlPoint[],
    options?: { recordHistory?: boolean; visualOnly?: boolean },
  ) => {
    const flowStore = useFlowStore.getState();
    const normalizedPoints = toFinitePoints(nextPoints);

    const nextEdges = flowStore.edges.map((edge) => {
      if (edge.id !== edgeId) return edge;

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

  const handleControlPointClick = (controlPointIndex: number, event: React.MouseEvent<SVGCircleElement>) => {
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

  const handleControlPointMouseDown = (controlPointIndex: number, event: React.MouseEvent<SVGCircleElement>) => {
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
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', finishDrag);
      setPreviewControlPoints(null);

      if (!didMove) return;
      setEdgePointArray(id, 'controlPoints', draggedPoints, { visualOnly: true });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', finishDrag);
  };

  const orthogonalPathPoints = buildOrthogonalPathPoints(
    sourceX,
    sourceY,
    targetX,
    targetY,
    orthogonalTurns,
  );
  const orthogonalSegments = buildOrthogonalSegments(orthogonalPathPoints, orthogonalLayout);
  const orthogonalPath = buildPolylinePath(orthogonalPathPoints);

  const handleOrthogonalSegmentMouseEnter = (
    segment: OrthogonalSegment,
    event: React.MouseEvent<SVGLineElement>,
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
      const nextTurns = draggedTurns.slice();

      if (orthogonalLayout === 'three') {
        const proposedX = snapToGrid(flowPosition.x, SNAP_GRID[0]);
        const clampedX = clampMovedCoordinate(proposedX, sourceX, targetX, nextTurns[0].x);

        if (
          Math.abs(nextTurns[0].x - clampedX) < POSITION_EPSILON &&
          Math.abs(nextTurns[1].x - clampedX) < POSITION_EPSILON
        ) {
          return;
        }

        nextTurns[0] = { x: clampedX, y: sourceY };
        nextTurns[1] = { x: clampedX, y: targetY };
      } else if (segment.index === 1) {
        const proposedX = snapToGrid(flowPosition.x, SNAP_GRID[0]);
        const clampedX = clampMovedCoordinate(proposedX, sourceX, nextTurns[2].x, nextTurns[0].x);

        if (
          Math.abs(nextTurns[0].x - clampedX) < POSITION_EPSILON &&
          Math.abs(nextTurns[1].x - clampedX) < POSITION_EPSILON
        ) {
          return;
        }

        nextTurns[0] = { x: clampedX, y: sourceY };
        nextTurns[1] = { x: clampedX, y: nextTurns[1].y };
      } else if (segment.index === 2) {
        const proposedY = snapToGrid(flowPosition.y, SNAP_GRID[1]);
        const clampedY = clampMovedCoordinate(proposedY, sourceY, targetY, nextTurns[1].y);

        if (
          Math.abs(nextTurns[1].y - clampedY) < POSITION_EPSILON &&
          Math.abs(nextTurns[2].y - clampedY) < POSITION_EPSILON
        ) {
          return;
        }

        nextTurns[1] = { x: nextTurns[1].x, y: clampedY };
        nextTurns[2] = { x: nextTurns[2].x, y: clampedY };
      } else if (segment.index === 3) {
        const proposedX = snapToGrid(flowPosition.x, SNAP_GRID[0]);
        const clampedX = clampMovedCoordinate(proposedX, nextTurns[0].x, targetX, nextTurns[2].x);

        if (
          Math.abs(nextTurns[2].x - clampedX) < POSITION_EPSILON &&
          Math.abs(nextTurns[3].x - clampedX) < POSITION_EPSILON
        ) {
          return;
        }

        nextTurns[2] = { x: clampedX, y: nextTurns[2].y };
        nextTurns[3] = { x: clampedX, y: targetY };
      } else {
        return;
      }

      const normalizedTurns = normalizeOrthogonalTurns(
        orthogonalLayout,
        nextTurns,
        sourceX,
        sourceY,
        targetX,
        targetY,
      );

      draggedTurns = normalizedTurns;
      didMove = true;
      setPreviewOrthogonalTurns(normalizedTurns);

      const nextPathPoints = buildOrthogonalPathPoints(
        sourceX,
        sourceY,
        targetX,
        targetY,
        normalizedTurns,
      );
      const nextSegments = buildOrthogonalSegments(nextPathPoints, orthogonalLayout);
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
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', finishDrag);

      setDraggingOrthSegmentIndex(null);
      setPreviewOrthogonalTurns(null);

      if (!didMove) return;
      setEdgePointArray(id, 'orthogonalTurns', draggedTurns, { visualOnly: true });
    };

    setDraggingOrthSegmentIndex(segmentIndex);
    setHoveredOrthSegmentIndex(segmentIndex);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', finishDrag);
  };

  const catmullPoints: EdgeControlPoint[] = [
    { x: sourceX, y: sourceY },
    ...controlPoints,
    { x: targetX, y: targetY },
  ];

  const catmullPath =
    pathStyle === 'bezier' && controlPoints.length > 0 ? buildCatmullRomPath(catmullPoints) : '';
  const straightControlPath =
    pathStyle === 'straight' && controlPoints.length > 0 ? buildPolylinePath(catmullPoints) : '';

  const [edgePath] =
    pathStyle === 'orthogonal'
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

  const edgeStyle: CSSProperties = {
    stroke: selected ? 'var(--theme-color-edge-selected-stroke)' : 'var(--theme-color-edge-stroke)',
    strokeWidth: EDGE_STROKE_WIDTH,
    strokeDasharray: lineStyle === 'dashed' ? '10 8' : lineStyle === 'dotted' ? '1 8' : undefined,
    strokeLinecap: lineStyle === 'dotted' ? 'round' : undefined,
    animation:
      lineStyle === 'dashed'
        ? 'recipe-edge-dash-flow 1.1s linear infinite'
        : lineStyle === 'dotted'
          ? 'recipe-edge-dot-flow 0.85s linear infinite'
          : undefined,
  };

  const activeOrthSegmentIndex =
    draggingOrthSegmentIndex !== null ? draggingOrthSegmentIndex : hoveredOrthSegmentIndex;

  const activeOrthSegment =
    pathStyle === 'orthogonal' && activeOrthSegmentIndex !== null
      ? findOrthogonalSegmentByIndex(orthogonalSegments, activeOrthSegmentIndex)
      : null;

  const showOrthogonalHandle =
    pathStyle === 'orthogonal' &&
    selected &&
    activeOrthSegment !== null &&
    activeOrthSegment.editable;
  const orthogonalHandleDimensions =
    showOrthogonalHandle && activeOrthSegment
      ? activeOrthSegment.orientation === 'horizontal'
        ? { width: ORTHOGONAL_HANDLE_LENGTH, height: ORTHOGONAL_HANDLE_THICKNESS }
        : { width: ORTHOGONAL_HANDLE_THICKNESS, height: ORTHOGONAL_HANDLE_LENGTH }
      : null;
  const activeOrthHandlePoint =
    showOrthogonalHandle && activeOrthSegment
      ? hoveredOrthHandlePoint ?? activeOrthSegment.midpoint
      : null;

  return (
    <Fragment>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={styles['edge-path']}
        style={edgeStyle}
        interactionWidth={EDGE_INTERACTION_WIDTH}
      />

      {pathStyle === 'orthogonal' && (
        <g className={styles['edge-orth-overlay']} onMouseLeave={handleOrthogonalOverlayLeave}>
          {orthogonalSegments.map((segment) => (
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
          ))}

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
              rx={Math.min(
                orthogonalHandleDimensions.width,
                orthogonalHandleDimensions.height,
              ) / 2}
              ry={Math.min(
                orthogonalHandleDimensions.width,
                orthogonalHandleDimensions.height,
              ) / 2}
              onMouseDown={(event) =>
                handleOrthogonalSegmentDragStart(activeOrthSegment.index, event)
              }
            />
          )}
        </g>
      )}

      {(pathStyle === 'bezier' || pathStyle === 'straight') &&
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
