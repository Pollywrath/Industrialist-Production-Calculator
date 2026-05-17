import type { SpecialRecipe } from '../types/specialRecipes';
import { air_separation_unit } from './special_recipes/air_separation_unit';

export const SPECIAL_RECIPES: Record<string, SpecialRecipe> = {
  [air_separation_unit.id]: air_separation_unit,
};

export function getSpecialRecipe(recipeId: string): SpecialRecipe | undefined {
  return SPECIAL_RECIPES[recipeId];
}

export function getAllSpecialRecipes(): SpecialRecipe[] {
  return Object.values(SPECIAL_RECIPES);
}
