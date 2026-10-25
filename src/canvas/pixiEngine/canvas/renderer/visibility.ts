import type { Viewport } from '../../domain/graph/types';
import { edgeCurveIntersectsBounds, type EdgeCurve } from './edge-view';
import { SpatialIndex, type Bounds } from './spatial-index';

export function getCameraWorldBounds(
  screenWidth: number,
  screenHeight: number,
  viewport: Viewport,
  margin = 0,
): Bounds {
  return {
    minX: (-screenWidth / 2 - viewport.x) / viewport.zoom - margin,
    minY: (-screenHeight / 2 - viewport.y) / viewport.zoom - margin,
    maxX: (screenWidth / 2 - viewport.x) / viewport.zoom + margin,
    maxY: (screenHeight / 2 - viewport.y) / viewport.zoom + margin,
  };
}

export function queryVisibleNodes(index: SpatialIndex<string>, cameraBounds: Bounds) {
  return new Set(index.query(cameraBounds));
}

export function queryVisibleEdges(
  index: SpatialIndex<string>,
  cameraBounds: Bounds,
  getCurve: (id: string) => EdgeCurve | null,
) {
  const visible = new Set<string>();
  for (const id of index.query(cameraBounds)) {
    const curve = getCurve(id);
    if (curve && edgeCurveIntersectsBounds(curve, cameraBounds)) visible.add(id);
  }
  return visible;
}

function boundsDifference(from: Bounds, to: Bounds): Bounds[] {
  const overlapMinX = Math.max(from.minX, to.minX);
  const overlapMinY = Math.max(from.minY, to.minY);
  const overlapMaxX = Math.min(from.maxX, to.maxX);
  const overlapMaxY = Math.min(from.maxY, to.maxY);
  if (overlapMinX > overlapMaxX || overlapMinY > overlapMaxY) return [to];

  const strips: Bounds[] = [];
  if (to.minY < from.minY)
    strips.push({ minX: to.minX, maxX: to.maxX, minY: to.minY, maxY: overlapMinY });
  if (to.maxY > from.maxY)
    strips.push({ minX: to.minX, maxX: to.maxX, minY: overlapMaxY, maxY: to.maxY });
  if (to.minX < from.minX)
    strips.push({ minX: to.minX, maxX: overlapMinX, minY: overlapMinY, maxY: overlapMaxY });
  if (to.maxX > from.maxX)
    strips.push({ minX: overlapMaxX, maxX: to.maxX, minY: overlapMinY, maxY: overlapMaxY });
  return strips;
}

export function updateIndexedVisibility(
  index: SpatialIndex<string>,
  current: ReadonlySet<string>,
  previousBounds: Bounds,
  nextBounds: Bounds,
  isVisible: (id: string, bounds: Bounds) => boolean,
) {
  let updated: Set<string> | null = null;
  const candidates = new Set<string>();
  for (const strip of boundsDifference(previousBounds, nextBounds)) {
    for (const id of index.query(strip)) candidates.add(id);
  }
  for (const strip of boundsDifference(nextBounds, previousBounds)) {
    for (const id of index.query(strip)) candidates.add(id);
  }

  for (const id of candidates) {
    const wasVisible = current.has(id);
    const willBeVisible = isVisible(id, nextBounds);
    if (wasVisible === willBeVisible) continue;
    updated ??= new Set(current);
    if (willBeVisible) updated.add(id);
    else updated.delete(id);
  }
  return updated ?? current;
}
