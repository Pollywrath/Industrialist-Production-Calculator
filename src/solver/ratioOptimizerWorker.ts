import type {
  RatioDeficiencyCauseKind,
  RatioDeficientInputDiagnostic,
  RatioFailureDiagnostics,
  RatioOptimizerConnection,
  RatioOptimizerNode,
  RatioOptimizerRequest,
  RatioOptimizerWarmupRequest,
  RatioOptimizerResponse,
  RatioOptimizerWorkerRequest,
  RatioSolverProgress,
  RatioSolverStageTelemetry,
  RatioSolverTelemetry,
  RatioRootCauseDiagnostic,
  RatioUpstreamContributionDiagnostic,
  RatioObjectiveWeights,
} from './ratioOptimizer';
import {
  DEFAULT_RATIO_OBJECTIVE_WEIGHTS,
  RATIO_OBJECTIVE_NORMALIZERS,
  resolveRatioObjectiveWeights,
} from './ratioOptimizer';
import {
  DEFAULT_SCIP_BUNDLE_PATH,
  getScipAssetUrl,
  normalizeScipBundlePath,
  type ScipBundlePath,
} from './scipBundle';
import {
  DEFAULT_OPTIMIZATION_CONFIGURATION,
  OPTIMIZATION_METRIC_IDS,
  OPTIMIZATION_NORMALIZERS,
  sanitizeOptimizationConfiguration,
  type OptimizationConfiguration,
} from './optimizationConfig';

interface SCIPRuntime {
  FS: {
    writeFile: (path: string, data: string) => void;
    readFile: (path: string, options?: { encoding?: 'utf8' }) => string | Uint8Array;
    unlink: (path: string) => void;
  };
  main: (args: string[]) => void;
  stdoutLines: string[];
  canDisableMilpPresolver?: boolean;
  bundlePath: ScipBundlePath;
  initMs: number;
  initializedDuringLastRequest: boolean;
  nativeRatioSolver?: NativeRatioSolver;
}

interface SCIPWasmModule {
  FS: SCIPRuntime['FS'];
  callMain: (args: string[]) => void;
  UTF8ToString?: (ptr: number) => string;
  _malloc?: (byteLength: number) => number;
  _free?: (ptr: number) => void;
  _industrialist_has_native_ratio_solver?: () => number;
  _industrialist_free_string?: (ptr: number) => void;
  _industrialist_free_result_buffer?: (ptr: number) => void;
  _industrialist_native_abi_version?: () => number;
  _industrialist_native_capabilities?: () => number;
  _industrialist_start_ratio_job_f64?: (
    payloadPtr: number,
    payloadDoubleCount: number,
    usePapiloReliabilityProfile: number,
  ) => number;
  _industrialist_get_ratio_job_state?: () => number;
  _industrialist_get_ratio_job_stage?: () => number;
  _industrialist_get_ratio_job_elapsed_ms?: () => number;
  _industrialist_cancel_ratio_job?: () => number;
  _industrialist_take_ratio_job_result?: () => number;
  _industrialist_get_ratio_job_error?: () => number;
  HEAPF64?: Float64Array;
}

type NativeResultStatus =
  | 'optimal'
  | 'cancelled'
  | 'infeasible'
  | 'unbounded'
  | 'limit_reached_not_proven'
  | 'numerical_failure'
  | 'invalid_payload'
  | 'internal_error';

interface NativeBinaryResult {
  status: NativeResultStatus;
  error?: string;
  telemetry: Partial<RatioSolverTelemetry>;
  stageTelemetry: RatioSolverStageTelemetry[];
  machineCountsByNode: Float64Array;
  connectionFlows: Float64Array;
  inputDeficits: Float64Array;
}

interface NativeRatioSolver {
  solveTypedPayloadResult: (
    payload: Float64Array,
    progress?: ProgressReporter,
  ) => Promise<NativeBinaryResult | null> | NativeBinaryResult | null;
  cancelActiveSolve?: () => boolean;
  getWasmMemoryBytes?: () => number | null;
}

type ProgressReporter = (progress: RatioSolverProgress) => void;

type RatioObjectiveMode = 'legacy' | 'shortage' | 'sink_excess' | 'weighted' | 'machine_count';

type RatioObjectiveBoundKey = 'shortage' | 'sinkExcess' | 'weighted';

interface RatioMPSBuildOptions {
  objective?: RatioObjectiveMode;
  bounds?: Partial<Record<RatioObjectiveBoundKey, number>>;
  valueScale?: number;
  objectiveWeights?: RatioObjectiveWeights;
}

interface RatioObjectiveExpressions {
  shortage: Map<string, number>;
  sinkExcess: Map<string, number>;
  weighted: Map<string, number>;
  machineCount: Map<string, number>;
}

interface RatioMPSModel {
  mpsString: string;
  varNameMap: Map<string, string>;
  objectiveExpressions: RatioObjectiveExpressions;
}

type MPSRowType = 'E' | 'L' | 'G';

interface MPSRow {
  type: MPSRowType;
  rhs: number;
  terms: Map<string, number>;
}

let runtimePromise: Promise<SCIPRuntime> | null = null;
let runtimeKey: string | null = null;
let activeRuntime: SCIPRuntime | null = null;
const cancelledRequestIds = new Set<number>();
let activeWorkerRequestId: number | undefined;

const STAGE_BOUND_ABSOLUTE_TOLERANCE = 1e-6;
const STAGE_BOUND_RELATIVE_TOLERANCE = 1e-6;
const STAGE_ZERO_BOUND_TOLERANCE = 1e-9;
const NATIVE_BINARY_RESULT_MAGIC = 444926465;
const NATIVE_BINARY_RESULT_VERSION = 2;
const NATIVE_BINARY_RESULT_LEGACY_VERSION = 1;
const NATIVE_BINARY_RESULT_HEADER_DOUBLES = 28;
const NATIVE_BINARY_RESULT_LEGACY_HEADER_DOUBLES = 20;
const NATIVE_PAYLOAD_F64_MAGIC = 444926466;
const NATIVE_PAYLOAD_F64_VERSION = 4;
const NATIVE_PAYLOAD_F64_HEADER_DOUBLES = 39;
const NATIVE_PAYLOAD_F64_NODE_DOUBLES = 13;
const NATIVE_PAYLOAD_F64_INPUT_DOUBLES = 2;
const NATIVE_PAYLOAD_F64_OUTPUT_DOUBLES = 2;
const NATIVE_PAYLOAD_F64_CONNECTION_DOUBLES = 4;
const NATIVE_ABI_V2_REQUIRED_CAPABILITIES = 31;
const SCALED_DEFICIENCY_EPSILON = 1e-6;
const ZERO_RATE_CONNECTION_EPSILON = 1e-12;
function addExpressionCoeff(expression: Map<string, number>, varName: string, coeff: number): void {
  if (coeff === 0) return;
  expression.set(varName, (expression.get(varName) ?? 0) + coeff);
}

function getTargetMachineLowerBound(node: RatioOptimizerNode): number | null {
  if (!node.isTarget) return null;
  if (!Number.isFinite(node.currentMachineCount)) return 0;
  return Math.max(0, node.currentMachineCount);
}

function getStageBoundRhs(value: number): number {
  const normalizedValue = Math.max(0, value);
  if (normalizedValue <= STAGE_ZERO_BOUND_TOLERANCE) return 0;
  return (
    normalizedValue +
    Math.max(
      STAGE_BOUND_ABSOLUTE_TOLERANCE,
      Math.abs(normalizedValue) * STAGE_BOUND_RELATIVE_TOLERANCE,
    )
  );
}

function getObjectiveExpression(
  objective: RatioObjectiveMode,
  expressions: RatioObjectiveExpressions,
  legacyExpression: Map<string, number>,
): Map<string, number> {
  switch (objective) {
    case 'legacy':
      return legacyExpression;
    case 'shortage':
      return expressions.shortage;
    case 'sink_excess':
      return expressions.sinkExcess;
    case 'weighted':
      return expressions.weighted;
    case 'machine_count':
      return expressions.machineCount;
  }
}

function getNoTargetComponentNodeIds(
  nodes: RatioOptimizerNode[],
  connections: RatioOptimizerConnection[],
  preservePowerOutputComponents = false,
): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  for (const connection of connections) {
    adjacency.get(connection.sourceNodeId)?.push(connection.targetNodeId);
    adjacency.get(connection.targetNodeId)?.push(connection.sourceNodeId);
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const noTargetComponentNodeIds = new Set<string>();

  for (const node of nodes) {
    if (visited.has(node.id)) continue;

    const componentNodeIds: string[] = [];
    const stack = [node.id];
    let hasTarget = false;
    let hasPowerOutput = false;
    visited.add(node.id);

    while (stack.length > 0) {
      const nodeId = stack.pop()!;
      componentNodeIds.push(nodeId);
      const componentNode = nodeById.get(nodeId);
      hasTarget ||= !!componentNode?.isTarget;
      hasPowerOutput ||= (componentNode?.powerOutput ?? 0) > 0;

      for (const nextNodeId of adjacency.get(nodeId) ?? []) {
        if (visited.has(nextNodeId)) continue;
        visited.add(nextNodeId);
        stack.push(nextNodeId);
      }
    }

    if (!hasTarget && !(preservePowerOutputComponents && hasPowerOutput)) {
      for (const nodeId of componentNodeIds) {
        noTargetComponentNodeIds.add(nodeId);
      }
    }
  }

  return noTargetComponentNodeIds;
}

interface RatioPresolveStats {
  originalNodeCount: number;
  originalConnectionCount: number;
  nodeCount: number;
  connectionCount: number;
  removedNodeCount: number;
  removedConnectionCount: number;
  removedInvalidConnectionCount: number;
  removedZeroDemandConnectionCount: number;
  removedNoTargetConnectionCount: number;
}

interface RatioPresolvedModel {
  nodes: RatioOptimizerNode[];
  connections: RatioOptimizerConnection[];
  stats: RatioPresolveStats;
}

function getConnectionEndpoints(
  nodesById: Map<string, RatioOptimizerNode>,
  connection: RatioOptimizerConnection,
): {
  sourceNode: RatioOptimizerNode;
  targetNode: RatioOptimizerNode;
  sourceOutput: RatioOptimizerNode['outputs'][number];
  targetInput: RatioOptimizerNode['inputs'][number];
} | null {
  const sourceNode = nodesById.get(connection.sourceNodeId);
  const targetNode = nodesById.get(connection.targetNodeId);
  if (!sourceNode || !targetNode) return null;

  const sourceOutput = sourceNode.outputs[connection.sourceOutputIndex];
  const targetInput = targetNode.inputs[connection.targetInputIndex];
  if (!sourceOutput || !targetInput) return null;

  return {
    sourceNode,
    targetNode,
    sourceOutput,
    targetInput,
  };
}

function isEffectivelyZeroRate(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= ZERO_RATE_CONNECTION_EPSILON;
}

