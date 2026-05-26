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
  ['./special_recipes/*.ts', '!./special_recipes/modular_diesel_engine.ts', '!./special_recipes/modular_turbine.ts', '!./special_recipes/nuclear_power_plant.ts'],
  { eager: true }
);

const BASE_SPECIAL_RECIPES: Record<string, SpecialRecipe> = {};

for (const path in modules) {
  const module = modules[path] as Record<string, unknown>;
  for (const exportName in module) {
    const value = module[exportName];
    if (isSpecialRecipe(value)) {
      BASE_SPECIAL_RECIPES[value.id] = value;
    } else if (exportName === 'chemical_plant_recipes' && Array.isArray(value)) {
      for (const item of value) {
        if (isSpecialRecipe(item)) {
          BASE_SPECIAL_RECIPES[item.id] = item;
        }
      }
    }
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
