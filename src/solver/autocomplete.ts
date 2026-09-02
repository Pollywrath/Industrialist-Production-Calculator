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
  FLOW_STATUS_ABSOLUTE_TOLERANCE,
  getScaledTolerance,
  MACHINE_INTEGER_ABSOLUTE_TOLERANCE,
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
const SELECTED_COUNT_EPSILON = MACHINE_INTEGER_ABSOLUTE_TOLERANCE;
const ACTIVE_FLOW_EPSILON = FLOW_STATUS_ABSOLUTE_TOLERANCE;
const RECIPE_TEMPERATURE_EPSILON = 0.01;
const MAX_COUPLED_SOLVES = 12;
const MAX_FALLBACK_EXPANSIONS = 2;
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
  disposalSources: Record<'primary' | 'secondary' | 'last-resort', RecipeDescriptorSource[]>;
  getDescriptors: (source: RecipeDescriptorSource, outputProduct?: string) => RecipeDescriptor[];
}

interface AutocompleteCandidate {
  kind: CandidateKind;
  key: string;
  node: RecipeNodeType;
  recipe: Recipe;
  inputTemperatures?: Record<number, number>;
}

interface AutocompleteModel {
  candidates: AutocompleteCandidate[];
  edges: Edge[];
  descriptorCatalog: RecipeDescriptorCatalog;
  protectedOutputHandles: Set<string>;
  disposalProducts: Set<string>;
  fallbackKeys: Set<string>;
  preservedEdgeEndpointKeys: Set<string>;
  warnings: string[];
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

export interface AutocompleteResult {
  feasible: boolean;
  error?: string;
  diagnostics?: RatioFailureDiagnostics;
  telemetry?: RatioSolverTelemetry;
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

function stableSettingsKey(settings: Record<string, unknown>): string {
  return JSON.stringify(
    Object.entries(settings)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, value]),
  );
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
  if (range.min !== undefined && temperature < range.min - FLOW_STATUS_ABSOLUTE_TOLERANCE)
    return false;
  if (range.max !== undefined && temperature > range.max + FLOW_STATUS_ABSOLUTE_TOLERANCE)
    return false;
  return true;
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

function isPowerOutputOptimizationActive(configuration: OptimizationConfiguration): boolean {
  const powerOutput = configuration.metrics.powerOutput;
  return powerOutput.enabled && powerOutput.weight > 0 && powerOutput.outputGoal !== null;
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
  powerOutputGoal: number | null,
  lockedSettingKeys: Set<string> = new Set(),
): Record<string, unknown>[] {
  const context = {
    globalSettings: globalSettings as unknown as Record<string, unknown>,
    powerOutputGoal,
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
    const previousPollutionPerFlow =
      'pollutionPerFlow' in port ? (port.pollutionPerFlow ?? 0) : 0;
    const nextPollutionPerFlow =
      'pollutionPerFlow' in nextPort ? (nextPort.pollutionPerFlow ?? 0) : 0;
    if (
      port.product_id !== nextPort.product_id ||
      port.handle_type !== nextPort.handle_type ||
      port.product_link_id !== nextPort.product_link_id ||
      port.variable !== nextPort.variable ||
      port.independentOfMachineCount !== nextPort.independentOfMachineCount ||
      !areNearlyEqual(previousPollutionPerFlow, nextPollutionPerFlow) ||
      !areNearlyEqual(port.quantity, nextPort.quantity)
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

function refreshSelectedCandidateRecipes(
  model: AutocompleteModel,
  globalSettings: GlobalSettings,
  connectionFlows: Record<string, number>,
): boolean {
  const selectedCandidates = model.candidates.filter(
    (candidate) => (candidate.node.data.machineCount ?? 0) > SELECTED_COUNT_EPSILON,
  );
  if (selectedCandidates.length === 0) return false;

  let changed = false;
  for (const candidate of selectedCandidates) {
    if (candidate.kind !== 'generated') continue;
    const specialRecipe = getSpecialRecipe(candidate.node.data.recipeId);
    if (!specialRecipe?.sizeAutocompleteSettings) continue;

    const settings = candidate.node.data.settings ?? {};
    const nextSettings = specialRecipe.sizeAutocompleteSettings(settings, {
      globalSettings: globalSettings as unknown as Record<string, unknown>,
      machineCount: candidate.node.data.machineCount ?? 0,
    });
    if (stableSettingsKey(settings) === stableSettingsKey(nextSettings)) continue;
    candidate.node = {
      ...candidate.node,
      data: { ...candidate.node.data, settings: nextSettings },
    };
    changed = true;
  }

  const selectedIds = new Set(selectedCandidates.map((candidate) => candidate.node.id));
  const activeEdges = model.edges.filter(
    (edge) =>
      selectedIds.has(edge.source) &&
      selectedIds.has(edge.target) &&
      (connectionFlows[edge.id] ?? 0) > ACTIVE_FLOW_EPSILON,
  );
  const snapshot = solveFlowPipeline(
    selectedCandidates.map((candidate) => candidate.node),
    activeEdges,
    globalSettings as unknown as Record<string, unknown>,
  );

  for (const candidate of selectedCandidates) {
    const recipe = snapshot.nodeRecipes[candidate.node.id];
    if (!recipe) continue;
    if (!areResolvedRecipesEquivalent(candidate.recipe, recipe)) {
      changed = true;
    }
    candidate.recipe = recipe;
    candidate.inputTemperatures = snapshot.inputTemps[candidate.node.id];
  }
  changed = pruneUnproducibleGeneratedCandidates(model) || changed;
  changed = rebuildCandidateEdges(model, globalSettings) || changed;
  return changed;
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

function buildRecipeDescriptorCatalog(
  globalSettings: GlobalSettings,
  configuration: OptimizationConfiguration,
): RecipeDescriptorCatalog {
  const powerOutputGoal = configuration.metrics.powerOutput.outputGoal;
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
  const disposalSources: RecipeDescriptorCatalog['disposalSources'] = {
    primary: sources.filter(
      (source) => source.specialRecipe?.autocompleteDisposalPriority === 'primary',
    ),
    secondary: sources.filter(
      (source) => source.specialRecipe?.autocompleteDisposalPriority === 'secondary',
    ),
    'last-resort': sources.filter(
      (source) => source.specialRecipe?.autocompleteDisposalPriority === 'last-resort',
    ),
  };

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
          powerOutputGoal,
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

  return { sources, sourcesByOutput, disposalSources, getDescriptors };
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

function bindDisposalDescriptor(
  descriptor: RecipeDescriptor,
  productId: string,
  globalSettings: GlobalSettings,
): RecipeDescriptor | null {
  const product = getProduct(productId);
  if (!product) return null;
  const inputIndex = descriptor.recipe.inputs.findIndex(
    (input) =>
      input.product_id === productId ||
      (input.product_id === 'any_fluid' && product.type === 'Fluid') ||
      (input.product_id === 'any_item' && product.type === 'Item'),
  );
  if (inputIndex < 0) return null;
  if (descriptor.recipe.inputs[inputIndex].product_id === productId) return descriptor;

  const recipe = resolveActiveRecipe(
    descriptor.recipeId,
    descriptor.settings,
    `autocomplete-disposal-${descriptor.recipeId}-${productId}`,
    {
      resolveProduct: (side, index) => {
        const ports = side === 'input' ? descriptor.recipe.inputs : descriptor.recipe.outputs;
        return side === 'input' && index === inputIndex
          ? productId
          : (ports[index]?.product_id ?? '');
      },
      hasConnection: (side, index) => side === 'input' && index === inputIndex,
    },
    {
      globalSettings: globalSettings as unknown as Record<string, unknown>,
      suppressStoreTemperatureOverrides: true,
    },
  );
  if (!recipe || recipe.inputs[inputIndex]?.product_id !== productId) return null;
  return {
    ...descriptor,
    key: `${descriptor.key}::dispose:${inputIndex}:${productId}`,
    recipe,
  };
}

function getDisposalDescriptors(
  catalog: RecipeDescriptorCatalog,
  productId: string,
  globalSettings: GlobalSettings,
): RecipeDescriptor[] {
  for (const priority of ['primary', 'secondary', 'last-resort'] as const) {
    const descriptors: RecipeDescriptor[] = [];
    const seen = new Set<string>();
    for (const source of catalog.disposalSources[priority]) {
      for (const descriptor of catalog.getDescriptors(source)) {
        const bound = bindDisposalDescriptor(descriptor, productId, globalSettings);
        if (!bound || seen.has(bound.key)) continue;
        seen.add(bound.key);
        descriptors.push(bound);
      }
    }
    if (descriptors.length > 0) return descriptors;
  }
  return [];
}

function buildInitialModel(
  existingNodes: RecipeNodeType[],
  existingEdges: Edge[],
  globalSettings: GlobalSettings,
  configuration: OptimizationConfiguration,
): AutocompleteModel {
  const currentSnapshot = solveFlowPipeline(
    existingNodes,
    existingEdges,
    globalSettings as unknown as Record<string, unknown>,
  );
  const descriptorCatalog = buildRecipeDescriptorCatalog(globalSettings, configuration);

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

  const needsPowerCandidates = isPowerOutputOptimizationActive(configuration);
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
        if (!needsPowerCandidates && hasRecipePowerOutput(source.baseRecipe)) continue;
        for (const descriptor of descriptorCatalog.getDescriptors(source, productId)) {
          if (!needsPowerCandidates && hasRecipePowerOutput(descriptor.recipe)) continue;
          recordProducedTemperatures(descriptor.recipe);
        }
      }
    }
  };

  const addConcreteDescriptor = (descriptor: RecipeDescriptor): void => {
    if (candidateKeys.has(descriptor.key)) return;
    const node = createRecipeNode(descriptor.recipe, descriptor.settings, 0);
    candidates.push({
      kind: 'generated',
      key: descriptor.key,
      node,
      recipe: descriptor.recipe,
    });
    candidateKeys.add(descriptor.key);
    recordProducedTemperatures(descriptor.recipe);
    for (const productId of getConcreteInputProducts(descriptor.recipe)) {
      requiredProducts.push(productId);
    }
  };

  const addDescriptor = (descriptor: RecipeDescriptor): void => {
    if (!needsPowerCandidates && hasRecipePowerOutput(descriptor.recipe)) return;
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

  if (needsPowerCandidates) {
    for (const source of descriptorCatalog.sources) {
      if (!hasRecipePowerOutput(source.baseRecipe)) continue;
      for (const descriptor of descriptorCatalog.getDescriptors(source)) {
        if (hasRecipePowerOutput(descriptor.recipe)) addDescriptor(descriptor);
      }
    }
  }

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
    protectedOutputHandles,
    disposalProducts: new Set(),
    fallbackKeys: new Set(),
    preservedEdgeEndpointKeys: new Set(existingEdges.map(edgeEndpointKey)),
    warnings: [...warnings],
  };
  pruneUnproducibleGeneratedCandidates(model);
  rebuildCandidateEdges(model, globalSettings);
  return model;
}

function addNeededDisposalCandidates(
  model: AutocompleteModel,
  machineCounts: Record<string, number>,
  connectionFlows: Record<string, number>,
  globalSettings: GlobalSettings,
): boolean {
  const outgoingFlowByHandle = new Map<string, number>();
  for (const edge of model.edges) {
    if (!edge.sourceHandle) continue;
    outgoingFlowByHandle.set(
      edge.sourceHandle,
      (outgoingFlowByHandle.get(edge.sourceHandle) ?? 0) +
        Math.max(0, connectionFlows[edge.id] ?? 0),
    );
  }

  const excessProducts = new Set<string>();
  for (const candidate of model.candidates) {
    const machineCount = Math.max(0, machineCounts[candidate.node.id] ?? 0);
    if (machineCount <= SELECTED_COUNT_EPSILON || candidate.recipe.outputs.length === 0) continue;
    const multiplier = getRateMultiplier(candidate.recipe.cycle_time, 'second');

    for (let outputIndex = 0; outputIndex < candidate.recipe.outputs.length; outputIndex += 1) {
      const output = candidate.recipe.outputs[outputIndex];
      const handleId = buildHandleId(candidate.node.id, 'output', outputIndex);
      if (
        model.protectedOutputHandles.has(handleId) ||
        output.voidable ||
        output.product_link_id ||
        PLACEHOLDER_PRODUCTS.has(output.product_id)
      ) {
        continue;
      }
      const produced = output.quantity * multiplier * machineCount;
      const routed = outgoingFlowByHandle.get(handleId) ?? 0;
      if (produced - routed > getScaledTolerance(produced, routed)) {
        excessProducts.add(output.product_id);
      }
    }
  }

  const candidateKeys = new Set(model.candidates.map((candidate) => candidate.key));
  let added = false;
  for (const productId of excessProducts) {
    if (model.disposalProducts.has(productId)) continue;
    model.disposalProducts.add(productId);
    const descriptors = getDisposalDescriptors(model.descriptorCatalog, productId, globalSettings);
    if (descriptors.length === 0) {
      const productName = getProduct(productId)?.name ?? productId;
      model.warnings.push(`No unlocked disposal recipe can accept excess ${productName}.`);
      continue;
    }
    for (const descriptor of descriptors) {
      if (candidateKeys.has(descriptor.key)) continue;
      candidateKeys.add(descriptor.key);
      model.candidates.push({
        kind: 'generated',
        key: descriptor.key,
        node: createRecipeNode(descriptor.recipe, descriptor.settings, 0),
        recipe: descriptor.recipe,
      });
      added = true;
    }
  }
  return added;
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
): void {
  for (const candidate of candidates) {
    const solvedCount = Math.max(0, machineCounts[candidate.node.id] ?? 0);
    const machineCount =
      candidate.node.data.isTarget || solvedCount > SELECTED_COUNT_EPSILON ? solvedCount : 0;
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
): AutocompletePlan | { error: string } {
  const selectedCandidateIds = new Set<string>();
  const newRecipeNodes: RecipeNodeType[] = [];
  const materializedIdByCandidateId = new Map<string, string>();
  const appliedMachineCounts: Record<string, number> = {};

  for (const candidate of model.candidates) {
    const rawSolvedCount = Math.max(0, machineCounts[candidate.node.id] ?? 0);
    const solvedCount =
      candidate.node.data.isTarget || rawSolvedCount > SELECTED_COUNT_EPSILON ? rawSolvedCount : 0;
    if (candidate.kind === 'existing') {
      materializedIdByCandidateId.set(candidate.node.id, candidate.node.id);
      appliedMachineCounts[candidate.node.id] = solvedCount;
      if (solvedCount > SELECTED_COUNT_EPSILON) selectedCandidateIds.add(candidate.node.id);
      continue;
    }
    if (solvedCount <= SELECTED_COUNT_EPSILON) continue;

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
        machineCount: materializedCount,
        inputOrder: candidate.recipe.inputs.map((_, index) => index),
        outputOrder: candidate.recipe.outputs.map((_, index) => index),
        settings,
      },
    };
    newRecipeNodes.push(node);
    selectedCandidateIds.add(candidate.node.id);
    materializedIdByCandidateId.set(candidate.node.id, node.id);
    appliedMachineCounts[node.id] = materializedCount;
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
    if ((connectionFlows[edge.id] ?? 0) <= ACTIVE_FLOW_EPSILON) continue;
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
  for (const node of recipeNodes) {
    if ((node.data.machineCount ?? 0) <= SELECTED_COUNT_EPSILON) continue;
    const result = verification.results.get(node.id);
    if (result?.inputFlows.some((input) => input.hasDeficiency)) {
      return {
        error: `The generated graph did not reproduce the solver flow for ${verification.nodeRecipes[node.id]?.name ?? node.data.recipeId}.`,
      };
    }
    const recipe = verification.nodeRecipes[node.id];
    if (
      recipe?.outputs.some(
        (output, index) => output.product_link_id && result?.outputFlows[index]?.hasExcess,
      )
    ) {
      return {
        error: `The generated graph could not circulate the linked output for ${recipe.name}.`,
      };
    }
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
  if (
    !existingNodes.some((node) => node.data.isTarget) &&
    !isPowerOutputOptimizationActive(options.configuration)
  ) {
    return {
      feasible: false,
      error: 'Autocomplete needs at least one target node or a Power Output goal.',
    };
  }

  const globalSettings = useGlobalSettingsStore.getState().settings;
  const model = buildInitialModel(
    existingNodes,
    existingEdges,
    globalSettings,
    options.configuration,
  );
  if (model.candidates.length === 0) {
    return { feasible: false, error: 'No available recipes can participate in autocomplete.' };
  }

  let finalMachineCounts: Record<string, number> | undefined;
  let finalConnectionFlows: Record<string, number> | undefined;
  let finalTelemetry: RatioSolverTelemetry | undefined;
  let fallbackExpansions = 0;

  for (let coupledPass = 0; coupledPass < MAX_COUPLED_SOLVES; coupledPass += 1) {
    if (runId !== activeAutocompleteRun) {
      return { feasible: false, error: 'Computation cancelled.' };
    }

    options.onProgress?.({
      phase: 'building',
      message:
        coupledPass === 0
          ? `Building autocomplete model with ${model.candidates.length} recipe candidates.`
          : `Rechecking generated recipes (${coupledPass + 1}/${MAX_COUPLED_SOLVES}).`,
      solver: 'native',
    });

    const session = solveRatios(
      model.candidates.map((candidate) => candidate.node),
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
    updateCandidateCounts(model.candidates, result.machineCounts);
    if (
      addNeededDisposalCandidates(
        model,
        result.machineCounts,
        result.connectionFlows,
        globalSettings,
      )
    ) {
      rebuildCandidateEdges(model, globalSettings);
      continue;
    }
    const recipesChanged = refreshSelectedCandidateRecipes(
      model,
      globalSettings,
      result.connectionFlows,
    );
    if (!recipesChanged) {
      finalMachineCounts = result.machineCounts;
      finalConnectionFlows = result.connectionFlows;
      break;
    }
    if (coupledPass === MAX_COUPLED_SOLVES - 1) {
      return {
        feasible: false,
        error: `Generated recipes did not settle after ${MAX_COUPLED_SOLVES} solve passes.`,
        telemetry: finalTelemetry,
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
  const plan = materializePlan(
    canvasNodes,
    canvasEdges,
    model,
    finalMachineCounts,
    finalConnectionFlows,
    globalSettings,
  );
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