function presolveRatioOptimizerModel(
  nodes: RatioOptimizerNode[],
  connections: RatioOptimizerConnection[],
  preservePowerOutputComponents: boolean,
): RatioPresolvedModel {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const semanticallyActiveConnections: RatioOptimizerConnection[] = [];
  let removedInvalidConnectionCount = 0;
  let removedZeroDemandConnectionCount = 0;

  for (const connection of connections) {
    const endpoints = getConnectionEndpoints(nodesById, connection);
    if (!endpoints) {
      removedInvalidConnectionCount += 1;
      continue;
    }

    if (isEffectivelyZeroRate(endpoints.targetInput.quantity)) {
      removedZeroDemandConnectionCount += 1;
      continue;
    }

    semanticallyActiveConnections.push(connection);
  }

  const noTargetComponentNodeIds = getNoTargetComponentNodeIds(
    nodes,
    semanticallyActiveConnections,
    preservePowerOutputComponents,
  );
  const keptNodeIds = new Set<string>();
  const presolvedNodes: RatioOptimizerNode[] = [];
  for (const node of nodes) {
    if (noTargetComponentNodeIds.has(node.id)) continue;
    keptNodeIds.add(node.id);
    presolvedNodes.push(node);
  }

  const presolvedConnections: RatioOptimizerConnection[] = [];
  let removedNoTargetConnectionCount = 0;
  for (const connection of semanticallyActiveConnections) {
    if (!keptNodeIds.has(connection.sourceNodeId) || !keptNodeIds.has(connection.targetNodeId)) {
      removedNoTargetConnectionCount += 1;
      continue;
    }
    presolvedConnections.push(connection);
  }

  const removedNodeCount = nodes.length - presolvedNodes.length;
  const removedConnectionCount = connections.length - presolvedConnections.length;

  return {
    nodes: presolvedNodes,
    connections: presolvedConnections,
    stats: {
      originalNodeCount: nodes.length,
      originalConnectionCount: connections.length,
      nodeCount: presolvedNodes.length,
      connectionCount: presolvedConnections.length,
      removedNodeCount,
      removedConnectionCount,
      removedInvalidConnectionCount,
      removedZeroDemandConnectionCount,
      removedNoTargetConnectionCount,
    },
  };
}

function didPresolveChangeModel(stats: RatioPresolveStats): boolean {
  return stats.removedNodeCount > 0 || stats.removedConnectionCount > 0;
}

function attachPresolveTelemetry(
  response: RatioOptimizerResponse,
  stats: RatioPresolveStats,
): void {
  const telemetry = response.telemetry;
  if (!telemetry) return;

  response.telemetry = {
    ...telemetry,
    presolveOriginalNodeCount: stats.originalNodeCount,
    presolveOriginalConnectionCount: stats.originalConnectionCount,
    presolveNodeCount: stats.nodeCount,
    presolveConnectionCount: stats.connectionCount,
    presolveRemovedNodeCount: stats.removedNodeCount,
    presolveRemovedConnectionCount: stats.removedConnectionCount,
    presolveRemovedInvalidConnectionCount: stats.removedInvalidConnectionCount,
    presolveRemovedZeroDemandConnectionCount: stats.removedZeroDemandConnectionCount,
    presolveRemovedNoTargetConnectionCount: stats.removedNoTargetConnectionCount,
  };
}

function buildPresolvedEmptyResponse(
  runtime: SCIPRuntime,
  originalNodes: RatioOptimizerNode[],
): RatioOptimizerResponse {
  const machineCounts: Record<string, number> = {};
  for (const node of originalNodes) {
    machineCounts[node.id] = 0;
  }

  return {
    feasible: true,
    machineCounts,
    telemetry: {
      solver: runtime.nativeRatioSolver ? 'native' : 'mps',
      bundlePath: runtime.bundlePath,
      initializedDuringSolve: runtime.initializedDuringLastRequest,
      initMs: runtime.initMs,
      solveMs: 0,
      variableCount: 0,
      constraintCount: 0,
      nonzeroCount: 0,
      stageTelemetry: [
        { name: 'shortage', objectiveValue: 0, elapsedMs: 0 },
        { name: 'weighted', objectiveValue: 0, elapsedMs: 0 },
        { name: 'machine count', objectiveValue: 0, elapsedMs: 0 },
      ],
    },
  };
}

function getRuntimeKey(origin: string, bundlePath: ScipBundlePath, version?: string): string {
  return getScipAssetUrl(origin, 'scip.js', bundlePath, version);
}

function getNativeProfileLabel(profileCode: number): string {
  switch (profileCode) {
    case 1:
      return 'soplex_direct';
    case 2:
      return 'reusable_scip';
    case 3:
      return 'fresh_scip';
    case 4:
      return 'scip_rounded_milp';
    default:
      return 'unknown';
  }
}

function getNativeResultStatus(statusCode: number): NativeResultStatus {
  switch (statusCode) {
    case 1:
      return 'optimal';
    case 2:
      return 'cancelled';
    case 3:
      return 'infeasible';
    case 4:
      return 'unbounded';
    case 5:
      return 'limit_reached_not_proven';
    case 6:
      return 'numerical_failure';
    case 7:
      return 'invalid_payload';
    case 8:
    default:
      return 'internal_error';
  }
}

function getNativeBinaryStageLabel(stageCode: number): string {
  switch (stageCode) {
    case 1:
      return 'shortage';
    case 2:
      return 'sink excess';
    case 3:
      return 'objective tier 1';
    case 4:
      return 'objective tier 2';
    case 5:
      return 'objective tier 3';
    case 6:
      return 'machine count';
    case 7:
      return 'infinite machine cost';
    default:
      return 'unknown';
  }
}

function readNativeBinaryResultBuffer(scip: SCIPWasmModule, resultPtr: number): NativeBinaryResult {
  const heap = scip.HEAPF64;
  if (!heap) {
    throw new Error('Native ratio solver exposed binary results without a Float64 heap view.');
  }
  if (resultPtr % Float64Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error('Native ratio solver returned an unaligned binary result pointer.');
  }

  const baseIndex = resultPtr / Float64Array.BYTES_PER_ELEMENT;
  const magic = heap[baseIndex];
  const totalDoubles = heap[baseIndex + 1];
  const version = heap[baseIndex + 2];
  if (magic !== NATIVE_BINARY_RESULT_MAGIC) {
    throw new Error(`Native binary result magic mismatch: ${magic}.`);
  }
  if (version !== NATIVE_BINARY_RESULT_VERSION && version !== NATIVE_BINARY_RESULT_LEGACY_VERSION) {
    throw new Error(`Unsupported native binary result version: ${version}.`);
  }
  const headerDoubles =
    version === NATIVE_BINARY_RESULT_VERSION
      ? NATIVE_BINARY_RESULT_HEADER_DOUBLES
      : NATIVE_BINARY_RESULT_LEGACY_HEADER_DOUBLES;
  if (
    !Number.isInteger(totalDoubles) ||
    totalDoubles < headerDoubles ||
    baseIndex + totalDoubles > heap.length
  ) {
    throw new Error(`Invalid native binary result length: ${totalDoubles}.`);
  }

  const values = heap.slice(baseIndex, baseIndex + totalDoubles);
  const status = getNativeResultStatus(values[3]);

  const stageCount = values[15];
  const nodeCount = values[16];
  const connectionCount = values[17];
  const inputValueCount = values[18];
  if (
    !Number.isInteger(stageCount) ||
    stageCount < 0 ||
    !Number.isInteger(nodeCount) ||
    nodeCount < 0 ||
    !Number.isInteger(connectionCount) ||
    connectionCount < 0 ||
    !Number.isInteger(inputValueCount) ||
    inputValueCount < 0
  ) {
    throw new Error('Native binary result contained invalid section counts.');
  }
  const expectedDoubles =
    headerDoubles + stageCount * 3 + nodeCount + connectionCount + inputValueCount;
  if (!Number.isSafeInteger(expectedDoubles) || expectedDoubles !== values.length) {
    throw new Error('Native binary result section lengths did not match the buffer length.');
  }

  let offset = headerDoubles;
  const stageTelemetry: RatioSolverStageTelemetry[] = [];
  for (let i = 0; i < stageCount; i += 1) {
    stageTelemetry.push({
      name: getNativeBinaryStageLabel(values[offset]),
      objectiveValue: values[offset + 1],
      elapsedMs: values[offset + 2],
    });
    offset += 3;
  }

  const machineCountsByNode = values.slice(offset, offset + nodeCount);
  offset += nodeCount;
  const connectionFlows = values.slice(offset, offset + connectionCount);
  offset += connectionCount;
  const inputDeficits = values.slice(offset, offset + inputValueCount);
  offset += inputValueCount;

  if (offset !== values.length)
    throw new Error('Native binary result parsing did not consume its buffer.');

  return {
    status,
    telemetry: {
      solver: 'native',
      profileUsed: getNativeProfileLabel(values[4]),
      nativeCallMs: values[5],
      nativeModelBuildMs: values[6],
      variableCount: values[7],
      constraintCount: values[8],
      nonzeroCount: values[9],
      valueScale: values[10],
      minCoefficient: values[11],
      maxCoefficient: values[12],
      minFiniteBound: values[13],
      maxFiniteBound: values[14],
      nativePayloadParseMs: values[19],
      nativeResultDoubles: totalDoubles,
      nativeStatus: status,
      mipNodeCount: version === NATIVE_BINARY_RESULT_VERSION ? values[20] : undefined,
      lpIterations: version === NATIVE_BINARY_RESULT_VERSION ? values[21] : undefined,
      primalBound: version === NATIVE_BINARY_RESULT_VERSION ? values[22] : undefined,
      dualBound: version === NATIVE_BINARY_RESULT_VERSION ? values[23] : undefined,
      mipGap: version === NATIVE_BINARY_RESULT_VERSION ? values[24] : undefined,
      roundedVariableCount: version === NATIVE_BINARY_RESULT_VERSION ? values[25] : undefined,
    },
    stageTelemetry,
    machineCountsByNode,
    connectionFlows,
    inputDeficits,
  };
}

