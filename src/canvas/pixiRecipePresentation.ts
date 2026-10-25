import type { Recipe } from '../types/data';
import type { RecipeNodeType } from '../types/nodes';
import type { NodeFlowResult } from '../types/solver';
import type { RateMode } from '../types/ui';
import { getMachine, getMachineName, getProductName } from '../data/lookup';
import { getSpecialRecipe } from '../data/registry';
import { buildHandleId } from '../utils/idGenerator';
import { getRecipeEntryProductId } from '../utils/handleTypes';
import { getRateMultiplier, getNormalizedCycleTime } from '../utils/recipeComputation';
import {
  formatPollution,
  formatQuantity,
  formatTemperature,
  formatTime,
} from '../utils/unitFormatting';
import { formatRecipePowerLine } from '../utils/recipePower';

export interface PixiRecipePresentation {
  readonly machineName: string;
  readonly machineTierColor?: string;
  readonly temperature?: string;
  readonly cycleTime: string;
  readonly power: string;
  readonly pollution: string;
  readonly portSummaries: ReadonlyMap<string, string>;
  readonly deficientPortIds: ReadonlySet<string>;
  readonly excessPortIds: ReadonlySet<string>;
}

export interface PixiRecipePresentationInput {
  readonly node: RecipeNodeType;
  readonly recipe: Recipe;
  readonly rateMode: RateMode;
  readonly flowResult?: NodeFlowResult;
  readonly isSolveFresh: boolean;
  readonly resolvedProducts: Readonly<Record<string, string>>;
  readonly inputTemperatures?: Readonly<Record<number, number>>;
}

interface CachedPresentation {
  readonly input: PixiRecipePresentationInput;
  readonly dataDbVersion: number;
  readonly themeVersion: number;
  readonly presentation: PixiRecipePresentation;
}

function sameInputTemperatures(
  left: Readonly<Record<number, number>> | undefined,
  right: Readonly<Record<number, number>> | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left[Number(key)] === right[Number(key)])
  );
}

function sameResolvedProducts(
  left: PixiRecipePresentationInput,
  right: PixiRecipePresentationInput,
): boolean {
  if (!left.isSolveFresh && !right.isSolveFresh) return true;
  if (left.isSolveFresh !== right.isSolveFresh) return false;
  for (const [side, entries] of [
    ['input', left.recipe.inputs],
    ['output', left.recipe.outputs],
  ] as const) {
    for (let index = 0; index < entries.length; index++) {
      const handleId = buildHandleId(left.node.id, side, index);
      if (left.resolvedProducts[handleId] !== right.resolvedProducts[handleId]) return false;
    }
  }
  return true;
}

function samePresentationInputs(
  left: CachedPresentation,
  input: PixiRecipePresentationInput,
  dataDbVersion: number,
  themeVersion: number,
): boolean {
  return (
    left.dataDbVersion === dataDbVersion &&
    left.themeVersion === themeVersion &&
    left.input.node.data === input.node.data &&
    left.input.recipe === input.recipe &&
    left.input.rateMode === input.rateMode &&
    left.input.flowResult === input.flowResult &&
    left.input.isSolveFresh === input.isSolveFresh &&
    sameResolvedProducts(left.input, input) &&
    sameInputTemperatures(left.input.inputTemperatures, input.inputTemperatures)
  );
}

export function createPixiRecipePresentationCache() {
  const cacheByNodeId = new Map<string, CachedPresentation[]>();
  return {
    get(
      input: PixiRecipePresentationInput,
      versions: { readonly dataDbVersion: number; readonly themeVersion: number },
    ): PixiRecipePresentation {
      const entries = cacheByNodeId.get(input.node.id) ?? [];
      const cached = entries.find((entry) =>
        samePresentationInputs(entry, input, versions.dataDbVersion, versions.themeVersion),
      );
      if (cached) return cached.presentation;

      const presentation = createPixiRecipePresentation(input);
      entries.unshift({
        input,
        dataDbVersion: versions.dataDbVersion,
        themeVersion: versions.themeVersion,
        presentation,
      });
      if (entries.length > 4) entries.length = 4;
      cacheByNodeId.set(input.node.id, entries);
      return presentation;
    },
    retainNodeIds(nodeIds: ReadonlySet<string>) {
      for (const nodeId of cacheByNodeId.keys()) {
        if (!nodeIds.has(nodeId)) cacheByNodeId.delete(nodeId);
      }
    },
  };
}

