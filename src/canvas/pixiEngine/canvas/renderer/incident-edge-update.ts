import type { FlowEdge } from '../../domain/edges/flow/model';
import type { GraphStore } from '../../state/graph-store';

export function updateIncidentEdges(
  graph: GraphStore,
  nodeId: string,
  update: (edge: FlowEdge) => void,
) {
  const edges = graph.getIncidentEdges(nodeId);
  for (const edge of edges) update(edge);
  return edges.length;
}
