import type { Node, Edge } from '@xyflow/react';
import type { RecipeNodeData } from '../types/nodes';
import { nextNodeId, nextEdgeId, parseHandleId, buildHandleId } from '../utils/idGenerator';

export function mergeSaveIntoCanvas(
  loadedNodes: Node<RecipeNodeData>[],
  loadedEdges: Edge[],
  currentNodes: Node<RecipeNodeData>[],
  currentEdges: Edge[],
): { nodes: Node<RecipeNodeData>[]; edges: Edge[] } {
  const idMap = new Map<string, string>();
  const mergedNodes = [...currentNodes];

  for (let i = 0; i < loadedNodes.length; i++) {
    const node = loadedNodes[i];
    const newId = nextNodeId();

    if (!idMap.has(node.id)) {
      idMap.set(node.id, newId);
    }

    mergedNodes.push({
      ...node,
      id: newId,
      position: { x: node.position.x + 50, y: node.position.y + 50 },
    });
  }

  const mergedEdges = [...currentEdges];
  for (let i = 0; i < loadedEdges.length; i++) {
    const edge = loadedEdges[i];
    const newSource = idMap.get(edge.source) ?? edge.source;
    const newTarget = idMap.get(edge.target) ?? edge.target;

    const sourceParsed = edge.sourceHandle ? parseHandleId(edge.sourceHandle) : null;
    const targetParsed = edge.targetHandle ? parseHandleId(edge.targetHandle) : null;

    if (!sourceParsed || !targetParsed) {
      console.warn(`Skipping malformed edge during merge: ${edge.id}`);
      continue;
    }

    mergedEdges.push({
      ...edge,
      id: nextEdgeId(),
      source: newSource,
      target: newTarget,
      sourceHandle: buildHandleId(newSource, 'output', sourceParsed.index),
      targetHandle: buildHandleId(newTarget, 'input', targetParsed.index),
    });
  }

  return { nodes: mergedNodes, edges: mergedEdges };
}
