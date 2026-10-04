import type { Edge } from '@xyflow/react';
import { getProduct, getRecipe, resolveActiveRecipe } from '../data/lookup';
import { getSpecialRecipe } from '../data/registry';
import type { Recipe } from '../types/data';
import { isRecipeNode, type CanvasNode, type RecipeNodeType } from '../types/nodes';
import type { AutocompleteTemperatureRange, SpecialRecipe } from '../types/specialRecipes';
import { buildHandleId, nextEdgeId, nextNodeId, parseHandleId } from '../utils/idGenerator';
import { resolveOptimizationSettings } from '../utils/optimizationMetrics';
import {
  areNearlyEqual,
  areRatesEquivalent,
  isMachineCountNumericallyZero,
  isPositiveSolverFlow,
  normalizeSolverRate,
} from '../utils/precision';
import { getRateMultiplier } from '../utils/recipeComputation';
import { hasRecipePowerOutput } from '../utils/recipePower';
import {
  getAvailableAutomationRecipes,
  isRecipeAvailableForAutomation,
} from '../utils/recipeAvailability';
import { constrainMachineCount } from '../utils/machineCountConstraint';
import { useGlobalSettingsStore, type GlobalSettings } from '../stores/useGlobalSettingsStore';
import { solveFlowPipeline } from './solverPipeline';
import {
  buildRatioOptimizerPayload,
  cancelRatioOptimizer,
  solveRatios,
  type RatioFailureDiagnostics,
  type RatioOptimizerConnection,
  type RatioOptimizerModelSnapshot,
  type RatioOptimizerNode,
  type RatioSolverProgress,
  type RatioSolverTelemetry,
} from './ratioOptimizer';
import type { OptimizationConfiguration } from './optimizationConfig';

const PLACEHOLDER_PRODUCTS = new Set(['any_fluid', 'any_item']);
const AUTOCOMPLETE_TEMPERATURE_RANGE_TOLERANCE = 1e-6;
const RECIPE_TEMPERATURE_EPSILON = 0.01;
const AUTOCOMPLETE_OUTPUT_NOISE_RELATIVE_TOLERANCE = 1e-7;
const MAX_COUPLED_SOLVES = 12;
const MAX_FALLBACK_EXPANSIONS = 2;
const MAX_AUTOCOMPLETE_CYCLE_BRANCH_SOLVES = 32;
const FALLBACK_RECIPE_IDS = {
  Item: 'r_item_spawner_01',
  Fluid: 'r_fluid_spawner_01',
} as const;

type CandidateKind = 'existing' | 'generated' | 'fallback';

interface RecipeDescriptor {
  key: string;
  recipeId: string;
  settings: Record<string, unknown>;
  recipe: Recipe;
}

interface RecipeDescriptorSource {
  recipeId: string;
  baseRecipe: Recipe;
  specialRecipe?: SpecialRecipe;
}

interface RecipeDescriptorCatalog {
  sources: RecipeDescriptorSource[];
  sourcesByOutput: Map<string, RecipeDescriptorSource[]>;
  getDescriptors: (source: RecipeDescriptorSource, outputProduct?: string) => RecipeDescriptor[];
}

interface AutocompleteCandidate {
  kind: CandidateKind;
  key: string;
  node: RecipeNodeType;
  recipe: Recipe;
  minimumMachineCount?: number;
  autocompleteBaseSettings?: Record<string, unknown>;
  autocompleteSizingResolved?: boolean;
  inputTemperatures?: Record<number, number>;
}

interface AutocompleteModel {
  candidates: AutocompleteCandidate[];
  edges: Edge[];
  descriptorCatalog: RecipeDescriptorCatalog;
  initialTemperatureConverged: boolean;
  protectedOutputHandles: Set<string>;
  fallbackKeys: Set<string>;
  preservedEdgeEndpointKeys: Set<string>;
  warnings: string[];
}

interface AutocompleteCycleSolution {
  pass: number;
  model: AutocompleteModel;
  resolvedSettingsByCandidate: Record<string, Record<string, unknown>>;
  activeIncomingEndpoints: Record<string, string[]>;
  machineCounts: Record<string, number>;
  connectionFlows: Record<string, number>;
  telemetry?: RatioSolverTelemetry;
}

interface AutocompleteCycleBranch {
  solution: AutocompleteCycleSolution;
  inputRoutes: Record<string, string[]>;
}

interface AutocompleteVerificationDeficit {
  nodeId: string;
  inputIndex: number;
  productId: string;
  requiredRate: number;
  suppliedRate: number;
  deficit: number;
}

interface AutocompletePlanFailure {
  error: string;
  deficientInputs?: AutocompleteVerificationDeficit[];
}

interface AutocompleteCycleRecoveryResult {
  recovered?: {
    solution: {
      pass: number;
      attempt: number;
      telemetry?: RatioSolverTelemetry;
    };
    plan: AutocompletePlan;
  };
  attempts: AutocompleteCycleRecoveryAttempt[];
  cancelled: boolean;
}

export interface AutocompleteCycleRecoveryAttempt {
  pass: number;
  attempt: number;
  constrainedInputCount: number;
  fixedRecipeSettings: Record<string, Record<string, unknown>>;
  fixedInputRoutes: Record<string, string[]>;
  solverStatus?: string;
  objectiveStages?: Array<{ name: string; objectiveValue: number }>;
  error: string;
  deficientInputs?: AutocompleteVerificationDeficit[];
  verified?: boolean;
  selected?: boolean;
}

interface VerifiedAutocompleteCycleSolution<TSolution, TValue> {
  solution: TSolution;
  value: TValue;
}

export interface AutocompletePlan {
  nodes: CanvasNode[];
  edges: Edge[];
  addedNodeIds: string[];
  machineCounts: Record<string, number>;
  objectiveNodes: RatioOptimizerNode[];
  objectiveConnections: RatioOptimizerConnection[];
  objectiveConnectionFlows: Record<string, number>;
  warnings: string[];
}

export interface AutocompletePassDebugInfo {
  pass: number;
  modelStateFingerprint?: string;
  ordinarySampleLimit: number;
  solverStatus?: string;
  objectiveStages: Array<{ name: string; objectiveValue: number }>;
  candidateCount: number;
  selectedCandidateCount: number;
  activeEdgeCount: number;
  machineCountChangeCount: number;
  machineCountChanges: Array<{
    nodeId: string;
    recipeId: string;
    specialRecipe: boolean;
    previous: number;
    next: number;
  }>;
  connectionFlowComparison: 'baseline' | 'compared';
  connectionFlowChangeCount: number;
  connectionFlowChanges: Array<{
    edgeId: string;
    sourceRecipeId?: string;
    sourceProductId?: string;
    targetRecipeId?: string;
    targetProductId?: string;
    previous: number;
    next: number;
    delta: number;
  }>;
  sizeSettingChangeCount: number;
  sizeSettingChanges: Array<{
    nodeId: string;
    recipeId: string;
    requiredOutputRates: number[];
    previous: Record<string, unknown>;
    next: Record<string, unknown>;
  }>;
  resolvedRecipeChangeCount: number;
  resolvedRecipeChanges: Array<{
    nodeId: string;
    recipeId: string;
    specialRecipe: boolean;
    fields: string[];
  }>;
  removedCandidateCount: number;
  removedCandidateIds: string[];
  addedEdgeEndpointCount: number;
  addedEdgeEndpoints: string[];
  removedEdgeEndpointCount: number;
  removedEdgeEndpoints: string[];
  temperatureConverged: boolean;
  temperaturePropagationIterations?: number;
  changed: boolean;
}

export interface AutocompleteCoupledStateCycle {
  firstSeenPass: number;
  repeatedPass: number;
  period: number;
  stateFingerprint: string;
  candidateCount: number;
  edgeCount: number;
}

export interface AutocompleteResult {
  feasible: boolean;
  error?: string;
  diagnostics?: RatioFailureDiagnostics;
  telemetry?: RatioSolverTelemetry;
  debugTrace?: AutocompletePassDebugInfo[];
  debugCycle?: AutocompleteCoupledStateCycle;
  cycleRecoveryAttempts?: AutocompleteCycleRecoveryAttempt[];
  plan?: AutocompletePlan;
}

export interface AutocompleteSession {
  promise: Promise<AutocompleteResult>;
}

export interface AutocompleteOptions {
  configuration: OptimizationConfiguration;
  onProgress?: (progress: RatioSolverProgress) => void;
}

let activeAutocompleteRun = 0;

export function selectBestVerifiedAutocompleteCycleSolution<
  TSolution extends { pass: number; attempt?: number; telemetry?: RatioSolverTelemetry },
  TValue,
>(
  solutions: TSolution[],
  verify: (solution: TSolution) => TValue | undefined,
): VerifiedAutocompleteCycleSolution<TSolution, TValue> | undefined {
  const rankedSolutions = [...solutions].sort(compareCycleSolutionRank);

  for (const solution of rankedSolutions) {
    const value = verify(solution);
    if (value !== undefined) return { solution, value };
  }

  return undefined;
}

function compareCycleSolutionRank(
  left: { pass: number; attempt?: number; telemetry?: RatioSolverTelemetry },
  right: { pass: number; attempt?: number; telemetry?: RatioSolverTelemetry },
): number {
  const leftStages = left.telemetry?.stageTelemetry ?? [];
  const rightStages = right.telemetry?.stageTelemetry ?? [];
  const sharedStageCount = Math.min(leftStages.length, rightStages.length);

  for (let index = 0; index < sharedStageCount; index += 1) {
    const leftStage = leftStages[index];
    const rightStage = rightStages[index];
    if (!areNearlyEqual(leftStage.objectiveValue, rightStage.objectiveValue)) {
      return leftStage.objectiveValue - rightStage.objectiveValue;
    }
  }

  if (leftStages.length !== rightStages.length) return rightStages.length - leftStages.length;
  return left.pass - right.pass || (left.attempt ?? 0) - (right.attempt ?? 0);
}

function snapshotAutocompleteModel(model: AutocompleteModel): AutocompleteModel {
  return {
    ...model,
    candidates: model.candidates.map((candidate) => ({
      ...candidate,
      node: {
        ...candidate.node,
        position: { ...candidate.node.position },
        data: {
          ...candidate.node.data,
          settings: candidate.node.data.settings
            ? structuredClone(candidate.node.data.settings)
            : undefined,
          inputOrder: candidate.node.data.inputOrder
            ? [...candidate.node.data.inputOrder]
            : undefined,
          outputOrder: candidate.node.data.outputOrder
            ? [...candidate.node.data.outputOrder]
            : undefined,
        },
      },
      recipe: {
        ...candidate.recipe,
        inputs: candidate.recipe.inputs.map((input) => ({ ...input })),
        outputs: candidate.recipe.outputs.map((output) => ({ ...output })),
      },
      autocompleteBaseSettings: candidate.autocompleteBaseSettings
        ? structuredClone(candidate.autocompleteBaseSettings)
        : undefined,
      inputTemperatures: candidate.inputTemperatures
        ? { ...candidate.inputTemperatures }
        : undefined,
    })),
    edges: model.edges.map((edge) => ({ ...edge })),
    protectedOutputHandles: new Set(model.protectedOutputHandles),
    fallbackKeys: new Set(model.fallbackKeys),
    preservedEdgeEndpointKeys: new Set(model.preservedEdgeEndpointKeys),
    warnings: [...model.warnings],
  };
}

function stableSettingsKey(settings: Record<string, unknown>): string {
  return JSON.stringify(
    Object.entries(settings)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, value]),
  );
}

function getCoupledModelSignature(model: AutocompleteModel): string {
  const candidates = [...model.candidates]
    .sort((left, right) => left.node.id.localeCompare(right.node.id))
    .map((candidate) => ({
      id: candidate.node.id,
      recipeId: candidate.node.data.recipeId,
      settings: stableSettingsKey(candidate.node.data.settings ?? {}),
      recipe: candidate.recipe,
    }));
  const edges = model.edges.map(edgeEndpointKey).sort();
  return JSON.stringify({ candidates, edges });
}

