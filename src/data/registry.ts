import type { SpecialRecipe } from '../types/specialRecipes';

function isSpecialRecipe(value: unknown): value is SpecialRecipe {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'machine_id' in value &&
    'settings' in value &&
    'compute' in value &&
    typeof (value as SpecialRecipe).compute === 'function'
  );
}

const modules = import.meta.glob(
  ['./special_recipes/*.ts', '!./special_recipes/nuclear_power_plant.ts'],
  { eager: true }
);

const BASE_SPECIAL_RECIPES: Record<string, SpecialRecipe> = {};

function registerSpecialRecipe(target: Record<string, SpecialRecipe>, recipe: SpecialRecipe): void {
  if (import.meta.env.DEV && target[recipe.id]) {
    console.warn(`[Special Recipe Registry] Duplicate special recipe id detected: "${recipe.id}"`);
  }
  target[recipe.id] = recipe;
}

function collectSpecialRecipesFromExport(
  target: Record<string, SpecialRecipe>,
  exportValue: unknown,
): void {
  if (isSpecialRecipe(exportValue)) {
    registerSpecialRecipe(target, exportValue);
    return;
  }

  if (!Array.isArray(exportValue)) {
    return;
  }

  let matchedCount = 0;
  for (let i = 0; i < exportValue.length; i++) {
    const entry = exportValue[i];
    if (isSpecialRecipe(entry)) {
      registerSpecialRecipe(target, entry);
      matchedCount++;
    }
  }

  if (import.meta.env.DEV && matchedCount > 0 && matchedCount < exportValue.length) {
    console.warn(
      `[Special Recipe Registry] Mixed export array detected (${matchedCount}/${exportValue.length} valid special recipes).`,
    );
  }
}

for (const path in modules) {
  const module = modules[path] as Record<string, unknown>;
  for (const exportName in module) {
    collectSpecialRecipesFromExport(BASE_SPECIAL_RECIPES, module[exportName]);
  }
}

let SPECIAL_RECIPES: Record<string, SpecialRecipe> = { ...BASE_SPECIAL_RECIPES };

export function setSpecialRecipeOverrides(overrides: Record<string, SpecialRecipe>): void {
  SPECIAL_RECIPES = {
    ...BASE_SPECIAL_RECIPES,
    ...overrides,
  };
}

export function getSpecialRecipe(recipeId: string): SpecialRecipe | undefined {
  return SPECIAL_RECIPES[recipeId];
}

export function getAllSpecialRecipes(): SpecialRecipe[] {
  return Object.values(SPECIAL_RECIPES);
}
