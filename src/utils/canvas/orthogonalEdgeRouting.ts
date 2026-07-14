import { SNAP_GRID } from '../../constants/layoutConstants';
import type { EdgeControlPoint } from '../../types/edges';
import {
  arePointsAtSamePosition,
  distanceSquaredPointToSegment,
  projectPointOntoSegment,
  toFinitePoints,
} from './edgeGeometry';

export const ORTHOGONAL_POSITION_EPSILON = 0.001;

export interface OrthogonalRouteAnchors {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

export interface OrthogonalSegment {
  index: number;
  start: EdgeControlPoint;
  end: EdgeControlPoint;
  orientation: 'horizontal' | 'vertical';
  midpoint: EdgeControlPoint;
  editable: boolean;
}

function snapToGrid(value: number, gridSize: number): number {
  if (!Number.isFinite(value) || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

function getNextGridLineAfter(value: number, gridSize: number): number {
  return Math.ceil((value + ORTHOGONAL_POSITION_EPSILON) / gridSize) * gridSize;
}

function getPreviousGridLineBefore(value: number, gridSize: number): number {
  return Math.floor((value - ORTHOGONAL_POSITION_EPSILON) / gridSize) * gridSize;
}

function snapToGridAfter(value: number, lowerBound: number, gridSize: number): number {
  const snapped = snapToGrid(value, gridSize);
  if (snapped > lowerBound + ORTHOGONAL_POSITION_EPSILON) return snapped;
  return getNextGridLineAfter(lowerBound, gridSize);
}

function snapToGridBefore(value: number, upperBound: number, gridSize: number): number {
  const snapped = snapToGrid(value, gridSize);
  if (snapped < upperBound - ORTHOGONAL_POSITION_EPSILON) return snapped;
  return getPreviousGridLineBefore(upperBound, gridSize);
}

function snapToInteriorGridOrBoundary(
  value: number,
  lowerBound: number,
  upperBound: number,
  gridSize: number,
): number {
  const snapped = snapToGrid(value, gridSize);
  if (
    snapped > lowerBound + ORTHOGONAL_POSITION_EPSILON &&
    snapped < upperBound - ORTHOGONAL_POSITION_EPSILON
  ) {
    return snapped;
  }

  const firstGridLine = getNextGridLineAfter(lowerBound, gridSize);
  const lastGridLine = getPreviousGridLineBefore(upperBound, gridSize);
  if (firstGridLine <= lastGridLine) {
    if (snapped < firstGridLine) return firstGridLine;
    if (snapped > lastGridLine) return lastGridLine;
    return snapped;
  }

  return (lowerBound + upperBound) / 2;
}

function getMinimumOrthogonalTurnCount({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: OrthogonalRouteAnchors): 0 | 2 | 4 {
  if (targetX > sourceX + ORTHOGONAL_POSITION_EPSILON) {
    return Math.abs(sourceY - targetY) < ORTHOGONAL_POSITION_EPSILON ? 0 : 2;
  }

  return 4;
}

function normalizeVerticalSegmentX(
  rawX: number,
  pairIndex: number,
  pairCount: number,
  anchors: OrthogonalRouteAnchors,
): number {
  if (pairCount === 1) {
    return snapToInteriorGridOrBoundary(rawX, anchors.sourceX, anchors.targetX, SNAP_GRID[0]);
  }

  if (pairIndex === 0) {
    return snapToGridAfter(rawX, anchors.sourceX, SNAP_GRID[0]);
  }

  if (pairIndex === pairCount - 1) {
    return snapToGridBefore(rawX, anchors.targetX, SNAP_GRID[0]);
  }

  return snapToGrid(rawX, SNAP_GRID[0]);
}

function normalizeTurnsFromRaw(
  rawTurns: EdgeControlPoint[],
  anchors: OrthogonalRouteAnchors,
): EdgeControlPoint[] {
  const pairCount = rawTurns.length / 2;
  const pairXs: number[] = [];
  const laneYs: number[] = [];

  for (let laneIndex = 0; laneIndex < pairCount - 1; laneIndex++) {
    const first = rawTurns[laneIndex * 2 + 1];
    const second = rawTurns[laneIndex * 2 + 2];
    laneYs[laneIndex] = snapToGrid((first.y + second.y) / 2, SNAP_GRID[1]);
  }

  for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
    const first = rawTurns[pairIndex * 2];
    const second = rawTurns[pairIndex * 2 + 1];
    pairXs[pairIndex] = normalizeVerticalSegmentX(
      (first.x + second.x) / 2,
      pairIndex,
      pairCount,
      anchors,
    );
    if (!arePointsAtSamePosition(first, second)) continue;

    const y = (first.y + second.y) / 2;
    if (pairIndex > 0) {
      laneYs[pairIndex - 1] = y;
    }
    if (pairIndex < pairCount - 1) {
      laneYs[pairIndex] = y;
    }
  }

  for (let laneIndex = 0; laneIndex < pairCount - 1; laneIndex++) {
    const first = rawTurns[laneIndex * 2 + 1];
    const second = rawTurns[laneIndex * 2 + 2];
    if (!arePointsAtSamePosition(first, second)) continue;

    const x = (first.x + second.x) / 2;
    const y = (first.y + second.y) / 2;
    pairXs[laneIndex] = x;
    pairXs[laneIndex + 1] = x;
    laneYs[laneIndex] = y;
  }

  const normalizedTurns: EdgeControlPoint[] = [];
  for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
    const x = pairXs[pairIndex];
    const startY = pairIndex === 0 ? anchors.sourceY : laneYs[pairIndex - 1];
    const endY = pairIndex === pairCount - 1 ? anchors.targetY : laneYs[pairIndex];

    normalizedTurns.push({ x, y: startY }, { x, y: endY });
  }

  return normalizedTurns;
}

function buildDefaultOrthogonalTurns(anchors: OrthogonalRouteAnchors): EdgeControlPoint[] {
  const minimumTurnCount = getMinimumOrthogonalTurnCount(anchors);

  if (minimumTurnCount === 0) {
    return [];
  }

  if (minimumTurnCount === 2) {
    const x = snapToInteriorGridOrBoundary(
      (anchors.sourceX + anchors.targetX) / 2,
      anchors.sourceX,
      anchors.targetX,
      SNAP_GRID[0],
    );
    return normalizeTurnsFromRaw(
      [
        { x, y: anchors.sourceY },
        { x, y: anchors.targetY },
      ],
      anchors,
    );
  }

  const xA = snapToGridAfter(anchors.sourceX + SNAP_GRID[0], anchors.sourceX, SNAP_GRID[0]);
  const xB = snapToGridBefore(anchors.targetX - SNAP_GRID[0], anchors.targetX, SNAP_GRID[0]);
  const y = snapToGrid((anchors.sourceY + anchors.targetY) / 2, SNAP_GRID[1]);

  return normalizeTurnsFromRaw(
    [
      { x: xA, y: anchors.sourceY },
      { x: xA, y },
      { x: xB, y },
      { x: xB, y: anchors.targetY },
    ],
    anchors,
  );
}

export function normalizeOrthogonalTurns(
  rawTurns: readonly unknown[] | undefined,
  anchors: OrthogonalRouteAnchors,
): EdgeControlPoint[] {
  const finiteTurns = toFinitePoints(rawTurns);
  const evenTurnCount = finiteTurns.length % 2 === 0 ? finiteTurns.length : finiteTurns.length - 1;
  const minimumTurnCount = getMinimumOrthogonalTurnCount(anchors);

  if (evenTurnCount < minimumTurnCount) {
    return buildDefaultOrthogonalTurns(anchors);
  }

  if (evenTurnCount === 0) {
    return [];
  }

  return normalizeTurnsFromRaw(finiteTurns.slice(0, evenTurnCount), anchors);
}

export function buildOrthogonalPathPoints(
  anchors: OrthogonalRouteAnchors,
  turns: EdgeControlPoint[],
): EdgeControlPoint[] {
  return [
    { x: anchors.sourceX, y: anchors.sourceY },
    ...turns,
    { x: anchors.targetX, y: anchors.targetY },
  ];
}

export function getOrthogonalSegmentOrientation(
  segmentIndex: number,
): OrthogonalSegment['orientation'] {
  return segmentIndex % 2 === 0 ? 'horizontal' : 'vertical';
}

export function isEditableOrthogonalSegmentIndex(
  segmentIndex: number,
  pathPointCount: number,
): boolean {
  const lastSegmentIndex = pathPointCount - 2;
  return segmentIndex > 0 && segmentIndex < lastSegmentIndex;
}

export function buildOrthogonalSegments(points: EdgeControlPoint[]): OrthogonalSegment[] {
  const segments: OrthogonalSegment[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];

    segments.push({
      index: i,
      start,
      end,
      orientation: getOrthogonalSegmentOrientation(i),
      midpoint: {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
      },
      editable: isEditableOrthogonalSegmentIndex(i, points.length),
    });
  }

  return segments;
}

export function findOrthogonalSegmentByIndex(
  segments: OrthogonalSegment[],
  segmentIndex: number,
): OrthogonalSegment | null {
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].index === segmentIndex) return segments[i];
  }
  return null;
}

