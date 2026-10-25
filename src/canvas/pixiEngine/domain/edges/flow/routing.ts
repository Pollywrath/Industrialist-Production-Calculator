import { SNAP_GRID_X, SNAP_GRID_Y, snapPosition } from '../../geometry/grid';
import type { EdgeControlPoint } from '../../graph/types';
import type { EdgePathStyle } from './model';

export interface RouteAnchors {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
}

export interface RouteSegment {
  readonly index: number;
  readonly start: EdgeControlPoint;
  readonly end: EdgeControlPoint;
  readonly orientation: 'horizontal' | 'vertical';
  readonly midpoint: EdgeControlPoint;
  readonly editable: boolean;
}

const EPSILON = 0.001;
const CATMULL_SAMPLES = 16;

function snap(value: number, gridSize: number) {
  return Math.round(value / gridSize) * gridSize;
}

function nextGridAfter(value: number, gridSize: number) {
  return Math.ceil((value + EPSILON) / gridSize) * gridSize;
}

function previousGridBefore(value: number, gridSize: number) {
  return Math.floor((value - EPSILON) / gridSize) * gridSize;
}

function snapAfter(value: number, lowerBound: number, gridSize: number) {
  const snapped = snap(value, gridSize);
  return snapped > lowerBound + EPSILON ? snapped : nextGridAfter(lowerBound, gridSize);
}

function snapBefore(value: number, upperBound: number, gridSize: number) {
  const snapped = snap(value, gridSize);
  return snapped < upperBound - EPSILON ? snapped : previousGridBefore(upperBound, gridSize);
}

function snapToInterior(value: number, lowerBound: number, upperBound: number, gridSize: number) {
  const snapped = snap(value, gridSize);
  if (snapped > lowerBound + EPSILON && snapped < upperBound - EPSILON) return snapped;

  const first = nextGridAfter(lowerBound, gridSize);
  const last = previousGridBefore(upperBound, gridSize);
  if (first <= last) return snapped < first ? first : snapped > last ? last : snapped;
  return (lowerBound + upperBound) / 2;
}

function minimumTurnCount(anchors: RouteAnchors): 0 | 2 | 4 {
  if (anchors.targetX > anchors.sourceX + EPSILON) {
    return Math.abs(anchors.sourceY - anchors.targetY) < EPSILON ? 0 : 2;
  }
  return 4;
}

function defaultPoint(index: number, x: number, y: number): EdgeControlPoint {
  return { id: `default-turn-${index}`, x, y };
}

function defaultTurns(anchors: RouteAnchors): EdgeControlPoint[] {
  const minimum = minimumTurnCount(anchors);
  if (minimum === 0) return [];
  if (minimum === 2) {
    const x = snapToInterior(
      (anchors.sourceX + anchors.targetX) / 2,
      anchors.sourceX,
      anchors.targetX,
      SNAP_GRID_X,
    );
    return normalizeRawTurns(
      [defaultPoint(0, x, anchors.sourceY), defaultPoint(1, x, anchors.targetY)],
      anchors,
    );
  }

  const xA = snapAfter(anchors.sourceX + SNAP_GRID_X, anchors.sourceX, SNAP_GRID_X);
  const xB = snapBefore(anchors.targetX - SNAP_GRID_X, anchors.targetX, SNAP_GRID_X);
  const y = snap((anchors.sourceY + anchors.targetY) / 2, SNAP_GRID_Y);
  return normalizeRawTurns(
    [
      defaultPoint(0, xA, anchors.sourceY),
      defaultPoint(1, xA, y),
      defaultPoint(2, xB, y),
      defaultPoint(3, xB, anchors.targetY),
    ],
    anchors,
  );
}

function samePosition(left: EdgeControlPoint, right: EdgeControlPoint) {
  return Math.abs(left.x - right.x) < EPSILON && Math.abs(left.y - right.y) < EPSILON;
}

function normalizeVerticalX(
  rawX: number,
  pairIndex: number,
  pairCount: number,
  anchors: RouteAnchors,
) {
  if (pairCount === 1) {
    return snapToInterior(rawX, anchors.sourceX, anchors.targetX, SNAP_GRID_X);
  }
  if (pairIndex === 0) return snapAfter(rawX, anchors.sourceX, SNAP_GRID_X);
  if (pairIndex === pairCount - 1) return snapBefore(rawX, anchors.targetX, SNAP_GRID_X);
  return snap(rawX, SNAP_GRID_X);
}

