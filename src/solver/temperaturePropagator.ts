import type { ReactFlowNode, ReactFlowEdge, FlowResults } from '../types/solver';
import { buildSolverGraph } from './graphBuilder';
import { calculateFlows } from './flowSolver';
import { resolveActiveRecipe } from '../data/lookup';
import { getSpecialRecipe } from '../data/registry';
import { parseHandleId, buildHandleId } from '../utils/idGenerator';

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
  // 1. Initial Pass: run flow solver using current canvas settings
  const initialGraph = buildSolverGraph(nodes, edges);
  const { edgeFlows: initialEdgeFlows } = calculateFlows(initialGraph);

  // Keep track of temperature state
  const nodeOutputTemps: Record<string, number[]> = {};
  const inputTemps: Record<string, Record<number, number>> = {};
  const edgeTemps: Record<string, number> = {};

  // Initialize inputTemps structure
  for (const node of nodes) {
    inputTemps[node.id] = {};
  }

  // Initialize edgeTemps to 18 (default room temperature)
  for (const edge of edges) {
    edgeTemps[edge.id] = 18;
  }

  // Initialize nodeOutputTemps based on the initial active recipe (using node settings)
  for (const node of nodes) {
    const recipe = resolveActiveRecipe(node.data.recipeId, node.data.settings);
    if (recipe) {
      nodeOutputTemps[node.id] = recipe.outputs.map((out) => out.temperature ?? 18);
    } else {
      nodeOutputTemps[node.id] = [];
    }
  }

  // Pre-calculate target handles that are connected by edges for faster lookup
  const connectedTargetHandles = new Set<string>();
  for (const edge of edges) {
    if (edge.targetHandle) {
      connectedTargetHandles.add(edge.targetHandle);
    }
  }

  // Pre-calculate incoming edges map by target node and handle index
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

  // 2. Propagation Loop (5 iterations)
  for (let iter = 0; iter < 5; iter++) {
    // Step A: Propagate output temperatures to edges
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

    // Step B: Aggregate edge temperatures at node inputs (weighted by initial flow rates)

    // Compute input temperatures for each node
    for (const node of nodes) {
      const nodeId = node.id;
      const recipe = resolveActiveRecipe(node.data.recipeId, node.data.settings);
      if (!recipe) continue;

      const sr = getSpecialRecipe(node.data.recipeId);

      for (let i = 0; i < recipe.inputs.length; i++) {
        const handleId = buildHandleId(nodeId, 'input', i);
        const hasIncoming = connectedTargetHandles.has(handleId);

        if (!hasIncoming) {
          // Unconnected: if it maps to a setting definitions key, read the current value or fall back to default
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
          // Connected: compute weighted average based on flows
          const connected = incomingEdges[nodeId]?.[i] || [];
          let totalFlow = 0;
          let weightedSum = 0;
          for (const edge of connected) {
            const flow = initialEdgeFlows[edge.id] ?? 0;
            totalFlow += flow;
            weightedSum += flow * edgeTemps[edge.id];
          }

          if (totalFlow > 1e-8) {
            inputTemps[nodeId][i] = weightedSum / totalFlow;
          } else {
            // Arithmetic average if total flow is zero
            let sumTemp = 0;
            for (const edge of connected) {
              sumTemp += edgeTemps[edge.id];
            }
            inputTemps[nodeId][i] = connected.length > 0 ? sumTemp / connected.length : 18;
          }
        }
      }

      // Step C: Re-evaluate node output temperatures based on computed input temperatures
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
        const updatedRecipe = resolveActiveRecipe(node.data.recipeId, {
          ...node.data.settings,
          ...tempOverrides,
        });
        if (updatedRecipe) {
          nodeOutputTemps[nodeId] = updatedRecipe.outputs.map((out) => out.temperature ?? 18);
        }
      } else {
        nodeOutputTemps[nodeId] = recipe.outputs.map((out) => out.temperature ?? 18);
      }
    }
  }

  // 3. Second Pass: Build final overrides and run the final solver
  const finalSettingsOverrides: Record<string, Record<string, unknown>> = {};
  for (const node of nodes) {
    const sr = getSpecialRecipe(node.data.recipeId);
    if (sr && sr.inputTemperatureSettings) {
      const nodeOverrides: Record<string, unknown> = {};
      let hasOverride = false;

      for (const [inpIdxStr, settingKey] of Object.entries(sr.inputTemperatureSettings)) {
        const inpIdx = Number(inpIdxStr);
        const handleId = buildHandleId(node.id, 'input', inpIdx);
        const hasIncoming = connectedTargetHandles.has(handleId);

        if (hasIncoming && inputTemps[node.id][inpIdx] !== undefined) {
          nodeOverrides[settingKey] = inputTemps[node.id][inpIdx];
          hasOverride = true;
        }
      }

      if (hasOverride) {
        finalSettingsOverrides[node.id] = nodeOverrides;
      }
    }
  }

  const finalGraph = buildSolverGraph(nodes, edges, finalSettingsOverrides);
  const { results: finalResults, edgeFlows: finalEdgeFlows } = calculateFlows(finalGraph);

  // Propagate one final time to make sure edgeTemps are aligned with final nodeOutputTemps
  const finalNodeOutputTemps: Record<string, number[]> = {};
  for (const node of nodes) {
    const nodeOverrides = finalSettingsOverrides[node.id];
    const settings = nodeOverrides || node.data.settings
      ? { ...node.data.settings, ...nodeOverrides }
      : undefined;
    const recipe = resolveActiveRecipe(node.data.recipeId, settings);
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
