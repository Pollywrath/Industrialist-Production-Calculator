import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

export const incinerator_01: SpecialRecipe = {
  id: 'r_incinerator_01',
  name: 'Burn Item',
  machine_id: 'm_incinerator',
  isSellTrash: true,
  settings: {},
  compute: (_settings, _globalSettings, _nodeId, helpers) => {
    let resolvedFluid = 'any_item';
    if (helpers?.hasConnection('input', 0)) {
      resolvedFluid = helpers.resolveProduct('input', 0) || 'any_item';
    }

    const pollution = 0.18 * 40;

    const recipe: Recipe = {
      id: 'r_incinerator_01',
      name: 'Burn Item',
      machine_id: 'm_incinerator',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution,
      inputs: [{ product_id: resolvedFluid, quantity: 40 }],
      outputs: [],
    };

    return recipe;
  },
};
