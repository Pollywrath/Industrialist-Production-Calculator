import type { SpecialRecipe } from '../../types/specialRecipes';
import { createSpecialRecipe } from '../../utils/specialRecipeFactory';

export const air_separation_unit: SpecialRecipe = createSpecialRecipe({
  id: 'r_air_separation_unit_01',
  name: 'Standard Separation',
  recipeName: 'Extracts Liquid Nitrogen, Liquid Oxygen, Liquid Argon, and Residue',
  machineId: 'm_air_separation_unit',
  powerConsumption: 20000000,
  powerType: 'HV',
  pollution: 0,
  cycleTime: 1,
  inputs: [],
  outputs: (_settings, globalSettings) => {
    const pollution = (globalSettings?.global_pollution as number) ?? 10;
    const residueQuantity = Math.max(1, 0.1 * pollution);

    return [
      { product_id: 'p_liquid_nitrogen', quantity: 60, temperature: -205 },
      { product_id: 'p_liquid_oxygen', quantity: 15, temperature: -190 },
      { product_id: 'p_liquid_argon', quantity: 3, temperature: -195 },
      { product_id: 'p_residue', quantity: residueQuantity, temperature: 18 },
    ];
  },
});
