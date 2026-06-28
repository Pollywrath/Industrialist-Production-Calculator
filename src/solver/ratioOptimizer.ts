import type { Edge } from '@xyflow/react';
import type { RecipeNodeType } from '../types/nodes';
import { ASSET_VERSION } from '../data/productIcons';
import { useFlowStore } from '../stores/useFlowStore';
import { useFlowResultStore } from '../stores/useFlowResultStore';
import { useGlobalSettingsStore } from '../stores/useGlobalSettingsStore';
import { solveFlowPipeline } from './solverPipeline';
import { getRateMultiplier } from '../utils/recipeComputation';
import { createGraphResolutionContext } from '../utils/graphResolutionContext';
import { buildHandleId, parseHandleId } from '../utils/idGenerator';
import { getRecipeNetPower } from '../utils/recipePower';

export interface RatioOptimizerNode {
  id: string;
  currentMachineCount: number;
  isTarget: boolean;
  power: number;
  pollution: number;
  inputs: {
    productId: string;
    quantity: number;
    isSink: boolean;
  }[];
  outputs: {
    productId: string;
    quantity: number;
    hasSinkConnection: boolean;
  }[];
}

export interface RatioOptimizerConnection {
  id: string;
  sourceNodeId: string;
  sourceOutputIndex: number;
  targetNodeId: string;
  targetInputIndex: number;
}

export interface RatioOptimizerRequest {
  origin: string;
  nodes: RatioOptimizerNode[];
  connections: RatioOptimizerConnection[];
  version?: string;
}

export interface RatioOptimizerResponse {
  feasible: boolean;
  error?: string;
  machineCounts?: Record<string, number>;
  diagnostics?: RatioFailureDiagnostics;
}

export interface RatioDeficientInputDiagnostic {
  nodeId: string;
  inputIndex: number;
  productId: string;
  deficiency: number;
  requiredRate: number;
  suppliedRate: number;
  upstreamNodeIds: string[];
  causeNodeIds: string[];
  causeKind: RatioDeficiencyCauseKind;
  upstreamContributions: RatioUpstreamContributionDiagnostic[];
}

export type RatioDeficiencyCauseKind =
  | 'feedback_loop'
  | 'product_mismatch'
  | 'upstream_input_deficient'
  | 'upstream_not_producing'
  | 'upstream_output_limited'
  | 'unknown';

export interface RatioUpstreamContributionDiagnostic {
  edgeId: string;
  nodeId: string;
  outputIndex: number;
  productId: string;
  productMatches: boolean;
  unitOutputRate: number;
  suppliedRate: number;
  outputRate: number;
  totalOutgoingRate: number;
  directDeficiency: number;
}

export interface RatioRootCauseDiagnostic {
  nodeId: string;
  outputIndex: number | null;
  productId: string;
  kind: RatioDeficiencyCauseKind;
  deficiency: number;
  requiredRate: number;
  suppliedRate: number;
  unitOutputRate: number;
  outputRate: number;
  blockedInputNodeId: string;
  blockedInputIndex: number;
  cycleNodeIds: string[];
  boundaryNodeIds: string[];
}

export interface RatioFailureDiagnostics {
  deficientNodeIds: string[];
  likelyRootNodeIds: string[];
  cycleNodeIds: string[];
  cycleBoundaryNodeIds: string[];
  rootCauses: RatioRootCauseDiagnostic[];
  deficientInputs: RatioDeficientInputDiagnostic[];
}

export type RatioOptimizerResult = RatioOptimizerResponse;

export interface RatioOptimizerSession {
  promise: Promise<RatioOptimizerResult>;
}

interface RatioOptimizerPayload {
  nodes: RatioOptimizerNode[];
  connections: RatioOptimizerConnection[];
}

function getCommittedSolverSnapshot(nodes: RecipeNodeType[]): Pick<
  ReturnType<typeof solveFlowPipeline>,
  'nodeRecipes' | 'resolvedProducts'
> | null {
  const flowState = useFlowStore.getState();
  const resultState = useFlowResultStore.getState();
  if (resultState.graphVersion !== flowState.graphVersion) {
    return null;
  }

  for (let i = 0; i < nodes.length; i++) {
    if (!resultState.nodeRecipes[nodes[i].id]) {
      return null;
    }
  }

  return {
    nodeRecipes: resultState.nodeRecipes,
    resolvedProducts: resultState.resolvedProducts,
  };
}

