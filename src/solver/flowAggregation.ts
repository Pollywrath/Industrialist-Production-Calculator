import { normalizeSolverRate } from '../utils/precision';

interface EdgeWithId {
  id: string;
}

export function sumConnectedEdgeFlows(
  edges: readonly EdgeWithId[],
  edgeFlows: Record<string, number>,
  normalizeEachAddition: boolean,
): number {
  let totalFlow = 0;

  for (const edge of edges) {
    const nextTotal = totalFlow + (edgeFlows[edge.id] ?? 0);
    totalFlow = normalizeEachAddition ? normalizeSolverRate(nextTotal) : nextTotal;
  }

  return totalFlow;
}
