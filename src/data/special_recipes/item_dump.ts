import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

export const item_dump_01: SpecialRecipe = {
  id: 'r_item_dump_01',
  name: 'Dump Item',
  machine_id: 'm_item_dump',
  isSellTrash: true,
  pollutionIndependentOfMachineCount: true,
  settings: {},
  compute: (_settings, _globalSettings, _nodeId, helpers) => {
    let resolvedFluid = 'any_item';
    if (helpers?.hasConnection('input', 0)) {
      resolvedFluid = helpers.resolveProduct('input', 0) || 'any_item';
    }

    const flow = helpers?.getFlowRate?.('input', 0) ?? 60;
    const pollution =  flow * 13/600;

    const recipe: Recipe = {
      id: 'r_item_dump_01',
      name: 'Dump Item',
      machine_id: 'm_item_dump',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution,
      inputs: [{ product_id: resolvedFluid, quantity: 60, variable: true }],
      outputs: [],
    };

    return recipe;
  },
};
