import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

export const underground_waste_facility_01: SpecialRecipe = {
  id: 'r_underground_waste_facility_01',
  name: 'Underground Waste Disposal',
  machine_id: 'm_underground_waste_facility',
  isSellTrash: true,
  settings: {},
  flowDependentInputs: true,
  compute: (_settings, _globalSettings, _nodeId, helpers) => {
    let item1 = 'any_item';
    if (helpers?.hasConnection('input', 0)) {
      item1 = helpers.resolveProduct('input', 0) || 'any_item';
    }
    let fluid1 = 'any_fluid';
    if (helpers?.hasConnection('input', 1)) {
      fluid1 = helpers.resolveProduct('input', 1) || 'any_fluid';
    }

    const itemFlow = helpers?.getFlowRate?.('input', 0) ?? 0;
    const fluidFlow = helpers?.getFlowRate?.('input', 1) ?? 0;
    const totalFlow = itemFlow + fluidFlow;

    let concreteQuantity = 140;
    let leadQuantity = 70;

    if (totalFlow > 0) {
      const cycleTime = 7000 / totalFlow;
      concreteQuantity = 140 / cycleTime;
      leadQuantity = 70 / cycleTime;
    } else if (helpers) {
      concreteQuantity = 0;
      leadQuantity = 0;
    }

    const recipe: Recipe = {
      id: 'r_underground_waste_facility_01',
      name: 'Underground Waste Disposal',
      machine_id: 'm_underground_waste_facility',
      cycle_time: 1,
      power_consumption: 1000000,
      power_type: 'MV',
      pollution: 0,
      inputs: [
        { product_id: item1, quantity: 240, variable: true },
        { product_id: fluid1, quantity: 240, variable: true },
        { product_id: 'p_concrete_block', quantity: concreteQuantity, independentOfMachineCount: true },
        { product_id: 'p_lead_ingot', quantity: leadQuantity, independentOfMachineCount: true },
      ],
      outputs: [],
    };

    return recipe;
  },
};