export function buildRatioOptimizerPayload(
  nodes: RecipeNodeType[],
  edges: Edge[],
): RatioOptimizerPayload {
  const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<string, unknown>;
  const committedSnapshot = getCommittedSolverSnapshot(nodes);
  const { nodeRecipes, resolvedProducts } =
    committedSnapshot ?? solveFlowPipeline(nodes, edges, globalSettings);

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

  const ratioNodes: RatioOptimizerNode[] = [];
  for (const node of nodes) {
    const recipe = nodeRecipes[node.id];
    if (!recipe) continue;

    const multiplier = getRateMultiplier(recipe.cycle_time, 'second');

    const powerVal = getRecipeNetPower(recipe);

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
        const targetIsSinkNode = targetRecipe.outputs.length === 0;
        return !!targetInput?.variable || targetIsSinkNode;
      });

      return {
        productId: sourceProductId || out.product_id,
        quantity: out.quantity * multiplier,
        hasSinkConnection,
      };
    });

    ratioNodes.push({
      id: node.id,
      currentMachineCount: node.data.machineCount ?? 0,
      isTarget: !!node.data.isTarget,
      power: powerVal,
      pollution: recipe.pollution ?? 0,
      inputs,
      outputs,
    });
  }

  const ratioConnections: RatioOptimizerConnection[] = [];
  for (const edge of edges) {
    if (!edge.sourceHandle || !edge.targetHandle) continue;
    const sourceParsed = parseHandleId(edge.sourceHandle);
    const targetParsed = parseHandleId(edge.targetHandle);
    if (!sourceParsed || !targetParsed) continue;
    if (sourceParsed.side !== 'output' || targetParsed.side !== 'input') continue;

    const sourceProductId = getResolvedPortProduct(edge.source, 'output', sourceParsed.index);
    const targetProductId = getResolvedPortProduct(edge.target, 'input', targetParsed.index);
    if (!sourceProductId || sourceProductId !== targetProductId) continue;

    ratioConnections.push({
      id: edge.id,
      sourceNodeId: edge.source,
      sourceOutputIndex: sourceParsed.index,
      targetNodeId: edge.target,
      targetInputIndex: targetParsed.index,
    });
  }

  return {
    nodes: ratioNodes,
    connections: ratioConnections,
  };
}

let activeWorker: Worker | null = null;
let activeSolveInFlight = false;
let activeSolveResolve: ((result: RatioOptimizerResult) => void) | null = null;

function finalizeActiveSolve(result: RatioOptimizerResult): void {
  const resolve = activeSolveResolve;
  activeSolveResolve = null;
  activeSolveInFlight = false;
  if (resolve) {
    resolve(result);
  }
}

function createWorker(): Worker {
  return new Worker(
    new URL('./ratioOptimizerWorker.ts', import.meta.url),
    { type: 'module' }
  );
}

function getOrCreateWorker(): Worker {
  if (!activeWorker) {
    activeWorker = createWorker();
  }
  return activeWorker;
}

export function initRatioOptimizerWorker(): void {
  getOrCreateWorker();
}

export function isRatioOptimizerRunning(): boolean {
  return activeSolveInFlight;
}

export function cancelRatioOptimizer(): void {
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

export function solveRatios(
  nodes: RecipeNodeType[],
  edges: Edge[]
): RatioOptimizerSession {
  if (activeSolveInFlight) {
    return {
      promise: Promise.resolve({
        feasible: false,
        error: 'Ratio optimizer is already running. Please wait for the current computation to finish.',
      }),
    };
  }

  let payload: RatioOptimizerPayload;
  try {
    payload = buildRatioOptimizerPayload(nodes, edges);
  } catch (error) {
    return {
      promise: Promise.resolve({
        feasible: false,
        error:
          error instanceof Error
            ? `Failed to build ratio optimization payload: ${error.message}`
            : 'Failed to build ratio optimization payload.',
      }),
    };
  }

  activeSolveInFlight = true;
  const worker = getOrCreateWorker();

  const promise = new Promise<RatioOptimizerResult>((resolve) => {
    activeSolveResolve = resolve;

    worker.onmessage = (event: MessageEvent<RatioOptimizerResponse>) => {
      worker.onmessage = null;
      worker.onerror = null;
      finalizeActiveSolve(event.data);
    };

    worker.onerror = (err) => {
      worker.onmessage = null;
      worker.onerror = null;
      console.error('[Ratio Optimizer Service] Worker thread error:', err);
      finalizeActiveSolve({
        feasible: false,
        error: 'Background worker thread encountered a runtime error.',
      });
      activeWorker = null;
    };

    try {
      worker.postMessage({
        origin: window.location.origin,
        nodes: payload.nodes,
        connections: payload.connections,
        version: ASSET_VERSION,
      });
    } catch (error) {
      worker.onmessage = null;
      worker.onerror = null;
      finalizeActiveSolve({
        feasible: false,
        error:
          error instanceof Error
            ? `Failed to dispatch ratio optimization request: ${error.message}`
            : 'Failed to dispatch ratio optimization request.',
      });
    }
  });

  return {
    promise,
  };
}
