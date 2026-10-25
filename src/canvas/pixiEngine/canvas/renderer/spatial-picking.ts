import type { EdgeControlPoint } from '../../domain/graph/types';
import type { EdgePathStyle, FlowEdge } from '../../domain/edges/flow/model';
import { distanceToEdgeCurve, type EdgeCurve, type Point } from './edge-view';
import { SpatialIndex } from './spatial-index';
import { compareRenderOrder, RENDER_BAND } from './render-order';

export function pickTopmostNode(
  index: SpatialIndex<string>,
  point: Point,
  getDepth: (id: string) => number,
  contains?: (id: string, point: Point) => boolean,
) {
  const candidates = index.query({
    minX: point.x - 0.001,
    minY: point.y - 0.001,
    maxX: point.x + 0.001,
    maxY: point.y + 0.001,
  });
  let bestId: string | null = null;
  let bestOrder: {
    readonly band: typeof RENDER_BAND.nodeBody;
    readonly order: number;
    readonly id: string;
  } | null = null;
  for (const id of candidates) {
    if (contains && !contains(id, point)) continue;
    const depth = getDepth(id);
    const candidate = { band: RENDER_BAND.nodeBody, order: depth, id };
    if (!bestOrder || compareRenderOrder(candidate, bestOrder) > 0) {
      bestId = id;
      bestOrder = candidate;
    }
  }
  return bestId;
}

export function pickClosestEdge(
  index: SpatialIndex<string>,
  point: Point,
  radius: number | ((edge: FlowEdge) => number),
  getEdge: (id: string) => FlowEdge | undefined,
  getCurve: (edge: FlowEdge) => EdgeCurve | null,
  getDepth: (id: string) => number,
  maxSearchRadius = typeof radius === 'number' ? radius : 64,
) {
  const candidates = index.query({
    minX: point.x - maxSearchRadius,
    minY: point.y - maxSearchRadius,
    maxX: point.x + maxSearchRadius,
    maxY: point.y + maxSearchRadius,
  });
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestDepth = -1;
  for (const id of candidates) {
    const edge = getEdge(id);
    const curve = edge && getCurve(edge);
    if (!curve) continue;
    const hitRadius =
      typeof radius === 'number' ? radius : Math.min(maxSearchRadius, Math.max(1, radius(edge)));
    const distance = distanceToEdgeCurve(curve, point);
    const depth = getDepth(id);
    if (
      distance <= hitRadius &&
      (distance < bestDistance || (distance === bestDistance && depth > bestDepth))
    ) {
      bestDistance = distance;
      bestDepth = depth;
      bestId = id;
    }
  }
  return bestId;
}

export function pickGraphTarget(
  point: Point,
  nodeIndex: SpatialIndex<string>,
  edgeIndex: SpatialIndex<string>,
  getNodeDepth: (id: string) => number,
  getEdge: (id: string) => FlowEdge | undefined,
  getEdgeCurve: (edge: FlowEdge) => EdgeCurve | null,
  getEdgeDepth: (id: string) => number,
  edgeRadius = 6,
) {
  const nodeId = pickTopmostNode(nodeIndex, point, getNodeDepth);
  if (nodeId) return { type: 'node' as const, id: nodeId };
  const edgeId = pickClosestEdge(edgeIndex, point, edgeRadius, getEdge, getEdgeCurve, getEdgeDepth);
  return edgeId ? { type: 'edge' as const, id: edgeId } : null;
}

export type DeletableTarget =
  | { readonly type: 'control-point'; readonly edgeId: string; readonly pointId: string }
  | { readonly type: 'turn-point'; readonly edgeId: string; readonly pointId: string }
  | { readonly type: 'edge'; readonly id: string }
  | { readonly type: 'node'; readonly id: string };

export function pickClosestRoutePoint(
  points: readonly EdgeControlPoint[],
  point: Point,
  radius: number,
) {
  let best: EdgeControlPoint | null = null;
  let bestDistance = radius;
  for (let index = points.length - 1; index >= 0; index--) {
    const candidate = points[index];
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance < bestDistance || (best === null && distance <= radius)) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

export function pickDeletableTarget(
  point: Point,
  selectedEdge: FlowEdge | undefined,
  routingStyle: EdgePathStyle,
  nodeIndex: SpatialIndex<string>,
  edgeIndex: SpatialIndex<string>,
  getNodeDepth: (id: string) => number,
  getEdge: (id: string) => FlowEdge | undefined,
  getEdgeCurve: (edge: FlowEdge) => EdgeCurve | null,
  getEdgeDepth: (id: string) => number,
  pointRadius = 6,
  edgeRadius = 6,
): DeletableTarget | null {
  if (selectedEdge) {
    const pointList =
      routingStyle === 'orthogonal'
        ? (selectedEdge.orthogonalTurns ?? [])
        : (selectedEdge.controlPoints ?? []);
    const nearest = pickClosestRoutePoint(pointList, point, pointRadius);
    if (nearest) {
      return routingStyle === 'orthogonal'
        ? { type: 'turn-point', edgeId: selectedEdge.id, pointId: nearest.id }
        : { type: 'control-point', edgeId: selectedEdge.id, pointId: nearest.id };
    }
  }

  const nodeId = pickTopmostNode(nodeIndex, point, getNodeDepth);
  if (nodeId) return { type: 'node', id: nodeId };
  const edgeId = pickClosestEdge(edgeIndex, point, edgeRadius, getEdge, getEdgeCurve, getEdgeDepth);
  return edgeId ? { type: 'edge', id: edgeId } : null;
}
