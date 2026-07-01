import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

export const m_sleigh_depot_01: SpecialRecipe = {
  id: 'r_sleigh_depot_01',
  name: 'Sell Item',
  machine_id: 'm_sleigh_depot',
  isSellTrash: true,
  settings: {},
  compute: (_settings, _globalSettings, _nodeId, helpers) => {
    const resolvedItem = helpers?.hasConnection('input', 0)
      ? helpers.resolveProduct('input', 0) || 'any_item'
      : 'any_item';

    const recipe: Recipe = {
      id: 'r_sleigh_depot_01',
      name: 'Sell Item',
      machine_id: 'm_sleigh_depot',
      cycle_time: 40,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: resolvedItem, quantity: 111 }],
      outputs: [],
    };

    return recipe;
  },
};
