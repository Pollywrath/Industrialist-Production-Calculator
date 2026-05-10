import type { Node, Edge } from '@xyflow/react';
import type { Recipe } from '../../../types/data';
import type { RecipeNodeData } from '../../../types/nodes';
import { SNAP_GRID, NODE_WIDTH } from '../../shared/layoutConstants';
import { cleanMachineCount } from '../../../utils/recipeComputation';
import { nextNodeId, nextEdgeId, buildHandleId } from '../../../utils/idGenerator';

interface InsertionParams {
  recipe: Recipe;
  preselectedNodeId: string | null;
  preselectedSourceSide: 'input' | 'output' | null;
  preselectedProductId: string | null;
  preselectedHandleIndex: number | null;
  derivedRate: number | null;
  nodes: Node<RecipeNodeData>[];
  edges: Edge[];
  screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number };
}

interface InsertionResult {
  newNode: Node<RecipeNodeData>;
  nextEdges: Edge[];
}

export function computeRecipeInsertion({
  recipe,
  preselectedNodeId,
  preselectedSourceSide,
  preselectedProductId,
  preselectedHandleIndex,
  derivedRate,
  nodes,
  edges,
  screenToFlowPosition,
}: InsertionParams): InsertionResult {
  const newNodeId = nextNodeId();
  const inputOrder = recipe.inputs.map((_, i) => i);
  const outputOrder = recipe.outputs.map((_, i) => i);

  const matchingInputIndex = preselectedProductId
    ? recipe.inputs.findIndex((inp) => inp.product_id === preselectedProductId)
    : -1;
  const matchingOutputIndex = preselectedProductId
    ? recipe.outputs.findIndex((out) => out.product_id === preselectedProductId)
    : -1;

  let targetX = 0;
  let targetY = 0;
  let shouldAutoConnect = false;
  let autoEdge: Edge | null = null;
  let calculatedMachineCount = 1;

  if (preselectedNodeId) {
    const existingNode = nodes.find((n) => n.id === preselectedNodeId);
    if (existingNode) {
      if (derivedRate !== null) {
        const targetIndex =
          preselectedSourceSide === 'input' ? matchingOutputIndex : matchingInputIndex;
        if (targetIndex !== -1) {
          const targetList = preselectedSourceSide === 'input' ? recipe.outputs : recipe.inputs;
          const targetEntry = targetList[targetIndex];
          const candidateBaseQty = targetEntry.quantity;
          if (candidateBaseQty > 0) {
            calculatedMachineCount = cleanMachineCount(
              (derivedRate * recipe.cycle_time) / candidateBaseQty,
            );
          }
        }
      }

      const horizontalGap = 150;
      if (preselectedSourceSide === 'input') {
        targetX = existingNode.position.x - NODE_WIDTH - horizontalGap;
        targetY = existingNode.position.y;

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
        targetX = existingNode.position.x + NODE_WIDTH + horizontalGap;
        targetY = existingNode.position.y;

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

  const newNode: Node<RecipeNodeData> = {
    id: newNodeId,
    type: 'recipe',
    position: { x: snappedX, y: snappedY },
    selected: true,
    data: {
      recipeId: recipe.id,
      machineCount: calculatedMachineCount,
      inputOrder,
      outputOrder,
    },
  };

  const nextEdges = shouldAutoConnect && autoEdge ? [...edges, autoEdge] : edges;

  return {
    newNode,
    nextEdges,
  };
}
