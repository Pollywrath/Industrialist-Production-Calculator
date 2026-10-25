import { Container, FederatedPointerEvent, Graphics, Polygon } from 'pixi.js';
import type { EdgePathStyle, FlowEdge } from '../../domain/edges/flow/model';
import {
  buildOrthogonalPathPoints,
  normalizeOrthogonalTurns,
  sampleCentripetalCatmullRom,
  type RouteAnchors,
  type RouteTangent,
} from '../../domain/edges/flow/routing';
import type { Bounds } from './spatial-index';
import { getCanvasThemeColors } from '../../theme/theme-colors';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface EdgeCurve {
  readonly start: Point;
  readonly control1: Point;
  readonly control2: Point;
  readonly tip: Point;
  readonly pathStyle?: EdgePathStyle;
  readonly points?: readonly Point[];
}

const BEZIER_SEGMENTS = 16;
const sampledBezierPoints = new WeakMap<EdgeCurve, Map<number, readonly Point[]>>();

export interface EdgeEndpointTangents {
  readonly source: RouteTangent;
  readonly target: RouteTangent;
}

export interface EdgeView {
  readonly container: Container;
  readonly hitLine: Graphics;
  readonly visual: Graphics;
  edgeId: string;
}

function getBezierPoint(
  start: Point,
  control1: Point,
  control2: Point,
  tip: Point,
  t: number,
): Point {
  const inverse = 1 - t;
  return {
    x:
      inverse ** 3 * start.x +
      3 * inverse ** 2 * t * control1.x +
      3 * inverse * t ** 2 * control2.x +
      t ** 3 * tip.x,
    y:
      inverse ** 3 * start.y +
      3 * inverse ** 2 * t * control1.y +
      3 * inverse * t ** 2 * control2.y +
      t ** 3 * tip.y,
  };
}

export function getEdgeCurvePoints(curve: EdgeCurve, segments = BEZIER_SEGMENTS): readonly Point[] {
  if (curve.points) return curve.points;
  let pointsBySegmentCount = sampledBezierPoints.get(curve);
  if (!pointsBySegmentCount) sampledBezierPoints.set(curve, (pointsBySegmentCount = new Map()));
  const cached = pointsBySegmentCount.get(segments);
  if (cached) return cached;
  const points = Array.from({ length: segments + 1 }, (_, index) =>
    getBezierPoint(curve.start, curve.control1, curve.control2, curve.tip, index / segments),
  );
  pointsBySegmentCount.set(segments, points);
  return points;
}

export function createEdgeCurve(
  start: Point,
  tip: Point,
  pathStyle: EdgePathStyle = 'orthogonal',
  controlPoints: readonly Point[] = [],
  orthogonalTurns: readonly import('../../domain/graph/types').EdgeControlPoint[] = [],
  endpointTangents: EdgeEndpointTangents = {
    source: { x: 1, y: 0 },
    target: { x: 1, y: 0 },
  },
): EdgeCurve {
  const anchors: RouteAnchors = {
    sourceX: start.x,
    sourceY: start.y,
    targetX: tip.x,
    targetY: tip.y,
  };

  if (pathStyle === 'straight') {
    const dx = tip.x - start.x;
    const dy = tip.y - start.y;
    return {
      start,
      control1: { x: start.x + dx / 3, y: start.y + dy / 3 },
      control2: { x: start.x + (dx * 2) / 3, y: start.y + (dy * 2) / 3 },
      tip,
      pathStyle,
      points: [start, ...controlPoints, tip],
    };
  }

  if (pathStyle === 'orthogonal') {
    const turns = normalizeOrthogonalTurns(orthogonalTurns, anchors);
    const points = buildOrthogonalPathPoints(anchors, turns).map(({ x, y }) => ({ x, y }));
    return {
      start,
      control1: points[1] ?? start,
      control2: points[points.length - 2] ?? tip,
      tip,
      pathStyle,
      points,
    };
  }

  if (controlPoints.length > 0) {
    const route = [start, ...controlPoints, tip];
    const sampled = sampleCentripetalCatmullRom(
      route,
      endpointTangents.source,
      endpointTangents.target,
    );
    return {
      start,
      control1: controlPoints[0],
      control2: controlPoints[controlPoints.length - 1],
      tip,
      pathStyle,
      points: sampled,
    };
  }

  const distance = Math.max(40, Math.min(160, Math.abs(tip.x - start.x) * 0.45));
  const control1 = { x: start.x + distance, y: start.y };
  const control2 = { x: tip.x - distance, y: tip.y };
  const curve = {
    start,
    control1,
    control2,
    tip,
    pathStyle,
  };
  return curve;
}

