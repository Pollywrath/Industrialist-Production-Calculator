import type { FlowResults, ReactFlowEdge, ReactFlowNode } from '../types/solver';
import { solveFlows } from './flowSolver';
import { propagateTemperatures } from './temperaturePropagator';

const MAX_TEMPERATURE_COUPLED_PASSES = 3;
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

export function solveFlowPipeline(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
): SolverPipelineResult {
  const nodesById = new Map<string, ReactFlowNode>(nodes.map((node) => [node.id, node]));
  let activeOverrides: SettingsOverrides | undefined;
  let finalResult: SolverPipelineResult = {
    results: new Map(),
    edgeFlows: {},
    edgeTemps: {},
    inputTemps: {},
  };

  for (let pass = 0; pass < MAX_TEMPERATURE_COUPLED_PASSES; pass++) {
    const { results, edgeFlows } = solveFlows(nodes, edges, activeOverrides);
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