function normalizeRawTurns(rawTurns: readonly EdgeControlPoint[], anchors: RouteAnchors) {
  const pairCount = rawTurns.length / 2;
  const pairXs: number[] = [];
  const laneYs: number[] = [];

  for (let lane = 0; lane < pairCount - 1; lane++) {
    const first = rawTurns[lane * 2 + 1];
    const second = rawTurns[lane * 2 + 2];
    laneYs[lane] = snap((first.y + second.y) / 2, SNAP_GRID_Y);
  }

  for (let pair = 0; pair < pairCount; pair++) {
    const first = rawTurns[pair * 2];
    const second = rawTurns[pair * 2 + 1];
    pairXs[pair] = normalizeVerticalX((first.x + second.x) / 2, pair, pairCount, anchors);
    if (!samePosition(first, second)) continue;
    const y = (first.y + second.y) / 2;
    if (pair > 0) laneYs[pair - 1] = y;
    if (pair < pairCount - 1) laneYs[pair] = y;
  }

  for (let lane = 0; lane < pairCount - 1; lane++) {
    const first = rawTurns[lane * 2 + 1];
    const second = rawTurns[lane * 2 + 2];
    if (!samePosition(first, second)) continue;
    const x = (first.x + second.x) / 2;
    pairXs[lane] = x;
    pairXs[lane + 1] = x;
    laneYs[lane] = (first.y + second.y) / 2;
  }

  const result: EdgeControlPoint[] = [];
  for (let pair = 0; pair < pairCount; pair++) {
    const first = rawTurns[pair * 2];
    const second = rawTurns[pair * 2 + 1];
    const x = pairXs[pair];
    const startY = pair === 0 ? anchors.sourceY : laneYs[pair - 1];
    const endY = pair === pairCount - 1 ? anchors.targetY : laneYs[pair];
    result.push({ id: first.id, x, y: startY }, { id: second.id, x, y: endY });
  }
  return result;
}

export function normalizeOrthogonalTurns(
  rawTurns: readonly EdgeControlPoint[] | undefined,
  anchors: RouteAnchors,
): EdgeControlPoint[] {
  const turns = (rawTurns ?? []).filter(
    (point) => point.id.length > 0 && Number.isFinite(point.x) && Number.isFinite(point.y),
  );
  const count = turns.length - (turns.length % 2);
  const minimum = minimumTurnCount(anchors);
  if (count < minimum) return defaultTurns(anchors);
  if (count === 0) return [];
  return normalizeRawTurns(turns.slice(0, count), anchors);
}

export function buildOrthogonalPathPoints(
  anchors: RouteAnchors,
  turns: readonly EdgeControlPoint[],
): EdgeControlPoint[] {
  return [
    { id: 'source', x: anchors.sourceX, y: anchors.sourceY },
    ...turns,
    { id: 'target', x: anchors.targetX, y: anchors.targetY },
  ];
}

export function buildOrthogonalSegments(points: readonly EdgeControlPoint[]): RouteSegment[] {
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    return {
      index,
      start,
      end,
      orientation: index % 2 === 0 ? 'horizontal' : 'vertical',
      midpoint: { id: `segment-${index}`, x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      editable: index > 0 && index < points.length - 2,
    };
  });
}

export function projectPointOntoSegment(
  point: { readonly x: number; readonly y: number },
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < EPSILON) return { x: start.x, y: start.y };
  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, projection));
  return { x: start.x + dx * t, y: start.y + dy * t };
}

export function distanceSquaredToSegment(
  point: { readonly x: number; readonly y: number },
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
) {
  const projected = projectPointOntoSegment(point, start, end);
  const dx = point.x - projected.x;
  const dy = point.y - projected.y;
  return dx * dx + dy * dy;
}