function getTierColor(tier: number | undefined): string | undefined {
  if (tier === undefined || typeof document === 'undefined') return undefined;
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue(`--theme-color-tier-${tier}`)
    .trim();
  return color || undefined;
}

export function createPixiRecipePresentation({
  node,
  recipe,
  rateMode,
  flowResult,
  isSolveFresh,
  resolvedProducts,
  inputTemperatures,
}: PixiRecipePresentationInput): PixiRecipePresentation {
  const multiplier = getRateMultiplier(recipe.cycle_time, rateMode);
  const flowScale = getNormalizedCycleTime(recipe.cycle_time, rateMode);
  const specialRecipe = getSpecialRecipe(recipe.id);
  const pollutionMultiplier = specialRecipe?.pollutionIndependentOfMachineCount
    ? 1
    : node.data.machineCount;
  const portSummaries = new Map<string, string>();
  const deficientPortIds = new Set<string>();
  const excessPortIds = new Set<string>();

  for (const side of ['input', 'output'] as const) {
    const entries = side === 'input' ? recipe.inputs : recipe.outputs;
    const statuses = side === 'input' ? flowResult?.inputFlows : flowResult?.outputFlows;
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      if (!entry) continue;
      const handleId = buildHandleId(node.id, side, index);
      const productId =
        (isSolveFresh ? resolvedProducts[handleId] : '') ||
        getRecipeEntryProductId(recipe, side, index) ||
        '';
      const actualFlow = isSolveFresh ? (statuses?.[index]?.connected ?? 0) * flowScale : 0;
      const scale = entry.independentOfMachineCount ? 1 : node.data.machineCount;
      const totalQuantity = entry.variable ? actualFlow : entry.quantity * scale * multiplier;
      portSummaries.set(handleId, `${formatQuantity(totalQuantity)}x ${getProductName(productId)}`);
      if (isSolveFresh && !entry.variable) {
        if (side === 'input' && statuses?.[index]?.hasDeficiency) deficientPortIds.add(handleId);
        if (side === 'output' && statuses?.[index]?.hasExcess) excessPortIds.add(handleId);
      }
    }
  }

  const tier = getMachine(recipe.machine_id)?.tier;
  const machineTierColor = getTierColor(tier);
  const temperatureInputIndex = specialRecipe?.inputTemperatureSettings
    ? Object.keys(specialRecipe.inputTemperatureSettings).map(Number)[0]
    : undefined;
  const temperatureValue =
    typeof recipe.runtime?.boilerTemp === 'number'
      ? recipe.runtime.boilerTemp
      : typeof recipe.runtime?.hxTemp === 'number'
        ? recipe.runtime.hxTemp
        : temperatureInputIndex === undefined
          ? undefined
          : inputTemperatures?.[temperatureInputIndex];
  return {
    machineName: getMachineName(recipe.machine_id),
    ...(machineTierColor ? { machineTierColor } : {}),
    ...(typeof temperatureValue === 'number'
      ? { temperature: formatTemperature(temperatureValue) }
      : {}),
    cycleTime: formatTime(getNormalizedCycleTime(recipe.cycle_time, rateMode)),
    power: formatRecipePowerLine(recipe, node.data.machineCount),
    pollution: formatPollution((recipe.pollution ?? 0) * pollutionMultiplier),
    portSummaries,
    deficientPortIds,
    excessPortIds,
  };
}
