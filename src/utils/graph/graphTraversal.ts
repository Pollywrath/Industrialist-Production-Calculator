import type { Edge } from '@xyflow/react';

export function getConnectedNodes(startNodeId: string, edges: Edge[]): Set<string> {
  const connected = new Set<string>([startNodeId]);
  const queue = [startNodeId];
  let head = 0;

  const adjList = new Map<string, string[]>();
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!adjList.has(edge.source)) adjList.set(edge.source, []);
    if (!adjList.has(edge.target)) adjList.set(edge.target, []);
    adjList.get(edge.source)!.push(edge.target);
    adjList.get(edge.target)!.push(edge.source);
  }

  while (head < queue.length) {
    const current = queue[head++];
    const neighbors = adjList.get(current);
    if (neighbors) {
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (!connected.has(neighbor)) {
          connected.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }

  return connected;
}
