import type { Edge } from '@xyflow/react';
import type { RecipeNodeType } from '../types/nodes';
import type { LPSolverConnection, LPSolverNode } from './lpTypes';
import { useGlobalSettingsStore } from '../stores/useGlobalSettingsStore';
import { solveFlowPipeline } from './solverPipeline';
import { getRateMultiplier } from '../utils/recipeComputation';
import { createGraphResolutionContext } from '../utils/graphResolutionContext';
import { buildHandleId, parseHandleId } from '../utils/idGenerator';

export interface LPSolverPayload {
  nodes: LPSolverNode[];
  connections: LPSolverConnection[];
}

export function buildLPSolverPayload(
  nodes: RecipeNodeType[],
  edges: Edge[]
): LPSolverPayload {
  const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<string, unknown>;
  const { nodeRecipes, resolvedProducts } = solveFlowPipeline(
    nodes,
    edges,
    globalSettings
  );

  const resolutionContext = createGraphResolutionContext(nodes, edges);
  const { edgeLookup } = resolutionContext;
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const getResolvedPortProduct = (
    nodeId: string,
    side: 'input' | 'output',
    index: number,
  ): string => {
    const recipe = nodeRecipes[nodeId];
    const list = side === 'input' ? recipe?.inputs : recipe?.outputs;
    const fallback = list?.[index]?.product_id ?? '';
    const handleId = buildHandleId(nodeId, side, index);
    return resolvedProducts[handleId] ?? fallback;
  };

  const lpNodes: LPSolverNode[] = [];
  for (const node of nodes) {
    const recipe = nodeRecipes[node.id];
    if (!recipe) continue;

    const multiplier = getRateMultiplier(recipe.cycle_time, 'second');

    let powerVal = 0;
    const power = recipe.power_consumption;
    if (typeof power === 'number') {
      powerVal = power;
    } else if (power && typeof power === 'object' && 'max' in power) {
      powerVal = (power as { max: number }).max;
    }

    const inputs = recipe.inputs.map((inp, idx) => {
      const handleId = buildHandleId(node.id, 'input', idx);
      return {
        productId: resolvedProducts[handleId] ?? inp.product_id,
        quantity: inp.quantity * multiplier,
        isSink: !!inp.variable,
      };
    });

    const outputs = recipe.outputs.map((out, idx) => {
      const handleId = buildHandleId(node.id, 'output', idx);
      const outgoingEdges = edgeLookup.get(handleId) ?? [];
      const sourceProductId = getResolvedPortProduct(node.id, 'output', idx);

      const hasSinkConnection = outgoingEdges.some((edge) => {
        if (edge.sourceHandle !== handleId) return false;
        if (!edge.targetHandle) return false;
        const targetParsed = parseHandleId(edge.targetHandle);
        if (!targetParsed) return false;
        if (targetParsed.side !== 'input') return false;
        const targetNode = nodesById.get(edge.target);
        if (!targetNode) return false;
        const targetRecipe = nodeRecipes[targetNode.id];
        if (!targetRecipe) return false;
        const targetInput = targetRecipe.inputs[targetParsed.index];
        const targetProductId = getResolvedPortProduct(edge.target, 'input', targetParsed.index);
        if (sourceProductId !== targetProductId) return false;
        return !!targetInput?.variable;
      });

      return {
        productId: sourceProductId || out.product_id,
        quantity: out.quantity * multiplier,
        hasSinkConnection,
      };
    });

    lpNodes.push({
      id: node.id,
      currentMachineCount: node.data.machineCount ?? 0,
      isTarget: !!node.data.isTarget,
      power: powerVal,
      pollution: recipe.pollution ?? 0,
      inputs,
      outputs,
    });
  }

  const lpConnections: LPSolverConnection[] = [];
  for (const edge of edges) {
    if (!edge.sourceHandle || !edge.targetHandle) continue;
    const sourceParsed = parseHandleId(edge.sourceHandle);
    const targetParsed = parseHandleId(edge.targetHandle);
    if (!sourceParsed || !targetParsed) continue;
    if (sourceParsed.side !== 'output' || targetParsed.side !== 'input') continue;

    const sourceProductId = getResolvedPortProduct(edge.source, 'output', sourceParsed.index);
    const targetProductId = getResolvedPortProduct(edge.target, 'input', targetParsed.index);
    if (!sourceProductId || sourceProductId !== targetProductId) continue;

    lpConnections.push({
      id: edge.id,
      sourceNodeId: edge.source,
      sourceOutputIndex: sourceParsed.index,
      targetNodeId: edge.target,
      targetInputIndex: targetParsed.index,
    });
  }

  return {
    nodes: lpNodes,
    connections: lpConnections,
  };
}