function getActiveIncomingEndpoints(
  model: AutocompleteModel,
  connectionFlows: Record<string, number>,
): Record<string, string[]> {
  const endpointsByInput: Record<string, Set<string>> = {};
  for (const edge of model.edges) {
    if (!edge.targetHandle || !isAutocompleteEdgeActive(connectionFlows[edge.id])) continue;
    (endpointsByInput[edge.targetHandle] ??= new Set()).add(edgeEndpointKey(edge));
  }
  return Object.fromEntries(
    Object.entries(endpointsByInput).map(([inputHandle, endpoints]) => [
      inputHandle,
      [...endpoints].sort(),
    ]),
  );
}

function getCycleChangingInputHandles(solutions: AutocompleteCycleSolution[]): string[] {
  const allInputHandles = new Set(
    solutions.flatMap((solution) => Object.keys(solution.activeIncomingEndpoints)),
  );
  return [...allInputHandles]
    .filter((inputHandle) => {
      const routeSets = new Set(
        solutions.map((solution) =>
          JSON.stringify(solution.activeIncomingEndpoints[inputHandle] ?? []),
        ),
      );
      return routeSets.size > 1;
    })
    .sort();
}

function getCycleBranchKey(branch: AutocompleteCycleBranch): string {
  return `${branch.solution.pass}:${JSON.stringify(
    Object.entries(branch.inputRoutes).sort(([left], [right]) => left.localeCompare(right)),
  )}`;
}

function buildCycleBranchModel(
  branch: AutocompleteCycleBranch,
  cycleSolutions: AutocompleteCycleSolution[],
): AutocompleteModel {
  const model = snapshotAutocompleteModel(branch.solution.model);
  for (const candidate of model.candidates) {
    const frozenSettings = branch.solution.resolvedSettingsByCandidate[candidate.node.id];
    if (frozenSettings) {
      candidate.node = {
        ...candidate.node,
        data: { ...candidate.node.data, settings: structuredClone(frozenSettings) },
      };
    }
  }

  applyCycleBranchRouteConstraints(model, branch.inputRoutes, cycleSolutions);
  return model;
}

function applyCycleBranchRouteConstraints(
  model: AutocompleteModel,
  inputRoutes: Record<string, string[]>,
  cycleSolutions: AutocompleteCycleSolution[],
): void {
  const requestedEndpoints = new Set(Object.values(inputRoutes).flat());
  const edgesByEndpoint = new Map(model.edges.map((edge) => [edgeEndpointKey(edge), edge]));
  for (const solution of cycleSolutions) {
    for (const edge of solution.model.edges) {
      const endpoint = edgeEndpointKey(edge);
      if (requestedEndpoints.has(endpoint) && !edgesByEndpoint.has(endpoint)) {
        edgesByEndpoint.set(endpoint, { ...edge });
      }
    }
  }

  const candidateIds = new Set(model.candidates.map((candidate) => candidate.node.id));
  model.edges = [...edgesByEndpoint.values()].filter((edge) => {
    if (!candidateIds.has(edge.source) || !candidateIds.has(edge.target)) return false;
    const inputHandle = edge.targetHandle;
    const selectedEndpoints = inputHandle ? inputRoutes[inputHandle] : undefined;
    if (!selectedEndpoints) return true;
    const endpoint = edgeEndpointKey(edge);
    return (
      model.preservedEdgeEndpointKeys.has(endpoint) || selectedEndpoints.includes(endpoint)
    );
  });
}

