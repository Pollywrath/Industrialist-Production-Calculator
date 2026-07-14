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
import { getRecipeOptimizationMetrics } from '../utils/optimizationMetrics';
import { getConfiguredScipBundlePath, type ScipBundlePath } from './scipBundle';
import type { OptimizationConfiguration } from './optimizationConfig';

export interface RatioObjectiveWeights {
  powerUse: number;
  pollution: number;
  machineCost: number;
  modelCount: number;
}

export const DEFAULT_RATIO_OBJECTIVE_WEIGHTS: RatioObjectiveWeights = {
  powerUse: 1,
  pollution: 1,
  machineCost: 0,
  modelCount: 0,
};

export const RATIO_OBJECTIVE_NORMALIZERS: RatioObjectiveWeights = {
  powerUse: 1_000_000,
  pollution: 1,
  machineCost: 1_000_000,
  modelCount: 10,
};

export function resolveRatioObjectiveWeights(
  weights?: Partial<RatioObjectiveWeights>,
): RatioObjectiveWeights {
  const resolved = { ...DEFAULT_RATIO_OBJECTIVE_WEIGHTS, ...weights };
  for (const key of Object.keys(resolved) as (keyof RatioObjectiveWeights)[]) {
    const value = resolved[key];
    resolved[key] = Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  return resolved;
}

export interface RatioOptimizerNode {
  id: string;
  currentMachineCount: number;
  isTarget: boolean;
  powerUse: number;
  powerOutput: number;
  pollution: number;
  machineCost: number;
  hasInfiniteMachineCost: boolean;
  modelCount: number;
  machineSpace: number;
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
  type?: 'solve';
  requestId?: number;
  origin: string;
  scipBundlePath?: ScipBundlePath;
  nodes: RatioOptimizerNode[];
  connections: RatioOptimizerConnection[];
  objectiveWeights?: RatioObjectiveWeights;
  optimizationConfiguration?: OptimizationConfiguration;
  version?: string;
}

export interface RatioOptimizerCancelRequest {
  type: 'cancel';
  requestId: number;
}

export type RatioSolverPhase =
  | 'queued'
  | 'warmup'
  | 'loading'
  | 'ready'
  | 'building'
  | 'solving'
  | 'finalizing'
  | 'complete'
  | 'failed';

export interface RatioSolverProgress {
  phase: RatioSolverPhase;
  message: string;
  solver?: 'native' | 'mps' | 'unknown';
  elapsedMs?: number;
}

export interface RatioSolverStageTelemetry {
  name: string;
  objectiveValue: number;
  elapsedMs: number;
}

export interface RatioSolverTelemetry {
  solver: 'native' | 'mps';
  bundlePath?: ScipBundlePath;
  initializedDuringSolve?: boolean;
  initMs?: number;
  solveMs?: number;
  presolveOriginalNodeCount?: number;
  presolveOriginalConnectionCount?: number;
  presolveNodeCount?: number;
  presolveConnectionCount?: number;
  presolveRemovedNodeCount?: number;
  presolveRemovedConnectionCount?: number;
  presolveRemovedInvalidConnectionCount?: number;
  presolveRemovedZeroDemandConnectionCount?: number;
  presolveRemovedNoTargetConnectionCount?: number;
  payloadBuildMs?: number;
  payloadBytes?: number;
  nativePayloadKind?: 'text' | 'f64';
  nativePayloadParseMs?: number;
  nativeModelBuildMs?: number;
  nativeCallMs?: number;
  resultParseMs?: number;
  nativeResultDoubles?: number;
  wasmMemoryBytes?: number;
  nativeStatus?: string;
  mipNodeCount?: number;
  lpIterations?: number;
  primalBound?: number;
  dualBound?: number;
  mipGap?: number;
  roundedVariableCount?: number;
  warmupMs?: number;
  profileUsed?: string;
  variableCount?: number;
  constraintCount?: number;
  nonzeroCount?: number;
  valueScale?: number;
  minCoefficient?: number;
  maxCoefficient?: number;
  minFiniteBound?: number;
  maxFiniteBound?: number;
  stageTelemetry?: RatioSolverStageTelemetry[];
}

export interface RatioOptimizerResponse {
  type?: 'solve-result';
  requestId?: number;
  feasible: boolean;
  error?: string;
  machineCounts?: Record<string, number>;
  diagnostics?: RatioFailureDiagnostics;
  telemetry?: RatioSolverTelemetry;
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

export interface RatioOptimizerSessionOptions {
  onProgress?: (progress: RatioSolverProgress) => void;
  objectiveWeights?: Partial<RatioObjectiveWeights>;
  optimizationConfiguration?: OptimizationConfiguration;
}

export interface RatioOptimizerWarmupRequest {
  type: 'warmup';
  origin: string;
  scipBundlePath?: ScipBundlePath;
  version?: string;
}

export interface RatioOptimizerProgressMessage {
  type: 'progress';
  requestId?: number;
  progress: RatioSolverProgress;
}

export interface RatioOptimizerWarmupResult {
  type: 'warmup-result';
  feasible: boolean;
  error?: string;
  telemetry?: RatioSolverTelemetry;
}

export type RatioOptimizerWorkerRequest =
  | RatioOptimizerWarmupRequest
  | RatioOptimizerRequest
  | RatioOptimizerCancelRequest;
export type RatioOptimizerWorkerMessage =
  | RatioOptimizerProgressMessage
  | RatioOptimizerWarmupResult
  | RatioOptimizerResponse;

interface RatioOptimizerPayload {
  nodes: RatioOptimizerNode[];
  connections: RatioOptimizerConnection[];
}

function getCommittedSolverSnapshot(
  nodes: RecipeNodeType[],
): Pick<ReturnType<typeof solveFlowPipeline>, 'nodeRecipes' | 'resolvedProducts'> | null {
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
  const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<
    string,
    unknown
  >;
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

    const optimizationMetrics = getRecipeOptimizationMetrics(
      recipe,
      node.data.settings,
      globalSettings,
      node.id,
    );

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
      powerUse: optimizationMetrics.powerUsePerMachine,
      powerOutput: optimizationMetrics.powerOutputPerMachine,
      pollution: optimizationMetrics.pollutionPerMachine,
      machineCost: optimizationMetrics.machineCostPerWholeMachine,
      hasInfiniteMachineCost: optimizationMetrics.hasInfiniteMachineCost,
      modelCount: optimizationMetrics.modelCountPerWholeMachine,
      machineSpace: optimizationMetrics.machineSpacePerWholeMachine,
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
let activeSolveProgress: ((progress: RatioSolverProgress) => void) | null = null;
let activeSolveRequestId: number | null = null;
let nextSolveRequestId = 1;
let warmupKey: string | null = null;
const cancelledSolveRequestIds = new Set<number>();

function finalizeActiveSolve(result: RatioOptimizerResult): void {
  const resolve = activeSolveResolve;
  activeSolveResolve = null;
  activeSolveProgress = null;
  activeSolveRequestId = null;
  activeSolveInFlight = false;
  if (resolve) {
    resolve(result);
  }
}

function handleWorkerMessage(event: MessageEvent<RatioOptimizerWorkerMessage>): void {
  const message = event.data;

  if (message.type === 'progress') {
    if (message.requestId !== undefined && cancelledSolveRequestIds.has(message.requestId)) {
      return;
    }
    if (
      activeSolveProgress &&
      (message.requestId === undefined || message.requestId === activeSolveRequestId)
    ) {
      activeSolveProgress(message.progress);
    }
    return;
  }

  if (message.type === 'warmup-result') {
    if (!message.feasible) {
      warmupKey = null;
      console.warn('[Ratio Optimizer Service] Warmup failed:', message.error);
    } else if (message.telemetry) {
      console.info('[Ratio Optimizer Service] Warmup complete:', message.telemetry);
    }
    return;
  }

  if (message.requestId !== undefined && message.requestId !== activeSolveRequestId) {
    if (cancelledSolveRequestIds.delete(message.requestId)) {
      return;
    }
    console.warn('[Ratio Optimizer Service] Ignored stale solver response:', message.requestId);
    return;
  }

  finalizeActiveSolve(message);
}

function handleWorkerError(err: ErrorEvent): void {
  console.error('[Ratio Optimizer Service] Worker thread error:', err);
  activeWorker = null;
  warmupKey = null;
  if (activeSolveInFlight) {
    finalizeActiveSolve({
      feasible: false,
      error: 'Background worker thread encountered a runtime error.',
    });
  }
}

function createWorker(): Worker {
  const worker = new Worker(new URL('./ratioOptimizerWorker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = handleWorkerMessage;
  worker.onerror = handleWorkerError;
  return worker;
}

function getOrCreateWorker(): Worker {
  if (!activeWorker) {
    activeWorker = createWorker();
  }
  return activeWorker;
}

export function initRatioOptimizerWorker(): void {
  const worker = getOrCreateWorker();
  if (typeof window === 'undefined') return;

  const scipBundlePath = getConfiguredScipBundlePath();
  const nextWarmupKey = `${window.location.origin}::${scipBundlePath}::${ASSET_VERSION}`;
  if (warmupKey === nextWarmupKey) return;

  warmupKey = nextWarmupKey;
  worker.postMessage({
    type: 'warmup',
    origin: window.location.origin,
    scipBundlePath,
    version: ASSET_VERSION,
  } satisfies RatioOptimizerWarmupRequest);
}

export function isRatioOptimizerRunning(): boolean {
  return activeSolveInFlight;
}

export function cancelRatioOptimizer(): void {
  const requestId = activeSolveRequestId;
  if (activeWorker && requestId !== null) {
    cancelledSolveRequestIds.add(requestId);
    activeWorker.postMessage({
      type: 'cancel',
      requestId,
    });
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
  edges: Edge[],
  options: RatioOptimizerSessionOptions = {},
): RatioOptimizerSession {
  if (activeSolveInFlight) {
    return {
      promise: Promise.resolve({
        feasible: false,
        error:
          'Ratio optimizer is already running. Please wait for the current computation to finish.',
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
  const requestId = nextSolveRequestId++;
  const worker = getOrCreateWorker();

  const promise = new Promise<RatioOptimizerResult>((resolve) => {
    activeSolveResolve = resolve;
    activeSolveProgress = options.onProgress ?? null;
    activeSolveRequestId = requestId;
    activeSolveProgress?.({
      phase: 'queued',
      message: 'Queued ratio optimizer request.',
      solver: 'unknown',
      elapsedMs: 0,
    });

    try {
      worker.postMessage({
        type: 'solve',
        requestId,
        origin: window.location.origin,
        scipBundlePath: getConfiguredScipBundlePath(),
        nodes: payload.nodes,
        connections: payload.connections,
        objectiveWeights: resolveRatioObjectiveWeights(options.objectiveWeights),
        optimizationConfiguration: options.optimizationConfiguration,
        version: ASSET_VERSION,
      } satisfies RatioOptimizerRequest);
    } catch (error) {
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