export function getEdgeCurveBounds(curve: EdgeCurve, padding = 6): Bounds {
  const boundPoints =
    !curve.points && (curve.pathStyle === 'bezier' || curve.pathStyle === undefined)
      ? [curve.start, curve.control1, curve.control2, curve.tip]
      : getEdgeCurvePoints(curve);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of boundPoints) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

function pointInBounds(point: Point, minX: number, minY: number, maxX: number, maxY: number) {
  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}

function segmentIntersectsBounds(
  start: Point,
  end: Point,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
) {
  let t0 = 0;
  let t1 = 1;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let denominator = -dx;
  let numerator = start.x - minX;
  if (denominator === 0) {
    if (numerator < 0) return false;
  } else {
    const ratio = numerator / denominator;
    if (denominator < 0) {
      if (ratio > t1) return false;
      t0 = Math.max(t0, ratio);
    } else {
      if (ratio < t0) return false;
      t1 = Math.min(t1, ratio);
    }
  }
  denominator = dx;
  numerator = maxX - start.x;
  if (denominator === 0) {
    if (numerator < 0) return false;
  } else {
    const ratio = numerator / denominator;
    if (denominator < 0) {
      if (ratio > t1) return false;
      t0 = Math.max(t0, ratio);
    } else {
      if (ratio < t0) return false;
      t1 = Math.min(t1, ratio);
    }
  }
  denominator = -dy;
  numerator = start.y - minY;
  if (denominator === 0) {
    if (numerator < 0) return false;
  } else {
    const ratio = numerator / denominator;
    if (denominator < 0) {
      if (ratio > t1) return false;
      t0 = Math.max(t0, ratio);
    } else {
      if (ratio < t0) return false;
      t1 = Math.min(t1, ratio);
    }
  }
  denominator = dy;
  numerator = maxY - start.y;
  if (denominator === 0) {
    if (numerator < 0) return false;
  } else {
    const ratio = numerator / denominator;
    if (denominator < 0) {
      if (ratio > t1) return false;
    } else {
      if (ratio < t0) return false;
    }
  }
  return true;
}

export function edgeCurveIntersectsBounds(curve: EdgeCurve, bounds: Bounds, strokePadding = 1) {
  let curveMinX = Number.POSITIVE_INFINITY;
  let curveMinY = Number.POSITIVE_INFINITY;
  let curveMaxX = Number.NEGATIVE_INFINITY;
  let curveMaxY = Number.NEGATIVE_INFINITY;
  if (!curve.points && (curve.pathStyle === 'bezier' || curve.pathStyle === undefined)) {
    curveMinX = Math.min(curve.start.x, curve.control1.x, curve.control2.x, curve.tip.x);
    curveMinY = Math.min(curve.start.y, curve.control1.y, curve.control2.y, curve.tip.y);
    curveMaxX = Math.max(curve.start.x, curve.control1.x, curve.control2.x, curve.tip.x);
    curveMaxY = Math.max(curve.start.y, curve.control1.y, curve.control2.y, curve.tip.y);
  } else {
    const extentPoints = curve.points ?? getEdgeCurvePoints(curve);
    for (const point of extentPoints) {
      curveMinX = Math.min(curveMinX, point.x);
      curveMinY = Math.min(curveMinY, point.y);
      curveMaxX = Math.max(curveMaxX, point.x);
      curveMaxY = Math.max(curveMaxY, point.y);
    }
  }
  if (
    curveMaxX + strokePadding < bounds.minX ||
    curveMinX - strokePadding > bounds.maxX ||
    curveMaxY + strokePadding < bounds.minY ||
    curveMinY - strokePadding > bounds.maxY
  )
    return false;
  if (
    curveMinX - strokePadding >= bounds.minX &&
    curveMaxX + strokePadding <= bounds.maxX &&
    curveMinY - strokePadding >= bounds.minY &&
    curveMaxY + strokePadding <= bounds.maxY
  )
    return true;

  const minX = bounds.minX - strokePadding;
  const minY = bounds.minY - strokePadding;
  const maxX = bounds.maxX + strokePadding;
  const maxY = bounds.maxY + strokePadding;
  const candidates = getEdgeCurvePoints(curve, 32);
  for (const point of candidates) if (pointInBounds(point, minX, minY, maxX, maxY)) return true;
  for (let index = 1; index < candidates.length; index++) {
    if (segmentIntersectsBounds(candidates[index - 1], candidates[index], minX, minY, maxX, maxY))
      return true;
  }
  return false;
}

