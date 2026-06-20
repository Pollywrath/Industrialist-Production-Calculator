import type { FlowResults, ReactFlowEdge, ReactFlowNode, SolverGraph } from '../types/solver';
import type { Recipe } from '../types/data';
import { getSpecialRecipe } from '../data/registry';
import { resolveActiveRecipe } from '../data/lookup';
import { buildSolverGraph } from './graphBuilder';
import { calculateFlows } from './flowSolver';
import { propagateTemperatures } from './temperaturePropagator';
import { computeResolvedProducts } from '../utils/productResolver';
import { createGraphResolutionContext } from '../utils/graphResolutionContext';
import { buildHandleId } from '../utils/idGenerator';

const MAX_TEMPERATURE_COUPLED_PASSES = 8;
const NUMERIC_EQUALITY_EPSILON = 1e-6;

type SettingsOverrides = Record<string, Record<string, unknown>>;

export interface SolverPipelineResult {
  results: FlowResults;
  edgeFlows: Record<string, number>;
  edgeTemps: Record<string, number>;
  inputTemps: Record<string, Record<number, number>>;
  resolvedProducts: Record<string, string>;
  nodeRecipes: Record<string, Recipe>;
  iterationsRun?: number;
}

function areValuesEquivalent(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return a === b;
    }
    return Math.abs(a - b) <= NUMERIC_EQUALITY_EPSILON;
  }
  return a === b;
}

function areOverridesEquivalent(
  prev: SettingsOverrides | undefined,
  next: SettingsOverrides,
): boolean {
  if (!prev) return false;
  const prevNodeIds = Object.keys(prev);
  const nextNodeIds = Object.keys(next);
  if (prevNodeIds.length !== nextNodeIds.length) return false;

  for (let i = 0; i < nextNodeIds.length; i++) {
    const nodeId = nextNodeIds[i];
    const prevNodeOverrides = prev[nodeId];
    const nextNodeOverrides = next[nodeId];
    if (!prevNodeOverrides || !nextNodeOverrides) return false;

    const prevKeys = Object.keys(prevNodeOverrides);
    const nextKeys = Object.keys(nextNodeOverrides);
    if (prevKeys.length !== nextKeys.length) return false;

    for (let j = 0; j < nextKeys.length; j++) {
      const key = nextKeys[j];
      if (!areValuesEquivalent(prevNodeOverrides[key], nextNodeOverrides[key])) {
        return false;
      }
    }
  }

  return true;
}

function hasMeaningfulOverrides(
  nodesById: Map<string, ReactFlowNode>,
  overrides: SettingsOverrides,
): boolean {
  const nodeIds = Object.keys(overrides);
  if (nodeIds.length === 0) return false;

  for (let i = 0; i < nodeIds.length; i++) {
    const nodeId = nodeIds[i];
    const node = nodesById.get(nodeId);
    const nodeOverrides = overrides[nodeId];
    if (!node || !nodeOverrides) continue;

    const currentSettings = node.data.settings ?? {};
    const overrideKeys = Object.keys(nodeOverrides);
    for (let j = 0; j < overrideKeys.length; j++) {
      const key = overrideKeys[j];
      if (!areValuesEquivalent(currentSettings[key], nodeOverrides[key])) {
        return true;
      }
    }
  }

  return false;
}

function hasFlowDependentRecipes(nodes: ReactFlowNode[]): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (getSpecialRecipe(nodes[i].data.recipeId)?.flowDependentInputs) {
      return true;
    }
  }
  return false;
}

function areNodePortsEquivalent(
  a: SolverGraph['nodes'][string],
  b: SolverGraph['nodes'][string],
): boolean {
  if (a.inputs.length !== b.inputs.length || a.outputs.length !== b.outputs.length) {
    return false;
  }

  for (let i = 0; i < a.inputs.length; i++) {
    const left = a.inputs[i];
    const right = b.inputs[i];
    if (left.productId !== right.productId || !areValuesEquivalent(left.rate, right.rate)) {
      return false;
    }
  }

  for (let i = 0; i < a.outputs.length; i++) {
    const left = a.outputs[i];
    const right = b.outputs[i];
    if (left.productId !== right.productId || !areValuesEquivalent(left.rate, right.rate)) {
      return false;
    }
  }

  return true;
}

function areGraphNodesEquivalent(
  prev: SolverGraph['nodes'],
  next: SolverGraph['nodes'],
): boolean {
  const prevNodeIds = Object.keys(prev);
  const nextNodeIds = Object.keys(next);
  if (prevNodeIds.length !== nextNodeIds.length) return false;

  for (let i = 0; i < prevNodeIds.length; i++) {
    const nodeId = prevNodeIds[i];
    const prevNode = prev[nodeId];
    const nextNode = next[nodeId];
    if (!prevNode || !nextNode || !areNodePortsEquivalent(prevNode, nextNode)) {
      return false;
    }
  }

  return true;
}

