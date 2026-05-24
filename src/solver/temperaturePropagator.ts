import type { ReactFlowNode, ReactFlowEdge, FlowResults } from '../types/solver';
import { buildSolverGraph } from './graphBuilder';
import { calculateFlows } from './flowSolver';
import { resolveActiveRecipe } from '../data/lookup';
import { getSpecialRecipe } from '../data/registry';
import { parseHandleId, buildHandleId } from '../utils/idGenerator';
import { resolveHandleProduct, buildEdgeLookupMap } from '../utils/productResolver';

export interface SolveFlowAndTemperatureResult {
  results: FlowResults;
  edgeFlows: Record<string, number>;
  edgeTemps: Record<string, number>;
  inputTemps: Record<string, Record<number, number>>;
}

export function solveFlowAndTemperature(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
): SolveFlowAndTemperatureResult {
  const nodesMap = new Map<string, ReactFlowNode>(nodes.map((n) => [n.id, n]));
  const edgeLookup = buildEdgeLookupMap(edges);
  const getHelpers = (nodeId: string) => ({
    resolveProduct: (side: 'input' | 'output', index: number) =>
      resolveHandleProduct(nodeId, side, index, nodesMap, edgeLookup),
    hasConnection: (side: 'input' | 'output', index: number) => {
      const handleId = buildHandleId(nodeId, side, index);
      return (edgeLookup.get(handleId)?.length ?? 0) > 0;
    },
  });

  const nodeOutputTemps: Record<string, number[]> = {};
  const inputTemps: Record<string, Record<number, number>> = {};
  const edgeTemps: Record<string, number> = {};

  for (const node of nodes) {
    inputTemps[node.id] = {};
  }
  for (const edge of edges) {
    edgeTemps[edge.id] = 18;
  }

  for (const node of nodes) {
    const recipe = resolveActiveRecipe(
      node.data.recipeId,
      node.data.settings,
      node.id,
      getHelpers(node.id),
    );
    if (recipe) {
      nodeOutputTemps[node.id] = recipe.outputs.map((out) => out.temperature ?? 18);
    } else {
      nodeOutputTemps[node.id] = [];
    }
  }

  const connectedTargetHandles = new Set<string>();
  for (const edge of edges) {
    if (edge.targetHandle) {
      connectedTargetHandles.add(edge.targetHandle);
    }
  }

  const buildConnectedTemperatureOverrides = (): Record<string, Record<string, unknown>> => {
    const settingsOverrides: Record<string, Record<string, unknown>> = {};

    for (const node of nodes) {
      const sr = getSpecialRecipe(node.data.recipeId);
      if (!sr?.inputTemperatureSettings) continue;

      const nodeOverrides: Record<string, unknown> = {};
      let hasOverride = false;

      for (const [inpIdxStr, settingKey] of Object.entries(sr.inputTemperatureSettings)) {
        const inpIdx = Number(inpIdxStr);
        const handleId = buildHandleId(node.id, 'input', inpIdx);
        const hasIncoming = connectedTargetHandles.has(handleId);
        const tempValue = inputTemps[node.id][inpIdx];

        if (hasIncoming && tempValue !== undefined) {
          nodeOverrides[settingKey] = tempValue;
          hasOverride = true;
        }
      }

      if (hasOverride) {
        settingsOverrides[node.id] = nodeOverrides;
      }
    }

    return settingsOverrides;
  };

  const incomingEdges: Record<string, Record<number, typeof edges>> = {};
  for (const edge of edges) {
    if (!edge.targetHandle) continue;
    const targetParsed = parseHandleId(edge.targetHandle);
    if (!targetParsed) continue;

    if (!incomingEdges[edge.target]) {
      incomingEdges[edge.target] = {};
    }
    if (!incomingEdges[edge.target][targetParsed.index]) {
      incomingEdges[edge.target][targetParsed.index] = [];
    }
    incomingEdges[edge.target][targetParsed.index].push(edge);
  }

  for (let iter = 0; iter < 5; iter++) {
    const iterationSettingsOverrides = buildConnectedTemperatureOverrides();
    const iterationGraph = buildSolverGraph(nodes, edges, iterationSettingsOverrides);
    const { edgeFlows: iterationEdgeFlows } = calculateFlows(iterationGraph);

    for (const edge of edges) {
      if (!edge.sourceHandle) continue;
      const sourceParsed = parseHandleId(edge.sourceHandle);
      if (!sourceParsed) continue;

      const sourceOutTemps = nodeOutputTemps[edge.source];
      if (sourceOutTemps && sourceParsed.index < sourceOutTemps.length) {
        edgeTemps[edge.id] = sourceOutTemps[sourceParsed.index];
      } else {
        edgeTemps[edge.id] = 18;
      }
    }

    for (const node of nodes) {
      const nodeId = node.id;
      const recipe = resolveActiveRecipe(
        node.data.recipeId,
        node.data.settings,
        nodeId,
        getHelpers(nodeId),
      );
      if (!recipe) continue;

      const sr = getSpecialRecipe(node.data.recipeId);

      for (let i = 0; i < recipe.inputs.length; i++) {
        const handleId = buildHandleId(nodeId, 'input', i);
        const hasIncoming = connectedTargetHandles.has(handleId);

        if (!hasIncoming) {
          const settingKey = sr?.inputTemperatureSettings?.[i];
          if (settingKey) {
            const settingVal = node.data.settings?.[settingKey];
            if (typeof settingVal === 'number') {
              inputTemps[nodeId][i] = settingVal;
            } else {
              const def = sr.settings?.[settingKey]?.default;
              inputTemps[nodeId][i] = typeof def === 'number' ? def : 18;
            }
          } else {
            inputTemps[nodeId][i] = 18;
          }
        } else {
          const connected = incomingEdges[nodeId]?.[i] || [];
          let totalFlow = 0;
          let weightedSum = 0;
          for (const edge of connected) {
            const flow = iterationEdgeFlows[edge.id] ?? 0;
            totalFlow += flow;
            weightedSum += flow * edgeTemps[edge.id];
          }

          if (totalFlow > 1e-8) {
            inputTemps[nodeId][i] = weightedSum / totalFlow;
          } else {
            let sumTemp = 0;
            for (const edge of connected) {
              sumTemp += edgeTemps[edge.id];
            }
            inputTemps[nodeId][i] = connected.length > 0 ? sumTemp / connected.length : 18;
          }
        }
      }

      if (sr) {
        const tempOverrides: Record<string, unknown> = {};
        if (sr.inputTemperatureSettings) {
          for (const [inpIdxStr, settingKey] of Object.entries(sr.inputTemperatureSettings)) {
            const inpIdx = Number(inpIdxStr);
            if (inputTemps[nodeId][inpIdx] !== undefined) {
              tempOverrides[settingKey] = inputTemps[nodeId][inpIdx];
            }
          }
        }
        const updatedRecipe = resolveActiveRecipe(
          node.data.recipeId,
          {
            ...node.data.settings,
            ...tempOverrides,
          },
          nodeId,
          getHelpers(nodeId),
        );
        if (updatedRecipe) {
          nodeOutputTemps[nodeId] = updatedRecipe.outputs.map((out) => out.temperature ?? 18);
        }
      } else {
        nodeOutputTemps[nodeId] = recipe.outputs.map((out) => out.temperature ?? 18);
      }
    }
  }

  const finalSettingsOverrides = buildConnectedTemperatureOverrides();

  const finalGraph = buildSolverGraph(nodes, edges, finalSettingsOverrides);
  const { results: finalResults, edgeFlows: finalEdgeFlows } = calculateFlows(finalGraph);

  const finalNodeOutputTemps: Record<string, number[]> = {};
  for (const node of nodes) {
    const nodeOverrides = finalSettingsOverrides[node.id];
    const settings =
      nodeOverrides || node.data.settings ? { ...node.data.settings, ...nodeOverrides } : undefined;
    const recipe = resolveActiveRecipe(node.data.recipeId, settings, node.id, getHelpers(node.id));
    if (recipe) {
      finalNodeOutputTemps[node.id] = recipe.outputs.map((out) => out.temperature ?? 18);
    } else {
      finalNodeOutputTemps[node.id] = [];
    }
  }

  for (const edge of edges) {
    if (!edge.sourceHandle) continue;
    const sourceParsed = parseHandleId(edge.sourceHandle);
    if (!sourceParsed) continue;

    const sourceOutTemps = finalNodeOutputTemps[edge.source];
    if (sourceOutTemps && sourceParsed.index < sourceOutTemps.length) {
      edgeTemps[edge.id] = sourceOutTemps[sourceParsed.index];
    } else {
      edgeTemps[edge.id] = 18;
    }
  }

  return {
    results: finalResults,
    edgeFlows: finalEdgeFlows,
    edgeTemps,
    inputTemps,
  };
}
