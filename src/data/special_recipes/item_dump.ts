import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

export const item_dump_01: SpecialRecipe = {
  id: 'r_item_dump_01',
  name: 'Dump Items',
  machine_id: 'm_item_dump',
  isSellTrash: true,
  pollutionIndependentOfMachineCount: true,
  settings: {},
  compute: (_settings, _globalSettings, _nodeId, helpers) => {
    let item1 = 'any_item';
    if (helpers?.hasConnection('input', 0)) {
      item1 = helpers.resolveProduct('input', 0) || 'any_item';
    }
    let item2 = 'any_item';
    if (helpers?.hasConnection('input', 1)) {
      item2 = helpers.resolveProduct('input', 1) || 'any_item';
    }

    const flow1 = helpers?.getFlowRate?.('input', 0) ?? 30;
    const flow2 = helpers?.getFlowRate?.('input', 1) ?? 30;
    const pollution = (flow1 + flow2) * 13 / 600;

    const recipe: Recipe = {
      id: 'r_item_dump_01',
      name: 'Dump Items',
      machine_id: 'm_item_dump',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution,
      inputs: [
        { product_id: item1, quantity: 30, variable: true },
        { product_id: item2, quantity: 30, variable: true },
      ],
      outputs: [],
    };

    return recipe;
  },
};
