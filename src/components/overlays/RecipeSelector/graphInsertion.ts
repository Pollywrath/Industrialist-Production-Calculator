import type { Edge } from '@xyflow/react';
import type { HandleDataType, Recipe } from '../../../types/data';
import { isGroupNode, isRecipeNode } from '../../../types/nodes';
import type { CanvasNode, RecipeNodeType } from '../../../types/nodes';
import { SNAP_GRID, NODE_WIDTH } from '../../shared/layoutConstants';
import { calculateMachineCountFromRate } from '../../../utils/recipeComputation';
import { nextNodeId, nextEdgeId, buildHandleId } from '../../../utils/idGenerator';
import { findBestProductMatchIndex } from './productMatch';

interface InsertionParams {
  recipe: Recipe;
  preselectedNodeId: string | null;
  preselectedSourceSide: 'input' | 'output' | null;
  preselectedProductId: string | null;
  preselectedHandleType: HandleDataType | '' | null;
  preselectedHandleIndex: number | null;
  derivedRate: number | null;
  nodes: CanvasNode[];
  edges: Edge[];
  screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number };
  resolvedSettings?: Record<string, unknown>;
}

interface InsertionResult {
  newNode: RecipeNodeType;
  nextEdges: Edge[];
}

function getInsertionAnchorNode(
  nodes: CanvasNode[],
  existingNode: CanvasNode,
  sourceSide: 'input' | 'output' | null,
  handleIndex: number | null,
): CanvasNode {
  if (!isRecipeNode(existingNode) || !existingNode.data.groupId || !sourceSide || handleIndex === null) {
    return existingNode;
  }

  const candidateGroupNode = nodes.find((node) => node.id === existingNode.data.groupId);
  if (!isGroupNode(candidateGroupNode) || !candidateGroupNode.data.collapsed) {
    return existingNode;
  }

  const internalHandleId = buildHandleId(existingNode.id, sourceSide, handleIndex);
  const proxyHandleIds =
    sourceSide === 'input'
      ? candidateGroupNode.data.inputProxyHandleIds
      : candidateGroupNode.data.outputProxyHandleIds;

  return proxyHandleIds.includes(internalHandleId) ? candidateGroupNode : existingNode;
}

export function computeRecipeInsertion({
  recipe,
  preselectedNodeId,
  preselectedSourceSide,
  preselectedProductId,
  preselectedHandleType,
  preselectedHandleIndex,
  derivedRate,
  nodes,
  edges,
  screenToFlowPosition,
  resolvedSettings,
}: InsertionParams): InsertionResult {
  const newNodeId = nextNodeId();
  const inputOrder = recipe.inputs.map((_, i) => i);
  const outputOrder = recipe.outputs.map((_, i) => i);

  const matchingInputIndex = findBestProductMatchIndex(
    recipe.inputs,
    preselectedProductId,
    preselectedHandleType,
  );
  const matchingOutputIndex = findBestProductMatchIndex(
    recipe.outputs,
    preselectedProductId,
    preselectedHandleType,
  );

  let targetX = 0;
  let targetY = 0;
  let shouldAutoConnect = false;
  let autoEdge: Edge | null = null;
  let calculatedMachineCount = 1;

  if (preselectedNodeId) {
    const existingNode = nodes.find((n) => n.id === preselectedNodeId);
    if (existingNode) {
      if (!isRecipeNode(existingNode)) {
        const center = screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        targetX = center.x - NODE_WIDTH / 2;
        targetY = center.y - 50;
      } else {
        const anchorNode = getInsertionAnchorNode(
          nodes,
          existingNode,
          preselectedSourceSide,
          preselectedHandleIndex,
        );

        if (derivedRate !== null) {
          const targetIndex =
            preselectedSourceSide === 'input' ? matchingOutputIndex : matchingInputIndex;
          if (targetIndex !== -1) {
            const targetList = preselectedSourceSide === 'input' ? recipe.outputs : recipe.inputs;
            const targetEntry = targetList[targetIndex];
            const candidateBaseQty = targetEntry.quantity;
            if (candidateBaseQty > 0) {
              calculatedMachineCount = calculateMachineCountFromRate(
                derivedRate,
                recipe.cycle_time,
                candidateBaseQty,
              );
            }
          }
        }

        const horizontalGap = 150;
        if (preselectedSourceSide === 'input') {
          targetX = anchorNode.position.x - NODE_WIDTH - horizontalGap;
          targetY = anchorNode.position.y;

          if (matchingOutputIndex !== -1 && preselectedHandleIndex !== null) {
            shouldAutoConnect = true;
            autoEdge = {
              id: nextEdgeId(),
              source: newNodeId,
              sourceHandle: buildHandleId(newNodeId, 'output', matchingOutputIndex),
              target: preselectedNodeId,
              targetHandle: buildHandleId(preselectedNodeId, 'input', preselectedHandleIndex),
            };
          }
        } else if (preselectedSourceSide === 'output') {
          targetX = anchorNode.position.x + NODE_WIDTH + horizontalGap;
          targetY = anchorNode.position.y;

          if (matchingInputIndex !== -1 && preselectedHandleIndex !== null) {
            shouldAutoConnect = true;
            autoEdge = {
              id: nextEdgeId(),
              source: preselectedNodeId,
              sourceHandle: buildHandleId(preselectedNodeId, 'output', preselectedHandleIndex),
              target: newNodeId,
              targetHandle: buildHandleId(newNodeId, 'input', matchingInputIndex),
            };
          }
        }
      }
    } else {
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      targetX = center.x - NODE_WIDTH / 2;
      targetY = center.y - 50;
    }
  } else {
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    targetX = center.x - NODE_WIDTH / 2;
    targetY = center.y - 50;
  }

  const snappedX = Math.round(targetX / SNAP_GRID[0]) * SNAP_GRID[0];
  const snappedY = Math.round(targetY / SNAP_GRID[1]) * SNAP_GRID[1];

  const newNode: RecipeNodeType = {
    id: newNodeId,
    type: 'recipe',
    position: { x: snappedX, y: snappedY },
    selected: true,
    data: {
      recipeId: recipe.id,
      machineCount: calculatedMachineCount,
      inputOrder,
      outputOrder,
      settings: resolvedSettings || {},
    },
  };

  const nextEdges = shouldAutoConnect && autoEdge ? [...edges, autoEdge] : edges;

  return {
    newNode,
    nextEdges,
  };
}