function solveFlowsForPipeline(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  settingsOverrides: SettingsOverrides | undefined,
  includesFlowDependentRecipes: boolean,
  globalSettings?: Record<string, unknown>,
): {
  results: FlowResults;
  edgeFlows: Record<string, number>;
} {
  const initialGraph = buildSolverGraph(nodes, edges, settingsOverrides, undefined, globalSettings);
  const firstPass = calculateFlows(initialGraph);

  if (!includesFlowDependentRecipes) {
    return firstPass;
  }

  const correctedGraph = buildSolverGraph(
    nodes,
    edges,
    settingsOverrides,
    firstPass.edgeFlows,
    globalSettings,
  );
  if (areGraphNodesEquivalent(initialGraph.nodes, correctedGraph.nodes)) {
    return firstPass;
  }

  return calculateFlows(correctedGraph, true);
}

function solveTemperatureCoupledPass(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  settingsOverrides: SettingsOverrides | undefined,
  includesFlowDependentRecipes: boolean,
  globalSettings?: Record<string, unknown>,
): SolverPipelineResult & { settingsOverrides: SettingsOverrides } {
  const { results, edgeFlows } = solveFlowsForPipeline(
    nodes,
    edges,
    settingsOverrides,
    includesFlowDependentRecipes,
    globalSettings,
  );
  const { edgeTemps, inputTemps, settingsOverrides: nextSettingsOverrides, iterationsRun } =
    propagateTemperatures(
      nodes,
      edges,
      edgeFlows,
      globalSettings,
    );

  return {
    results,
    edgeFlows,
    edgeTemps,
    inputTemps,
    resolvedProducts: {},
    nodeRecipes: {},
    iterationsRun,
    settingsOverrides: nextSettingsOverrides,
  };
}

export function solveFlowPipeline(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  globalSettings?: Record<string, unknown>,
): SolverPipelineResult {
  const nodesById = new Map<string, ReactFlowNode>(nodes.map((node) => [node.id, node]));
  const includesFlowDependentRecipes = hasFlowDependentRecipes(nodes);
  let activeOverrides: SettingsOverrides | undefined;
  let finalResult: SolverPipelineResult = {
    results: new Map(),
    edgeFlows: {},
    edgeTemps: {},
    inputTemps: {},
    resolvedProducts: {},
    nodeRecipes: {},
    iterationsRun: 0,
  };
  let needsFinalResync = false;

  for (let pass = 0; pass < MAX_TEMPERATURE_COUPLED_PASSES; pass++) {
    const passResult = solveTemperatureCoupledPass(
      nodes,
      edges,
      activeOverrides,
      includesFlowDependentRecipes,
      globalSettings,
    );
    const { settingsOverrides, ...resultSnapshot } = passResult;

    finalResult = resultSnapshot;
    needsFinalResync = false;

    if (!hasMeaningfulOverrides(nodesById, settingsOverrides)) {
      break;
    }

    if (areOverridesEquivalent(activeOverrides, settingsOverrides)) {
      break;
    }

    activeOverrides = settingsOverrides;
    needsFinalResync = pass === MAX_TEMPERATURE_COUPLED_PASSES - 1;
  }

  if (needsFinalResync) {
    const passResult = solveTemperatureCoupledPass(
      nodes,
      edges,
      activeOverrides,
      includesFlowDependentRecipes,
      globalSettings,
    );
    finalResult = {
      results: passResult.results,
      edgeFlows: passResult.edgeFlows,
      edgeTemps: passResult.edgeTemps,
      inputTemps: passResult.inputTemps,
      resolvedProducts: passResult.resolvedProducts,
      nodeRecipes: passResult.nodeRecipes,
      iterationsRun: passResult.iterationsRun,
    };
  }

  finalResult.resolvedProducts = computeResolvedProducts(nodesById, edges, globalSettings);

  const resolutionContext = createGraphResolutionContext(nodes, edges);
  const nodeRecipes: Record<string, Recipe> = {};

  for (const node of nodes) {
    const nodeId = node.id;
    const nodeOverrides = activeOverrides?.[nodeId];
    const settings =
      nodeOverrides || node.data.settings ? { ...node.data.settings, ...nodeOverrides } : undefined;

    const helpers = {
      resolveProduct: (side: 'input' | 'output', index: number): string => {
        const handleId = buildHandleId(nodeId, side, index);
        return finalResult.resolvedProducts[handleId] ?? '';
      },
      hasConnection: (side: 'input' | 'output', index: number): boolean => {
        const handleId = buildHandleId(nodeId, side, index);
        return (resolutionContext.edgeLookup.get(handleId)?.length ?? 0) > 0;
      },
      getFlowRate: (side: 'input' | 'output', index: number): number => {
        const handleId = buildHandleId(nodeId, side, index);
        const connectedEdges = resolutionContext.edgeLookup.get(handleId) ?? [];
        let totalFlow = 0;
        for (const edge of connectedEdges) {
          totalFlow += finalResult.edgeFlows[edge.id] ?? 0;
        }
        return totalFlow;
      },
    };

    const recipe = resolveActiveRecipe(
      node.data.recipeId,
      settings,
      nodeId,
      helpers,
      {
        temperatureInputOverrides: finalResult.inputTemps[nodeId],
        suppressStoreTemperatureOverrides: true,
        globalSettings,
      },
    );

    if (recipe) {
      nodeRecipes[nodeId] = recipe;
    }
  }

  finalResult.nodeRecipes = nodeRecipes;
  return finalResult;
}
