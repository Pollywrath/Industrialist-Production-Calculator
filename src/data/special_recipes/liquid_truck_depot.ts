import type { SpecialRecipe } from '../../types/specialRecipes';
import { createSpecialRecipe } from '../../utils/specialRecipeFactory';

export const liquid_truck_depot_01: SpecialRecipe = createSpecialRecipe({
  id: 'r_liquid_truck_depot_01',
  name: 'Sell Fluid',
  machineId: 'm_liquid_truck_depot',
  isSellTrash: true,
  powerConsumption: 0,
  powerType: 'MV' as const,
  pollution: 0.045,
  cycleTime: 80,
  inputs: (_settings, _globalSettings, _nodeId, helpers) => {
    let resolvedFluid = 'any_fluid';
    if (helpers?.hasConnection('input', 0)) {
      resolvedFluid = helpers.resolveProduct('input', 0) || 'any_fluid';
    }
    return [{ product_id: resolvedFluid, quantity: 400, variable: true }];
  },
  outputs: [],
});