export function createNativeRatioSolver(
  scip: SCIPWasmModule,
  usePapiloReliabilityProfile: boolean,
): NativeRatioSolver | undefined {
  if (
    typeof scip._industrialist_has_native_ratio_solver !== 'function' ||
    scip._industrialist_has_native_ratio_solver() !== 1 ||
    typeof scip._industrialist_free_string !== 'function' ||
    typeof scip.UTF8ToString !== 'function' ||
    typeof scip._malloc !== 'function' ||
    typeof scip._free !== 'function' ||
    typeof scip._industrialist_free_result_buffer !== 'function' ||
    !(scip.HEAPF64 instanceof Float64Array)
  ) {
    return undefined;
  }

  const canRunAsyncJob =
    scip._industrialist_native_abi_version?.() === 2 &&
    ((scip._industrialist_native_capabilities?.() ?? 0) & NATIVE_ABI_V2_REQUIRED_CAPABILITIES) ===
      NATIVE_ABI_V2_REQUIRED_CAPABILITIES &&
    typeof scip._industrialist_start_ratio_job_f64 === 'function' &&
    typeof scip._industrialist_get_ratio_job_state === 'function' &&
    typeof scip._industrialist_get_ratio_job_stage === 'function' &&
    typeof scip._industrialist_get_ratio_job_elapsed_ms === 'function' &&
    typeof scip._industrialist_cancel_ratio_job === 'function' &&
    typeof scip._industrialist_take_ratio_job_result === 'function' &&
    typeof scip._industrialist_get_ratio_job_error === 'function';
  if (!canRunAsyncJob) return undefined;

  const getWasmMemoryBytes = () => scip.HEAPF64?.buffer.byteLength ?? null;

  return {
    getWasmMemoryBytes,
    cancelActiveSolve: () => scip._industrialist_cancel_ratio_job!() === 1,
    solveTypedPayloadResult: async (payload: Float64Array, progress?: ProgressReporter) => {
      const byteLength = payload.byteLength;
      let payloadPtr = scip._malloc!(byteLength);
      if (!payloadPtr) {
        throw new Error('Failed to allocate WASM memory for native ratio payload.');
      }

      let resultPtr = 0;
      try {
        const heap = scip.HEAPF64;
        if (!(heap instanceof Float64Array)) {
          throw new Error('Native ratio solver typed payload path requires a Float64 heap view.');
        }
        if (payloadPtr % Float64Array.BYTES_PER_ELEMENT !== 0) {
          throw new Error('Allocated native ratio payload pointer was not Float64-aligned.');
        }

        heap.set(payload, payloadPtr / Float64Array.BYTES_PER_ELEMENT);

        const started = scip._industrialist_start_ratio_job_f64!(
          payloadPtr,
          payload.length,
          usePapiloReliabilityProfile ? 1 : 0,
        );
        if (started !== 1) {
          throw new Error('Native ratio solver could not start an asynchronous job.');
        }
        // start() owns a native copy, so the transient JS-to-WASM buffer can go now.
        scip._free!(payloadPtr);
        payloadPtr = 0;

        let lastStage = -1;
        while (true) {
          const state = scip._industrialist_get_ratio_job_state!();
          const stage = scip._industrialist_get_ratio_job_stage!();
          if (stage !== lastStage) {
            lastStage = stage;
            const stageMessages: Record<number, string> = {
              0: 'Preparing the optimization model.',
              1: 'Satisfying connected-input shortages.',
              2: 'Balancing excess routed into sinks.',
              3: 'Optimizing Priority 1.',
              4: 'Optimizing Priority 2.',
              5: 'Optimizing Priority 3.',
              6: 'Reducing the final machine count.',
              7: 'Finalizing the optimized ratios.',
            };
            progress?.({
              phase: stage > 6 ? 'finalizing' : stage === 0 ? 'building' : 'solving',
              message: stageMessages[stage] ?? 'Optimizing production ratios.',
              solver: 'native',
              elapsedMs: scip._industrialist_get_ratio_job_elapsed_ms!(),
            });
          }

          if (state === 2) break;
          if (state !== 1) {
            throw new Error(`Native ratio job entered unexpected state ${state}.`);
          }
          await new Promise<void>((resolve) => setTimeout(resolve, 16));
        }

        const errorPtr = scip._industrialist_get_ratio_job_error!();
        let nativeError = '';
        try {
          if (errorPtr) nativeError = scip.UTF8ToString!(errorPtr);
        } finally {
          if (errorPtr) scip._industrialist_free_string!(errorPtr);
        }

        resultPtr = scip._industrialist_take_ratio_job_result!();
        if (!resultPtr) {
          throw new Error(nativeError || 'Native ratio job returned no result buffer.');
        }
        const result = readNativeBinaryResultBuffer(scip, resultPtr);
        if (nativeError) result.error = nativeError;
        return result;
      } finally {
        if (resultPtr) {
          scip._industrialist_free_result_buffer!(resultPtr);
        }
        if (payloadPtr) scip._free!(payloadPtr);
      }
    },
  };
}

async function getOrCreateRuntime(
  origin: string,
  requestedBundlePath = DEFAULT_SCIP_BUNDLE_PATH,
  version?: string,
  progress?: ProgressReporter,
): Promise<SCIPRuntime> {
  if (typeof SharedArrayBuffer === 'undefined' || globalThis.crossOriginIsolated !== true) {
    throw new Error(
      'The native ratio solver requires cross-origin isolation. Serve the app with ' +
        'Cross-Origin-Opener-Policy: same-origin and ' +
        'Cross-Origin-Embedder-Policy: require-corp.',
    );
  }
  const bundlePath = normalizeScipBundlePath(requestedBundlePath);
  const nextKey = getRuntimeKey(origin, bundlePath, version);
  if (runtimePromise && runtimeKey === nextKey) {
    const runtime = await runtimePromise;
    activeRuntime = runtime;
    runtime.initializedDuringLastRequest = false;
    return runtime;
  }

  runtimeKey = nextKey;
  const initStart = performance.now();
  runtimePromise = (async () => {
    progress?.({
      phase: 'loading',
      message: `Loading SCIP bundle '${bundlePath}'.`,
      solver: 'unknown',
      elapsedMs: 0,
    });
    const scipUrl = getScipAssetUrl(origin, 'scip.js', bundlePath, version);
    const scipModule = await import(/* @vite-ignore */ scipUrl);
    const createSCIP = scipModule.default;

    const stdoutLines: string[] = [];
    progress?.({
      phase: 'loading',
      message: 'Instantiating SCIP WASM runtime and worker pool.',
      solver: 'unknown',
      elapsedMs: performance.now() - initStart,
    });
    const scip = (await createSCIP({
      locateFile: (file: string) => getScipAssetUrl(origin, file, bundlePath, version),
      print: (text: string) => {
        stdoutLines.push(text);
      },
      printErr: (text: string) => {
        stdoutLines.push(text);
      },
    })) as SCIPWasmModule;
    const canDisableMilpPresolver = false;
    const nativeRatioSolver = createNativeRatioSolver(scip, canDisableMilpPresolver);
    if (!nativeRatioSolver?.solveTypedPayloadResult || !nativeRatioSolver.cancelActiveSolve) {
      throw new Error(
        'The canonical SCIP bundle is missing native ABI v2 capabilities. ' +
          'Rebuild public/scip from tools/scip-wasm before running the ratio optimizer.',
      );
    }
    const initMs = performance.now() - initStart;
    progress?.({
      phase: 'ready',
      message: 'Native SCIP ratio runtime is ready.',
      solver: 'native',
      elapsedMs: initMs,
    });

    return {
      FS: scip.FS,
      main: scip.callMain,
      stdoutLines,
      canDisableMilpPresolver,
      bundlePath,
      initMs,
      initializedDuringLastRequest: true,
      nativeRatioSolver,
    };
  })();

  try {
    const runtime = await runtimePromise;
    activeRuntime = runtime;
    runtime.initializedDuringLastRequest = true;
    return runtime;
  } catch (error) {
    runtimePromise = null;
    runtimeKey = null;
    activeRuntime = null;
    throw error;
  }
}