export function distanceToEdgeCurve(curve: EdgeCurve, point: Point) {
  let minimumDistance = Number.POSITIVE_INFINITY;
  const points = getEdgeCurvePoints(curve);
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const lengthSquared = dx * dx + dy * dy;
    const projection =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - previous.x) * dx + (point.y - previous.y) * dy) / lengthSquared,
            ),
          );
    const closestX = previous.x + projection * dx;
    const closestY = previous.y + projection * dy;
    minimumDistance = Math.min(minimumDistance, Math.hypot(point.x - closestX, point.y - closestY));
  }
  return minimumDistance;
}

function createCurveHitArea(curve: EdgeCurve, radius: number) {
  const points = getEdgeCurvePoints(curve);
  const forward: number[] = [];
  const backward: number[] = [];
  for (let index = 0; index < points.length; index++) {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const tangentX = next.x - previous.x;
    const tangentY = next.y - previous.y;
    const length = Math.hypot(tangentX, tangentY) || 1;
    const normalX = (-tangentY / length) * radius;
    const normalY = (tangentX / length) * radius;
    forward.push(points[index].x + normalX, points[index].y + normalY);
    backward.push(points[index].x - normalX, points[index].y - normalY);
  }
  const reverseOrder: number[] = [];
  for (let index = backward.length - 2; index >= 0; index -= 2) {
    reverseOrder.push(backward[index], backward[index + 1]);
  }
  return new Polygon([...forward, ...reverseOrder]);
}

export function createEdgeView(
  onPointerDown: (edgeId: string, event: FederatedPointerEvent) => void,
): EdgeView {
  const container = new Container();
  container.eventMode = 'passive';
  container.cursor = 'pointer';
  const hitLine = new Graphics();
  hitLine.eventMode = 'static';
  hitLine.cursor = 'pointer';
  const visual = new Graphics();
  container.addChild(hitLine, visual);
  const view: EdgeView = { container, hitLine, visual, edgeId: '' };
  hitLine.on('pointerdown', (event: FederatedPointerEvent) => onPointerDown(view.edgeId, event));
  return view;
}

export function drawEdge(
  view: EdgeView,
  edge: FlowEdge,
  curve: EdgeCurve | null,
  selected: boolean,
) {
  view.edgeId = edge.id;
  if (!curve) {
    view.hitLine.clear();
    view.visual.clear();
    return;
  }

  const points = getEdgeCurvePoints(curve);
  const start = points[0];
  view.hitLine.hitArea = createCurveHitArea(curve, 6);
  const themeColors = getCanvasThemeColors();
  const color = selected ? themeColors.selected : themeColors.edge;

  view.hitLine.clear().moveTo(start.x, start.y);
  view.visual.clear().moveTo(start.x, start.y);
  for (let index = 1; index < points.length; index++) {
    view.hitLine.lineTo(points[index].x, points[index].y);
    view.visual.lineTo(points[index].x, points[index].y);
  }
  view.hitLine.stroke({ color: themeColors.white, alpha: 0.01, width: 12 });
  view.visual.stroke({ color, width: selected ? 3 : 2 });
}
