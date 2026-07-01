import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

export const huge_truck_depot_01: SpecialRecipe = {
  id: 'r_huge_truck_depot_01',
  name: 'Sell Item',
  machine_id: 'm_huge_truck_depot',
  isSellTrash: true,
  settings: {},
  compute: (_settings, _globalSettings, _nodeId, helpers) => {
    let resolvedItem = 'any_item';
    if (helpers?.hasConnection('input', 0)) {
      resolvedItem = helpers.resolveProduct('input', 0) || 'any_item';
    }

    const recipe: Recipe = {
      id: 'r_huge_truck_depot_01',
      name: 'Sell Item',
      machine_id: 'm_huge_truck_depot',
      cycle_time: 80,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0.135,
      inputs: [{ product_id: resolvedItem, quantity: 400 }],
      outputs: [],
    };

    return recipe;
  },
};