export function buildMPS(
  nodes: RatioOptimizerNode[],
  connections: RatioOptimizerConnection[],
  options: RatioMPSBuildOptions = {},
): RatioMPSModel {
  const objectiveMode = options.objective ?? 'legacy';
  const objectiveWeights = resolveRatioObjectiveWeights(options.objectiveWeights);
  const valueScale =
    Number.isFinite(options.valueScale) && options.valueScale! > 0 ? options.valueScale! : 1;
  const variables: string[] = [];
  const varSet = new Set<string>();
  const varNameMap = new Map<string, string>();
  const legacyObjCoeffs = new Map<string, number>();
  const objectiveExpressions: RatioObjectiveExpressions = {
    shortage: new Map(),
    sinkExcess: new Map(),
    weighted: new Map(),
    machineCount: new Map(),
  };
  const rowMap = new Map<string, MPSRow>();
  const rowOrder: string[] = [];
  const variableLowerBounds = new Map<string, number>();
  const variableUpperBounds = new Map<string, number>();
  const noTargetComponentNodeIds = getNoTargetComponentNodeIds(nodes, connections);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  let varCounter = 0;

  const registerVar = (originalName: string) => {
    let sanitized = originalName.replace(/[^a-zA-Z0-9_]/g, '_');
    if (varSet.has(sanitized)) {
      sanitized = `${sanitized}_c${varCounter++}`;
    }
    varSet.add(sanitized);
    variables.push(sanitized);
    varNameMap.set(sanitized, originalName);
    return sanitized;
  };

  const registerRow = (name: string, type: MPSRowType, rhs = 0) => {
    let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
    if (rowMap.has(sanitized)) {
      sanitized = `${sanitized}_r${varCounter++}`;
    }
    rowMap.set(sanitized, { type, rhs, terms: new Map() });
    rowOrder.push(sanitized);
    return sanitized;
  };

  const addRowTerm = (rowName: string, varName: string, coeff: number) => {
    if (coeff === 0) return;
    const row = rowMap.get(rowName);
    if (row) {
      row.terms.set(varName, (row.terms.get(varName) || 0) + coeff);
    }
  };

  const setLowerBound = (varName: string, lowerBound: number) => {
    if (!Number.isFinite(lowerBound) || lowerBound <= 0) return;
    variableLowerBounds.set(varName, Math.max(variableLowerBounds.get(varName) ?? 0, lowerBound));
  };

  const tightenUpperBound = (varName: string, upperBound: number) => {
    if (!Number.isFinite(upperBound) || upperBound < 0) return;
    variableUpperBounds.set(
      varName,
      Math.min(variableUpperBounds.get(varName) ?? Number.POSITIVE_INFINITY, upperBound),
    );
  };

  const nodeMachineVars = new Map<string, string>();
  for (const node of nodes) {
    const mVar = registerVar(`m_${node.id}`);
    nodeMachineVars.set(node.id, mVar);
    const targetMachineLowerBound = getTargetMachineLowerBound(node);
    if (targetMachineLowerBound !== null) {
      setLowerBound(mVar, targetMachineLowerBound / valueScale);
    }
    if (noTargetComponentNodeIds.has(node.id)) {
      tightenUpperBound(mVar, 0);
    }

    const legacyMachineWeight = Math.max(
      1e-6,
      1e-3 + 1e-8 * (node.powerUse ?? 0) + 1e-5 * (node.pollution ?? 0),
    );
    const weightedMachineCoeff =
      valueScale *
      ((objectiveWeights.powerUse * (node.powerUse ?? 0)) / RATIO_OBJECTIVE_NORMALIZERS.powerUse +
        (objectiveWeights.pollution * (node.pollution ?? 0)) /
          RATIO_OBJECTIVE_NORMALIZERS.pollution);
    addExpressionCoeff(legacyObjCoeffs, mVar, legacyMachineWeight);
    addExpressionCoeff(objectiveExpressions.weighted, mVar, weightedMachineCoeff);
    addExpressionCoeff(objectiveExpressions.machineCount, mVar, 1);
  }

  const edgeFlowVars = new Map<string, string>();
  for (const conn of connections) {
    const fVar = registerVar(`f_${conn.id}`);
    edgeFlowVars.set(conn.id, fVar);
    const endpoints = getConnectionEndpoints(nodesById, conn);
    if (
      noTargetComponentNodeIds.has(conn.sourceNodeId) ||
      noTargetComponentNodeIds.has(conn.targetNodeId)
    ) {
      tightenUpperBound(fVar, 0);
    }
    if (
      endpoints &&
      (isEffectivelyZeroRate(endpoints.sourceOutput.quantity) ||
        isEffectivelyZeroRate(endpoints.targetInput.quantity))
    ) {
      tightenUpperBound(fVar, 0);
    }
  }

  for (const node of nodes) {
    const mVar = nodeMachineVars.get(node.id)!;
    node.outputs.forEach((out, outputIndex) => {
      const outgoingVarNames: string[] = [];
      for (const c of connections) {
        if (c.sourceNodeId === node.id && c.sourceOutputIndex === outputIndex) {
          const fVar = edgeFlowVars.get(c.id);
          if (fVar) outgoingVarNames.push(fVar);
        }
      }

      if (outgoingVarNames.length === 0 && !out.hasSinkConnection) return;

      const excessVar = registerVar(`excess_${node.id}_${outputIndex}`);
      if (noTargetComponentNodeIds.has(node.id)) {
        tightenUpperBound(excessVar, 0);
      }
      if (out.hasSinkConnection) {
        addExpressionCoeff(legacyObjCoeffs, excessVar, 1e8);
        addExpressionCoeff(objectiveExpressions.sinkExcess, excessVar, 1);
      }

      const rowName = registerRow(`flow_out_${node.id}_${outputIndex}`, 'E', 0);
      addRowTerm(rowName, mVar, out.quantity);
      outgoingVarNames.forEach((fVar) => addRowTerm(rowName, fVar, -1));
      addRowTerm(rowName, excessVar, -1);
    });
  }

  for (const node of nodes) {
    const mVar = nodeMachineVars.get(node.id)!;
    node.inputs.forEach((inp, inputIndex) => {
      const incomingVarNames: string[] = [];
      for (const c of connections) {
        if (c.targetNodeId === node.id && c.targetInputIndex === inputIndex) {
          const fVar = edgeFlowVars.get(c.id);
          if (fVar) incomingVarNames.push(fVar);
        }
      }

      if (incomingVarNames.length === 0) return;

      if (inp.isSink && !node.isTarget) {
        const rowName = registerRow(`sink_cap_${node.id}_${inputIndex}`, 'L', 0);
        incomingVarNames.forEach((fVar) => addRowTerm(rowName, fVar, 1));
        addRowTerm(rowName, mVar, -inp.quantity);
      } else {
        const deficitVar = registerVar(`deficit_${node.id}_${inputIndex}`);
        if (noTargetComponentNodeIds.has(node.id)) {
          tightenUpperBound(deficitVar, 0);
        }
        const isSinkNode = node.outputs.length === 0 || node.inputs.some((inp) => inp.isSink);
        const penalty = isSinkNode ? 1e4 : 1e12;
        addExpressionCoeff(legacyObjCoeffs, deficitVar, penalty);
        addExpressionCoeff(objectiveExpressions.shortage, deficitVar, 1);

        const rowName = registerRow(`flow_in_${node.id}_${inputIndex}`, 'E', 0);
        incomingVarNames.forEach((fVar) => addRowTerm(rowName, fVar, 1));
        addRowTerm(rowName, deficitVar, 1);
        addRowTerm(rowName, mVar, -inp.quantity);
      }
    });
  }

  const addObjectiveBound = (
    name: string,
    expression: Map<string, number>,
    optimum: number | undefined,
  ) => {
    if (optimum === undefined || expression.size === 0) return;
    if (!Number.isFinite(optimum)) {
      throw new Error(`Cannot add ${name} objective bound because the optimum is not finite.`);
    }
    const rowName = registerRow(`limit_${name}`, 'L', getStageBoundRhs(optimum));
    expression.forEach((coeff, varName) => addRowTerm(rowName, varName, coeff));
  };

  addObjectiveBound('shortage', objectiveExpressions.shortage, options.bounds?.shortage);
  addObjectiveBound('sink_excess', objectiveExpressions.sinkExcess, options.bounds?.sinkExcess);
  addObjectiveBound('weighted', objectiveExpressions.weighted, options.bounds?.weighted);

  const addObjectiveDerivedVariableBounds = (
    expression: Map<string, number>,
    optimum: number | undefined,
  ) => {
    if (optimum === undefined || expression.size === 0) return;
    if (!Number.isFinite(optimum)) return;
    const rhs = getStageBoundRhs(optimum);
    expression.forEach((coeff, varName) => {
      if (coeff <= 0) return;
      tightenUpperBound(varName, rhs / coeff);
    });
  };

  addObjectiveDerivedVariableBounds(objectiveExpressions.shortage, options.bounds?.shortage);
  addObjectiveDerivedVariableBounds(objectiveExpressions.sinkExcess, options.bounds?.sinkExcess);
  addObjectiveDerivedVariableBounds(objectiveExpressions.weighted, options.bounds?.weighted);

  const objCoeffs = getObjectiveExpression(objectiveMode, objectiveExpressions, legacyObjCoeffs);

  const out: string[] = [];
  out.push('NAME          MODEL\n');

  out.push('ROWS\n');
  out.push(' N  obj\n');
  rowOrder.forEach((rowName) => {
    const row = rowMap.get(rowName)!;
    out.push(` ${row.type}  ${rowName}\n`);
  });

  out.push('COLUMNS\n');
  const colEntries = new Map<string, [string, number][]>();
  const getColEntries = (v: string) => {
    let list = colEntries.get(v);
    if (!list) {
      list = [];
      colEntries.set(v, list);
    }
    return list;
  };

  objCoeffs.forEach((coeff, varName) => {
    if (coeff !== 0) getColEntries(varName).push(['obj', coeff]);
  });

  rowOrder.forEach((rowName) => {
    const row = rowMap.get(rowName)!;
    row.terms.forEach((coeff, varName) => {
      if (coeff !== 0) getColEntries(varName).push([rowName, coeff]);
    });
  });

  variables.forEach((varName) => {
    const entries = colEntries.get(varName) || [];
    if (entries.length === 0) {
      out.push(`    ${varName}  obj  0\n`);
      return;
    }
    entries.forEach(([rowName, coeff]) => {
      out.push(`    ${varName}  ${rowName}  ${coeff}\n`);
    });
  });

  out.push('RHS\n');
  rowOrder.forEach((rowName) => {
    const row = rowMap.get(rowName)!;
    if (row.rhs !== 0) {
      out.push(`    RHS  ${rowName}  ${row.rhs}\n`);
    }
  });

  out.push('BOUNDS\n');
  for (const varName of variables) {
    const lowerBound = variableLowerBounds.get(varName);
    const upperBound = variableUpperBounds.get(varName);
    if (lowerBound !== undefined) {
      out.push(` LO BND  ${varName}  ${lowerBound}\n`);
    }
    if (upperBound !== undefined && Number.isFinite(upperBound)) {
      out.push(` UP BND  ${varName}  ${upperBound}\n`);
    }
  }

  out.push('ENDATA\n');

  return {
    mpsString: out.join(''),
    varNameMap,
    objectiveExpressions,
  };
}

function safeNativeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function nativeBool(value: boolean): number {
  return value ? 1 : 0;
}

export function buildNativeRatioPayloadArray(
  nodes: RatioOptimizerNode[],
  connections: RatioOptimizerConnection[],
  objectiveWeights: RatioObjectiveWeights = DEFAULT_RATIO_OBJECTIVE_WEIGHTS,
  configuration?: OptimizationConfiguration,
): Float64Array {
  const resolvedWeights = resolveRatioObjectiveWeights(objectiveWeights);
  const resolvedConfiguration = configuration
    ? sanitizeOptimizationConfiguration(configuration)
    : sanitizeOptimizationConfiguration({
        ...DEFAULT_OPTIMIZATION_CONFIGURATION,
        metrics: {
          ...DEFAULT_OPTIMIZATION_CONFIGURATION.metrics,
          powerUse: {
            ...DEFAULT_OPTIMIZATION_CONFIGURATION.metrics.powerUse,
            weight: resolvedWeights.powerUse,
          },
          pollution: {
            ...DEFAULT_OPTIMIZATION_CONFIGURATION.metrics.pollution,
            weight: resolvedWeights.pollution,
          },
          machineCost: {
            ...DEFAULT_OPTIMIZATION_CONFIGURATION.metrics.machineCost,
            enabled: resolvedWeights.machineCost > 0,
            weight: resolvedWeights.machineCost,
          },
          modelCount: {
            ...DEFAULT_OPTIMIZATION_CONFIGURATION.metrics.modelCount,
            enabled: resolvedWeights.modelCount > 0,
            weight: resolvedWeights.modelCount,
          },
        },
      });
  const nodeIndexById = new Map<string, number>();
  let inputCount = 0;
  let outputCount = 0;

  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    nodeIndexById.set(nodes[nodeIndex].id, nodeIndex);
    inputCount += nodes[nodeIndex].inputs.length;
    outputCount += nodes[nodeIndex].outputs.length;
  }

  const nodeSectionOffset = NATIVE_PAYLOAD_F64_HEADER_DOUBLES;
  const inputSectionOffset = nodeSectionOffset + nodes.length * NATIVE_PAYLOAD_F64_NODE_DOUBLES;
  const outputSectionOffset = inputSectionOffset + inputCount * NATIVE_PAYLOAD_F64_INPUT_DOUBLES;
  const connectionSectionOffset =
    outputSectionOffset + outputCount * NATIVE_PAYLOAD_F64_OUTPUT_DOUBLES;
  const totalDoubles =
    connectionSectionOffset + connections.length * NATIVE_PAYLOAD_F64_CONNECTION_DOUBLES;
  const out = new Float64Array(totalDoubles);

  out[0] = NATIVE_PAYLOAD_F64_MAGIC;
  out[1] = NATIVE_PAYLOAD_F64_VERSION;
  out[2] = totalDoubles;
  out[3] = nodes.length;
  out[4] = connections.length;
  out[5] = inputCount;
  out[6] = outputCount;
  out[7] = Math.max(
    1,
    ...OPTIMIZATION_METRIC_IDS.filter((id) => resolvedConfiguration.metrics[id].enabled).map(
      (id) => resolvedConfiguration.metrics[id].tier,
    ),
  );
  out[8] = 0;
  for (let metricIndex = 0; metricIndex < OPTIMIZATION_METRIC_IDS.length; metricIndex += 1) {
    const id = OPTIMIZATION_METRIC_IDS[metricIndex];
    const setting = resolvedConfiguration.metrics[id];
    const offset = 9 + metricIndex * 5;
    out[offset] = nativeBool(setting.enabled);
    out[offset + 1] = setting.weight / OPTIMIZATION_NORMALIZERS[id];
    out[offset + 2] = setting.tier;
    out[offset + 3] = setting.limit ?? -1;
    out[offset + 4] = setting.outputGoal ?? -1;
  }

  let nextInputIndex = 0;
  let nextOutputIndex = 0;
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const node = nodes[nodeIndex];
    const nodeOffset = nodeSectionOffset + nodeIndex * NATIVE_PAYLOAD_F64_NODE_DOUBLES;
    out[nodeOffset] = safeNativeNumber(node.currentMachineCount);
    out[nodeOffset + 1] = nativeBool(node.isTarget);
    out[nodeOffset + 2] = safeNativeNumber(node.powerUse);
    out[nodeOffset + 3] = safeNativeNumber(node.powerOutput);
    out[nodeOffset + 4] = safeNativeNumber(node.pollution);
    out[nodeOffset + 5] = safeNativeNumber(node.machineCost);
    out[nodeOffset + 6] = safeNativeNumber(node.machineSpace);
    out[nodeOffset + 7] = safeNativeNumber(node.modelCount);
    out[nodeOffset + 8] = nextInputIndex;
    out[nodeOffset + 9] = node.inputs.length;
    out[nodeOffset + 10] = nextOutputIndex;
    out[nodeOffset + 11] = node.outputs.length;
    out[nodeOffset + 12] = nativeBool(node.hasInfiniteMachineCost);

    for (const input of node.inputs) {
      const inputOffset = inputSectionOffset + nextInputIndex * NATIVE_PAYLOAD_F64_INPUT_DOUBLES;
      out[inputOffset] = safeNativeNumber(input.quantity);
      out[inputOffset + 1] = nativeBool(input.isSink);
      nextInputIndex += 1;
    }

    for (const output of node.outputs) {
      const outputOffset =
        outputSectionOffset + nextOutputIndex * NATIVE_PAYLOAD_F64_OUTPUT_DOUBLES;
      out[outputOffset] = safeNativeNumber(output.quantity);
      out[outputOffset + 1] = nativeBool(output.hasSinkConnection);
      nextOutputIndex += 1;
    }
  }

  for (let connectionIndex = 0; connectionIndex < connections.length; connectionIndex += 1) {
    const connection = connections[connectionIndex];
    const sourceNodeIndex = nodeIndexById.get(connection.sourceNodeId);
    const targetNodeIndex = nodeIndexById.get(connection.targetNodeId);
    if (sourceNodeIndex === undefined || targetNodeIndex === undefined) {
      throw new Error(
        `Connection ${connection.id} references a node outside the native ratio payload.`,
      );
    }

    const connectionOffset =
      connectionSectionOffset + connectionIndex * NATIVE_PAYLOAD_F64_CONNECTION_DOUBLES;
    out[connectionOffset] = sourceNodeIndex;
    out[connectionOffset + 1] = connection.sourceOutputIndex;
    out[connectionOffset + 2] = targetNodeIndex;
    out[connectionOffset + 3] = connection.targetInputIndex;
  }

  return out;
}

