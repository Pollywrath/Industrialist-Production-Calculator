import { getMachine } from '../data/lookup';
import { getSpecialRecipe } from '../data/registry';
import type { Recipe } from '../types/data';
import { estimatePowerModelCount, getRecipePowerTotals } from './recipePower';

export interface RecipeOptimizationMetrics {
  powerUsePerMachine: number;
  powerOutputPerMachine: number;
  pollutionPerMachine: number;
  machineCostPerWholeMachine: number;
  hasInfiniteMachineCost: boolean;
  modelCountPerWholeMachine: number;
  machineSpacePerWholeMachine: number;
}

function toNonnegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function toFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function resolveOptimizationSettings(
  recipeId: string,
  nodeSettings: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const specialRecipe = getSpecialRecipe(recipeId);
  if (!specialRecipe) return { ...(nodeSettings ?? {}) };

  const defaultSettings: Record<string, unknown> = {};
  for (const [key, definition] of Object.entries(specialRecipe.settings)) {
    defaultSettings[key] = definition.default;
  }

  return {
    ...defaultSettings,
    ...(nodeSettings ?? {}),
  };
}

export function getRecipeOptimizationMetrics(
  recipe: Recipe,
  nodeSettings: Record<string, unknown> | undefined,
  globalSettings: Record<string, unknown> | undefined,
  nodeId?: string,
): RecipeOptimizationMetrics {
  const specialRecipe = getSpecialRecipe(recipe.id);
  const resolvedSettings = resolveOptimizationSettings(recipe.id, nodeSettings);
  const machine = getMachine(recipe.machine_id);

  const machineCost = machine
    ? specialRecipe?.computeMachineCost
      ? specialRecipe.computeMachineCost(resolvedSettings, globalSettings, nodeId)
      : machine.cost
    : 0;

  const modelCount = specialRecipe?.computeModelCount
    ? specialRecipe.computeModelCount(resolvedSettings, globalSettings, nodeId)
    : 1 + 2 * recipe.inputs.length + 2 * recipe.outputs.length + estimatePowerModelCount(recipe);
  const machineSpace = specialRecipe?.computeMachineSpace
    ? specialRecipe.computeMachineSpace(resolvedSettings, globalSettings, nodeId)
    : machine
      ? machine.size.x * machine.size.y
      : 0;

  const powerIsConstant = recipe.powerIndependentOfMachineCount === true;
  const pollutionIsConstant =
    recipe.pollutionIndependentOfMachineCount === true ||
    specialRecipe?.pollutionIndependentOfMachineCount === true;
  const hasInfiniteMachineCost = machineCost === Infinity;

  return {
    // Fixed per-node effects do not affect ratio selection because the node already exists.
    powerUsePerMachine: powerIsConstant
      ? 0
      : toNonnegativeFinite(getRecipePowerTotals(recipe, 1).use),
    powerOutputPerMachine: powerIsConstant
      ? 0
      : toNonnegativeFinite(getRecipePowerTotals(recipe, 1).output),
    pollutionPerMachine: pollutionIsConstant ? 0 : toFinite(recipe.pollution ?? 0),
    machineCostPerWholeMachine: hasInfiniteMachineCost ? 0 : toNonnegativeFinite(machineCost),
    hasInfiniteMachineCost,
    modelCountPerWholeMachine: toNonnegativeFinite(modelCount),
    machineSpacePerWholeMachine: toNonnegativeFinite(machineSpace),
  };
}
