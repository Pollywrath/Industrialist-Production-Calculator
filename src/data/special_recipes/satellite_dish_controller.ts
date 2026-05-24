import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

export const satellite_dish_controller_01: SpecialRecipe = {
  id: 'r_satellite_dish_controller_01',
  name: 'Satellite Dish Controller',
  machine_id: 'm_satellite_dish_controller',
  isSellTrash: true,
  settings: {},
  compute: (_settings, _globalSettings, _nodeId, helpers) => {
    let resolvedFluid = 'any_fluid';
    if (helpers?.hasConnection('input', 0)) {
      resolvedFluid = helpers.resolveProduct('input', 0) || 'any_fluid';
    }

    const recipe: Recipe = {
      id: 'r_satellite_dish_controller_01',
      name: 'Satellite Dish Controller',
      machine_id: 'm_satellite_dish_controller',
      cycle_time: 1,
      power_consumption: 75000,
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: resolvedFluid, quantity: 0.5 }],
      outputs: [],
    };

    return recipe;
  },
};
