import type { Node, Edge } from '@xyflow/react';
import type { RecipeNodeData } from '../types/nodes';
import type {
  LPSolverNode,
  LPSolverConnection,
  LPSolverResponse,
  LPFailureDiagnostics,
} from './lpWorker';
import { useFlowStore } from '../stores/useFlowStore';
import { resolveActiveRecipe } from '../data/lookup';
import { solveFlowPipeline } from './solverPipeline';
import { getRateMultiplier } from '../utils/recipeComputation';
import { ASSET_VERSION } from '../data/productIcons';
import { createGraphResolutionContext } from '../utils/graphResolutionContext';
import { parseHandleId, buildHandleId } from '../utils/idGenerator';
export type { LPFailureDiagnostics } from './lpWorker';

export interface LPSolverResult {
  feasible: boolean;
  error?: string;
  machineCounts?: Record<string, number>;
  diagnostics?: LPFailureDiagnostics;
}

export interface LPSolverSession {
  promise: Promise<LPSolverResult>;
}

let activeWorker: Worker | null = null;
let activeSolveInFlight = false;
let activeSolveResolve: ((result: LPSolverResult) => void) | null = null;

function finalizeActiveSolve(result: LPSolverResult): void {
  const resolve = activeSolveResolve;
  activeSolveResolve = null;
  activeSolveInFlight = false;
  if (resolve) {
    resolve(result);
  }
}

function createWorker(): Worker {
  return new Worker(
    new URL('./lpWorker.ts', import.meta.url),
    { type: 'module' }
  );
}

function getOrCreateWorker(): Worker {
  if (!activeWorker) {
    activeWorker = createWorker();
  }
  return activeWorker;
}

export function initLPSolverWorker(): void {
  getOrCreateWorker();
}

export function isLPSolverRunning(): boolean {
  return activeSolveInFlight;
}

export function cancelLPSolver(): void {
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }
  if (activeSolveInFlight) {
    finalizeActiveSolve({
      feasible: false,
      error: 'Computation cancelled.',
    });
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (activeWorker) {
      activeWorker.terminate();
      activeWorker = null;
    }
  });
}

export function solveLP(
  nodes: Node<RecipeNodeData>[],
  edges: Edge[]
): LPSolverSession {
  if (activeSolveInFlight) {
    return {
      promise: Promise.resolve({
        feasible: false,
        error: 'LP solver is already running. Please wait for the current computation to finish.',
      }),
    };
  }
  activeSolveInFlight = true;

  const { inputTemps, edgeFlows } = solveFlowPipeline(nodes, edges);

  const resolutionContext = createGraphResolutionContext(nodes, edges);
  const { edgeLookup } = resolutionContext;

  const flowStore = useFlowStore.getState();

  const makeHelpers = (nodeId: string) => {
    const baseHelpers = resolutionContext.createHelpers(nodeId);
    return {
      ...baseHelpers,
      resolveProduct: (side: 'input' | 'output', index: number): string => {
        const handleId = buildHandleId(nodeId, side, index);
        return flowStore.resolvedProducts[handleId] ?? baseHelpers.resolveProduct(side, index);
      },
      getFlowRate: (side: 'input' | 'output', index: number): number => {
        const handleId = buildHandleId(nodeId, side, index);
        const connectedEdges = edgeLookup.get(handleId) ?? [];
        let totalFlow = 0;
        for (const edge of connectedEdges) {
          totalFlow += edgeFlows[edge.id] ?? 0;
        }
        return totalFlow;
      },
    };
  };

  const lpNodes: LPSolverNode[] = [];
  for (const node of nodes) {
    const helpers = makeHelpers(node.id);
    const recipe = resolveActiveRecipe(
      node.data.recipeId,
      node.data.settings,
      node.id,
      helpers,
      { temperatureInputOverrides: inputTemps[node.id] }
    );
    if (!recipe) continue;

    const multiplier = getRateMultiplier(recipe.cycle_time, 'second');

    let powerVal = 0;
    const power = recipe.power_consumption;
    if (typeof power === 'number') {
      powerVal = power;
    } else if (power && typeof power === 'object' && 'max' in power) {
      powerVal = (power as { max: number }).max;
    }

    const pollutionVal = recipe.pollution ?? 0;

    const inputs = recipe.inputs.map((inp, idx) => {
      return {
        productId: helpers.resolveProduct('input', idx),
        quantity: inp.quantity * multiplier,
        isSink: !!inp.variable,
      };
    });

    const outputs = recipe.outputs.map((out, idx) => {
      const handleId = buildHandleId(node.id, 'output', idx);
      const outgoingEdges = edgeLookup.get(handleId) ?? [];

      const hasSinkConnection = outgoingEdges.some((edge) => {
        if (!edge.targetHandle) return false;
        const targetParsed = parseHandleId(edge.targetHandle);
        if (!targetParsed) return false;
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (!targetNode) return false;
        const targetHelpers = makeHelpers(targetNode.id);
        const targetRecipe = resolveActiveRecipe(
          targetNode.data.recipeId,
          targetNode.data.settings,
          targetNode.id,
          targetHelpers,
          { temperatureInputOverrides: inputTemps[targetNode.id] }
        );
        if (!targetRecipe) return false;
        const targetInput = targetRecipe.inputs[targetParsed.index];
        return !!targetInput?.variable;
      });

      return {
        productId: helpers.resolveProduct('output', idx),
        quantity: out.quantity * multiplier,
        hasSinkConnection,
      };
    });

    lpNodes.push({
      id: node.id,
      currentMachineCount: node.data.machineCount ?? 0,
      isTarget: !!node.data.isTarget,
      power: powerVal,
      pollution: pollutionVal,
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

    lpConnections.push({
      id: edge.id,
      sourceNodeId: edge.source,
      sourceOutputIndex: sourceParsed.index,
      targetNodeId: edge.target,
      targetInputIndex: targetParsed.index,
    });
  }

  const worker = getOrCreateWorker();

  const promise = new Promise<LPSolverResult>((resolve) => {
    activeSolveResolve = resolve;

    worker.onmessage = (event: MessageEvent<LPSolverResponse>) => {
      worker.onmessage = null;
      worker.onerror = null;
      finalizeActiveSolve(event.data);
    };

    worker.onerror = (err) => {
      worker.onmessage = null;
      worker.onerror = null;
      console.error('[LP Solver Service] Worker thread error:', err);
      finalizeActiveSolve({
        feasible: false,
        error: 'Background worker thread encountered a runtime error.',
      });
      activeWorker = null;
    };

    try {
      worker.postMessage({
        origin: window.location.origin,
        nodes: lpNodes,
        connections: lpConnections,
        version: ASSET_VERSION,
      });
    } catch (error) {
      worker.onmessage = null;
      worker.onerror = null;
      finalizeActiveSolve({
        feasible: false,
        error:
          error instanceof Error
            ? `Failed to dispatch LP request: ${error.message}`
            : 'Failed to dispatch LP request.',
      });
    }
  });

  return {
    promise,
  };
}
