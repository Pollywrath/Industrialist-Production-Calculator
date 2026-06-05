import type { Edge } from '@xyflow/react';
import { isGroupNode, isRecipeNode } from '../types/nodes';
import type { CanvasNode } from '../types/nodes';
import { nextNodeId, nextEdgeId, parseHandleId, buildHandleId } from '../utils/idGenerator';

function remapProxyHandleIds(
  handleIds: string[],
  idMap: Map<string, string>,
  recipeNodeIds: Set<string>,
  side: 'input' | 'output',
): string[] {
  let changed = false;
  const nextHandleIds: string[] = [];

  for (let i = 0; i < handleIds.length; i++) {
    const handleId = handleIds[i];
    const parsed = parseHandleId(handleId);
    const nextNodeId = parsed ? idMap.get(parsed.nodeId) : undefined;
    const nextHandleId =
      parsed && nextNodeId ? buildHandleId(nextNodeId, parsed.side, parsed.index) : handleId;
    const nextParsed = parseHandleId(nextHandleId);

    if (!nextParsed || nextParsed.side !== side || !recipeNodeIds.has(nextParsed.nodeId)) {
      changed = true;
      continue;
    }

    nextHandleIds.push(nextHandleId);
    if (parsed && nextNodeId) {
      changed = true;
    }
  }

  return changed ? nextHandleIds : handleIds;
}

export function mergeSaveIntoCanvas(
  loadedNodes: CanvasNode[],
  loadedEdges: Edge[],
  currentNodes: CanvasNode[],
  currentEdges: Edge[],
): { nodes: CanvasNode[]; edges: Edge[] } {
  const idMap = new Map<string, string>();
  const newNodeIds = new Array<string>(loadedNodes.length);
  const loadedGroupIds = new Set<string>();
  const loadedRecipeIds = new Set<string>();
  const mergedNodes = [...currentNodes];

  for (let i = 0; i < loadedNodes.length; i++) {
    const node = loadedNodes[i];
    const newId = nextNodeId();
    newNodeIds[i] = newId;
    if (isGroupNode(node)) {
      loadedGroupIds.add(newId);
    } else if (isRecipeNode(node)) {
      loadedRecipeIds.add(newId);
    }

    if (!idMap.has(node.id)) {
      idMap.set(node.id, newId);
    }
  }

  for (let i = 0; i < loadedNodes.length; i++) {
    const node = loadedNodes[i];
    const newId = newNodeIds[i];

    const mergedNode: CanvasNode = {
      ...node,
      id: newId,
      position: { x: node.position.x + 50, y: node.position.y + 50 },
    };

    if (isGroupNode(mergedNode)) {
      mergedNodes.push({
        ...mergedNode,
        data: {
          ...mergedNode.data,
          inputProxyHandleIds: remapProxyHandleIds(
            mergedNode.data.inputProxyHandleIds,
            idMap,
            loadedRecipeIds,
            'input',
          ),
          outputProxyHandleIds: remapProxyHandleIds(
            mergedNode.data.outputProxyHandleIds,
            idMap,
            loadedRecipeIds,
            'output',
          ),
        },
      });
    } else if (isRecipeNode(mergedNode)) {
      const groupId = mergedNode.data.groupId
        ? idMap.get(mergedNode.data.groupId)
        : undefined;
      mergedNodes.push({
        ...mergedNode,
        data: {
          ...mergedNode.data,
          groupId: groupId && loadedGroupIds.has(groupId) ? groupId : undefined,
        },
      });
    }
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
