import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { clamp } from '../../utils/precision';

export const air_separation_unit: SpecialRecipe = {
  id: 'r_air_separation_unit_01',
  name: 'Standard Separation',
  machine_id: 'm_air_separation_unit',
  settings: {},
  compute: (_settings, globalSettings) => {
    const pollution = (globalSettings?.global_pollution as number) ?? 10;
    const residueQuantity = clamp(pollution / 10, 1, 20);

    const recipe: Recipe = {
      id: 'r_air_separation_unit_01',
      name: 'Standard Separation',
      machine_id: 'm_air_separation_unit',
      cycle_time: 1,
      power_consumption: 20000000,
      power_type: 'HV',
      pollution: 0,
      inputs: [],
      outputs: [
        { product_id: 'p_liquid_nitrogen', quantity: 60, temperature: -205 },
        { product_id: 'p_liquid_oxygen', quantity: 15, temperature: -190 },
        { product_id: 'p_liquid_argon', quantity: 3, temperature: -195 },
        { product_id: 'p_residue', quantity: residueQuantity, temperature: 18 },
      ],
    };

    return recipe;
  },
};