function buildResponseFromRawValues(
  rawValues: Record<string, number>,
  connections: RatioOptimizerConnection[],
  nodes: RatioOptimizerNode[],
  deficiencyEpsilon: number,
  telemetry?: RatioSolverTelemetry,
): RatioOptimizerResponse {
  const machineCounts: Record<string, number> = {};
  for (const node of nodes) {
    const varName = `m_${node.id}`;
    const targetMachineLowerBound = getTargetMachineLowerBound(node);
    let count = rawValues[varName] !== undefined ? rawValues[varName] : 0;
    if (
      targetMachineLowerBound !== null &&
      count < targetMachineLowerBound &&
      targetMachineLowerBound - count <= Math.max(1e-8, Math.abs(targetMachineLowerBound) * 1e-9)
    ) {
      count = targetMachineLowerBound;
    }
    if (count < 1e-8) {
      count = 0;
    }
    machineCounts[node.id] = count;
  }

  let unresolvedDeficiencyTotal = 0;
  let unresolvedDeficiencyCount = 0;
  const unresolvedDeficits: Array<{ name: string; value: number }> = [];
  const rawEntries = Object.entries(rawValues);
  for (let i = 0; i < rawEntries.length; i++) {
    const [varName, value] = rawEntries[i];
    if (!varName.startsWith('deficit_')) continue;
    if (!Number.isFinite(value) || value <= deficiencyEpsilon) continue;
    unresolvedDeficiencyTotal += value;
    unresolvedDeficiencyCount += 1;
    unresolvedDeficits.push({ name: varName, value });
  }

  if (unresolvedDeficiencyCount > 0) {
    const diagnostics = buildFailureDiagnostics(
      unresolvedDeficits,
      connections,
      nodes,
      rawValues,
      machineCounts,
    );
    return {
      feasible: false,
      error:
        `The solver could not fully satisfy connected inputs. ` +
        `${unresolvedDeficiencyCount} connected input ` +
        `${unresolvedDeficiencyCount === 1 ? 'port is' : 'ports are'} still short by ` +
        `${unresolvedDeficiencyTotal.toFixed(6)} units/sec total.`,
      diagnostics,
      telemetry,
    };
  }

  return {
    feasible: true,
    machineCounts,
    telemetry,
  };
}

function buildResponseFromNativeBinaryResult(
  binaryResult: NativeBinaryResult,
  solvedConnections: RatioOptimizerConnection[],
  solvedNodes: RatioOptimizerNode[],
  resultConnections: RatioOptimizerConnection[],
  resultNodes: RatioOptimizerNode[],
  fallbackTelemetry: RatioSolverTelemetry,
): RatioOptimizerResponse {
  const rawValues: Record<string, number> = {};

  for (let nodeIndex = 0; nodeIndex < solvedNodes.length; nodeIndex += 1) {
    const value = binaryResult.machineCountsByNode[nodeIndex];
    if (Number.isFinite(value)) {
      rawValues[`m_${solvedNodes[nodeIndex].id}`] = value;
    }
  }

  for (let connectionIndex = 0; connectionIndex < solvedConnections.length; connectionIndex += 1) {
    const value = binaryResult.connectionFlows[connectionIndex];
    if (Number.isFinite(value)) {
      rawValues[`f_${solvedConnections[connectionIndex].id}`] = value;
    }
  }

  let inputValueIndex = 0;
  for (const node of solvedNodes) {
    for (let inputIndex = 0; inputIndex < node.inputs.length; inputIndex += 1) {
      const value = binaryResult.inputDeficits[inputValueIndex];
      if (Number.isFinite(value) && Math.abs(value) > 1e-12) {
        rawValues[`deficit_${node.id}_${inputIndex}`] = value;
      }
      inputValueIndex += 1;
    }
  }

  const telemetry: RatioSolverTelemetry = {
    ...fallbackTelemetry,
    ...binaryResult.telemetry,
    solver: 'native',
    stageTelemetry: binaryResult.stageTelemetry,
  };

  return buildResponseFromRawValues(
    rawValues,
    resultConnections,
    resultNodes,
    Math.max(1e-6, SCALED_DEFICIENCY_EPSILON),
    telemetry,
  );
}

async function solveRatioStagesNative(
  runtime: SCIPRuntime,
  nodes: RatioOptimizerNode[],
  connections: RatioOptimizerConnection[],
  objectiveWeights: RatioObjectiveWeights = DEFAULT_RATIO_OBJECTIVE_WEIGHTS,
  configuration?: OptimizationConfiguration,
  progress?: ProgressReporter,
  resultNodes = nodes,
  resultConnections = connections,
): Promise<RatioOptimizerResponse> {
  if (!runtime.nativeRatioSolver) {
    throw new Error('The native ratio optimizer is unavailable.');
  }

  const solveStart = performance.now();
  progress?.({
    phase: 'building',
    message: 'Building native ratio payload.',
    solver: 'native',
  });
  const payloadBuildStart = performance.now();
  const payload = buildNativeRatioPayloadArray(nodes, connections, objectiveWeights, configuration);
  const payloadBuildMs = performance.now() - payloadBuildStart;
  const payloadBytes = payload.byteLength;
  progress?.({
    phase: 'solving',
    message: 'Optimizing production ratios.',
    solver: 'native',
  });
  const nativeCallStart = performance.now();
  const binaryResult = await runtime.nativeRatioSolver.solveTypedPayloadResult(payload, progress);
  const nativeCallMs = performance.now() - nativeCallStart;
  if (!binaryResult) {
    throw new Error('Native ratio solver failed before returning a typed result.');
  }
  if (binaryResult.status !== 'optimal') {
    if (binaryResult.status === 'cancelled') {
      throw new Error('Computation cancelled.');
    }
    throw new Error(
      binaryResult.error || `Native ratio solver stopped with status '${binaryResult.status}'.`,
    );
  }

  progress?.({
    phase: 'finalizing',
    message: 'Finalizing native solver result.',
    solver: 'native',
  });
  const fallbackTelemetry: RatioSolverTelemetry = {
    solver: 'native',
    bundlePath: runtime.bundlePath,
    initializedDuringSolve: runtime.initializedDuringLastRequest,
    initMs: runtime.initMs,
    solveMs: performance.now() - solveStart,
    payloadBuildMs,
    payloadBytes,
    nativePayloadKind: 'f64',
    nativeCallMs,
    wasmMemoryBytes: runtime.nativeRatioSolver.getWasmMemoryBytes?.() ?? undefined,
  };
  const parseStart = performance.now();
  const response = buildResponseFromNativeBinaryResult(
    binaryResult,
    connections,
    nodes,
    resultConnections,
    resultNodes,
    fallbackTelemetry,
  );
  response.telemetry = {
    ...fallbackTelemetry,
    ...response.telemetry,
    solveMs: performance.now() - solveStart,
    nativeCallMs: response.telemetry?.nativeCallMs ?? nativeCallMs,
    resultParseMs: performance.now() - parseStart,
  };
  return response;
}

export async function solveRatioStages(
  runtime: SCIPRuntime,
  nodes: RatioOptimizerNode[],
  connections: RatioOptimizerConnection[],
  objectiveWeights: RatioObjectiveWeights = DEFAULT_RATIO_OBJECTIVE_WEIGHTS,
  configuration?: OptimizationConfiguration,
  progress?: ProgressReporter,
): Promise<RatioOptimizerResponse> {
  const resolvedConfiguration = configuration
    ? sanitizeOptimizationConfiguration(configuration)
    : undefined;
  const powerOutput = resolvedConfiguration?.metrics.powerOutput;
  const preservePowerOutputComponents =
    (powerOutput?.limit ?? null) !== null ||
    (powerOutput?.enabled === true && powerOutput.weight > 0 && powerOutput.outputGoal !== null);
  const presolved = presolveRatioOptimizerModel(nodes, connections, preservePowerOutputComponents);
  if (didPresolveChangeModel(presolved.stats)) {
    progress?.({
      phase: 'building',
      message:
        `Presolved ratio graph from ${presolved.stats.originalNodeCount} nodes / ` +
        `${presolved.stats.originalConnectionCount} connections to ` +
        `${presolved.stats.nodeCount} nodes / ${presolved.stats.connectionCount} connections.`,
      solver: runtime.nativeRatioSolver ? 'native' : 'mps',
    });
  }

  if (presolved.nodes.length === 0) {
    const response = buildPresolvedEmptyResponse(runtime, nodes);
    attachPresolveTelemetry(response, presolved.stats);
    return response;
  }

  const response = await solveRatioStagesNative(
    runtime,
    presolved.nodes,
    presolved.connections,
    objectiveWeights,
    resolvedConfiguration,
    progress,
    nodes,
    connections,
  );

  attachPresolveTelemetry(response, presolved.stats);
  return response;
}

function postProgress(requestId: number | undefined, progress: RatioSolverProgress): void {
  self.postMessage({
    type: 'progress',
    requestId,
    progress,
  });
}

function throwIfCancelled(requestId: number | undefined): void {
  if (requestId !== undefined && cancelledRequestIds.has(requestId)) {
    throw new Error('Computation cancelled.');
  }
}

function getWarmupNodes(): RatioOptimizerNode[] {
  return [
    {
      id: 'warmup_target',
      currentMachineCount: 1,
      isTarget: true,
      powerUse: 0,
      powerOutput: 0,
      pollution: 0,
      machineCost: 0,
      hasInfiniteMachineCost: false,
      machineSpace: 0,
      modelCount: 0,
      inputs: [],
      outputs: [
        {
          productId: 'warmup_product',
          quantity: 1,
          hasSinkConnection: false,
        },
      ],
    },
  ];
}