export function findNearestOrthogonalSegmentIndex(
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

export function insertOrthogonalTurnPair(
  rawTurns: readonly unknown[] | undefined,
  candidate: EdgeControlPoint,
  anchors: OrthogonalRouteAnchors,
): EdgeControlPoint[] {
  const turns = normalizeOrthogonalTurns(rawTurns, anchors);
  const pathPoints = buildOrthogonalPathPoints(anchors, turns);
  const segmentIndex = findNearestOrthogonalSegmentIndex(pathPoints, candidate);
  const projectedPoint = projectPointOntoSegment(
    candidate,
    pathPoints[segmentIndex],
    pathPoints[segmentIndex + 1],
  );
  const nextTurns = turns.slice();

  nextTurns.splice(segmentIndex, 0, projectedPoint, projectedPoint);
  return normalizeOrthogonalTurns(nextTurns, anchors);
}

export function moveOrthogonalSegment(
  rawTurns: readonly unknown[] | undefined,
  segmentIndex: number,
  candidate: EdgeControlPoint,
  anchors: OrthogonalRouteAnchors,
): EdgeControlPoint[] | null {
  const turns = normalizeOrthogonalTurns(rawTurns, anchors);
  const pathPointCount = turns.length + 2;
  if (!isEditableOrthogonalSegmentIndex(segmentIndex, pathPointCount)) {
    return null;
  }

  const startTurnIndex = segmentIndex - 1;
  const endTurnIndex = segmentIndex;
  if (startTurnIndex < 0 || endTurnIndex >= turns.length) {
    return null;
  }

  const nextTurns = turns.slice();
  const orientation = getOrthogonalSegmentOrientation(segmentIndex);

  if (orientation === 'horizontal') {
    const y = snapToGrid(candidate.y, SNAP_GRID[1]);
    nextTurns[startTurnIndex] = { ...nextTurns[startTurnIndex], y };
    nextTurns[endTurnIndex] = { ...nextTurns[endTurnIndex], y };
  } else {
    const x = snapToGrid(candidate.x, SNAP_GRID[0]);
    nextTurns[startTurnIndex] = { ...nextTurns[startTurnIndex], x };
    nextTurns[endTurnIndex] = { ...nextTurns[endTurnIndex], x };
  }

  return normalizeOrthogonalTurns(nextTurns, anchors);
}

function isProtectedTurnIndex(
  index: number,
  turnCount: number,
  minimumTurnCount: 0 | 2 | 4,
): boolean {
  return (
    (minimumTurnCount >= 2 && (index === 0 || index === turnCount - 1)) ||
    (minimumTurnCount >= 4 && (index === 1 || index === turnCount - 2))
  );
}

function stitchTurnsAcrossRemovedPair(
  turns: EdgeControlPoint[],
  removedStartIndex: number,
  anchors: OrthogonalRouteAnchors,
  minimumTurnCount: 0 | 2 | 4,
): EdgeControlPoint[] {
  const nextTurns = turns.slice();
  const previousTurnIndex = removedStartIndex - 1;
  const nextTurnIndex = removedStartIndex;
  const hasPreviousTurn = previousTurnIndex >= 0;
  const hasNextTurn = nextTurnIndex < nextTurns.length;

  if (!hasPreviousTurn && !hasNextTurn) {
    return nextTurns;
  }

  const segmentIndex = removedStartIndex;
  const orientation = getOrthogonalSegmentOrientation(segmentIndex);
  const previousPoint = hasPreviousTurn
    ? nextTurns[previousTurnIndex]
    : { x: anchors.sourceX, y: anchors.sourceY };
  const nextPoint = hasNextTurn
    ? nextTurns[nextTurnIndex]
    : { x: anchors.targetX, y: anchors.targetY };
  const preferredTurnIndex =
    hasNextTurn && !isProtectedTurnIndex(nextTurnIndex, nextTurns.length, minimumTurnCount)
      ? nextTurnIndex
      : hasPreviousTurn &&
          !isProtectedTurnIndex(previousTurnIndex, nextTurns.length, minimumTurnCount)
        ? previousTurnIndex
        : hasNextTurn
          ? nextTurnIndex
          : previousTurnIndex;
  const stitchPoint =
    preferredTurnIndex === nextTurnIndex && hasNextTurn ? previousPoint : nextPoint;

  if (preferredTurnIndex < 0 || preferredTurnIndex >= nextTurns.length) {
    return nextTurns;
  }

  if (orientation === 'horizontal') {
    nextTurns[preferredTurnIndex] = {
      ...nextTurns[preferredTurnIndex],
      y: stitchPoint.y,
    };
  } else {
    nextTurns[preferredTurnIndex] = {
      ...nextTurns[preferredTurnIndex],
      x: stitchPoint.x,
    };
  }

  return nextTurns;
}

function removeTurnPairAt(
  turns: EdgeControlPoint[],
  startIndex: number,
  anchors: OrthogonalRouteAnchors,
  minimumTurnCount: 0 | 2 | 4,
): EdgeControlPoint[] | null {
  if (startIndex < 0 || startIndex + 1 >= turns.length) return null;
  if (
    isProtectedTurnIndex(startIndex, turns.length, minimumTurnCount) ||
    isProtectedTurnIndex(startIndex + 1, turns.length, minimumTurnCount)
  ) {
    return null;
  }

  const nextTurns = turns.slice();
  nextTurns.splice(startIndex, 2);
  return stitchTurnsAcrossRemovedPair(nextTurns, startIndex, anchors, minimumTurnCount);
}

function getPreferredDeletionPairStart(
  turns: EdgeControlPoint[],
  turnIndex: number,
  minimumTurnCount: 0 | 2 | 4,
): number | null {
  const canDeleteLeft =
    turnIndex > 0 &&
    !isProtectedTurnIndex(turnIndex - 1, turns.length, minimumTurnCount) &&
    !isProtectedTurnIndex(turnIndex, turns.length, minimumTurnCount);
  const canDeleteRight =
    turnIndex + 1 < turns.length &&
    !isProtectedTurnIndex(turnIndex, turns.length, minimumTurnCount) &&
    !isProtectedTurnIndex(turnIndex + 1, turns.length, minimumTurnCount);

  if (canDeleteRight && arePointsAtSamePosition(turns[turnIndex], turns[turnIndex + 1])) {
    return turnIndex;
  }
  if (canDeleteLeft) return turnIndex - 1;
  if (canDeleteRight) return turnIndex;
  return null;
}

export function deleteOrthogonalTurnPair(
  rawTurns: readonly unknown[] | undefined,
  turnIndex: number,
  anchors: OrthogonalRouteAnchors,
): EdgeControlPoint[] | null {
  const turns = normalizeOrthogonalTurns(rawTurns, anchors);
  const minimumTurnCount = getMinimumOrthogonalTurnCount(anchors);

  if (turnIndex < 0 || turnIndex >= turns.length) return null;
  if (turns.length - 2 < minimumTurnCount) return null;

  const startIndex = getPreferredDeletionPairStart(turns, turnIndex, minimumTurnCount);
  if (startIndex === null) return null;

  const nextTurns = removeTurnPairAt(turns, startIndex, anchors, minimumTurnCount);
  return nextTurns ? normalizeOrthogonalTurns(nextTurns, anchors) : null;
}
