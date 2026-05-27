import type { FlowResults, ReactFlowEdge, ReactFlowNode, SolverGraph } from '../types/solver';
import { getSpecialRecipe } from '../data/registry';
import { buildSolverGraph } from './graphBuilder';
import { calculateFlows } from './flowSolver';
import { propagateTemperatures } from './temperaturePropagator';

const MAX_TEMPERATURE_COUPLED_PASSES = 8;
const NUMERIC_EQUALITY_EPSILON = 1e-6;

type SettingsOverrides = Record<string, Record<string, unknown>>;

export interface SolverPipelineResult {
  results: FlowResults;
  edgeFlows: Record<string, number>;
  edgeTemps: Record<string, number>;
  inputTemps: Record<string, Record<number, number>>;
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
): {
  results: FlowResults;
  edgeFlows: Record<string, number>;
} {
  const initialGraph = buildSolverGraph(nodes, edges, settingsOverrides);
  const firstPass = calculateFlows(initialGraph);

  if (!includesFlowDependentRecipes) {
    return firstPass;
  }

  const correctedGraph = buildSolverGraph(
    nodes,
    edges,
    settingsOverrides,
    firstPass.edgeFlows,
  );
  if (areGraphNodesEquivalent(initialGraph.nodes, correctedGraph.nodes)) {
    return firstPass;
  }

  return calculateFlows(correctedGraph, true);
}

export function solveFlowPipeline(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
): SolverPipelineResult {
  const nodesById = new Map<string, ReactFlowNode>(nodes.map((node) => [node.id, node]));
  const includesFlowDependentRecipes = hasFlowDependentRecipes(nodes);
  let activeOverrides: SettingsOverrides | undefined;
  let finalResult: SolverPipelineResult = {
    results: new Map(),
    edgeFlows: {},
    edgeTemps: {},
    inputTemps: {},
  };

  for (let pass = 0; pass < MAX_TEMPERATURE_COUPLED_PASSES; pass++) {
    const { results, edgeFlows } = solveFlowsForPipeline(
      nodes,
      edges,
      activeOverrides,
      includesFlowDependentRecipes,
    );
    const { edgeTemps, inputTemps, settingsOverrides } = propagateTemperatures(
      nodes,
      edges,
      edgeFlows,
    );

    finalResult = {
      results,
      edgeFlows,
      edgeTemps,
      inputTemps,
    };

    if (!hasMeaningfulOverrides(nodesById, settingsOverrides)) {
      break;
    }

    if (areOverridesEquivalent(activeOverrides, settingsOverrides)) {
      break;
    }

    activeOverrides = settingsOverrides;
  }

  return finalResult;
}
