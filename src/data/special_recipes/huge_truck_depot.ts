import type { SpecialRecipe } from '../../types/specialRecipes';
import { createSpecialRecipe } from '../../utils/specialRecipeFactory';

export const huge_truck_depot_01: SpecialRecipe = createSpecialRecipe({
  id: 'r_huge_truck_depot_01',
  name: 'Sell Item',
  machineId: 'm_huge_truck_depot',
  isSellTrash: true,
  powerConsumption: 0,
  powerType: 'MV' as const,
  pollution: 0.135,
  cycleTime: 80,
  inputs: (_settings, _globalSettings, _nodeId, helpers) => {
    let resolvedItem = 'any_item';
    if (helpers?.hasConnection('input', 0)) {
      resolvedItem = helpers.resolveProduct('input', 0) || 'any_item';
    }
    return [{ product_id: resolvedItem, quantity: 400, variable: true }];
  },
  outputs: [],
});
