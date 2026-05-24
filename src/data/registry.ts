import type { SpecialRecipe } from '../types/specialRecipes';
import { air_separation_unit } from './special_recipes/air_separation_unit';
import {
  alloyer_ferroaluminium,
  alloyer_purple_gold,
  alloyer_brass,
} from './special_recipes/alloyer';
import {
  boiler_standard,
  boiler_preheater,
  boiler_self_heating,
  boiler_coolant_loop,
} from './special_recipes/boiler';

export const SPECIAL_RECIPES: Record<string, SpecialRecipe> = {
  [air_separation_unit.id]: air_separation_unit,
  [alloyer_ferroaluminium.id]: alloyer_ferroaluminium,
  [alloyer_purple_gold.id]: alloyer_purple_gold,
  [alloyer_brass.id]: alloyer_brass,
  [boiler_standard.id]: boiler_standard,
  [boiler_preheater.id]: boiler_preheater,
  [boiler_self_heating.id]: boiler_self_heating,
  [boiler_coolant_loop.id]: boiler_coolant_loop,
};

export function getSpecialRecipe(recipeId: string): SpecialRecipe | undefined {
  return SPECIAL_RECIPES[recipeId];
}

export function getAllSpecialRecipes(): SpecialRecipe[] {
  return Object.values(SPECIAL_RECIPES);
}