export function findNearestSegmentIndex(
  points: readonly { readonly x: number; readonly y: number }[],
  candidate: { readonly x: number; readonly y: number },
) {
  if (points.length < 2) return 0;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index++) {
    const distance = distanceSquaredToSegment(candidate, points[index], points[index + 1]);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

export function evaluateCatmullRom(
  p0: { readonly x: number; readonly y: number },
  p1: { readonly x: number; readonly y: number },
  p2: { readonly x: number; readonly y: number },
  p3: { readonly x: number; readonly y: number },
  t: number,
) {
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

export function sampleCatmullRom(points: readonly { readonly x: number; readonly y: number }[]) {
  if (points.length < 2) return [...points];
  const sampled: { x: number; y: number }[] = [points[0]];
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    for (let step = 1; step <= CATMULL_SAMPLES; step++) {
      sampled.push(evaluateCatmullRom(p0, p1, p2, p3, step / CATMULL_SAMPLES));
    }
  }
  return sampled;
}

export interface RouteTangent {
  readonly x: number;
  readonly y: number;
}

export function getPortPathTangent(
  direction: 'input' | 'output',
  endpoint: 'source' | 'target',
): RouteTangent {
  const outwardX = direction === 'output' ? 1 : -1;
  return { x: endpoint === 'source' ? outwardX : -outwardX, y: 0 };
}

function distance(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function normalizeTangent(tangent: RouteTangent): RouteTangent {
  const length = Math.hypot(tangent.x, tangent.y);
  return length > EPSILON ? { x: tangent.x / length, y: tangent.y / length } : { x: 1, y: 0 };
}

function limitMonotoneTangent(candidate: number, previousSlope: number, nextSlope: number) {
  if (previousSlope === 0 || nextSlope === 0 || Math.sign(previousSlope) !== Math.sign(nextSlope))
    return 0;
  const limit = 3 * Math.min(Math.abs(previousSlope), Math.abs(nextSlope));
  return Math.sign(previousSlope) * Math.min(Math.abs(candidate), limit);
}

function limitEndpointTangent(candidate: number, slope: number) {
  if (slope === 0 || candidate === 0 || Math.sign(candidate) !== Math.sign(slope)) return candidate;
  return Math.sign(candidate) * Math.min(Math.abs(candidate), 3 * Math.abs(slope));
}

function componentTangents(
  points: readonly { readonly x: number; readonly y: number }[],
  knots: readonly number[],
  component: 'x' | 'y',
  sourceTangent: RouteTangent,
  targetTangent: RouteTangent,
) {
  const derivatives = Array.from({ length: points.length }, () => 0);
  for (let index = 1; index < points.length - 1; index++) {
    const previousInterval = knots[index] - knots[index - 1];
    const nextInterval = knots[index + 1] - knots[index];
    const previousSlope =
      (points[index][component] - points[index - 1][component]) / previousInterval;
    const nextSlope = (points[index + 1][component] - points[index][component]) / nextInterval;
    const tangent =
      previousSlope -
      (points[index + 1][component] - points[index - 1][component]) /
        (previousInterval + nextInterval) +
      nextSlope;
    derivatives[index] = limitMonotoneTangent(tangent, previousSlope, nextSlope);
  }

  const firstInterval = knots[1] - knots[0];
  const lastIndex = points.length - 1;
  const lastInterval = knots[lastIndex] - knots[lastIndex - 1];
  const firstChord = distance(points[0], points[1]);
  const lastChord = distance(points[lastIndex - 1], points[lastIndex]);
  const sourceDirection = sourceTangent[component];
  const targetDirection = targetTangent[component];
  const firstHandle = Math.min(firstChord / 3, 80);
  const lastHandle = Math.min(lastChord / 3, 80);
  const firstSlope = (points[1][component] - points[0][component]) / firstInterval;
  const lastSlope =
    (points[lastIndex][component] - points[lastIndex - 1][component]) / lastInterval;
  derivatives[0] = limitEndpointTangent(
    (sourceDirection * firstHandle) / firstInterval,
    firstSlope,
  );
  derivatives[lastIndex] = limitEndpointTangent(
    (targetDirection * lastHandle) / lastInterval,
    lastSlope,
  );

  return derivatives;
}

export function sampleCentripetalCatmullRom(
  points: readonly { readonly x: number; readonly y: number }[],
  sourceTangent: RouteTangent = { x: 1, y: 0 },
  targetTangent: RouteTangent = { x: 1, y: 0 },
) {
  if (points.length < 2) return [...points];
  const normalizedSourceTangent = normalizeTangent(sourceTangent);
  const normalizedTargetTangent = normalizeTangent(targetTangent);
  const knots = [0];
  for (let index = 1; index < points.length; index++) {
    knots.push(
      knots[index - 1] + Math.max(0.001, Math.sqrt(distance(points[index - 1], points[index]))),
    );
  }
  const tangentX = componentTangents(
    points,
    knots,
    'x',
    normalizedSourceTangent,
    normalizedTargetTangent,
  );
  const tangentY = componentTangents(
    points,
    knots,
    'y',
    normalizedSourceTangent,
    normalizedTargetTangent,
  );
  const sampled: { x: number; y: number }[] = [points[0]];

  for (let index = 0; index < points.length - 1; index++) {
    const interval = knots[index + 1] - knots[index];
    for (let step = 1; step <= CATMULL_SAMPLES; step++) {
      if (step === CATMULL_SAMPLES) {
        sampled.push(points[index + 1]);
        continue;
      }
      const t = step / CATMULL_SAMPLES;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      sampled.push({
        x:
          h00 * points[index].x +
          h10 * tangentX[index] * interval +
          h01 * points[index + 1].x +
          h11 * tangentX[index + 1] * interval,
        y:
          h00 * points[index].y +
          h10 * tangentY[index] * interval +
          h01 * points[index + 1].y +
          h11 * tangentY[index + 1] * interval,
      });
    }
  }
  return sampled;
}

export function findNearestCatmullSegmentIndex(
  points: readonly { readonly x: number; readonly y: number }[],
  candidate: { readonly x: number; readonly y: number },
  sourceTangent: RouteTangent = { x: 1, y: 0 },
  targetTangent: RouteTangent = { x: 1, y: 0 },
) {
  if (points.length < 3) return findNearestSegmentIndex(points, candidate);
  const sampled = sampleCentripetalCatmullRom(points, sourceTangent, targetTangent);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < sampled.length - 1; index++) {
    const distance = distanceSquaredToSegment(candidate, sampled[index], sampled[index + 1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = Math.min(points.length - 2, Math.floor(index / CATMULL_SAMPLES));
    }
  }
  return bestIndex;
}

export function findNearestSampledCurveSpanIndex(
  sampledPath: readonly { readonly x: number; readonly y: number }[],
  candidate: { readonly x: number; readonly y: number },
  spanCount: number,
) {
  if (sampledPath.length < 2 || spanCount < 1) return 0;
  const segmentsPerSpan = (sampledPath.length - 1) / spanCount;
  let nearestSegment = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < sampledPath.length - 1; index++) {
    const distance = distanceSquaredToSegment(
      candidate,
      sampledPath[index],
      sampledPath[index + 1],
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      nearestSegment = index;
    }
  }
  return Math.min(spanCount - 1, Math.floor(nearestSegment / segmentsPerSpan));
}

export function insertControlPoint(
  controlPoints: readonly EdgeControlPoint[],
  source: { readonly x: number; readonly y: number },
  target: { readonly x: number; readonly y: number },
  candidate: { readonly x: number; readonly y: number },
  pathStyle: EdgePathStyle,
  createPoint: (x: number, y: number) => EdgeControlPoint,
  endpointTangents: { readonly source: RouteTangent; readonly target: RouteTangent } = {
    source: { x: 1, y: 0 },
    target: { x: 1, y: 0 },
  },
  renderedBezierPath?: readonly { readonly x: number; readonly y: number }[],
) {
  const path = [source, ...controlPoints, target];
  const segmentIndex =
    pathStyle === 'bezier'
      ? renderedBezierPath
        ? findNearestSampledCurveSpanIndex(renderedBezierPath, candidate, controlPoints.length + 1)
        : findNearestCatmullSegmentIndex(
            path,
            candidate,
            endpointTangents.source,
            endpointTangents.target,
          )
      : findNearestSegmentIndex(path, candidate);
  const next = [...controlPoints];
  next.splice(
    Math.max(0, Math.min(next.length, segmentIndex)),
    0,
    createPoint(candidate.x, candidate.y),
  );
  return next;
}

export function insertOrthogonalTurnPair(
  rawTurns: readonly EdgeControlPoint[] | undefined,
  candidate: { readonly x: number; readonly y: number },
  anchors: RouteAnchors,
  createPoint: (x: number, y: number) => EdgeControlPoint,
) {
  const turns = normalizeOrthogonalTurns(rawTurns, anchors);
  const path = buildOrthogonalPathPoints(anchors, turns);
  const segmentIndex = findNearestSegmentIndex(path, candidate);
  const projected = projectPointOntoSegment(candidate, path[segmentIndex], path[segmentIndex + 1]);
  const next = [...turns];
  next.splice(
    segmentIndex,
    0,
    createPoint(projected.x, projected.y),
    createPoint(projected.x, projected.y),
  );
  return normalizeOrthogonalTurns(next, anchors);
}

export function moveOrthogonalSegment(
  rawTurns: readonly EdgeControlPoint[] | undefined,
  segmentIndex: number,
  candidate: { readonly x: number; readonly y: number },
  anchors: RouteAnchors,
) {
  const turns = normalizeOrthogonalTurns(rawTurns, anchors);
  const pathPointCount = turns.length + 2;
  if (segmentIndex <= 0 || segmentIndex >= pathPointCount - 2) return null;
  const firstIndex = segmentIndex - 1;
  const secondIndex = segmentIndex;
  if (firstIndex < 0 || secondIndex >= turns.length) return null;
  const next = [...turns];
  if (segmentIndex % 2 === 0) {
    const y = snap(candidate.y, SNAP_GRID_Y);
    next[firstIndex] = { ...next[firstIndex], y };
    next[secondIndex] = { ...next[secondIndex], y };
  } else {
    const x = snap(candidate.x, SNAP_GRID_X);
    next[firstIndex] = { ...next[firstIndex], x };
    next[secondIndex] = { ...next[secondIndex], x };
  }
  return normalizeOrthogonalTurns(next, anchors);
}

function isProtectedTurnIndex(index: number, count: number, minimum: 0 | 2 | 4) {
  return (
    (minimum >= 2 && (index === 0 || index === count - 1)) ||
    (minimum >= 4 && (index === 1 || index === count - 2))
  );
}

function stitchAfterDeletion(
  turns: readonly EdgeControlPoint[],
  removedStartIndex: number,
  anchors: RouteAnchors,
  minimum: 0 | 2 | 4,
) {
  const next = [...turns];
  const previousIndex = removedStartIndex - 1;
  const nextIndex = removedStartIndex;
  const hasPrevious = previousIndex >= 0;
  const hasNext = nextIndex < next.length;
  if (!hasPrevious && !hasNext) return next;
  const horizontal = removedStartIndex % 2 === 0;
  const previous = hasPrevious
    ? next[previousIndex]
    : { id: 'source', x: anchors.sourceX, y: anchors.sourceY };
  const following = hasNext
    ? next[nextIndex]
    : { id: 'target', x: anchors.targetX, y: anchors.targetY };
  const preferred =
    hasNext && !isProtectedTurnIndex(nextIndex, next.length, minimum)
      ? nextIndex
      : hasPrevious && !isProtectedTurnIndex(previousIndex, next.length, minimum)
        ? previousIndex
        : hasNext
          ? nextIndex
          : previousIndex;
  const stitch = preferred === nextIndex && hasNext ? previous : following;
  if (preferred < 0 || preferred >= next.length) return next;
  next[preferred] = horizontal
    ? { ...next[preferred], y: stitch.y }
    : { ...next[preferred], x: stitch.x };
  return next;
}

function preferredDeletionPairStart(
  turns: readonly EdgeControlPoint[],
  index: number,
  minimum: 0 | 2 | 4,
) {
  const canDeleteLeft =
    index > 0 &&
    !isProtectedTurnIndex(index - 1, turns.length, minimum) &&
    !isProtectedTurnIndex(index, turns.length, minimum);
  const canDeleteRight =
    index + 1 < turns.length &&
    !isProtectedTurnIndex(index, turns.length, minimum) &&
    !isProtectedTurnIndex(index + 1, turns.length, minimum);
  if (canDeleteRight && samePosition(turns[index], turns[index + 1])) return index;
  if (canDeleteLeft) return index - 1;
  if (canDeleteRight) return index;
  return null;
}

export function deleteOrthogonalTurnPair(
  rawTurns: readonly EdgeControlPoint[] | undefined,
  pointId: string,
  anchors: RouteAnchors,
) {
  const turns = normalizeOrthogonalTurns(rawTurns, anchors);
  const index = turns.findIndex((point) => point.id === pointId);
  const minimum = minimumTurnCount(anchors);
  if (index < 0 || turns.length - 2 < minimum) return null;
  const startIndex = preferredDeletionPairStart(turns, index, minimum);
  if (startIndex === null) return null;
  const next = [...turns];
  next.splice(startIndex, 2);
  return normalizeOrthogonalTurns(stitchAfterDeletion(next, startIndex, anchors, minimum), anchors);
}

export function snapEdgePoint(point: { readonly x: number; readonly y: number }) {
  return snapPosition(point);
}
