import { getAllRecipes, getMachine, isMachineUnlocked } from '../data/lookup';
import type { Machine, Recipe } from '../types/data';
import type { GlobalSettings } from '../stores/useGlobalSettingsStore';

export function isMachineAvailable(
  machine: Machine,
  settings: GlobalSettings,
  unlockedResearchIds = new Set(settings.unlockedResearchIds),
): boolean {
  if (!isMachineUnlocked(machine, unlockedResearchIds)) return false;
  if (machine.id === 'm_industrial_drill' && !settings.oreNodesEnabled) return false;

  const isSandbox = settings.difficulty === 'sandbox' || settings.difficulty === 'sandbox_plus';
  if (machine.sandboxPlusOnly && settings.difficulty !== 'sandbox_plus') return false;
  if (machine.sandboxOnly && !isSandbox) return false;

  const isVariant = !!machine.variant && machine.variant !== 'none';
  if (!settings.showVariantLimited && (isVariant || machine.limited)) return false;
  return true;
}

export function isRecipeAvailable(
  recipe: Recipe,
  settings: GlobalSettings,
  unlockedResearchIds = new Set(settings.unlockedResearchIds),
): boolean {
  const machine = getMachine(recipe.machine_id);
  return !machine || isMachineAvailable(machine, settings, unlockedResearchIds);
}

export function isRecipeAvailableForAutomation(
  recipe: Recipe,
  settings: GlobalSettings,
  unlockedResearchIds = new Set(settings.unlockedResearchIds),
): boolean {
  const machine = getMachine(recipe.machine_id);
  return (
    (!machine || !machine.requiresManualOperation) &&
    isRecipeAvailable(recipe, settings, unlockedResearchIds)
  );
}

export function getAvailableRecipes(settings: GlobalSettings): Recipe[] {
  const unlockedResearchIds = new Set(settings.unlockedResearchIds);
  return getAllRecipes().filter((recipe) =>
    isRecipeAvailable(recipe, settings, unlockedResearchIds),
  );
}

export function getAvailableAutomationRecipes(settings: GlobalSettings): Recipe[] {
  const unlockedResearchIds = new Set(settings.unlockedResearchIds);
  return getAllRecipes().filter((recipe) =>
    isRecipeAvailableForAutomation(recipe, settings, unlockedResearchIds),
  );
}
