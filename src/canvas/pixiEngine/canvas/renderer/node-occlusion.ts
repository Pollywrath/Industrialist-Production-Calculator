import type { Bounds } from './spatial-index';

export function collectOcclusionRefreshIds(
  bounds: readonly Bounds[],
  query: (bounds: Bounds) => readonly string[],
  include: readonly string[] = [],
) {
  const ids = new Set(include);
  for (const area of bounds) {
    for (const id of query(area)) ids.add(id);
  }
  return ids;
}

export function getOcclusionTransitionBounds(previous: Bounds | null, next: Bounds | null) {
  return [previous, next].filter((bounds): bounds is Bounds => bounds !== null);
}

export function containsBounds(outer: Bounds, inner: Bounds | null) {
  return (
    inner !== null &&
    outer.minX <= inner.minX &&
    outer.minY <= inner.minY &&
    outer.maxX >= inner.maxX &&
    outer.maxY >= inner.maxY
  );
}

export function boundsIntersect(left: Bounds, right: Bounds) {
  return (
    left.minX <= right.maxX &&
    left.maxX >= right.minX &&
    left.minY <= right.maxY &&
    left.maxY >= right.minY
  );
}

export function subtractBounds(source: Bounds, occluder: Bounds): Bounds[] {
  if (!boundsIntersect(source, occluder)) return [source];
  const overlap = {
    minX: Math.max(source.minX, occluder.minX),
    minY: Math.max(source.minY, occluder.minY),
    maxX: Math.min(source.maxX, occluder.maxX),
    maxY: Math.min(source.maxY, occluder.maxY),
  };
  if (overlap.minX >= overlap.maxX || overlap.minY >= overlap.maxY) return [source];

  const fragments: Bounds[] = [];
  if (overlap.minY > source.minY) fragments.push({ ...source, maxY: overlap.minY });
  if (overlap.maxY < source.maxY) fragments.push({ ...source, minY: overlap.maxY });
  if (overlap.minX > source.minX) {
    fragments.push({
      minX: source.minX,
      minY: overlap.minY,
      maxX: overlap.minX,
      maxY: overlap.maxY,
    });
  }
  if (overlap.maxX < source.maxX) {
    fragments.push({
      minX: overlap.maxX,
      minY: overlap.minY,
      maxX: source.maxX,
      maxY: overlap.maxY,
    });
  }
  return fragments;
}

export interface OcclusionCandidate {
  readonly id: string;
  readonly order: number;
  readonly bounds: Bounds;
}

export interface OcclusionHistoryEntry {
  readonly id: string;
  readonly order: number;
}

export interface NodeOcclusionLayoutInput {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number };
  readonly order: number;
  readonly labels: readonly Bounds[];
  readonly control?: Bounds;
  readonly history: readonly OcclusionHistoryEntry[];
  readonly getCurrentOrder: (id: string) => number;
  readonly hasDisplayNode: (id: string) => boolean;
  readonly getCandidate: (id: string) => OcclusionCandidate | null;
  readonly queryCandidates: (bounds: Bounds) => readonly OcclusionCandidate[];
}

export interface NodeOcclusionLayout {
  readonly labelFragments: readonly (readonly Bounds[] | null)[];
  readonly needsTextMask: boolean;
  readonly controlFragments: readonly Bounds[] | null;
  readonly candidateCount: number;
}

export class NodeOcclusionController {
  private readonly visibilityKeys = new Map<string, string>();
  private readonly occlusionKeys = new Map<string, string>();

  getVisibilityKey(id: string) {
    return this.visibilityKeys.get(id);
  }

  setVisibilityKey(id: string, key: string) {
    this.visibilityKeys.set(id, key);
  }

  getOcclusionKey(id: string) {
    return this.occlusionKeys.get(id);
  }

  setOcclusionKey(id: string, key: string) {
    this.occlusionKeys.set(id, key);
  }

  forget(id: string) {
    this.visibilityKeys.delete(id);
    this.occlusionKeys.delete(id);
  }

  calculate(input: NodeOcclusionLayoutInput): NodeOcclusionLayout {
    let candidateCount = 0;
    let needsTextMask = false;
    const labelFragments = input.labels.map((labelBounds) => {
      const fragments: Bounds[] = [labelBounds];
      const checked = new Set<string>();
      const subtract = (candidate: OcclusionCandidate) => {
        const localBounds = toLocalBounds(candidate.bounds, input.position);
        if (!boundsIntersect(labelBounds, localBounds)) return;
        checked.add(candidate.id);
        fragments.splice(
          0,
          fragments.length,
          ...fragments.flatMap((fragment) => subtractBounds(fragment, localBounds)),
        );
      };

      for (let index = input.history.length - 1, tested = 0; index >= 0 && tested < 8; index--) {
        const entry = input.history[index];
        if (input.getCurrentOrder(entry.id) !== entry.order || !input.hasDisplayNode(entry.id))
          continue;
        if (entry.order <= input.order) break;
        const candidate = input.getCandidate(entry.id);
        if (!candidate) continue;
        tested++;
        candidateCount++;
        subtract(candidate);
        if (fragments.length === 0) break;
      }

      if (fragments.length > 0) {
        const remaining = input
          .queryCandidates(toWorldBounds(labelBounds, input.position))
          .filter((candidate) => !checked.has(candidate.id) && candidate.order > input.order)
          .sort(compareCandidatesTopmostFirst);
        candidateCount += remaining.length;
        for (const candidate of remaining) {
          subtract(candidate);
          if (fragments.length === 0) break;
        }
      }
      if (fragments.length === 0) return null;
      if (fragments.length !== 1 || !containsBounds(fragments[0], labelBounds))
        needsTextMask = true;
      return fragments;
    });

    let controlFragments: Bounds[] | null = null;
    if (input.control) {
      controlFragments = [input.control];
      const controlWorldBounds = toWorldBounds(input.control, input.position);
      const occluders = input
        .queryCandidates(controlWorldBounds)
        .filter((candidate) => candidate.id !== input.id && candidate.order > input.order)
        .sort(compareCandidatesTopmostFirst);
      candidateCount += occluders.length;
      for (const candidate of occluders) {
        const localBounds = toLocalBounds(candidate.bounds, input.position);
        controlFragments.splice(
          0,
          controlFragments.length,
          ...controlFragments.flatMap((fragment) => subtractBounds(fragment, localBounds)),
        );
        if (controlFragments.length === 0) break;
      }
    }

    return { labelFragments, needsTextMask, controlFragments, candidateCount };
  }
}

function compareCandidatesTopmostFirst(left: OcclusionCandidate, right: OcclusionCandidate) {
  return right.order - left.order || right.id.localeCompare(left.id);
}

function toLocalBounds(
  bounds: Bounds,
  position: { readonly x: number; readonly y: number },
): Bounds {
  return {
    minX: bounds.minX - position.x,
    minY: bounds.minY - position.y,
    maxX: bounds.maxX - position.x,
    maxY: bounds.maxY - position.y,
  };
}

function toWorldBounds(
  bounds: Bounds,
  position: { readonly x: number; readonly y: number },
): Bounds {
  return {
    minX: bounds.minX + position.x,
    minY: bounds.minY + position.y,
    maxX: bounds.maxX + position.x,
    maxY: bounds.maxY + position.y,
  };
}
