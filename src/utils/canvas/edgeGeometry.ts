import type { EdgeControlPoint } from '../../types/edges';

const POINT_EPSILON = 0.001;

function isFinitePoint(value: unknown): value is EdgeControlPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as { x?: unknown; y?: unknown };
  return (
    typeof point.x === 'number' &&
    Number.isFinite(point.x) &&
    typeof point.y === 'number' &&
    Number.isFinite(point.y)
  );
}

export function toFinitePoints(points: readonly unknown[] | undefined): EdgeControlPoint[] {
  if (!points || points.length === 0) return [];

  const next: EdgeControlPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (isFinitePoint(point)) {
      next.push({ x: point.x, y: point.y });
    }
  }

  return next;
}

export function getPointArray(data: unknown, key: string): EdgeControlPoint[] {
  if (!data || typeof data !== 'object') return [];
  const raw = (data as Record<string, unknown>)[key];
  return Array.isArray(raw) ? toFinitePoints(raw) : [];
}

export function arePointsAtSamePosition(a: EdgeControlPoint, b: EdgeControlPoint): boolean {
  return Math.abs(a.x - b.x) < POINT_EPSILON && Math.abs(a.y - b.y) < POINT_EPSILON;
}

export function distanceSquaredBetweenPoints(a: EdgeControlPoint, b: EdgeControlPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function projectPointOntoSegment(
  point: EdgeControlPoint,
  segmentStart: EdgeControlPoint,
  segmentEnd: EdgeControlPoint,
): EdgeControlPoint {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < POINT_EPSILON) {
    return { x: segmentStart.x, y: segmentStart.y };
  }

  const tUnclamped =
    ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, tUnclamped));
  return {
    x: segmentStart.x + dx * t,
    y: segmentStart.y + dy * t,
  };
}

export function distanceSquaredPointToSegment(
  point: EdgeControlPoint,
  segmentStart: EdgeControlPoint,
  segmentEnd: EdgeControlPoint,
): number {
  return distanceSquaredBetweenPoints(
    point,
    projectPointOntoSegment(point, segmentStart, segmentEnd),
  );
}
