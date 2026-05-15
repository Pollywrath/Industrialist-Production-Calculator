import type { Node, Edge } from '@xyflow/react';
import type { RecipeNodeData } from '../types/nodes';
import { nextNodeId, nextEdgeId, parseHandleId, buildHandleId } from './idGenerator';

export function mergeSaveIntoCanvas(
  loadedNodes: Node<RecipeNodeData>[],
  loadedEdges: Edge[],
  currentNodes: Node<RecipeNodeData>[],
  currentEdges: Edge[],
): { nodes: Node<RecipeNodeData>[]; edges: Edge[] } {
  const idMap = new Map<string, string>();
  const mergedNodes = [...currentNodes];

  for (let i = 0; i < loadedNodes.length; i++) {
    const n = loadedNodes[i];
    const newId = nextNodeId();
    
    // Only map the ID if it's the first time we see it to prevent ambiguous edge routing
    // in malformed source data.
    if (!idMap.has(n.id)) {
      idMap.set(n.id, newId);
    }
    
    mergedNodes.push({
      ...n,
      id: newId,
      position: { x: n.position.x + 50, y: n.position.y + 50 },
    });
  }

  const mergedEdges = [...currentEdges];
  for (let i = 0; i < loadedEdges.length; i++) {
    const e = loadedEdges[i];
    const newSource = idMap.get(e.source) ?? e.source;
    const newTarget = idMap.get(e.target) ?? e.target;

    const sourceParsed = e.sourceHandle ? parseHandleId(e.sourceHandle) : null;
    const targetParsed = e.targetHandle ? parseHandleId(e.targetHandle) : null;

    // Reject edges with malformed handle IDs during merge to prevent incorrect topology
    if (!sourceParsed || !targetParsed) {
      console.warn(`Skipping malformed edge during merge: ${e.id}`);
      continue;
    }

    mergedEdges.push({
      ...e,
      id: nextEdgeId(),
      source: newSource,
      target: newTarget,
      sourceHandle: buildHandleId(newSource, 'output', sourceParsed.index),
      targetHandle: buildHandleId(newTarget, 'input', targetParsed.index),
    });
  }

  return { nodes: mergedNodes, edges: mergedEdges };
}
