import type { ReactFlowNode, ReactFlowEdge } from '../types/solver';
import { resolveActiveRecipe } from '../data/lookup';
import { getSpecialRecipe } from '../data/registry';
import { parseHandleId, buildHandleId } from '../utils/idGenerator';
import { createGraphResolutionContext } from '../utils/graphResolutionContext';

const EFFECTIVE_TEMPERATURE_FLOW_EPSILON = 1e-8;

export interface TemperaturePropagationResult {
  edgeTemps: Record<string, number>;
  inputTemps: Record<string, Record<number, number>>;
  settingsOverrides: Record<string, Record<string, unknown>>;
  iterationsRun: number;
}

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
        let totalFlow = 0;

        for (const edge of connectedEdges) {
          totalFlow += edgeFlows[edge.id] ?? 0;
        }

        return totalFlow;
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

  const prevEdgeTemps: Record<string, number> = {};
  let iterationsRun = 0;

  for (let iter = 0; iter < 80; iter++) {
    iterationsRun = iter + 1;

    for (const edge of edges) {
      if (!edge.sourceHandle) continue;
      if ((edgeFlows[edge.id] ?? 0) <= EFFECTIVE_TEMPERATURE_FLOW_EPSILON) {
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

    if (iter > 0) {
      let maxDiff = 0;
      for (const edge of edges) {
        const prev = prevEdgeTemps[edge.id] ?? 18;
        const curr = edgeTemps[edge.id];
        const diff = Math.abs(curr - prev);
        if (diff > maxDiff) {
          maxDiff = diff;
        }
      }
      if (maxDiff < 0.01) {
        break;
      }
    }

    for (const edge of edges) {
      prevEdgeTemps[edge.id] = edgeTemps[edge.id];
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
            if (flow <= EFFECTIVE_TEMPERATURE_FLOW_EPSILON) continue;
            totalFlow += flow;
            weightedSum += flow * edgeTemps[edge.id];
          }

          if (totalFlow > EFFECTIVE_TEMPERATURE_FLOW_EPSILON) {
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
  }

  const finalSettingsOverrides = buildConnectedTemperatureOverrides();

  const finalNodeOutputTemps: Record<string, number[]> = {};
  for (const node of nodes) {
    const nodeOverrides = finalSettingsOverrides[node.id];
    const settings =
      nodeOverrides || node.data.settings ? { ...node.data.settings, ...nodeOverrides } : undefined;
    const recipe = resolveActiveRecipe(
      node.data.recipeId,
      settings,
      node.id,
      getHelpers(node.id),
      {
        temperatureInputOverrides: inputTemps[node.id],
        suppressStoreTemperatureOverrides: true,
        globalSettings,
      },
    );
    if (recipe) {
      finalNodeOutputTemps[node.id] = recipe.outputs.map((out) => out.temperature ?? 18);
    } else {
      finalNodeOutputTemps[node.id] = [];
    }
  }

  for (const edge of edges) {
    if (!edge.sourceHandle) continue;
    if ((edgeFlows[edge.id] ?? 0) <= EFFECTIVE_TEMPERATURE_FLOW_EPSILON) {
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
  };
}
