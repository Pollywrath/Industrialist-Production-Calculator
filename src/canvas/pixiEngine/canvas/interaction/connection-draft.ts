export interface ConnectionEndpoint {
  readonly nodeId: string;
  readonly portId: string;
  readonly direction: 'input' | 'output';
  readonly kind: 'item' | 'fluid';
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ConnectionPortCandidate {
  readonly endpoint: ConnectionEndpoint;
  readonly anchor: Point;
  readonly hitAnchor?: Point;
  readonly renderOrder: number;
}

export type ConnectionCompatibilityPolicy = (
  first: ConnectionEndpoint,
  second: ConnectionEndpoint,
) => boolean;

export const CONNECTION_SNAP_RADIUS_WORLD = 24;

export function canConnectEndpoints(first: ConnectionEndpoint, second: ConnectionEndpoint) {
  return (
    (first.nodeId !== second.nodeId || first.portId !== second.portId) &&
    first.direction !== second.direction &&
    first.kind === second.kind
  );
}

export function findNearestConnectablePort(
  source: ConnectionEndpoint,
  candidates: readonly ConnectionPortCandidate[],
  pointer: Point,
  radius: number,
  isCompatible: ConnectionCompatibilityPolicy = canConnectEndpoints,
) {
  if (!(radius >= 0)) return null;
  const radiusSquared = radius * radius;
  let best: ConnectionPortCandidate | null = null;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (!isCompatible(source, candidate.endpoint)) continue;
    const hitAnchor = candidate.hitAnchor ?? candidate.anchor;
    const dx = hitAnchor.x - pointer.x;
    const dy = hitAnchor.y - pointer.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > radiusSquared) continue;
    if (
      distanceSquared < bestDistanceSquared ||
      (distanceSquared === bestDistanceSquared &&
        best &&
        (candidate.renderOrder > best.renderOrder ||
          (candidate.renderOrder === best.renderOrder &&
            compareEndpointIds(candidate.endpoint, best.endpoint) < 0)))
    ) {
      best = candidate;
      bestDistanceSquared = distanceSquared;
    }
  }
  return best;
}

export function getConnectionPreviewAnchors(
  source: ConnectionEndpoint,
  sourceAnchor: Point,
  pointer: Point,
  target: ConnectionPortCandidate | null,
  isCompatible: ConnectionCompatibilityPolicy = canConnectEndpoints,
) {
  if (target && isCompatible(source, target.endpoint)) {
    return source.direction === 'output'
      ? { start: sourceAnchor, tip: target.anchor, snapped: true }
      : { start: target.anchor, tip: sourceAnchor, snapped: true };
  }
  return source.direction === 'output'
    ? { start: sourceAnchor, tip: pointer, snapped: false }
    : { start: pointer, tip: sourceAnchor, snapped: false };
}

function compareEndpointIds(left: ConnectionEndpoint, right: ConnectionEndpoint) {
  const nodeOrder = left.nodeId.localeCompare(right.nodeId);
  return nodeOrder !== 0 ? nodeOrder : left.portId.localeCompare(right.portId);
}

export class ConnectionDraft {
  readonly source: ConnectionEndpoint;
  private readonly pointerStart: Point;
  current: Point;
  target: ConnectionEndpoint | null = null;
  moved = false;
  active = true;
  private readonly isCompatible: ConnectionCompatibilityPolicy;

  constructor(
    source: ConnectionEndpoint,
    pointerStart: Point,
    isCompatible: ConnectionCompatibilityPolicy = canConnectEndpoints,
  ) {
    this.source = source;
    this.pointerStart = pointerStart;
    this.current = pointerStart;
    this.isCompatible = isCompatible;
  }

  update(point: Point, target: ConnectionEndpoint | null, zoom: number) {
    if (!this.active) return false;
    this.current = point;
    this.target = target;
    this.moved ||=
      Math.hypot(point.x - this.pointerStart.x, point.y - this.pointerStart.y) * zoom >= 3;
    return !!target && this.isCompatible(this.source, target);
  }

  finish(
    target: ConnectionEndpoint | null,
    endpointExists: (endpoint: ConnectionEndpoint) => boolean,
  ) {
    if (!this.active) return null;
    this.active = false;
    if (
      !this.moved ||
      !target ||
      !this.isCompatible(this.source, target) ||
      !endpointExists(this.source) ||
      !endpointExists(target)
    )
      return null;
    return target;
  }

  cancel() {
    this.active = false;
    this.target = null;
  }
}