async function handleWarmupMessage(message: RatioOptimizerWarmupRequest): Promise<void> {
  const warmupStart = performance.now();
  const progress = (nextProgress: RatioSolverProgress) =>
    postProgress(undefined, {
      ...nextProgress,
      phase: nextProgress.phase === 'loading' ? 'warmup' : nextProgress.phase,
    });

  try {
    progress({
      phase: 'warmup',
      message: 'Preparing ratio optimizer runtime.',
      solver: 'unknown',
      elapsedMs: 0,
    });
    const runtime = await getOrCreateRuntime(
      message.origin,
      message.scipBundlePath,
      message.version,
      progress,
    );
    let smokeMs = 0;
    if (runtime.nativeRatioSolver) {
      const smokeStart = performance.now();
      const smokeResponse = await solveRatioStagesNative(
        runtime,
        getWarmupNodes(),
        [],
        DEFAULT_RATIO_OBJECTIVE_WEIGHTS,
        undefined,
        (nextProgress) =>
          postProgress(undefined, {
            ...nextProgress,
            phase: 'warmup',
            message: `Warmup: ${nextProgress.message}`,
          }),
      );
      smokeMs = performance.now() - smokeStart;
      if (!smokeResponse?.feasible) {
        throw new Error(smokeResponse?.error ?? 'Native warmup smoke solve failed.');
      }
    }

    self.postMessage({
      type: 'warmup-result',
      feasible: true,
      telemetry: {
        solver: runtime.nativeRatioSolver ? 'native' : 'mps',
        bundlePath: runtime.bundlePath,
        initializedDuringSolve: runtime.initializedDuringLastRequest,
        initMs: runtime.initMs,
        warmupMs: performance.now() - warmupStart,
        solveMs: smokeMs,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[Ratio Optimizer Worker] Warmup failed:', errorMsg);
    self.postMessage({
      type: 'warmup-result',
      feasible: false,
      error: `Worker warmup failed: ${errorMsg}`,
    });
  }
}

async function handleSolveMessage(message: RatioOptimizerRequest): Promise<void> {
  const { origin, scipBundlePath, nodes, connections, version, requestId } = message;
  const solveStart = performance.now();
  activeWorkerRequestId = requestId;
  const progress = (nextProgress: RatioSolverProgress) =>
    postProgress(requestId, {
      ...nextProgress,
      elapsedMs: nextProgress.elapsedMs ?? performance.now() - solveStart,
    });

  try {
    throwIfCancelled(requestId);
    progress({
      phase: 'loading',
      message: 'Preparing SCIP runtime.',
      solver: 'unknown',
    });
    const runtime = await getOrCreateRuntime(origin, scipBundlePath, version, progress);
    throwIfCancelled(requestId);
    const response = await solveRatioStages(
      runtime,
      nodes,
      connections,
      resolveRatioObjectiveWeights(message.objectiveWeights),
      message.optimizationConfiguration,
      progress,
    );
    throwIfCancelled(requestId);
    response.type = 'solve-result';
    response.requestId = requestId;
    response.telemetry = {
      ...response.telemetry,
      solver: response.telemetry?.solver ?? (runtime.nativeRatioSolver ? 'native' : 'mps'),
      bundlePath: runtime.bundlePath,
      initializedDuringSolve: runtime.initializedDuringLastRequest,
      initMs: runtime.initMs,
      solveMs: performance.now() - solveStart,
    };
    progress({
      phase: response.feasible ? 'complete' : 'failed',
      message: response.feasible
        ? 'Ratio optimizer finished.'
        : 'Ratio optimizer finished with unresolved shortages.',
      solver: response.telemetry.solver,
    });
    self.postMessage(response);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    if (errorMsg !== 'Computation cancelled.') {
      console.error('[Ratio Optimizer Worker] Run failed:', errorMsg, errorStack);
    }
    postProgress(requestId, {
      phase: 'failed',
      message: errorMsg,
      solver: 'unknown',
      elapsedMs: performance.now() - solveStart,
    });
    self.postMessage({
      type: 'solve-result',
      requestId,
      feasible: false,
      error:
        errorMsg === 'Computation cancelled.' ? errorMsg : `Worker execution failed: ${errorMsg}`,
    });
  } finally {
    if (requestId !== undefined) {
      cancelledRequestIds.delete(requestId);
    }
    if (activeWorkerRequestId === requestId) {
      activeWorkerRequestId = undefined;
    }
  }
}

let workerMessageQueue = Promise.resolve();

const handleRatioOptimizerMessage = (event: MessageEvent<RatioOptimizerWorkerRequest>) => {
  if (event.data.type === 'cancel') {
    cancelledRequestIds.add(event.data.requestId);
    if (activeWorkerRequestId === event.data.requestId) {
      activeRuntime?.nativeRatioSolver?.cancelActiveSolve?.();
    }
    return;
  }

  const message = event.data;
  workerMessageQueue = workerMessageQueue
    .catch((error: unknown) => {
      console.error('[Ratio Optimizer Worker] Unexpected queued task failure:', error);
    })
    .then(async () => {
      if (message.type === 'warmup') {
        await handleWarmupMessage(message);
        return;
      }
      await handleSolveMessage(message);
    });
};

if (typeof self !== 'undefined') {
  self.onmessage = handleRatioOptimizerMessage;
}

function buildFailureDiagnostics(
  unresolvedDeficits: Array<{ name: string; value: number }>,
  connections: RatioOptimizerConnection[],
  nodes: RatioOptimizerNode[],
  rawValues: Record<string, number>,
  machineCounts: Record<string, number>,
): RatioFailureDiagnostics {
  const deficientInputs: RatioDeficientInputDiagnostic[] = [];
  const deficientNodeIds = new Set<string>();
  const nodeById = new Map<string, RatioOptimizerNode>();
  for (const node of nodes) {
    nodeById.set(node.id, node);
  }

  const incomingByInput = new Map<string, RatioOptimizerConnection[]>();
  const outgoingByOutput = new Map<string, RatioOptimizerConnection[]>();
  for (const connection of connections) {
    const inputKey = `${connection.targetNodeId}::${connection.targetInputIndex}`;
    const inputConnections = incomingByInput.get(inputKey);
    if (inputConnections) {
      inputConnections.push(connection);
    } else {
      incomingByInput.set(inputKey, [connection]);
    }

    const outputKey = `${connection.sourceNodeId}::${connection.sourceOutputIndex}`;
    const outputConnections = outgoingByOutput.get(outputKey);
    if (outputConnections) {
      outputConnections.push(connection);
    } else {
      outgoingByOutput.set(outputKey, [connection]);
    }
  }

  const parsedDeficits: Array<{
    nodeId: string;
    inputIndex: number;
    value: number;
  }> = [];
  for (const deficit of unresolvedDeficits) {
    const parsed = parseDeficitVarName(deficit.name);
    if (!parsed) continue;
    const { nodeId, inputIndex } = parsed;
    deficientNodeIds.add(nodeId);
    parsedDeficits.push({
      nodeId,
      inputIndex,
      value: deficit.value,
    });
  }

  const deficiencyByNode = new Map<string, number>();
  for (const deficit of parsedDeficits) {
    deficiencyByNode.set(
      deficit.nodeId,
      (deficiencyByNode.get(deficit.nodeId) ?? 0) + deficit.value,
    );
  }

  const deficientUpstream = new Map<string, Set<string>>();
  const deficientDownstream = new Map<string, Set<string>>();
  const structuralDownstream = new Map<string, Set<string>>();
  for (const nodeId of deficientNodeIds) {
    deficientUpstream.set(nodeId, new Set());
    deficientDownstream.set(nodeId, new Set());
  }

  for (const node of nodes) {
    structuralDownstream.set(node.id, new Set());
  }

  for (const connection of connections) {
    structuralDownstream.get(connection.sourceNodeId)?.add(connection.targetNodeId);
  }

  for (const deficit of parsedDeficits) {
    const inputConnections = incomingByInput.get(`${deficit.nodeId}::${deficit.inputIndex}`) ?? [];
    for (const connection of inputConnections) {
      if (!deficientNodeIds.has(connection.sourceNodeId)) continue;
      deficientUpstream.get(deficit.nodeId)?.add(connection.sourceNodeId);
      deficientDownstream.get(connection.sourceNodeId)?.add(deficit.nodeId);
    }
  }

  const cycleComponents = findCycleComponents(structuralDownstream);
  const cycleNodeIds = cycleComponents
    .flatMap((component) => component.nodeIds)
    .sort((a, b) => a.localeCompare(b));
  const cycleNodeIdSet = new Set(cycleNodeIds);

  for (const deficit of parsedDeficits) {
    const { nodeId, inputIndex } = deficit;

    const node = nodeById.get(nodeId);
    const input = node?.inputs[inputIndex];
    const productId = input?.productId ?? 'unknown';
    const requiredRate = Math.max(0, (machineCounts[nodeId] ?? 0) * (input?.quantity ?? 0));
    const inputConnections = incomingByInput.get(`${nodeId}::${inputIndex}`) ?? [];
    const suppliedRate = inputConnections.reduce(
      (sum, connection) => sum + getRawFlowValue(rawValues, connection.id),
      0,
    );

    const upstreamContributions = inputConnections.map((connection) => {
      const sourceNode = nodeById.get(connection.sourceNodeId);
      const sourceOutput = sourceNode?.outputs[connection.sourceOutputIndex];
      const outputKey = `${connection.sourceNodeId}::${connection.sourceOutputIndex}`;
      const siblingConnections = outgoingByOutput.get(outputKey) ?? [];
      const unitOutputRate = sourceOutput?.quantity ?? 0;
      const outputRate = Math.max(
        0,
        (machineCounts[connection.sourceNodeId] ?? 0) * unitOutputRate,
      );
      const totalOutgoingRate = siblingConnections.reduce(
        (sum, sibling) => sum + getRawFlowValue(rawValues, sibling.id),
        0,
      );

      return {
        edgeId: connection.id,
        nodeId: connection.sourceNodeId,
        outputIndex: connection.sourceOutputIndex,
        productId: sourceOutput?.productId ?? 'unknown',
        productMatches: !sourceOutput || sourceOutput.productId === productId,
        unitOutputRate,
        suppliedRate: getRawFlowValue(rawValues, connection.id),
        outputRate,
        totalOutgoingRate,
        directDeficiency: deficiencyByNode.get(connection.sourceNodeId) ?? 0,
      };
    });

    upstreamContributions.sort((a, b) => {
      const deficiencyDelta = b.directDeficiency - a.directDeficiency;
      if (Math.abs(deficiencyDelta) > 1e-9) return deficiencyDelta;
      const suppliedDelta = a.suppliedRate - b.suppliedRate;
      if (Math.abs(suppliedDelta) > 1e-9) return suppliedDelta;
      return a.nodeId.localeCompare(b.nodeId);
    });

    const upstreamNodeIds = upstreamContributions.map((contribution) => contribution.nodeId);
    const causeKind = classifyDeficiencyCause(nodeId, upstreamContributions, cycleNodeIdSet);
    const causeNodeIds = getCauseNodeIds(nodeId, upstreamContributions, deficientNodeIds);

    deficientInputs.push({
      nodeId,
      inputIndex,
      productId,
      deficiency: deficit.value,
      requiredRate,
      suppliedRate,
      upstreamNodeIds: [...new Set(upstreamNodeIds)],
      causeNodeIds,
      causeKind,
      upstreamContributions,
    });
  }

  deficientInputs.sort((a, b) => b.deficiency - a.deficiency);

  attachCycleBoundaryNodeIds(cycleComponents, deficientInputs, connections);
  const cycleBoundaryNodeIds = [
    ...new Set(cycleComponents.flatMap((component) => component.boundaryNodeIds)),
  ].sort((a, b) => a.localeCompare(b));

  const deficientInputsByNode = getDeficientInputsByNode(deficientInputs);
  const rootCauseContext: RatioRootCauseTraceContext = {
    deficientInputsByNode,
    incomingByInput,
    nodeById,
    cycleNodeToComponent: getCycleNodeToComponent(cycleComponents),
    rootCauseCache: new Map(),
  };

  for (const input of deficientInputs) {
    const rootCausesForInput = traceRootCausesFromInput(input, rootCauseContext, new Set());
    if (rootCausesForInput.length === 0) continue;

    input.causeKind = summarizeRootCauseKind(rootCausesForInput);
    input.causeNodeIds = getRootCauseNodeIds(rootCausesForInput);
  }

  const rootCauses = getSummaryRootCauses(deficientInputs, cycleComponents, rootCauseContext);

  const sortedDeficientNodeIds = [...deficientNodeIds].sort((a, b) => {
    const deficiencyDelta = (deficiencyByNode.get(b) ?? 0) - (deficiencyByNode.get(a) ?? 0);
    if (Math.abs(deficiencyDelta) > 1e-9) return deficiencyDelta;
    return a.localeCompare(b);
  });

  const likelyRootNodeIds = getRootCauseNodeIds(rootCauses);
  if (likelyRootNodeIds.length === 0) {
    likelyRootNodeIds.push(
      ...getLikelyRootNodeIds(
        deficientInputs,
        deficientNodeIds,
        deficiencyByNode,
        deficientUpstream,
      ),
    );
  }
  if (likelyRootNodeIds.length === 0 && cycleNodeIds.length > 0) {
    likelyRootNodeIds.push(...cycleNodeIds);
  }

  return {
    deficientNodeIds: sortedDeficientNodeIds,
    likelyRootNodeIds,
    cycleNodeIds,
    cycleBoundaryNodeIds,
    rootCauses,
    deficientInputs,
  };
}

interface RatioCycleComponent {
  nodeIds: string[];
  nodeIdSet: Set<string>;
  boundaryNodeIds: string[];
}

interface RatioRootCauseTraceContext {
  deficientInputsByNode: Map<string, RatioDeficientInputDiagnostic[]>;
  incomingByInput: Map<string, RatioOptimizerConnection[]>;
  nodeById: Map<string, RatioOptimizerNode>;
  cycleNodeToComponent: Map<string, RatioCycleComponent>;
  rootCauseCache: Map<string, RatioRootCauseDiagnostic[]>;
}

function getDeficientInputsByNode(
  deficientInputs: RatioDeficientInputDiagnostic[],
): Map<string, RatioDeficientInputDiagnostic[]> {
  const deficientInputsByNode = new Map<string, RatioDeficientInputDiagnostic[]>();
  for (const input of deficientInputs) {
    const list = deficientInputsByNode.get(input.nodeId);
    if (list) {
      list.push(input);
    } else {
      deficientInputsByNode.set(input.nodeId, [input]);
    }
  }
  return deficientInputsByNode;
}

function getCycleNodeToComponent(
  cycleComponents: RatioCycleComponent[],
): Map<string, RatioCycleComponent> {
  const cycleNodeToComponent = new Map<string, RatioCycleComponent>();
  for (const component of cycleComponents) {
    for (const nodeId of component.nodeIds) {
      cycleNodeToComponent.set(nodeId, component);
    }
  }
  return cycleNodeToComponent;
}

function attachCycleBoundaryNodeIds(
  cycleComponents: RatioCycleComponent[],
  deficientInputs: RatioDeficientInputDiagnostic[],
  connections: RatioOptimizerConnection[],
): void {
  for (const component of cycleComponents) {
    const boundaryNodeIds = new Set<string>();

    for (const input of deficientInputs) {
      if (!component.nodeIdSet.has(input.nodeId)) continue;
      if (
        input.upstreamContributions.some(
          (contribution) => !component.nodeIdSet.has(contribution.nodeId),
        )
      ) {
        boundaryNodeIds.add(input.nodeId);
      }
    }

    for (const connection of connections) {
      const sourceInCycle = component.nodeIdSet.has(connection.sourceNodeId);
      const targetInCycle = component.nodeIdSet.has(connection.targetNodeId);
      if (sourceInCycle === targetInCycle) continue;
      boundaryNodeIds.add(sourceInCycle ? connection.sourceNodeId : connection.targetNodeId);
    }

    if (boundaryNodeIds.size === 0) {
      for (const nodeId of component.nodeIds) {
        boundaryNodeIds.add(nodeId);
      }
    }

    component.boundaryNodeIds = [...boundaryNodeIds].sort((a, b) => a.localeCompare(b));
  }
}

function traceRootCausesFromInput(
  input: RatioDeficientInputDiagnostic,
  context: RatioRootCauseTraceContext,
  visitedInputKeys: Set<string>,
): RatioRootCauseDiagnostic[] {
  const inputKey = `${input.nodeId}::${input.inputIndex}::${input.deficiency.toFixed(9)}`;
  const cached = context.rootCauseCache.get(inputKey);
  if (cached) return cached;

  const cycleComponent = context.cycleNodeToComponent.get(input.nodeId);
  if (
    cycleComponent &&
    input.upstreamContributions.some((contribution) =>
      cycleComponent.nodeIdSet.has(contribution.nodeId),
    )
  ) {
    const rootCauses = [createCycleRootCause(input, cycleComponent)];
    context.rootCauseCache.set(inputKey, rootCauses);
    return rootCauses;
  }

  if (visitedInputKeys.has(inputKey)) {
    const rootCauses = [createUnresolvedRootCause(input, 'feedback_loop')];
    context.rootCauseCache.set(inputKey, rootCauses);
    return rootCauses;
  }

  visitedInputKeys.add(inputKey);
  const rootCauses: RatioRootCauseDiagnostic[] = [];

  for (const contribution of input.upstreamContributions) {
    if (!contribution.productMatches || contribution.unitOutputRate <= 1e-8) {
      rootCauses.push(createContributionRootCause(input, contribution));
      continue;
    }

    const structuralInputs = getConnectedRequiredInputsForNode(
      contribution.nodeId,
      context,
      input.deficiency,
    );
    const structuralRootCauses: RatioRootCauseDiagnostic[] = [];
    for (const structuralInput of structuralInputs) {
      structuralRootCauses.push(
        ...traceRootCausesFromInput(structuralInput, context, visitedInputKeys),
      );
    }

    if (structuralRootCauses.length > 0) {
      rootCauses.push(...structuralRootCauses);
      continue;
    }

    const upstreamDeficientInputs = context.deficientInputsByNode.get(contribution.nodeId) ?? [];
    if (contribution.directDeficiency > 1e-6 && upstreamDeficientInputs.length > 0) {
      for (const upstreamInput of upstreamDeficientInputs) {
        rootCauses.push(...traceRootCausesFromInput(upstreamInput, context, visitedInputKeys));
      }
      continue;
    }
  }

  if (rootCauses.length === 0) {
    rootCauses.push(createUnresolvedRootCause(input, 'unknown'));
  }

  visitedInputKeys.delete(inputKey);
  const mergedRootCauses = mergeRootCauses(rootCauses);
  context.rootCauseCache.set(inputKey, mergedRootCauses);
  return mergedRootCauses;
}

function getConnectedRequiredInputsForNode(
  nodeId: string,
  context: RatioRootCauseTraceContext,
  inheritedDeficiency: number,
): RatioDeficientInputDiagnostic[] {
  const node = context.nodeById.get(nodeId);
  if (!node) return [];

  const structuralInputs: RatioDeficientInputDiagnostic[] = [];
  for (let inputIndex = 0; inputIndex < node.inputs.length; inputIndex++) {
    const input = node.inputs[inputIndex];
    if (!input || input.isSink || input.quantity <= 1e-8) continue;

    const existingInput = context.deficientInputsByNode
      .get(nodeId)
      ?.find((candidate) => candidate.inputIndex === inputIndex);
    if (existingInput) {
      structuralInputs.push(existingInput);
      continue;
    }

    const inputConnections = context.incomingByInput.get(`${nodeId}::${inputIndex}`) ?? [];
    if (inputConnections.length === 0) continue;

    const upstreamContributions = inputConnections.map((connection) => {
      const sourceNode = context.nodeById.get(connection.sourceNodeId);
      const sourceOutput = sourceNode?.outputs[connection.sourceOutputIndex];
      const unitOutputRate = sourceOutput?.quantity ?? 0;

      return {
        edgeId: connection.id,
        nodeId: connection.sourceNodeId,
        outputIndex: connection.sourceOutputIndex,
        productId: sourceOutput?.productId ?? 'unknown',
        productMatches: !sourceOutput || sourceOutput.productId === input.productId,
        unitOutputRate,
        suppliedRate: 0,
        outputRate: 0,
        totalOutgoingRate: 0,
        directDeficiency: getNodeDeficiency(connection.sourceNodeId, context),
      };
    });

    structuralInputs.push({
      nodeId,
      inputIndex,
      productId: input.productId,
      deficiency: inheritedDeficiency,
      requiredRate: 0,
      suppliedRate: 0,
      upstreamNodeIds: [
        ...new Set(upstreamContributions.map((contribution) => contribution.nodeId)),
      ],
      causeNodeIds: [],
      causeKind: 'unknown',
      upstreamContributions,
    });
  }

  return structuralInputs;
}

function getNodeDeficiency(nodeId: string, context: RatioRootCauseTraceContext): number {
  const deficientInputs = context.deficientInputsByNode.get(nodeId) ?? [];
  let total = 0;
  for (const input of deficientInputs) {
    total += input.deficiency;
  }
  return total;
}

function getSummaryRootCauses(
  deficientInputs: RatioDeficientInputDiagnostic[],
  cycleComponents: RatioCycleComponent[],
  context: RatioRootCauseTraceContext,
): RatioRootCauseDiagnostic[] {
  const summaryInputs = deficientInputs.filter(
    (input) =>
      !input.upstreamContributions.some((contribution) => contribution.directDeficiency > 1e-6),
  );

  if (summaryInputs.length === 0) {
    for (const component of cycleComponents) {
      const boundaryInput = deficientInputs.find(
        (input) =>
          component.boundaryNodeIds.includes(input.nodeId) && component.nodeIdSet.has(input.nodeId),
      );
      if (boundaryInput) summaryInputs.push(boundaryInput);
    }
  }

  if (summaryInputs.length === 0 && deficientInputs.length > 0) {
    summaryInputs.push(deficientInputs[0]);
  }

  const rootCauses: RatioRootCauseDiagnostic[] = [];
  for (const input of summaryInputs) {
    rootCauses.push(...traceRootCausesFromInput(input, context, new Set()));
  }

  return selectRootCausesForDisplay(mergeRootCauses(rootCauses));
}

function createContributionRootCause(
  input: RatioDeficientInputDiagnostic,
  contribution: RatioUpstreamContributionDiagnostic,
): RatioRootCauseDiagnostic {
  return {
    nodeId: contribution.nodeId,
    outputIndex: contribution.outputIndex,
    productId: contribution.productId,
    kind: getContributionRootCauseKind(contribution),
    deficiency: input.deficiency,
    requiredRate: input.requiredRate,
    suppliedRate: contribution.suppliedRate,
    unitOutputRate: contribution.unitOutputRate,
    outputRate: contribution.outputRate,
    blockedInputNodeId: input.nodeId,
    blockedInputIndex: input.inputIndex,
    cycleNodeIds: [],
    boundaryNodeIds: [],
  };
}

function createCycleRootCause(
  input: RatioDeficientInputDiagnostic,
  component: RatioCycleComponent,
): RatioRootCauseDiagnostic {
  return {
    nodeId: component.boundaryNodeIds[0] ?? input.nodeId,
    outputIndex: null,
    productId: input.productId,
    kind: 'feedback_loop',
    deficiency: input.deficiency,
    requiredRate: input.requiredRate,
    suppliedRate: input.suppliedRate,
    unitOutputRate: 0,
    outputRate: 0,
    blockedInputNodeId: input.nodeId,
    blockedInputIndex: input.inputIndex,
    cycleNodeIds: component.nodeIds,
    boundaryNodeIds: component.boundaryNodeIds,
  };
}

function createUnresolvedRootCause(
  input: RatioDeficientInputDiagnostic,
  kind: RatioDeficiencyCauseKind,
): RatioRootCauseDiagnostic {
  return {
    nodeId: input.nodeId,
    outputIndex: null,
    productId: input.productId,
    kind,
    deficiency: input.deficiency,
    requiredRate: input.requiredRate,
    suppliedRate: input.suppliedRate,
    unitOutputRate: 0,
    outputRate: 0,
    blockedInputNodeId: input.nodeId,
    blockedInputIndex: input.inputIndex,
    cycleNodeIds: [],
    boundaryNodeIds: [],
  };
}

function getContributionRootCauseKind(
  contribution: RatioUpstreamContributionDiagnostic,
): RatioDeficiencyCauseKind {
  if (!contribution.productMatches) {
    return 'product_mismatch';
  }

  if (contribution.unitOutputRate <= 1e-8) {
    return 'upstream_not_producing';
  }

  return 'upstream_output_limited';
}

function summarizeRootCauseKind(rootCauses: RatioRootCauseDiagnostic[]): RatioDeficiencyCauseKind {
  const priority: RatioDeficiencyCauseKind[] = [
    'feedback_loop',
    'product_mismatch',
    'upstream_not_producing',
    'upstream_input_deficient',
    'upstream_output_limited',
    'unknown',
  ];

  for (const kind of priority) {
    if (rootCauses.some((cause) => cause.kind === kind)) {
      return kind;
    }
  }

  return 'unknown';
}

function getRootCauseNodeIds(rootCauses: RatioRootCauseDiagnostic[]): string[] {
  return [...new Set(rootCauses.map((cause) => cause.nodeId))].sort((a, b) => a.localeCompare(b));
}

function mergeRootCauses(rootCauses: RatioRootCauseDiagnostic[]): RatioRootCauseDiagnostic[] {
  const mergedByKey = new Map<string, RatioRootCauseDiagnostic>();

  for (const cause of rootCauses) {
    const key = [
      cause.kind,
      cause.nodeId,
      cause.outputIndex ?? 'input',
      cause.productId,
      cause.cycleNodeIds.join(','),
      cause.boundaryNodeIds.join(','),
    ].join('::');
    const existing = mergedByKey.get(key);
    if (!existing) {
      mergedByKey.set(key, { ...cause });
      continue;
    }

    existing.deficiency += cause.deficiency;
    existing.requiredRate += cause.requiredRate;
    existing.suppliedRate += cause.suppliedRate;
    existing.outputRate = Math.max(existing.outputRate, cause.outputRate);
  }

  return [...mergedByKey.values()].sort((a, b) => {
    const priorityDelta = getRootCausePriority(a.kind) - getRootCausePriority(b.kind);
    if (priorityDelta !== 0) return priorityDelta;
    const deficiencyDelta = b.deficiency - a.deficiency;
    if (Math.abs(deficiencyDelta) > 1e-9) return deficiencyDelta;
    return a.nodeId.localeCompare(b.nodeId);
  });
}

function selectRootCausesForDisplay(
  rootCauses: RatioRootCauseDiagnostic[],
): RatioRootCauseDiagnostic[] {
  const zeroOutputCauses = rootCauses.filter((cause) => cause.kind === 'upstream_not_producing');
  if (zeroOutputCauses.length > 0) return zeroOutputCauses;

  const loopCauses = rootCauses.filter((cause) => cause.kind === 'feedback_loop');
  if (loopCauses.length > 0) return loopCauses;

  return rootCauses;
}

function getRootCausePriority(kind: RatioDeficiencyCauseKind): number {
  switch (kind) {
    case 'upstream_not_producing':
      return 0;
    case 'feedback_loop':
      return 1;
    case 'product_mismatch':
      return 2;
    case 'upstream_input_deficient':
      return 3;
    case 'upstream_output_limited':
      return 4;
    case 'unknown':
    default:
      return 5;
  }
}

function getRawFlowValue(rawValues: Record<string, number>, edgeId: string): number {
  const value = rawValues[`f_${edgeId}`] ?? 0;
  if (!Number.isFinite(value) || Math.abs(value) < 1e-8) return 0;
  return value;
}

function classifyDeficiencyCause(
  nodeId: string,
  upstreamContributions: RatioUpstreamContributionDiagnostic[],
  cycleNodeIds: Set<string>,
): RatioDeficiencyCauseKind {
  if (
    cycleNodeIds.has(nodeId) ||
    upstreamContributions.some((contribution) => cycleNodeIds.has(contribution.nodeId))
  ) {
    return 'feedback_loop';
  }

  if (upstreamContributions.length === 0) {
    return 'unknown';
  }

  if (upstreamContributions.some((contribution) => !contribution.productMatches)) {
    return 'product_mismatch';
  }

  if (upstreamContributions.some((contribution) => contribution.directDeficiency > 1e-6)) {
    return 'upstream_input_deficient';
  }

  if (upstreamContributions.every((contribution) => contribution.unitOutputRate <= 1e-8)) {
    return 'upstream_not_producing';
  }

  return 'upstream_output_limited';
}

function getCauseNodeIds(
  nodeId: string,
  upstreamContributions: RatioUpstreamContributionDiagnostic[],
  deficientNodeIds: Set<string>,
): string[] {
  if (upstreamContributions.length === 0) {
    return [nodeId];
  }

  const causeNodeIds = new Set<string>();
  for (const contribution of upstreamContributions) {
    if (!deficientNodeIds.has(contribution.nodeId)) {
      causeNodeIds.add(contribution.nodeId);
    }
  }

  if (causeNodeIds.size === 0) {
    for (const contribution of upstreamContributions) {
      causeNodeIds.add(contribution.nodeId);
    }
  }

  return [...causeNodeIds].sort((a, b) => a.localeCompare(b));
}

function getLikelyRootNodeIds(
  deficientInputs: RatioDeficientInputDiagnostic[],
  deficientNodeIds: Set<string>,
  deficiencyByNode: Map<string, number>,
  deficientUpstream: Map<string, Set<string>>,
): string[] {
  const likelyRootNodeIds = new Set<string>();

  for (const input of deficientInputs) {
    if ((deficientUpstream.get(input.nodeId)?.size ?? 0) > 0) continue;
    for (const causeNodeId of input.causeNodeIds) {
      likelyRootNodeIds.add(causeNodeId);
    }
  }

  if (likelyRootNodeIds.size === 0) {
    for (const nodeId of deficientNodeIds) {
      if ((deficientUpstream.get(nodeId)?.size ?? 0) === 0) {
        likelyRootNodeIds.add(nodeId);
      }
    }
  }

  return [...likelyRootNodeIds].sort((a, b) => {
    const deficiencyDelta = (deficiencyByNode.get(b) ?? 0) - (deficiencyByNode.get(a) ?? 0);
    if (Math.abs(deficiencyDelta) > 1e-9) return deficiencyDelta;
    return a.localeCompare(b);
  });
}

function parseDeficitVarName(name: string): { nodeId: string; inputIndex: number } | null {
  if (!name.startsWith('deficit_')) return null;
  const lastUnderscore = name.lastIndexOf('_');
  if (lastUnderscore <= 'deficit_'.length) return null;

  const inputIndex = Number.parseInt(name.slice(lastUnderscore + 1), 10);
  if (!Number.isFinite(inputIndex)) return null;

  const nodeId = name.slice('deficit_'.length, lastUnderscore);
  if (!nodeId) return null;

  return { nodeId, inputIndex };
}

function findCycleComponents(graph: Map<string, Set<string>>): RatioCycleComponent[] {
  const indexMap = new Map<string, number>();
  const lowLinkMap = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycleComponents: RatioCycleComponent[] = [];
  let index = 0;

  const strongConnect = (nodeId: string): void => {
    indexMap.set(nodeId, index);
    lowLinkMap.set(nodeId, index);
    index += 1;

    stack.push(nodeId);
    onStack.add(nodeId);

    const neighbors = graph.get(nodeId);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!indexMap.has(neighbor)) {
          strongConnect(neighbor);
          const lowLinkNode = lowLinkMap.get(nodeId) ?? 0;
          const lowLinkNeighbor = lowLinkMap.get(neighbor) ?? 0;
          lowLinkMap.set(nodeId, Math.min(lowLinkNode, lowLinkNeighbor));
        } else if (onStack.has(neighbor)) {
          const lowLinkNode = lowLinkMap.get(nodeId) ?? 0;
          const neighborIndex = indexMap.get(neighbor) ?? 0;
          lowLinkMap.set(nodeId, Math.min(lowLinkNode, neighborIndex));
        }
      }
    }

    const nodeIndex = indexMap.get(nodeId);
    const nodeLowLink = lowLinkMap.get(nodeId);
    if (nodeIndex === undefined || nodeLowLink === undefined || nodeLowLink !== nodeIndex) return;

    const component: string[] = [];
    let popped: string | undefined;
    do {
      popped = stack.pop();
      if (!popped) break;
      onStack.delete(popped);
      component.push(popped);
    } while (popped !== nodeId);

    if (component.length > 1) {
      const nodeIds = component.sort((a, b) => a.localeCompare(b));
      cycleComponents.push({
        nodeIds,
        nodeIdSet: new Set(nodeIds),
        boundaryNodeIds: [],
      });
      return;
    }

    const single = component[0];
    if (!single) return;
    if (graph.get(single)?.has(single)) {
      cycleComponents.push({
        nodeIds: [single],
        nodeIdSet: new Set([single]),
        boundaryNodeIds: [],
      });
    }
  };

  for (const nodeId of graph.keys()) {
    if (!indexMap.has(nodeId)) {
      strongConnect(nodeId);
    }
  }

  return cycleComponents.sort((a, b) => a.nodeIds.join(',').localeCompare(b.nodeIds.join(',')));
}
