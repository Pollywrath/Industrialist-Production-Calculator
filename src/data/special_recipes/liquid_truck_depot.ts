import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

export const liquid_truck_depot_01: SpecialRecipe = {
  id: 'r_liquid_truck_depot_01',
  name: 'Sell Fluid',
  machine_id: 'm_liquid_truck_depot',
  isSellTrash: true,
  settings: {},
  compute: (_settings, _globalSettings, _nodeId, helpers) => {
    let resolvedFluid = 'any_fluid';
    if (helpers?.hasConnection('input', 0)) {
      resolvedFluid = helpers.resolveProduct('input', 0) || 'any_fluid';
    }

    const recipe: Recipe = {
      id: 'r_liquid_truck_depot_01',
      name: 'Sell Fluid',
      machine_id: 'm_liquid_truck_depot',
      cycle_time: 80,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0.045,
      inputs: [{ product_id: resolvedFluid, quantity: 400 }],
      outputs: [],
    };

    return recipe;
  },
};
