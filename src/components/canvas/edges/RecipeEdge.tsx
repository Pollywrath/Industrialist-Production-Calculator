import {
  BaseEdge,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { Fragment, useState } from 'react';
import type { CSSProperties } from 'react';
import { type EdgeControlPoint, type RecipeEdgeData } from '../../../types/edges';
import { useEdgeThemeStore } from '../../../stores/useEdgeThemeStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { getEffectiveToggleId, useUIStore } from '../../../stores/useUIStore';
import styles from './RecipeEdge.module.css';

const EDGE_STROKE_WIDTH = 2;
const EDGE_INTERACTION_WIDTH = 8;
const EDGE_CONTROL_POINT_RADIUS = 4;

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
  const controlPoints = previewControlPoints ?? data?.controlPoints ?? [];

  const setControlPoints = (
    edgeId: string,
    nextControlPoints: EdgeControlPoint[],
    options?: { recordHistory?: boolean; visualOnly?: boolean },
  ) => {
    const flowStore = useFlowStore.getState();
    const nextEdges = flowStore.edges.map((edge) => {
      if (edge.id !== edgeId) return edge;

      const nextData: Record<string, unknown> = {
        ...(edge.data as Record<string, unknown> | undefined),
      };
      if (nextControlPoints.length > 0) {
        nextData.controlPoints = nextControlPoints;
      } else {
        delete nextData.controlPoints;
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
    setControlPoints(id, next, { visualOnly: true });
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

    const basePoints = (data?.controlPoints ?? []).map((point) => ({ x: point.x, y: point.y }));
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
      setControlPoints(id, draggedPoints, { visualOnly: true });
    };

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

  const [edgePath] =
    catmullPath
      ? [catmullPath]
      : pathStyle === 'straight'
      ? getStraightPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
        })
      : pathStyle === 'orthogonal'
        ? getSmoothStepPath({
            sourceX,
            sourceY,
            sourcePosition,
            targetX,
            targetY,
            targetPosition,
            borderRadius: 0,
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
      {pathStyle === 'bezier' &&
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
