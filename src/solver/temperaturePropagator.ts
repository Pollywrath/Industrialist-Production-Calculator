import type { ReactFlowNode, ReactFlowEdge } from '../types/solver';
import { resolveActiveRecipe } from '../data/lookup';
import { getSpecialRecipe } from '../data/registry';
import { parseHandleId, buildHandleId } from '../utils/idGenerator';
import { createGraphResolutionContext } from '../utils/graphResolutionContext';
import { isPositiveSolverFlow, normalizeSolverRate } from '../utils/precision';
import { sumConnectedEdgeFlows } from './flowAggregation';

export interface TemperaturePropagationResult {
  edgeTemps: Record<string, number>;
  inputTemps: Record<string, Record<number, number>>;
  settingsOverrides: Record<string, Record<string, unknown>>;
  iterationsRun: number;
  converged: boolean;
}

const TEMPERATURE_CONVERGENCE_TOLERANCE = 1e-6;

export function propagateTemperatures(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  edgeFlows: Record<string, number>,
  globalSettings?: Record<string, unknown>,
): TemperaturePropagationResult {
  const resolutionContext = createGraphResolutionContext(nodes, edges);
  const getHelpers = (nodeId: string) => {
    const baseHelpers = resolutionContext.createHelpers(nodeId);
    return {
      ...baseHelpers,
      getFlowRate: (side: 'input' | 'output', index: number) => {
        const handleId = buildHandleId(nodeId, side, index);
        const connectedEdges = resolutionContext.edgeLookup.get(handleId) ?? [];
        return sumConnectedEdgeFlows(connectedEdges, edgeFlows, true);
      },
    };
  };

  const nodeOutputTemps: Record<string, number[]> = {};
  const inputTemps: Record<string, Record<number, number>> = {};
  const edgeTemps: Record<string, number> = {};

  const resolveConfiguredInputTemp = (
    node: ReactFlowNode,
    inputIndex: number,
    sr = getSpecialRecipe(node.data.recipeId),
  ): number => {
    const settingKey = sr?.inputTemperatureSettings?.[inputIndex];
    if (!settingKey) return 18;
    const settingVal = node.data.settings?.[settingKey];
    if (typeof settingVal === 'number') return settingVal;
    const def = sr.settings?.[settingKey]?.default;
    return typeof def === 'number' ? def : 18;
  };

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
      { suppressStoreTemperatureOverrides: true, globalSettings },
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

  let iterationsRun = 0;
  let converged = false;

  for (let iter = 0; iter < 80; iter++) {
    iterationsRun = iter + 1;
    const previousOutputTemps = Object.fromEntries(
      Object.entries(nodeOutputTemps).map(([nodeId, temperatures]) => [nodeId, [...temperatures]]),
    );
    const previousInputTemps = Object.fromEntries(
      Object.entries(inputTemps).map(([nodeId, temperatures]) => [nodeId, { ...temperatures }]),
    );

    for (const edge of edges) {
      if (!edge.sourceHandle) continue;
      if (!isPositiveSolverFlow(edgeFlows[edge.id])) {
        edgeTemps[edge.id] = 18;
        continue;
      }
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
        { suppressStoreTemperatureOverrides: true, globalSettings },
      );
      if (!recipe) continue;

      const sr = getSpecialRecipe(node.data.recipeId);
      inputTemps[nodeId] = {};

      for (let i = 0; i < recipe.inputs.length; i++) {
        const handleId = buildHandleId(nodeId, 'input', i);
        const hasIncoming = connectedTargetHandles.has(handleId);

        if (!hasIncoming) {
          inputTemps[nodeId][i] = resolveConfiguredInputTemp(node, i, sr);
        } else {
          const connected = incomingEdges[nodeId]?.[i] || [];
          let totalFlow = 0;
          let weightedSum = 0;
          for (const edge of connected) {
            const flow = edgeFlows[edge.id] ?? 0;
            if (!isPositiveSolverFlow(flow)) continue;
            totalFlow = normalizeSolverRate(totalFlow + flow);
            weightedSum += flow * edgeTemps[edge.id];
          }

          if (isPositiveSolverFlow(totalFlow)) {
            inputTemps[nodeId][i] = weightedSum / totalFlow;
          } else {
            inputTemps[nodeId][i] = resolveConfiguredInputTemp(node, i, sr);
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
          {
            temperatureInputOverrides: inputTemps[nodeId],
            suppressStoreTemperatureOverrides: true,
            globalSettings,
          },
        );
        if (updatedRecipe) {
          nodeOutputTemps[nodeId] = updatedRecipe.outputs.map((out) => out.temperature ?? 18);
        }
      } else {
        nodeOutputTemps[nodeId] = recipe.outputs.map((out) => out.temperature ?? 18);
      }
    }

    let maxOutputTemperatureDelta = 0;
    for (const node of nodes) {
      const previous = previousOutputTemps[node.id] ?? [];
      const current = nodeOutputTemps[node.id] ?? [];
      if (previous.length !== current.length) {
        maxOutputTemperatureDelta = Number.POSITIVE_INFINITY;
        break;
      }
      for (let index = 0; index < current.length; index += 1) {
        const delta = Math.abs(current[index] - previous[index]);
        if (!Number.isFinite(delta)) {
          maxOutputTemperatureDelta = Number.POSITIVE_INFINITY;
          break;
        }
        maxOutputTemperatureDelta = Math.max(maxOutputTemperatureDelta, delta);
      }
      if (!Number.isFinite(maxOutputTemperatureDelta)) break;

      const previousInputs = previousInputTemps[node.id] ?? {};
      const currentInputs = inputTemps[node.id] ?? {};
      const previousInputIndexes = Object.keys(previousInputs);
      const currentInputIndexes = Object.keys(currentInputs);
      if (previousInputIndexes.length !== currentInputIndexes.length) {
        maxOutputTemperatureDelta = Number.POSITIVE_INFINITY;
        break;
      }
      for (const index of currentInputIndexes) {
        if (!(index in previousInputs)) {
          maxOutputTemperatureDelta = Number.POSITIVE_INFINITY;
          break;
        }
        const delta = Math.abs(currentInputs[Number(index)] - previousInputs[Number(index)]);
        if (!Number.isFinite(delta)) {
          maxOutputTemperatureDelta = Number.POSITIVE_INFINITY;
          break;
        }
        maxOutputTemperatureDelta = Math.max(maxOutputTemperatureDelta, delta);
      }
      if (!Number.isFinite(maxOutputTemperatureDelta)) break;
    }
    if (maxOutputTemperatureDelta <= TEMPERATURE_CONVERGENCE_TOLERANCE) {
      converged = true;
      break;
    }
  }

  const finalSettingsOverrides = buildConnectedTemperatureOverrides();

  const finalNodeOutputTemps: Record<string, number[]> = {};
  for (const node of nodes) {
    const nodeOverrides = finalSettingsOverrides[node.id];
    const settings =
      nodeOverrides || node.data.settings ? { ...node.data.settings, ...nodeOverrides } : undefined;
    const recipe = resolveActiveRecipe(node.data.recipeId, settings, node.id, getHelpers(node.id), {
      temperatureInputOverrides: inputTemps[node.id],
      suppressStoreTemperatureOverrides: true,
      globalSettings,
    });
    if (recipe) {
      finalNodeOutputTemps[node.id] = recipe.outputs.map((out) => out.temperature ?? 18);
    } else {
      finalNodeOutputTemps[node.id] = [];
    }
  }

  for (const edge of edges) {
    if (!edge.sourceHandle) continue;
    if (!isPositiveSolverFlow(edgeFlows[edge.id])) {
      edgeTemps[edge.id] = 18;
      continue;
    }
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
    edgeTemps,
    inputTemps,
    settingsOverrides: finalSettingsOverrides,
    iterationsRun,
    converged,
  };
}