function getCoupledStateFingerprint(signature: string): string {
  let hash = 2166136261;
  for (let index = 0; index < signature.length; index += 1) {
    hash ^= signature.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function candidateKey(recipeId: string, settings: Record<string, unknown>): string {
  return `${recipeId}::${stableSettingsKey(settings)}`;
}

function edgeEndpointKey(edge: Pick<Edge, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>) {
  return `${edge.sourceHandle ?? edge.source}::${edge.targetHandle ?? edge.target}`;
}

function isTemperatureInRange(
  temperature: number,
  range: AutocompleteTemperatureRange | null,
): boolean {
  if (!range) return true;
  if (range.min !== undefined && temperature < range.min - AUTOCOMPLETE_TEMPERATURE_RANGE_TOLERANCE)
    return false;
  if (range.max !== undefined && temperature > range.max + AUTOCOMPLETE_TEMPERATURE_RANGE_TOLERANCE)
    return false;
  return true;
}

function areRecipeRatesEquivalent(previous: number, next: number): boolean {
  return areRatesEquivalent(previous, next);
}

function hasActiveCandidateFlow(
  candidate: AutocompleteCandidate,
  edges: Edge[],
  connectionFlows: Record<string, number>,
): boolean {
  return edges.some(
    (edge) =>
      (edge.source === candidate.node.id || edge.target === candidate.node.id) &&
      isAutocompleteEdgeActive(connectionFlows[edge.id]),
  );
}

function hasIndependentSolverRate(candidate: AutocompleteCandidate): boolean {
  const multiplier = getRateMultiplier(candidate.recipe.cycle_time, 'second');
  return [...candidate.recipe.inputs, ...candidate.recipe.outputs].some(
    (port) =>
      port.independentOfMachineCount === true && isPositiveSolverFlow(port.quantity * multiplier),
  );
}

export function isAutocompleteEdgeActive(flow: number | undefined): boolean {
  return isPositiveSolverFlow(flow);
}

export function isAutocompleteCandidateActive(
  isTarget: boolean | undefined,
  machineCount: number,
  hasActiveFlow: boolean,
  hasIndependentRate: boolean,
): boolean {
  return (
    isTarget === true ||
    !isMachineCountNumericallyZero(machineCount) ||
    hasActiveFlow ||
    hasIndependentRate
  );
}

function isCandidateSolverActive(
  candidate: AutocompleteCandidate,
  edges: Edge[],
  machineCount: number,
  connectionFlows: Record<string, number>,
): boolean {
  return isAutocompleteCandidateActive(
    candidate.node.data.isTarget,
    machineCount,
    hasActiveCandidateFlow(candidate, edges, connectionFlows),
    hasIndependentSolverRate(candidate),
  );
}

interface AutocompleteOutputNoiseProfile {
  targetMachineScale: number;
  targetRateByProduct: Map<string, number>;
}

function getPortRate(
  recipe: Recipe,
  port: Recipe['inputs'][number] | Recipe['outputs'][number],
  machineCount: number,
): number {
  const multiplier = getRateMultiplier(recipe.cycle_time, 'second');
  const scale = port.independentOfMachineCount ? 1 : Math.max(0, machineCount);
  return normalizeSolverRate(Math.max(0, port.quantity) * multiplier * scale);
}

function buildOutputNoiseProfile(model: AutocompleteModel): AutocompleteOutputNoiseProfile {
  const targetRateByProduct = new Map<string, number>();
  let targetMachineScale = 0;
  for (const candidate of model.candidates) {
    if (!candidate.node.data.isTarget) continue;
    const machineCount = Math.max(0, candidate.node.data.machineCount ?? 0);
    targetMachineScale = Math.max(targetMachineScale, machineCount);
    for (const port of [...candidate.recipe.inputs, ...candidate.recipe.outputs]) {
      if (PLACEHOLDER_PRODUCTS.has(port.product_id) || port.quantity <= 0) continue;
      const rate = getPortRate(candidate.recipe, port, machineCount);
      targetRateByProduct.set(
        port.product_id,
        Math.max(targetRateByProduct.get(port.product_id) ?? 0, rate),
      );
    }
  }
  return { targetMachineScale, targetRateByProduct };
}

function getAutocompleteOutputNoiseMachineTolerance(
  profile: AutocompleteOutputNoiseProfile,
): number {
  return Math.max(1e-12, profile.targetMachineScale * AUTOCOMPLETE_OUTPUT_NOISE_RELATIVE_TOLERANCE);
}

function getAutocompleteOutputNoiseRateTolerance(
  profile: AutocompleteOutputNoiseProfile,
  productId: string,
): number {
  const targetRate = profile.targetRateByProduct.get(productId) ?? 0;
  return Math.max(1e-12, targetRate * AUTOCOMPLETE_OUTPUT_NOISE_RELATIVE_TOLERANCE);
}

function hasPreservedCandidateEdge(model: AutocompleteModel, candidateId: string): boolean {
  return model.edges.some(
    (edge) =>
      (edge.source === candidateId || edge.target === candidateId) &&
      model.preservedEdgeEndpointKeys.has(edgeEndpointKey(edge)),
  );
}

export function getGeneratedOutputNoiseIds(
  model: AutocompleteModel,
  machineCounts: Record<string, number>,
  connectionFlows: Record<string, number>,
): Set<string> {
  const profile = buildOutputNoiseProfile(model);
  const machineTolerance = getAutocompleteOutputNoiseMachineTolerance(profile);
  const noiseIds = new Set<string>();

  for (const candidate of model.candidates) {
    if (candidate.kind !== 'generated' || candidate.node.data.isTarget) continue;
    const machineCount = Math.max(0, machineCounts[candidate.node.id] ?? 0);
    if (machineCount > machineTolerance || hasIndependentSolverRate(candidate)) continue;
    if (hasPreservedCandidateEdge(model, candidate.node.id)) continue;

    const activeEdges = model.edges.filter(
      (edge) =>
        (edge.source === candidate.node.id || edge.target === candidate.node.id) &&
        isAutocompleteEdgeActive(connectionFlows[edge.id]),
    );
    const hasMeaningfulFlow = activeEdges.some((edge) => {
      const port =
        edge.source === candidate.node.id
          ? candidate.recipe.outputs[parseHandleId(edge.sourceHandle ?? '')?.index ?? -1]
          : candidate.recipe.inputs[parseHandleId(edge.targetHandle ?? '')?.index ?? -1];
      const productId = port?.product_id;
      if (!productId) return true;
      return (
        normalizeSolverRate(connectionFlows[edge.id] ?? 0) >
        getAutocompleteOutputNoiseRateTolerance(profile, productId)
      );
    });
    if (!hasMeaningfulFlow) noiseIds.add(candidate.node.id);
  }
  return noiseIds;
}

function getGeneratedOutputNoiseEdgeIds(
  model: AutocompleteModel,
  connectionFlows: Record<string, number>,
): Set<string> {
  const profile = buildOutputNoiseProfile(model);
  const noiseIds = new Set<string>();
  for (const edge of model.edges) {
    if (model.preservedEdgeEndpointKeys.has(edgeEndpointKey(edge))) continue;
    const source = model.candidates.find((candidate) => candidate.node.id === edge.source);
    const target = model.candidates.find((candidate) => candidate.node.id === edge.target);
    if (!source || !target || (source.kind !== 'generated' && target.kind !== 'generated')) {
      continue;
    }
    const flow = normalizeSolverRate(connectionFlows[edge.id] ?? 0);
    if (!isAutocompleteEdgeActive(flow)) continue;
    const targetPort = target.recipe.inputs[parseHandleId(edge.targetHandle ?? '')?.index ?? -1];
    const tolerance = getAutocompleteOutputNoiseRateTolerance(
      profile,
      targetPort?.product_id ?? '',
    );
    if (flow <= tolerance) noiseIds.add(edge.id);
  }
  return noiseIds;
}

function getInputTemperatureRange(
  recipeId: string,
  settings: Record<string, unknown>,
  inputIndex: number,
  productId: string,
): AutocompleteTemperatureRange | null {
  return (
    getSpecialRecipe(recipeId)?.getAutocompleteInputTemperatureRange?.(
      settings,
      inputIndex,
      productId,
    ) ?? null
  );
}

function createRecipeNode(
  recipe: Recipe,
  settings: Record<string, unknown>,
  machineCount: number,
  isTarget = false,
): RecipeNodeType {
  return {
    id: nextNodeId(),
    type: 'recipe',
    position: { x: 0, y: 0 },
    data: {
      recipeId: recipe.id,
      machineCount,
      inputOrder: recipe.inputs.map((_, index) => index),
      outputOrder: recipe.outputs.map((_, index) => index),
      settings,
      isTarget,
    },
  };
}

function getSelectSettingsVariants(
  specialRecipe: SpecialRecipe,
  defaults: Record<string, unknown>,
  globalSettings: GlobalSettings,
  lockedSettingKeys: Set<string> = new Set(),
): Record<string, unknown>[] {
  const context = {
    globalSettings: globalSettings as unknown as Record<string, unknown>,
  };
  let variants: Record<string, unknown>[];
  if (specialRecipe.getAutocompleteSettings) {
    variants = specialRecipe.getAutocompleteSettings(defaults, context);
  } else {
    const baseSettings = { ...defaults };
    for (const [key, definition] of Object.entries(specialRecipe.settings)) {
      if ((key === 'heat_loss' || key === 'tick_delay') && definition.type === 'number') {
        baseSettings[key] = definition.min ?? definition.default;
      }
    }

    variants = [baseSettings];
    for (const [key, definition] of Object.entries(specialRecipe.settings)) {
      if (definition.type !== 'select' || lockedSettingKeys.has(key)) continue;

      const nextVariants: Record<string, unknown>[] = [];
      for (const variant of variants) {
        const options =
          definition.getOptions?.(variant, context.globalSettings) ?? definition.options;
        for (const option of options) {
          nextVariants.push({ ...variant, [key]: option.value });
        }
      }
      variants = nextVariants;
    }
  }

  if (!specialRecipe.resolveAutocompleteSettings) return variants;
  return variants.map((settings) => specialRecipe.resolveAutocompleteSettings!(settings, context));
}

function areRecipePortsEquivalent(
  previous: Recipe['inputs'] | Recipe['outputs'],
  next: Recipe['inputs'] | Recipe['outputs'],
): boolean {
  if (previous.length !== next.length) return false;
  return previous.every((port, index) => {
    const nextPort = next[index];
    const previousPollutionPerFlow = 'pollutionPerFlow' in port ? (port.pollutionPerFlow ?? 0) : 0;
    const nextPollutionPerFlow =
      'pollutionPerFlow' in nextPort ? (nextPort.pollutionPerFlow ?? 0) : 0;
    if (
      port.product_id !== nextPort.product_id ||
      port.handle_type !== nextPort.handle_type ||
      port.product_link_id !== nextPort.product_link_id ||
      port.variable !== nextPort.variable ||
      port.independentOfMachineCount !== nextPort.independentOfMachineCount ||
      !areNearlyEqual(previousPollutionPerFlow, nextPollutionPerFlow) ||
      !areRecipeRatesEquivalent(port.quantity, nextPort.quantity)
    ) {
      return false;
    }

    const previousTemperature =
      'temperature' in port && typeof port.temperature === 'number' ? port.temperature : undefined;
    const nextTemperature =
      'temperature' in nextPort && typeof nextPort.temperature === 'number'
        ? nextPort.temperature
        : undefined;
    if (previousTemperature !== undefined && nextTemperature !== undefined) {
      return areNearlyEqual(previousTemperature, nextTemperature, RECIPE_TEMPERATURE_EPSILON, 0);
    }
    return previousTemperature === undefined && nextTemperature === undefined;
  });
}

function arePowerEffectsEquivalent(
  previous: Recipe['powerEffects'],
  next: Recipe['powerEffects'],
): boolean {
  if (previous === next) return true;
  if (!previous || !next || previous.length !== next.length) return false;
  return previous.every((effect, index) => {
    const nextEffect = next[index];
    return (
      effect.power_type === nextEffect.power_type &&
      effect.label === nextEffect.label &&
      effect.accounting === nextEffect.accounting &&
      areNearlyEqual(effect.power_use, nextEffect.power_use)
    );
  });
}

function areResolvedRecipesEquivalent(previous: Recipe, next: Recipe): boolean {
  return (
    previous.id === next.id &&
    previous.machine_id === next.machine_id &&
    previous.power_type === next.power_type &&
    previous.isSellTrash === next.isSellTrash &&
    previous.powerIndependentOfMachineCount === next.powerIndependentOfMachineCount &&
    previous.pollutionIndependentOfMachineCount === next.pollutionIndependentOfMachineCount &&
    areNearlyEqual(previous.cycle_time, next.cycle_time) &&
    areNearlyEqual(previous.power_use, next.power_use) &&
    areNearlyEqual(previous.pollution, next.pollution) &&
    areRecipePortsEquivalent(previous.inputs, next.inputs) &&
    areRecipePortsEquivalent(previous.outputs, next.outputs) &&
    arePowerEffectsEquivalent(previous.powerEffects, next.powerEffects) &&
    arePowerEffectsEquivalent(previous.powerAccountingEffects, next.powerAccountingEffects)
  );
}

function getResolvedRecipeChangeFields(previous: Recipe, next: Recipe): string[] {
  const fields: string[] = [];
  if (previous.machine_id !== next.machine_id) fields.push('machine_id');
  if (previous.power_type !== next.power_type) fields.push('power_type');
  if (previous.isSellTrash !== next.isSellTrash) fields.push('isSellTrash');
  if (previous.powerIndependentOfMachineCount !== next.powerIndependentOfMachineCount) {
    fields.push('powerIndependentOfMachineCount');
  }
  if (previous.pollutionIndependentOfMachineCount !== next.pollutionIndependentOfMachineCount) {
    fields.push('pollutionIndependentOfMachineCount');
  }
  if (!areNearlyEqual(previous.cycle_time, next.cycle_time)) fields.push('cycle_time');
  if (!areNearlyEqual(previous.power_use, next.power_use)) fields.push('power_use');
  if (!areNearlyEqual(previous.pollution, next.pollution)) fields.push('pollution');

  const comparePorts = (side: 'inputs' | 'outputs') => {
    const previousPorts = previous[side];
    const nextPorts = next[side];
    if (previousPorts.length !== nextPorts.length) {
      fields.push(`${side}.length`);
      return;
    }
    for (let index = 0; index < previousPorts.length; index += 1) {
      const left = previousPorts[index];
      const right = nextPorts[index];
      const portLabel = `${side}[${index}]`;
      if (left.product_id !== right.product_id) fields.push(`${portLabel}.product_id`);
      if (left.handle_type !== right.handle_type) fields.push(`${portLabel}.handle_type`);
      if (left.product_link_id !== right.product_link_id) {
        fields.push(`${portLabel}.product_link_id`);
      }
      if (left.variable !== right.variable) fields.push(`${portLabel}.variable`);
      if (left.independentOfMachineCount !== right.independentOfMachineCount) {
        fields.push(`${portLabel}.independentOfMachineCount`);
      }
      if (!areRecipeRatesEquivalent(left.quantity, right.quantity)) {
        fields.push(`${portLabel}.quantity`);
      }
      const leftTemperature = 'temperature' in left ? left.temperature : undefined;
      const rightTemperature = 'temperature' in right ? right.temperature : undefined;
      if (
        leftTemperature !== rightTemperature &&
        (leftTemperature === undefined ||
          rightTemperature === undefined ||
          !areNearlyEqual(leftTemperature, rightTemperature, RECIPE_TEMPERATURE_EPSILON, 0))
      ) {
        fields.push(`${portLabel}.temperature`);
      }
    }
  };
  comparePorts('inputs');
  comparePorts('outputs');
  if (!arePowerEffectsEquivalent(previous.powerEffects, next.powerEffects)) {
    fields.push('powerEffects');
  }
  if (!arePowerEffectsEquivalent(previous.powerAccountingEffects, next.powerAccountingEffects)) {
    fields.push('powerAccountingEffects');
  }
  return fields;
}

const MAX_AUTOCOMPLETE_DEBUG_SAMPLES = 20;

function getDebugSamples<T extends { specialRecipe: boolean }>(items: T[]): T[] {
  return [
    ...items.filter((item) => item.specialRecipe),
    ...items.filter((item) => !item.specialRecipe).slice(0, MAX_AUTOCOMPLETE_DEBUG_SAMPLES),
  ];
}

function getSetDifference(
  left: Set<string>,
  right: Set<string>,
): {
  count: number;
  sample: string[];
} {
  const difference = [...left].filter((value) => !right.has(value));
  return {
    count: difference.length,
    sample: difference.slice(0, MAX_AUTOCOMPLETE_DEBUG_SAMPLES),
  };
}

function getConnectionFlowChanges(
  previousFlows: Record<string, number> | undefined,
  currentFlows: Record<string, number>,
  previousEdges: Edge[] | undefined,
  currentEdges: Edge[],
  candidates: AutocompleteCandidate[],
): { count: number; sample: AutocompletePassDebugInfo['connectionFlowChanges'] } {
  if (!previousFlows || !previousEdges) return { count: 0, sample: [] };

  const previousEdgesById = new Map(previousEdges.map((edge) => [edge.id, edge]));
  const currentEdgesById = new Map(currentEdges.map((edge) => [edge.id, edge]));
  const candidatesById = new Map(candidates.map((candidate) => [candidate.node.id, candidate]));
  const edgeIds = new Set([
    ...Object.keys(previousFlows),
    ...Object.keys(currentFlows),
    ...previousEdgesById.keys(),
    ...currentEdgesById.keys(),
  ]);
  const changes: AutocompletePassDebugInfo['connectionFlowChanges'] = [];

  for (const edgeId of edgeIds) {
    const previous = previousFlows[edgeId] ?? 0;
    const next = currentFlows[edgeId] ?? 0;
    if (previous === next) continue;

    const edge = currentEdgesById.get(edgeId) ?? previousEdgesById.get(edgeId);
    if (!edge) continue;
    const source = candidatesById.get(edge.source);
    const target = candidatesById.get(edge.target);
    const sourceIndex = edge.sourceHandle ? parseHandleId(edge.sourceHandle)?.index : undefined;
    const targetIndex = edge.targetHandle ? parseHandleId(edge.targetHandle)?.index : undefined;
    changes.push({
      edgeId,
      sourceRecipeId: source?.node.data.recipeId,
      sourceProductId:
        sourceIndex === undefined ? undefined : source?.recipe.outputs[sourceIndex]?.product_id,
      targetRecipeId: target?.node.data.recipeId,
      targetProductId:
        targetIndex === undefined ? undefined : target?.recipe.inputs[targetIndex]?.product_id,
      previous,
      next,
      delta: next - previous,
    });
  }

  changes.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
  return { count: changes.length, sample: changes.slice(0, MAX_AUTOCOMPLETE_DEBUG_SAMPLES) };
}

function getCandidateRequiredOutputRates(
  candidates: AutocompleteCandidate[],
  edges: Edge[],
  connectionFlows: Record<string, number>,
): Map<string, number[]> {
  const ratesByCandidate = new Map(
    candidates.map((candidate) => [candidate.node.id, candidate.recipe.outputs.map(() => 0)]),
  );

  for (const edge of edges) {
    const outputHandle = edge.sourceHandle ? parseHandleId(edge.sourceHandle) : null;
    if (outputHandle?.side !== 'output') continue;
    const outputRates = ratesByCandidate.get(edge.source);
    if (!outputRates || outputHandle.index < 0 || outputHandle.index >= outputRates.length)
      continue;
    const flow = connectionFlows[edge.id] ?? 0;
    if (!Number.isFinite(flow) || !isPositiveSolverFlow(flow)) continue;
    outputRates[outputHandle.index] += flow;
  }

  return ratesByCandidate;
}

function refreshSelectedCandidateRecipes(
  model: AutocompleteModel,
  globalSettings: GlobalSettings,
  connectionFlows: Record<string, number>,
  pass: number,
): { changed: boolean; debugInfo: AutocompletePassDebugInfo } {
  let changed = false;
  const sizeSettingChanges: AutocompletePassDebugInfo['sizeSettingChanges'] = [];
  const candidatesBeforeRefresh = new Set(model.candidates.map((candidate) => candidate.node.id));
  const edgeEndpointsBeforeRefresh = new Set(model.edges.map(edgeEndpointKey));
  const requiredOutputRatesByCandidate = getCandidateRequiredOutputRates(
    model.candidates,
    model.edges,
    connectionFlows,
  );

  for (const candidate of model.candidates) {
    if (candidate.kind !== 'generated' || candidate.autocompleteSizingResolved) continue;
    const specialRecipe = getSpecialRecipe(candidate.node.data.recipeId);
    if (!specialRecipe?.sizeAutocompleteSettings) continue;

    const requiredOutputRates = requiredOutputRatesByCandidate.get(candidate.node.id) ?? [];
    if (!requiredOutputRates.some((rate) => Number.isFinite(rate) && isPositiveSolverFlow(rate))) {
      continue;
    }

    const currentSettings = candidate.node.data.settings ?? {};
    const baseSettings = candidate.autocompleteBaseSettings ?? currentSettings;
    const nextSettings = specialRecipe.sizeAutocompleteSettings(baseSettings, {
      globalSettings: globalSettings as unknown as Record<string, unknown>,
      requiredOutputRates,
    });
    candidate.autocompleteSizingResolved = true;
    if (stableSettingsKey(currentSettings) === stableSettingsKey(nextSettings)) continue;
    sizeSettingChanges.push({
      nodeId: candidate.node.id,
      recipeId: candidate.node.data.recipeId,
      requiredOutputRates,
      previous: currentSettings,
      next: nextSettings,
    });
    candidate.node = {
      ...candidate.node,
      data: { ...candidate.node.data, settings: nextSettings },
    };
    changed = true;
  }

  const selectedCandidates = model.candidates.filter((candidate) =>
    isCandidateSolverActive(
      candidate,
      model.edges,
      candidate.node.data.machineCount ?? 0,
      connectionFlows,
    ),
  );
  if (selectedCandidates.length === 0) {
    const prunedCandidates = pruneUnproducibleGeneratedCandidates(model);
    changed = prunedCandidates || changed;
    const edgesChanged = rebuildCandidateEdges(model, globalSettings);
    changed = edgesChanged || changed;
    const edgeEndpointsAfterRefresh = new Set(model.edges.map(edgeEndpointKey));
    const candidatesAfterRefresh = new Set(model.candidates.map((candidate) => candidate.node.id));
    const removedCandidates = getSetDifference(candidatesBeforeRefresh, candidatesAfterRefresh);
    const addedEdges = getSetDifference(edgeEndpointsAfterRefresh, edgeEndpointsBeforeRefresh);
    const removedEdges = getSetDifference(edgeEndpointsBeforeRefresh, edgeEndpointsAfterRefresh);
    return {
      changed,
      debugInfo: {
        pass,
        ordinarySampleLimit: MAX_AUTOCOMPLETE_DEBUG_SAMPLES,
        objectiveStages: [],
        candidateCount: model.candidates.length,
        selectedCandidateCount: 0,
        activeEdgeCount: 0,
        machineCountChangeCount: 0,
        machineCountChanges: [],
        connectionFlowComparison: 'baseline',
        connectionFlowChangeCount: 0,
        connectionFlowChanges: [],
        sizeSettingChangeCount: sizeSettingChanges.length,
        sizeSettingChanges,
        resolvedRecipeChangeCount: 0,
        resolvedRecipeChanges: [],
        removedCandidateCount: removedCandidates.count,
        removedCandidateIds: removedCandidates.sample,
        addedEdgeEndpointCount: addedEdges.count,
        addedEdgeEndpoints: addedEdges.sample,
        removedEdgeEndpointCount: removedEdges.count,
        removedEdgeEndpoints: removedEdges.sample,
        temperatureConverged: true,
        changed,
      },
    };
  }

  const selectedIds = new Set(selectedCandidates.map((candidate) => candidate.node.id));
  const activeEdges = model.edges.filter(
    (edge) =>
      selectedIds.has(edge.source) &&
      selectedIds.has(edge.target) &&
      isAutocompleteEdgeActive(connectionFlows[edge.id]),
  );
  const snapshot = solveFlowPipeline(
    selectedCandidates.map((candidate) => candidate.node),
    activeEdges,
    globalSettings as unknown as Record<string, unknown>,
  );

  const resolvedRecipeChanges: AutocompletePassDebugInfo['resolvedRecipeChanges'] = [];
  for (const candidate of selectedCandidates) {
    const recipe = snapshot.nodeRecipes[candidate.node.id];
    if (!recipe) continue;
    if (!areResolvedRecipesEquivalent(candidate.recipe, recipe)) {
      changed = true;
      resolvedRecipeChanges.push({
        nodeId: candidate.node.id,
        recipeId: candidate.node.data.recipeId,
        specialRecipe: !!getSpecialRecipe(candidate.node.data.recipeId),
        fields: getResolvedRecipeChangeFields(candidate.recipe, recipe),
      });
    }
    candidate.recipe = recipe;
    candidate.inputTemperatures = snapshot.inputTemps[candidate.node.id];
  }
  const prunedCandidates = pruneUnproducibleGeneratedCandidates(model);
  changed = prunedCandidates || changed;
  const edgesChanged = rebuildCandidateEdges(model, globalSettings);
  changed = edgesChanged || changed;
  const edgeEndpointsAfterRefresh = new Set(model.edges.map(edgeEndpointKey));
  const candidatesAfterRefresh = new Set(model.candidates.map((candidate) => candidate.node.id));
  const removedCandidates = getSetDifference(candidatesBeforeRefresh, candidatesAfterRefresh);
  const addedEdges = getSetDifference(edgeEndpointsAfterRefresh, edgeEndpointsBeforeRefresh);
  const removedEdges = getSetDifference(edgeEndpointsBeforeRefresh, edgeEndpointsAfterRefresh);
  return {
    changed,
    debugInfo: {
      pass,
      ordinarySampleLimit: MAX_AUTOCOMPLETE_DEBUG_SAMPLES,
      objectiveStages: [],
      candidateCount: model.candidates.length,
      selectedCandidateCount: selectedCandidates.length,
      activeEdgeCount: activeEdges.length,
      machineCountChangeCount: 0,
      machineCountChanges: [],
      connectionFlowComparison: 'baseline',
      connectionFlowChangeCount: 0,
      connectionFlowChanges: [],
      sizeSettingChangeCount: sizeSettingChanges.length,
      sizeSettingChanges,
      resolvedRecipeChangeCount: resolvedRecipeChanges.length,
      resolvedRecipeChanges: getDebugSamples(resolvedRecipeChanges),
      removedCandidateCount: removedCandidates.count,
      removedCandidateIds: removedCandidates.sample,
      addedEdgeEndpointCount: addedEdges.count,
      addedEdgeEndpoints: addedEdges.sample,
      removedEdgeEndpointCount: removedEdges.count,
      removedEdgeEndpoints: removedEdges.sample,
      temperatureConverged: snapshot.temperatureConverged ?? true,
      temperaturePropagationIterations: snapshot.iterationsRun,
      changed,
    },
  };
}

function buildCandidateModelSnapshot(
  candidates: AutocompleteCandidate[],
): RatioOptimizerModelSnapshot {
  const nodeRecipes: RatioOptimizerModelSnapshot['nodeRecipes'] = {};
  const resolvedProducts: RatioOptimizerModelSnapshot['resolvedProducts'] = {};
  for (const candidate of candidates) {
    nodeRecipes[candidate.node.id] = candidate.recipe;
    for (let index = 0; index < candidate.recipe.inputs.length; index += 1) {
      resolvedProducts[buildHandleId(candidate.node.id, 'input', index)] =
        candidate.recipe.inputs[index].product_id;
    }
    for (let index = 0; index < candidate.recipe.outputs.length; index += 1) {
      resolvedProducts[buildHandleId(candidate.node.id, 'output', index)] =
        candidate.recipe.outputs[index].product_id;
    }
  }
  return { nodeRecipes, resolvedProducts };
}

function buildRecipeDescriptorCatalog(globalSettings: GlobalSettings): RecipeDescriptorCatalog {
  const sources = getAvailableAutomationRecipes(globalSettings)
    .filter((recipe) => recipe.id !== 'r_item_spawner_01' && recipe.id !== 'r_fluid_spawner_01')
    .map((baseRecipe) => ({
      recipeId: baseRecipe.id,
      baseRecipe,
      specialRecipe: getSpecialRecipe(baseRecipe.id),
    }));
  const sourcesByOutput = new Map<string, RecipeDescriptorSource[]>();
  for (const source of sources) {
    const products = new Set([
      ...source.baseRecipe.outputs.map((output) => output.product_id),
      ...(source.baseRecipe.potential_outputs ?? []),
    ]);
    for (const productId of products) {
      if (PLACEHOLDER_PRODUCTS.has(productId)) continue;
      const productSources = sourcesByOutput.get(productId) ?? [];
      productSources.push(source);
      sourcesByOutput.set(productId, productSources);
    }
  }
  const cache = new Map<string, RecipeDescriptor[]>();
  const getDescriptors = (
    source: RecipeDescriptorSource,
    outputProduct?: string,
  ): RecipeDescriptor[] => {
    const cacheKey = `${source.recipeId}::${outputProduct ?? '*'}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const defaults = resolveOptimizationSettings(source.recipeId, undefined);
    const outputSettings = outputProduct
      ? source.specialRecipe?.resolveSettings?.(outputProduct)
      : null;
    const seedSettings = { ...defaults, ...(outputSettings ?? {}) };
    const lockedSettingKeys = new Set(Object.keys(outputSettings ?? {}));
    const variants = source.specialRecipe
      ? getSelectSettingsVariants(
          source.specialRecipe,
          seedSettings,
          globalSettings,
          lockedSettingKeys,
        )
      : [{}];
    const descriptors: RecipeDescriptor[] = [];
    const seen = new Set<string>();
    for (const settings of variants) {
      const recipe = resolveActiveRecipe(source.recipeId, settings, undefined, undefined, {
        globalSettings: globalSettings as unknown as Record<string, unknown>,
        suppressStoreTemperatureOverrides: true,
      });
      if (
        !recipe ||
        (outputProduct && !recipe.outputs.some((output) => output.product_id === outputProduct))
      ) {
        continue;
      }
      const key = candidateKey(source.recipeId, settings);
      if (seen.has(key)) continue;
      seen.add(key);
      descriptors.push({ key, recipeId: source.recipeId, settings, recipe });
    }
    cache.set(cacheKey, descriptors);
    return descriptors;
  };

  return { sources, sourcesByOutput, getDescriptors };
}

function getConcreteInputProducts(recipe: Recipe): string[] {
  return recipe.inputs
    .filter((input) => !input.variable && !PLACEHOLDER_PRODUCTS.has(input.product_id))
    .map((input) => input.product_id);
}

function hasFlowDependentDemand(input: Recipe['inputs'][number]): boolean {
  return (input.flowDependencies?.length ?? 0) > 0;
}

function hasInactiveInputRate(input: Recipe['inputs'][number]): boolean {
  return input.quantity <= 0 && !hasFlowDependentDemand(input);
}

function hasUnboundRequiredInput(recipe: Recipe): boolean {
  return recipe.inputs.some(
    (input) => !input.variable && PLACEHOLDER_PRODUCTS.has(input.product_id),
  );
}

function bindLinkedWildcardDescriptor(
  descriptor: RecipeDescriptor,
  productId: string,
  inputIndex: number,
  inputTemperature: number,
  globalSettings: GlobalSettings,
): RecipeDescriptor | null {
  const wildcardInput = descriptor.recipe.inputs.find(
    (input) => PLACEHOLDER_PRODUCTS.has(input.product_id) && input.product_link_id,
  );
  if (!wildcardInput?.product_link_id) return null;
  const linkId = wildcardInput.product_link_id;
  const recipe = resolveActiveRecipe(
    descriptor.recipeId,
    descriptor.settings,
    `autocomplete-preview-${descriptor.recipeId}`,
    {
      resolveProduct: (side, index) => {
        const ports = side === 'input' ? descriptor.recipe.inputs : descriptor.recipe.outputs;
        const port = ports[index];
        return port?.product_link_id === linkId ? productId : (port?.product_id ?? '');
      },
      hasConnection: (side, index) => {
        const ports = side === 'input' ? descriptor.recipe.inputs : descriptor.recipe.outputs;
        return ports[index]?.product_link_id === linkId;
      },
    },
    {
      globalSettings: globalSettings as unknown as Record<string, unknown>,
      suppressStoreTemperatureOverrides: true,
      temperatureInputOverrides: { [inputIndex]: inputTemperature },
    },
  );
  if (!recipe || hasUnboundRequiredInput(recipe)) return null;

  return {
    ...descriptor,
    key: `${descriptor.key}::${linkId}:${productId}`,
    recipe,
  };
}

function getLinkedWildcardBindings(
  descriptor: RecipeDescriptor,
  producedTemperatures: Map<string, number[]>,
  globalSettings: GlobalSettings,
): RecipeDescriptor[] {
  const wildcardInputIndex = descriptor.recipe.inputs.findIndex(
    (input) => PLACEHOLDER_PRODUCTS.has(input.product_id) && input.product_link_id,
  );
  if (wildcardInputIndex < 0) return [];
  const wildcardProduct = descriptor.recipe.inputs[wildcardInputIndex].product_id;
  const expectedType = wildcardProduct === 'any_fluid' ? 'Fluid' : 'Item';
  const allowedProducts = getSpecialRecipe(
    descriptor.recipeId,
  )?.getAutocompleteLinkedInputProducts?.(descriptor.settings, wildcardInputIndex);
  const bindings: RecipeDescriptor[] = [];

  for (const [productId, temperatures] of producedTemperatures) {
    if (getProduct(productId)?.type !== expectedType) continue;
    if (allowedProducts && !allowedProducts.includes(productId)) continue;
    const range = getInputTemperatureRange(
      descriptor.recipeId,
      descriptor.settings,
      wildcardInputIndex,
      productId,
    );
    const compatibleTemperatures = temperatures.filter((temperature) =>
      isTemperatureInRange(temperature, range),
    );
    if (compatibleTemperatures.length === 0) continue;
    const bound = bindLinkedWildcardDescriptor(
      descriptor,
      productId,
      wildcardInputIndex,
      Math.min(...compatibleTemperatures),
      globalSettings,
    );
    if (!bound) continue;
    bindings.push(bound);
  }

  return bindings;
}

function buildInitialModel(
  existingNodes: RecipeNodeType[],
  existingEdges: Edge[],
  globalSettings: GlobalSettings,
): AutocompleteModel {
  const currentSnapshot = solveFlowPipeline(
    existingNodes,
    existingEdges,
    globalSettings as unknown as Record<string, unknown>,
  );
  const descriptorCatalog = buildRecipeDescriptorCatalog(globalSettings);

  const candidates: AutocompleteCandidate[] = [];
  const candidateKeys = new Set<string>();
  const requiredProducts: string[] = [];
  const warnings = new Set<string>();
  const protectedOutputHandles = new Set<string>();

  for (const existingNode of existingNodes) {
    const recipe = currentSnapshot.nodeRecipes[existingNode.id];
    if (!recipe) continue;
    const settings = existingNode.data.settings ?? {};
    const key = candidateKey(existingNode.data.recipeId, settings);
    candidates.push({
      kind: 'existing',
      key,
      node: existingNode,
      recipe,
      minimumMachineCount: Math.max(
        0,
        Number.isFinite(existingNode.data.machineCount) ? existingNode.data.machineCount : 0,
      ),
      inputTemperatures: currentSnapshot.inputTemps[existingNode.id],
    });
    candidateKeys.add(key);

    if (existingNode.data.isTarget) {
      for (const productId of getConcreteInputProducts(recipe)) requiredProducts.push(productId);
      for (let outputIndex = 0; outputIndex < recipe.outputs.length; outputIndex += 1) {
        protectedOutputHandles.add(buildHandleId(existingNode.id, 'output', outputIndex));
      }
      if (hasUnboundRequiredInput(recipe)) {
        warnings.add(`Target ${recipe.name} has an unresolved wildcard input.`);
      }
    }
  }

  const producedTemperatures = new Map<string, number[]>();
  const recordProducedTemperatures = (recipe: Recipe): void => {
    for (const output of recipe.outputs) {
      if (PLACEHOLDER_PRODUCTS.has(output.product_id) || output.quantity <= 0) continue;
      const temperatures = producedTemperatures.get(output.product_id) ?? [];
      temperatures.push(output.temperature ?? 18);
      producedTemperatures.set(output.product_id, temperatures);
    }
  };
  for (const candidate of candidates) recordProducedTemperatures(candidate.recipe);
  let fluidTemperaturesIndexed = false;
  const indexFluidSourceTemperatures = (): void => {
    if (fluidTemperaturesIndexed) return;
    fluidTemperaturesIndexed = true;
    for (const [productId, sources] of descriptorCatalog.sourcesByOutput) {
      if (getProduct(productId)?.type !== 'Fluid') continue;
      for (const source of sources) {
        if (hasRecipePowerOutput(source.baseRecipe)) continue;
        for (const descriptor of descriptorCatalog.getDescriptors(source, productId)) {
          if (hasRecipePowerOutput(descriptor.recipe)) continue;
          recordProducedTemperatures(descriptor.recipe);
        }
      }
    }
  };

  const addConcreteDescriptor = (descriptor: RecipeDescriptor): void => {
    if (candidateKeys.has(descriptor.key)) return;
    if (
      candidates.some(
        (candidate) =>
          candidate.kind === 'existing' &&
          areResolvedRecipesEquivalent(candidate.recipe, descriptor.recipe),
      )
    ) {
      return;
    }
    const node = createRecipeNode(descriptor.recipe, descriptor.settings, 0);
    candidates.push({
      kind: 'generated',
      key: descriptor.key,
      node,
      recipe: descriptor.recipe,
      autocompleteBaseSettings: { ...descriptor.settings },
    });
    candidateKeys.add(descriptor.key);
    recordProducedTemperatures(descriptor.recipe);
    for (const productId of getConcreteInputProducts(descriptor.recipe)) {
      requiredProducts.push(productId);
    }
  };

  const addDescriptor = (descriptor: RecipeDescriptor): void => {
    if (hasRecipePowerOutput(descriptor.recipe)) return;
    if (candidateKeys.has(descriptor.key)) return;
    if (hasUnboundRequiredInput(descriptor.recipe)) {
      indexFluidSourceTemperatures();
      const bindings = getLinkedWildcardBindings(descriptor, producedTemperatures, globalSettings);
      for (const binding of bindings) addConcreteDescriptor(binding);
      if (bindings.length > 0) return;
      warnings.add(
        `${descriptor.recipe.name} was skipped because its required wildcard input has no safe binding yet.`,
      );
      return;
    }
    addConcreteDescriptor(descriptor);
  };

  const visitedProducts = new Set<string>();
  while (requiredProducts.length > 0) {
    const productId = requiredProducts.pop()!;
    if (visitedProducts.has(productId)) continue;
    visitedProducts.add(productId);

    for (const source of descriptorCatalog.sourcesByOutput.get(productId) ?? []) {
      for (const descriptor of descriptorCatalog.getDescriptors(source, productId)) {
        addDescriptor(descriptor);
      }
    }
  }

  const model: AutocompleteModel = {
    candidates,
    edges: [],
    descriptorCatalog,
    initialTemperatureConverged: currentSnapshot.temperatureConverged ?? true,
    protectedOutputHandles,
    fallbackKeys: new Set(),
    preservedEdgeEndpointKeys: new Set(existingEdges.map(edgeEndpointKey)),
    warnings: [...warnings],
  };
  pruneUnproducibleGeneratedCandidates(model);
  rebuildCandidateEdges(model, globalSettings);
  return model;
}

function addFallbackCandidate(
  model: AutocompleteModel,
  productId: string,
  globalSettings: GlobalSettings,
  temperature = 18,
): boolean {
  const product = getProduct(productId);
  if (!product) return false;
  const fallbackKey =
    product.type === 'Fluid' ? `${productId}@${temperature.toFixed(6)}` : productId;
  if (model.fallbackKeys.has(fallbackKey)) return false;

  let quantity = 1;
  for (const candidate of model.candidates) {
    const countScale = Math.max(1, candidate.node.data.machineCount ?? 0);
    for (const input of candidate.recipe.inputs) {
      if (input.product_id === productId) {
        quantity = Math.max(quantity, input.quantity * countScale);
      }
    }
  }

  const recipeId = FALLBACK_RECIPE_IDS[product.type];
  const fallbackRecipe = getRecipe(recipeId);
  if (!fallbackRecipe || !isRecipeAvailableForAutomation(fallbackRecipe, globalSettings)) {
    return false;
  }
  const settings: Record<string, unknown> = {
    product_id: productId,
    quantity,
    ...(product.type === 'Fluid' ? { temperature } : {}),
  };
  const recipe = resolveActiveRecipe(recipeId, settings, undefined, undefined, {
    globalSettings: globalSettings as unknown as Record<string, unknown>,
    suppressStoreTemperatureOverrides: true,
  });
  if (!recipe) return false;

  model.candidates.push({
    kind: 'fallback',
    key: candidateKey(recipeId, settings),
    node: createRecipeNode(recipe, settings, 0),
    recipe,
  });
  model.fallbackKeys.add(fallbackKey);
  return true;
}

function addRequiredExistingInputFallbacks(
  model: AutocompleteModel,
  globalSettings: GlobalSettings,
): boolean {
  const connectedInputHandles = new Set(
    model.edges.flatMap((edge) => (edge.targetHandle ? [edge.targetHandle] : [])),
  );
  let added = false;

  for (const target of model.candidates) {
    if (target.kind !== 'existing') continue;
    for (let inputIndex = 0; inputIndex < target.recipe.inputs.length; inputIndex += 1) {
      const input = target.recipe.inputs[inputIndex];
      if (
        input.variable ||
        hasInactiveInputRate(input) ||
        PLACEHOLDER_PRODUCTS.has(input.product_id) ||
        connectedInputHandles.has(buildHandleId(target.node.id, 'input', inputIndex))
      ) {
        continue;
      }
      added =
        addFallbackCandidate(
          model,
          input.product_id,
          globalSettings,
          getFallbackTemperature(getCandidateInputTemperatureRange(target, inputIndex)),
        ) || added;
    }
  }
  return added;
}

function rebuildCandidateEdges(model: AutocompleteModel, globalSettings: GlobalSettings): boolean {
  model.edges = buildCandidateEdges(model.candidates, model.preservedEdgeEndpointKeys);
  const addedFallback = addRequiredExistingInputFallbacks(model, globalSettings);
  if (addedFallback) {
    model.edges = buildCandidateEdges(model.candidates, model.preservedEdgeEndpointKeys);
  }
  return addedFallback;
}

function getCandidateModelSettings(candidate: AutocompleteCandidate): Record<string, unknown> {
  const settings = { ...(candidate.node.data.settings ?? {}) };
  const temperatureSettings = getSpecialRecipe(
    candidate.node.data.recipeId,
  )?.inputTemperatureSettings;
  for (const [indexText, settingKey] of Object.entries(temperatureSettings ?? {})) {
    const temperature = candidate.inputTemperatures?.[Number(indexText)];
    if (temperature !== undefined) settings[settingKey] = temperature;
  }
  return settings;
}

function getCandidateResolvedSettings(candidate: AutocompleteCandidate): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(getCandidateModelSettings(candidate)).filter(
      ([key]) => !key.startsWith('__autocomplete_'),
    ),
  );
}

function getCandidateInputTemperatureRange(
  candidate: AutocompleteCandidate,
  inputIndex: number,
): AutocompleteTemperatureRange | null {
  const input = candidate.recipe.inputs[inputIndex];
  if (!input) return null;
  return getInputTemperatureRange(
    candidate.node.data.recipeId,
    getCandidateModelSettings(candidate),
    inputIndex,
    input.product_id,
  );
}

function isCandidateTemperatureCompatible(
  producer: AutocompleteCandidate,
  outputIndex: number,
  target: AutocompleteCandidate,
  inputIndex: number,
): boolean {
  const temperatureSettings = getSpecialRecipe(
    producer.node.data.recipeId,
  )?.inputTemperatureSettings;
  if (
    producer.kind === 'generated' &&
    temperatureSettings &&
    Object.keys(temperatureSettings).some(
      (indexText) => producer.inputTemperatures?.[Number(indexText)] === undefined,
    )
  ) {
    return true;
  }

  const temperature = producer.recipe.outputs[outputIndex]?.temperature ?? 18;
  return isTemperatureInRange(temperature, getCandidateInputTemperatureRange(target, inputIndex));
}

function getFallbackTemperature(range: AutocompleteTemperatureRange | null): number {
  if (range?.min !== undefined) return range.min;
  if (range?.max !== undefined) return Math.min(18, range.max);
  return 18;
}

function pruneUnproducibleGeneratedCandidates(model: AutocompleteModel): boolean {
  let removedAny = false;

  while (true) {
    const connectedInputHandles = new Set(
      buildCandidateEdges(model.candidates, model.preservedEdgeEndpointKeys).flatMap((edge) =>
        edge.targetHandle ? [edge.targetHandle] : [],
      ),
    );
    const removableIds = new Set<string>();
    for (const target of model.candidates) {
      if (target.kind !== 'generated') continue;
      if (
        !isMachineCountNumericallyZero(target.node.data.machineCount) ||
        hasIndependentSolverRate(target)
      ) {
        continue;
      }
      const hasUnproducibleInput = target.recipe.inputs.some((input, inputIndex) => {
        if (
          input.variable ||
          hasInactiveInputRate(input) ||
          PLACEHOLDER_PRODUCTS.has(input.product_id)
        ) {
          return false;
        }
        return !connectedInputHandles.has(buildHandleId(target.node.id, 'input', inputIndex));
      });
      if (hasUnproducibleInput) removableIds.add(target.node.id);
    }

    if (removableIds.size === 0) return removedAny;
    removedAny = true;
    model.candidates = model.candidates.filter((candidate) => !removableIds.has(candidate.node.id));
  }
}

function buildCandidateEdges(
  candidates: AutocompleteCandidate[],
  preservedEdgeEndpointKeys: Set<string>,
): Edge[] {
  const producersByProduct = new Map<
    string,
    Array<{ candidate: AutocompleteCandidate; outputIndex: number }>
  >();

  for (const candidate of candidates) {
    for (let outputIndex = 0; outputIndex < candidate.recipe.outputs.length; outputIndex += 1) {
      const output = candidate.recipe.outputs[outputIndex];
      if (PLACEHOLDER_PRODUCTS.has(output.product_id) || output.quantity <= 0) continue;
      const producers = producersByProduct.get(output.product_id) ?? [];
      producers.push({ candidate, outputIndex });
      producersByProduct.set(output.product_id, producers);
    }
  }

  const edges: Edge[] = [];
  for (const target of candidates) {
    for (let inputIndex = 0; inputIndex < target.recipe.inputs.length; inputIndex += 1) {
      const input = target.recipe.inputs[inputIndex];
      if (PLACEHOLDER_PRODUCTS.has(input.product_id) || hasInactiveInputRate(input)) continue;

      for (const producer of producersByProduct.get(input.product_id) ?? []) {
        const output = producer.candidate.recipe.outputs[producer.outputIndex];
        const targetSpecialRecipe = getSpecialRecipe(target.node.data.recipeId);
        const sourceHandle = buildHandleId(
          producer.candidate.node.id,
          'output',
          producer.outputIndex,
        );
        const targetHandle = buildHandleId(target.node.id, 'input', inputIndex);
        const edge: Edge = {
          id: `ac-${sourceHandle}-${targetHandle}`,
          type: 'recipe',
          source: producer.candidate.node.id,
          sourceHandle,
          target: target.node.id,
          targetHandle,
        };
        const isPreservedEdge = preservedEdgeEndpointKeys.has(edgeEndpointKey(edge));
        const isSelfConnection = producer.candidate.node.id === target.node.id;
        if (
          !isPreservedEdge &&
          isSelfConnection &&
          output.product_link_id &&
          (output.product_link_id !== input.product_link_id ||
            !targetSpecialRecipe?.allowAutocompleteLinkedOutputRecirculation)
        ) {
          continue;
        }
        if (
          !isPreservedEdge &&
          targetSpecialRecipe?.preventAutocompleteRecipeChaining &&
          !isSelfConnection &&
          producer.candidate.node.data.recipeId === target.node.data.recipeId
        ) {
          continue;
        }
        if (
          !isPreservedEdge &&
          !isCandidateTemperatureCompatible(
            producer.candidate,
            producer.outputIndex,
            target,
            inputIndex,
          )
        ) {
          continue;
        }
        edges.push(edge);
      }
    }
  }
  return edges;
}

function getFallbackRequestsFromDiagnostics(
  diagnostics: RatioFailureDiagnostics | undefined,
  candidates: AutocompleteCandidate[],
): Array<{ productId: string; temperature: number }> {
  if (!diagnostics) return [];
  const candidatesById = new Map(candidates.map((candidate) => [candidate.node.id, candidate]));
  const requests = new Map<string, { productId: string; temperature: number }>();
  for (const input of diagnostics.deficientInputs) {
    if (PLACEHOLDER_PRODUCTS.has(input.productId)) continue;
    const candidate = candidatesById.get(input.nodeId);
    const temperature = candidate
      ? getFallbackTemperature(getCandidateInputTemperatureRange(candidate, input.inputIndex))
      : 18;
    requests.set(`${input.productId}@${temperature.toFixed(6)}`, {
      productId: input.productId,
      temperature,
    });
  }
  if (requests.size > 0) return [...requests.values()];
  for (const cause of diagnostics.rootCauses) {
    if (PLACEHOLDER_PRODUCTS.has(cause.productId)) continue;
    requests.set(`${cause.productId}@18`, { productId: cause.productId, temperature: 18 });
  }
  return [...requests.values()];
}

function updateCandidateCounts(
  candidates: AutocompleteCandidate[],
  machineCounts: Record<string, number>,
  edges: Edge[],
  connectionFlows: Record<string, number>,
): void {
  for (const candidate of candidates) {
    const solvedCount = Math.max(0, machineCounts[candidate.node.id] ?? 0);
    const countWithRequiredFloor = Math.max(candidate.minimumMachineCount ?? 0, solvedCount);
    const machineCount = isCandidateSolverActive(
      candidate,
      edges,
      countWithRequiredFloor,
      connectionFlows,
    )
      ? countWithRequiredFloor
      : 0;
    candidate.node = {
      ...candidate.node,
      data: {
        ...candidate.node.data,
        machineCount,
      },
    };
  }
}

function positionGeneratedNodes(
  existingNodes: RecipeNodeType[],
  generatedNodes: RecipeNodeType[],
): RecipeNodeType[] {
  if (generatedNodes.length === 0) return generatedNodes;
  let minX = 0;
  let minY = 0;
  if (existingNodes.length > 0) {
    minX = Math.min(...existingNodes.map((node) => node.position.x));
    minY = Math.min(...existingNodes.map((node) => node.position.y));
  }

  const rowsPerColumn = Math.max(1, Math.ceil(Math.sqrt(generatedNodes.length)));
  return generatedNodes.map((node, index) => ({
    ...node,
    position: {
      x: minX - 420 * (Math.floor(index / rowsPerColumn) + 1),
      y: minY + (index % rowsPerColumn) * 220,
    },
    selected: false,
  }));
}

function materializePlan(
  canvasNodes: CanvasNode[],
  canvasEdges: Edge[],
  model: AutocompleteModel,
  machineCounts: Record<string, number>,
  connectionFlows: Record<string, number>,
  globalSettings: GlobalSettings,
  excludedGeneratedIds: Set<string> = new Set(),
  excludedGeneratedEdgeIds: Set<string> = new Set(),
): AutocompletePlan | AutocompletePlanFailure {
  const selectedCandidateIds = new Set<string>();
  const newRecipeNodes: RecipeNodeType[] = [];
  const materializedIdByCandidateId = new Map<string, string>();
  const appliedMachineCounts: Record<string, number> = {};

  for (const candidate of model.candidates) {
    if (candidate.kind === 'generated' && excludedGeneratedIds.has(candidate.node.id)) continue;
    const rawSolvedCount = Math.max(0, machineCounts[candidate.node.id] ?? 0);
    const solvedCount = isCandidateSolverActive(
      candidate,
      model.edges,
      rawSolvedCount,
      connectionFlows,
    )
      ? rawSolvedCount
      : 0;
    if (candidate.kind === 'existing') {
      materializedIdByCandidateId.set(candidate.node.id, candidate.node.id);
      const countWithRequiredFloor = Math.max(candidate.minimumMachineCount ?? 0, solvedCount);
      appliedMachineCounts[candidate.node.id] = countWithRequiredFloor;
      if (
        isCandidateSolverActive(candidate, model.edges, countWithRequiredFloor, connectionFlows)
      ) {
        selectedCandidateIds.add(candidate.node.id);
      }
      continue;
    }
    if (!isCandidateSolverActive(candidate, model.edges, solvedCount, connectionFlows)) continue;

    let settings = getCandidateResolvedSettings(candidate);
    let materializedCount = solvedCount;
    if (candidate.kind === 'fallback') {
      const unitQuantity = candidate.recipe.outputs[0]?.quantity ?? 1;
      settings = { ...settings, quantity: unitQuantity * solvedCount };
      materializedCount = 1;
    }

    const node: RecipeNodeType = {
      ...candidate.node,
      data: {
        ...candidate.node.data,
        machineCount: constrainMachineCount(candidate.node.data, materializedCount),
        inputOrder: candidate.recipe.inputs.map((_, index) => index),
        outputOrder: candidate.recipe.outputs.map((_, index) => index),
        settings,
      },
    };
    newRecipeNodes.push(node);
    selectedCandidateIds.add(candidate.node.id);
    materializedIdByCandidateId.set(candidate.node.id, node.id);
    appliedMachineCounts[node.id] = node.data.machineCount;
  }

  const positionedNewNodes = positionGeneratedNodes(
    canvasNodes.filter(isRecipeNode),
    newRecipeNodes,
  );
  const nextNodes = canvasNodes.map((node) => {
    if (!isRecipeNode(node)) return node;
    const count = appliedMachineCounts[node.id];
    if (count === undefined) return node;
    return {
      ...node,
      data: { ...node.data, machineCount: constrainMachineCount(node.data, count) },
    };
  });
  nextNodes.push(...positionedNewNodes);

  const edgeEndpointKeys = new Set(
    canvasEdges.map(
      (edge) => `${edge.sourceHandle ?? edge.source}::${edge.targetHandle ?? edge.target}`,
    ),
  );
  const nextEdges = [...canvasEdges];
  for (const edge of model.edges) {
    if (excludedGeneratedEdgeIds.has(edge.id)) continue;
    if (!isAutocompleteEdgeActive(connectionFlows[edge.id])) continue;
    if (!selectedCandidateIds.has(edge.source) || !selectedCandidateIds.has(edge.target)) continue;

    const sourceId = materializedIdByCandidateId.get(edge.source);
    const targetId = materializedIdByCandidateId.get(edge.target);
    if (!sourceId || !targetId || !edge.sourceHandle || !edge.targetHandle) continue;

    const sourcePort = parseHandleId(edge.sourceHandle);
    const targetPort = parseHandleId(edge.targetHandle);
    if (sourcePort?.side !== 'output' || targetPort?.side !== 'input') continue;

    const sourceHandle = buildHandleId(sourceId, 'output', sourcePort.index);
    const targetHandle = buildHandleId(targetId, 'input', targetPort.index);
    const endpointKey = `${sourceHandle}::${targetHandle}`;
    if (edgeEndpointKeys.has(endpointKey)) continue;
    edgeEndpointKeys.add(endpointKey);
    nextEdges.push({
      id: nextEdgeId(),
      type: 'recipe',
      source: sourceId,
      sourceHandle,
      target: targetId,
      targetHandle,
    });
  }

  const recipeNodes = nextNodes.filter(isRecipeNode);
  const recipeNodeIds = new Set(recipeNodes.map((node) => node.id));
  const recipeEdges = nextEdges.filter(
    (edge) => recipeNodeIds.has(edge.source) && recipeNodeIds.has(edge.target),
  );
  const verification = solveFlowPipeline(
    recipeNodes,
    recipeEdges,
    globalSettings as unknown as Record<string, unknown>,
  );
  if (!verification.temperatureConverged) {
    return { error: 'Temperature and recipe settings did not settle during graph verification.' };
  }

  const materializedEndpointKeys = new Set(
    recipeEdges.map(
      (edge) => `${edge.sourceHandle ?? edge.source}::${edge.targetHandle ?? edge.target}`,
    ),
  );
  for (const modelEdge of model.edges) {
    if (excludedGeneratedEdgeIds.has(modelEdge.id)) continue;
    if (!isAutocompleteEdgeActive(connectionFlows[modelEdge.id])) continue;
    if (
      !selectedCandidateIds.has(modelEdge.source) ||
      !selectedCandidateIds.has(modelEdge.target)
    ) {
      continue;
    }
    const sourceId = materializedIdByCandidateId.get(modelEdge.source);
    const targetId = materializedIdByCandidateId.get(modelEdge.target);
    if (!sourceId || !targetId || !modelEdge.sourceHandle || !modelEdge.targetHandle) continue;
    const sourcePort = parseHandleId(modelEdge.sourceHandle);
    const targetPort = parseHandleId(modelEdge.targetHandle);
    if (sourcePort?.side !== 'output' || targetPort?.side !== 'input') continue;
    const sourceHandle = buildHandleId(sourceId, 'output', sourcePort.index);
    const targetHandle = buildHandleId(targetId, 'input', targetPort.index);
    const endpointKey = `${sourceHandle}::${targetHandle}`;
    if (!materializedEndpointKeys.has(endpointKey)) {
      const targetNode = recipeNodes.find((node) => node.id === targetId);
      return {
        error: `The generated graph omitted an active input connection for ${verification.nodeRecipes[targetId]?.name ?? targetNode?.data.recipeId ?? targetId}.`,
      };
    }
  }

  const deficientInputs: AutocompleteVerificationDeficit[] = [];
  for (const node of recipeNodes) {
    if (!selectedCandidateIds.has(node.id)) continue;
    const result = verification.results.get(node.id);
    const resolvedRecipe = verification.nodeRecipes[node.id];
    for (const [inputIndex, inputFlow] of result?.inputFlows.entries() ?? []) {
      if (!inputFlow.hasDeficiency) continue;
      deficientInputs.push({
        nodeId: node.id,
        inputIndex,
        productId: resolvedRecipe?.inputs[inputIndex]?.product_id ?? 'unknown',
        requiredRate: inputFlow.rate,
        suppliedRate: inputFlow.connected,
        deficit: inputFlow.deficit,
      });
    }
    if (
      resolvedRecipe?.outputs.some(
        (output, index) => output.product_link_id && result?.outputFlows[index]?.hasExcess,
      )
    ) {
      return {
        error: `The generated graph could not circulate the linked output for ${resolvedRecipe.name}.`,
      };
    }
  }
  if (deficientInputs.length > 0) {
    const firstDeficit = deficientInputs[0];
    const node = recipeNodes.find((candidate) => candidate.id === firstDeficit.nodeId);
    return {
      error: `The generated graph did not reproduce the solver flow for ${verification.nodeRecipes[firstDeficit.nodeId]?.name ?? node?.data.recipeId ?? firstDeficit.nodeId}.`,
      deficientInputs,
    };
  }

  const objectivePayload = buildRatioOptimizerPayload(recipeNodes, recipeEdges, {
    modelSnapshot: {
      nodeRecipes: verification.nodeRecipes,
      resolvedProducts: verification.resolvedProducts,
    },
  });
  const objectiveMachineCounts: Record<string, number> = {};
  for (const node of recipeNodes) objectiveMachineCounts[node.id] = node.data.machineCount ?? 0;

  return {
    nodes: nextNodes,
    edges: nextEdges,
    addedNodeIds: positionedNewNodes.map((node) => node.id),
    machineCounts: objectiveMachineCounts,
    objectiveNodes: objectivePayload.nodes,
    objectiveConnections: objectivePayload.connections,
    objectiveConnectionFlows: verification.edgeFlows,
    warnings: model.warnings,
  };
}

function getResolvedSettingsByCandidate(
  model: AutocompleteModel,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    model.candidates.map((candidate) => [
      candidate.node.id,
      structuredClone(getCandidateResolvedSettings(candidate)),
    ]),
  );
}

function getCycleBranchRoutes(
  solution: AutocompleteCycleSolution,
  changingInputHandles: string[],
): Record<string, string[]> {
  return Object.fromEntries(
    changingInputHandles.map((inputHandle) => [
      inputHandle,
      [...(solution.activeIncomingEndpoints[inputHandle] ?? [])],
    ]),
  );
}

function getCycleBranchDeficitHandles(
  deficientInputs: AutocompleteVerificationDeficit[] | undefined,
): string[] {
  return [...new Set(
    (deficientInputs ?? []).map((input) => buildHandleId(input.nodeId, 'input', input.inputIndex)),
  )];
}

async function recoverAutocompleteCycle(
  cycleSolutions: AutocompleteCycleSolution[],
  canvasNodes: CanvasNode[],
  canvasEdges: Edge[],
  globalSettings: GlobalSettings,
  options: AutocompleteOptions,
  runId: number,
): Promise<AutocompleteCycleRecoveryResult> {
  const changingInputHandles = getCycleChangingInputHandles(cycleSolutions);
  const rankedCycleSolutions = [...cycleSolutions].sort(compareCycleSolutionRank);
  const branches: AutocompleteCycleBranch[] = rankedCycleSolutions.map((solution) => ({
    solution,
    inputRoutes: getCycleBranchRoutes(solution, changingInputHandles),
  }));
  const queuedKeys = new Set(branches.map(getCycleBranchKey));
  const attempts: AutocompleteCycleRecoveryAttempt[] = [];
  const verified: Array<{
    pass: number;
    attempt: number;
    telemetry?: RatioSolverTelemetry;
    plan: AutocompletePlan;
  }> = [];

  const enqueueAlternates = (
    branch: AutocompleteCycleBranch,
    deficitHandles: string[],
  ) => {
    for (const inputHandle of deficitHandles) {
      if (!changingInputHandles.includes(inputHandle)) continue;
      const currentRoute = JSON.stringify(branch.inputRoutes[inputHandle] ?? []);
      const alternateRoutes = new Map<string, string[]>();
      for (const solution of cycleSolutions) {
        const route = solution.activeIncomingEndpoints[inputHandle] ?? [];
        const routeKey = JSON.stringify(route);
        if (routeKey !== currentRoute) alternateRoutes.set(routeKey, [...route]);
      }
      for (const alternateRoute of alternateRoutes.values()) {
        const nextBranch: AutocompleteCycleBranch = {
          solution: branch.solution,
          inputRoutes: {
            ...branch.inputRoutes,
            [inputHandle]: alternateRoute,
          },
        };
        const key = getCycleBranchKey(nextBranch);
        if (queuedKeys.has(key) || branches.length >= MAX_AUTOCOMPLETE_CYCLE_BRANCH_SOLVES) {
          continue;
        }
        queuedKeys.add(key);
        branches.push(nextBranch);
      }
    }
  };

  for (
    let branchIndex = 0;
    branchIndex < branches.length && attempts.length < MAX_AUTOCOMPLETE_CYCLE_BRANCH_SOLVES;
    branchIndex += 1
  ) {
    if (runId !== activeAutocompleteRun) return { attempts, cancelled: true };
    const branch = branches[branchIndex];
    const branchModel = buildCycleBranchModel(branch, cycleSolutions);
    let branchSettled = false;
    const seenBranchStates = new Set<string>();
    while (attempts.length < MAX_AUTOCOMPLETE_CYCLE_BRANCH_SOLVES) {
      if (runId !== activeAutocompleteRun) return { attempts, cancelled: true };
      const branchState = getCoupledModelSignature(branchModel);
      if (seenBranchStates.has(branchState)) {
        const lastAttempt = attempts[attempts.length - 1];
        if (lastAttempt?.pass === branch.solution.pass) {
          lastAttempt.error = 'Recipe settings repeated within the branch before verification settled.';
        }
        break;
      }
      seenBranchStates.add(branchState);
      const attempt = attempts.length + 1;
      options.onProgress?.({
        phase: 'finalizing',
        message: `Re-solving autocomplete cycle route ${attempt}/${MAX_AUTOCOMPLETE_CYCLE_BRANCH_SOLVES}.`,
        solver: 'native',
      });

      const session = solveRatios(
        branchModel.candidates.map((candidate) =>
          candidate.kind === 'existing'
            ? {
                ...candidate.node,
                data: {
                  ...candidate.node.data,
                  isTarget: true,
                  machineCount: candidate.minimumMachineCount ?? 0,
                },
              }
            : candidate.node,
        ),
        branchModel.edges,
        {
          optimizationConfiguration: options.configuration,
          onProgress: options.onProgress,
          modelSnapshot: buildCandidateModelSnapshot(branchModel.candidates),
          minimizeLinkedOutputExcess: true,
          excludeAvoidableInfiniteCostMachines: true,
        },
      );
      const result = await session.promise;
      if (runId !== activeAutocompleteRun) return { attempts, cancelled: true };

      const objectiveStages = result.telemetry?.stageTelemetry?.map(({ name, objectiveValue }) => ({
        name,
        objectiveValue,
      }));
      const failureBase = {
        pass: branch.solution.pass,
        attempt,
        constrainedInputCount: Object.keys(branch.inputRoutes).length,
        fixedRecipeSettings: getResolvedSettingsByCandidate(branchModel),
        fixedInputRoutes: Object.fromEntries(
          Object.entries(branch.inputRoutes).map(([inputHandle, endpoints]) => [
            inputHandle,
            [...endpoints],
          ]),
        ),
        solverStatus: result.telemetry?.nativeStatus,
        ...(objectiveStages ? { objectiveStages } : {}),
      };

      if (!result.feasible || !result.machineCounts || !result.connectionFlows) {
        const error = result.error ?? 'The cycle branch did not produce a solver result.';
        const deficientInputs = (result.diagnostics?.deficientInputs ?? []).map((input) => ({
          nodeId: input.nodeId,
          inputIndex: input.inputIndex,
          productId: input.productId,
          requiredRate: input.requiredRate,
          suppliedRate: input.suppliedRate,
          deficit: input.deficiency,
        }));
        attempts.push({
          ...failureBase,
          error,
          ...(deficientInputs.length > 0 ? { deficientInputs } : {}),
        });
        enqueueAlternates(branch, getCycleBranchDeficitHandles(deficientInputs));
        break;
      }

      updateCandidateCounts(
        branchModel.candidates,
        result.machineCounts,
        branchModel.edges,
        result.connectionFlows,
      );
      const refresh = refreshSelectedCandidateRecipes(
        branchModel,
        globalSettings,
        result.connectionFlows,
        attempt,
      );
      applyCycleBranchRouteConstraints(branchModel, branch.inputRoutes, cycleSolutions);
      if (!refresh.debugInfo.temperatureConverged) {
        attempts.push({
          ...failureBase,
          error: 'Cycle branch recipe temperatures did not settle after a fresh solve.',
        });
        break;
      }
      if (refresh.changed) {
        attempts.push({
          ...failureBase,
          error: 'Recipe settings or routes changed after flow propagation; solving the branch again.',
        });
        continue;
      }

      const outputNoiseIds = getGeneratedOutputNoiseIds(
        branchModel,
        result.machineCounts,
        result.connectionFlows,
      );
      const outputNoiseEdgeIds = getGeneratedOutputNoiseEdgeIds(
        branchModel,
        result.connectionFlows,
      );
      let plan = materializePlan(
        canvasNodes,
        canvasEdges,
        branchModel,
        result.machineCounts,
        result.connectionFlows,
        globalSettings,
        outputNoiseIds,
        outputNoiseEdgeIds,
      );
      if ('error' in plan && outputNoiseIds.size > 0) {
        plan = materializePlan(
          canvasNodes,
          canvasEdges,
          branchModel,
          result.machineCounts,
          result.connectionFlows,
          globalSettings,
        );
      }

      if ('error' in plan) {
        attempts.push({
          ...failureBase,
          error: plan.error,
          ...(plan.deficientInputs ? { deficientInputs: plan.deficientInputs } : {}),
        });
        enqueueAlternates(branch, getCycleBranchDeficitHandles(plan.deficientInputs));
        break;
      }

      attempts.push({
        ...failureBase,
        error: 'Generated graph verification passed.',
        verified: true,
      });
      verified.push({
        pass: branch.solution.pass,
        attempt,
        telemetry: result.telemetry,
        plan,
      });
      branchSettled = true;
      break;
    }

    if (!branchSettled && attempts.length >= MAX_AUTOCOMPLETE_CYCLE_BRANCH_SOLVES) break;
  }

  const best = selectBestVerifiedAutocompleteCycleSolution(verified, (solution) => solution.plan);
  if (best) {
    const selectedAttempt = attempts.find((attempt) => attempt.attempt === best.solution.attempt);
    if (selectedAttempt) selectedAttempt.selected = true;
  }
  return {
    ...(best ? { recovered: { solution: best.solution, plan: best.value } } : {}),
    attempts,
    cancelled: false,
  };
}

async function runAutocomplete(
  canvasNodes: CanvasNode[],
  canvasEdges: Edge[],
  options: AutocompleteOptions,
  runId: number,
): Promise<AutocompleteResult> {
  const existingNodes = canvasNodes.filter(isRecipeNode);
  const existingNodeIds = new Set(existingNodes.map((node) => node.id));
  const existingEdges = canvasEdges.filter(
    (edge) => existingNodeIds.has(edge.source) && existingNodeIds.has(edge.target),
  );
  if (!existingNodes.some((node) => node.data.isTarget)) {
    return {
      feasible: false,
      error: 'Autocomplete needs at least one target node.',
    };
  }

  const globalSettings = useGlobalSettingsStore.getState().settings;
  const model = buildInitialModel(existingNodes, existingEdges, globalSettings);
  if (!model.initialTemperatureConverged) {
    return {
      feasible: false,
      error: 'Temperature and recipe settings did not settle in the existing graph.',
    };
  }
  if (model.candidates.length === 0) {
    return { feasible: false, error: 'No available recipes can participate in autocomplete.' };
  }

  let finalMachineCounts: Record<string, number> | undefined;
  let finalConnectionFlows: Record<string, number> | undefined;
  let finalTelemetry: RatioSolverTelemetry | undefined;
  let fallbackExpansions = 0;
  const coupledPassDebugTrace: AutocompletePassDebugInfo[] = [];
  const seenCoupledStates = new Map<string, { pass: number; historyIndex: number }>();
  const coupledSolveHistory: AutocompleteCycleSolution[] = [];
  let previousCoupledPassFlows: Record<string, number> | undefined;
  let previousCoupledPassEdges: Edge[] | undefined;

  for (let coupledPass = 0; coupledPass < MAX_COUPLED_SOLVES; coupledPass += 1) {
    if (runId !== activeAutocompleteRun) {
      return { feasible: false, error: 'Computation cancelled.' };
    }

    const coupledModelSignature = getCoupledModelSignature(model);
    const firstSeenState = seenCoupledStates.get(coupledModelSignature);
    if (firstSeenState !== undefined) {
      const repeatedPass = coupledPass + 1;
      const debugCycle: AutocompleteCoupledStateCycle = {
        firstSeenPass: firstSeenState.pass,
        repeatedPass,
        period: repeatedPass - firstSeenState.pass,
        stateFingerprint: getCoupledStateFingerprint(coupledModelSignature),
        candidateCount: model.candidates.length,
        edgeCount: model.edges.length,
      };
      const cycleSolutions = coupledSolveHistory.slice(firstSeenState.historyIndex);
      options.onProgress?.({
        phase: 'finalizing',
        message: `Re-solving stable routes from the repeated recipe-state cycle (${cycleSolutions.length}).`,
        solver: 'native',
      });
      const recovery = await recoverAutocompleteCycle(
        cycleSolutions,
        canvasNodes,
        canvasEdges,
        globalSettings,
        options,
        runId,
      );

      if (recovery.cancelled || runId !== activeAutocompleteRun) {
        return { feasible: false, error: 'Computation cancelled.' };
      }
      if (recovery.recovered) {
        return {
          feasible: true,
          telemetry: recovery.recovered.solution.telemetry,
          debugTrace: coupledPassDebugTrace,
          debugCycle,
          cycleRecoveryAttempts: recovery.attempts,
          plan: recovery.recovered.plan,
        };
      }

      return {
        feasible: false,
        error: `Generated recipe settings repeated the same model state from pass ${firstSeenState.pass} at pass ${repeatedPass}, and none of ${recovery.attempts.length} re-solved route branches passed generated-graph verification.`,
        telemetry: finalTelemetry,
        debugTrace: coupledPassDebugTrace,
        debugCycle,
        cycleRecoveryAttempts: recovery.attempts,
      };
    }
    seenCoupledStates.set(coupledModelSignature, {
      pass: coupledPass + 1,
      historyIndex: coupledSolveHistory.length,
    });
    const coupledPassModel = snapshotAutocompleteModel(model);

    options.onProgress?.({
      phase: 'building',
      message:
        coupledPass === 0
          ? `Building autocomplete model with ${model.candidates.length} recipe candidates.`
          : `Rechecking generated recipes (${coupledPass + 1}/${MAX_COUPLED_SOLVES}).`,
      solver: 'native',
    });

    const coupledPassEdges = [...model.edges];
    const session = solveRatios(
      model.candidates.map((candidate) =>
        candidate.kind === 'existing'
          ? {
              ...candidate.node,
              data: {
                ...candidate.node.data,
                isTarget: true,
                machineCount: candidate.minimumMachineCount ?? 0,
              },
            }
          : candidate.node,
      ),
      model.edges,
      {
        optimizationConfiguration: options.configuration,
        onProgress: options.onProgress,
        modelSnapshot: buildCandidateModelSnapshot(model.candidates),
        minimizeLinkedOutputExcess: true,
        excludeAvoidableInfiniteCostMachines: true,
      },
    );
    const result = await session.promise;
    if (runId !== activeAutocompleteRun) {
      return { feasible: false, error: 'Computation cancelled.' };
    }

    if (!result.feasible || !result.machineCounts || !result.connectionFlows) {
      const fallbackRequests = getFallbackRequestsFromDiagnostics(
        result.diagnostics,
        model.candidates,
      );
      let addedFallback = false;
      if (fallbackExpansions < MAX_FALLBACK_EXPANSIONS) {
        for (const { productId, temperature } of fallbackRequests) {
          addedFallback ||= addFallbackCandidate(model, productId, globalSettings, temperature);
        }
      }
      if (addedFallback) {
        fallbackExpansions += 1;
        rebuildCandidateEdges(model, globalSettings);
        coupledPass -= 1;
        continue;
      }
      return {
        feasible: false,
        error: result.error,
        diagnostics: result.diagnostics,
        telemetry: result.telemetry,
      };
    }

    finalTelemetry = result.telemetry;
    coupledSolveHistory.push({
      pass: coupledPass + 1,
      model: coupledPassModel,
      resolvedSettingsByCandidate: getResolvedSettingsByCandidate(coupledPassModel),
      activeIncomingEndpoints: getActiveIncomingEndpoints(coupledPassModel, result.connectionFlows),
      machineCounts: { ...result.machineCounts },
      connectionFlows: { ...result.connectionFlows },
      telemetry: result.telemetry,
    });
    const connectionFlowChanges = getConnectionFlowChanges(
      previousCoupledPassFlows,
      result.connectionFlows,
      previousCoupledPassEdges,
      coupledPassEdges,
      model.candidates,
    );
    const previousCandidateCounts = new Map(
      model.candidates.map((candidate) => [
        candidate.node.id,
        candidate.node.data.machineCount ?? 0,
      ]),
    );
    updateCandidateCounts(
      model.candidates,
      result.machineCounts,
      model.edges,
      result.connectionFlows,
    );
    const allMachineCountChanges = model.candidates.flatMap((candidate) => {
      const previous = previousCandidateCounts.get(candidate.node.id) ?? 0;
      const next = candidate.node.data.machineCount ?? 0;
      if (previous === next) return [];
      return [
        {
          nodeId: candidate.node.id,
          recipeId: candidate.node.data.recipeId,
          specialRecipe: !!getSpecialRecipe(candidate.node.data.recipeId),
          previous,
          next,
        },
      ];
    });
    const refreshResult = refreshSelectedCandidateRecipes(
      model,
      globalSettings,
      result.connectionFlows,
      coupledPass + 1,
    );
    refreshResult.debugInfo.modelStateFingerprint =
      getCoupledStateFingerprint(coupledModelSignature);
    refreshResult.debugInfo.machineCountChangeCount = allMachineCountChanges.length;
    refreshResult.debugInfo.machineCountChanges = getDebugSamples(allMachineCountChanges);
    refreshResult.debugInfo.solverStatus = result.telemetry?.nativeStatus;
    refreshResult.debugInfo.connectionFlowComparison = previousCoupledPassFlows
      ? 'compared'
      : 'baseline';
    refreshResult.debugInfo.connectionFlowChangeCount = connectionFlowChanges.count;
    refreshResult.debugInfo.connectionFlowChanges = connectionFlowChanges.sample;
    refreshResult.debugInfo.objectiveStages =
      result.telemetry?.stageTelemetry?.map(({ name, objectiveValue }) => ({
        name,
        objectiveValue,
      })) ?? [];
    coupledPassDebugTrace.push(refreshResult.debugInfo);
    previousCoupledPassFlows = result.connectionFlows;
    previousCoupledPassEdges = coupledPassEdges;
    if (!refreshResult.debugInfo.temperatureConverged) {
      return {
        feasible: false,
        error: 'Temperature and recipe settings did not settle within the propagation limits.',
        telemetry: finalTelemetry,
        debugTrace: coupledPassDebugTrace,
      };
    }
    if (!refreshResult.changed) {
      finalMachineCounts = result.machineCounts;
      finalConnectionFlows = result.connectionFlows;
      break;
    }
    if (coupledPass === MAX_COUPLED_SOLVES - 1) {
      return {
        feasible: false,
        error: `Generated recipes did not settle after ${MAX_COUPLED_SOLVES} solve passes.`,
        telemetry: finalTelemetry,
        debugTrace: coupledPassDebugTrace,
      };
    }
  }

  if (!finalMachineCounts || !finalConnectionFlows) {
    return { feasible: false, error: 'Autocomplete stopped before producing a solution.' };
  }

  options.onProgress?.({
    phase: 'finalizing',
    message: 'Verifying and laying out the generated production graph.',
    solver: 'native',
  });
  const outputNoiseIds = getGeneratedOutputNoiseIds(
    model,
    finalMachineCounts,
    finalConnectionFlows,
  );
  const outputNoiseEdgeIds = getGeneratedOutputNoiseEdgeIds(model, finalConnectionFlows);
  let plan = materializePlan(
    canvasNodes,
    canvasEdges,
    model,
    finalMachineCounts,
    finalConnectionFlows,
    globalSettings,
    outputNoiseIds,
    outputNoiseEdgeIds,
  );
  if ('error' in plan && outputNoiseIds.size > 0) {
    plan = materializePlan(
      canvasNodes,
      canvasEdges,
      model,
      finalMachineCounts,
      finalConnectionFlows,
      globalSettings,
    );
  }
  if ('error' in plan) {
    return { feasible: false, error: plan.error, telemetry: finalTelemetry };
  }

  return { feasible: true, telemetry: finalTelemetry, plan };
}

export function solveAutocomplete(
  canvasNodes: CanvasNode[],
  canvasEdges: Edge[],
  options: AutocompleteOptions,
): AutocompleteSession {
  const runId = ++activeAutocompleteRun;
  return {
    promise: runAutocomplete(canvasNodes, canvasEdges, options, runId),
  };
}

export function cancelAutocomplete(): void {
  activeAutocompleteRun += 1;
  cancelRatioOptimizer();
}
