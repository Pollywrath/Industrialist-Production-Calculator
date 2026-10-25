import type { FlowEdge } from '../../domain/edges/flow/model';
import type { FlowGroup } from '../../domain/graph/types';

export function getOrderedGroupIncidentEdges(
  group: FlowGroup,
  incidentEdges: (nodeId: string) => readonly FlowEdge[],
  edgeOrder: ReadonlyMap<string, number>,
) {
  const byId = new Map<string, FlowEdge>();
  for (const nodeId of group.memberNodeIds) {
    for (const edge of incidentEdges(nodeId)) byId.set(edge.id, edge);
  }
  return [...byId.values()].sort(
    (left, right) =>
      (edgeOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (edgeOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

export class GroupProxyCache<T> {
  private readonly entries = new Map<string, T>();

  get(groupId: string) {
    return this.entries.get(groupId);
  }

  set(groupId: string, ports: T) {
    this.entries.set(groupId, ports);
  }

  getOrCreate(groupId: string, create: () => T) {
    const existing = this.entries.get(groupId);
    if (existing !== undefined) return existing;
    const created = create();
    this.entries.set(groupId, created);
    return created;
  }

  invalidate(groupId: string) {
    this.entries.delete(groupId);
  }

  clear() {
    this.entries.clear();
  }
}
