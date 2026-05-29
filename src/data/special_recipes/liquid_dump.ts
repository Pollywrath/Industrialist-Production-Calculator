import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

const ZERO_POLLUTION_FLUIDS = [
  'p_water',
  'p_filtered_water',
  'p_distilled_water',
  'p_steam',
  'p_high_pressure_steam',
  'p_low_pressure_steam',
];

const calculatePollution = (fluidId: string, rate: number): number => {
  if (fluidId === 'any_fluid' || ZERO_POLLUTION_FLUIDS.includes(fluidId)) return 0;
  if (fluidId === 'p_residue') return 8.64 * rate;
  return 0.0216 * rate;
};

export const liquid_dump_01: SpecialRecipe = {
  id: 'r_liquid_dump_01',
  name: 'Dump Fluids',
  machine_id: 'm_liquid_dump',
  isSellTrash: true,
  pollutionIndependentOfMachineCount: true,
  settings: {},
  compute: (_settings, _globalSettings, _nodeId, helpers) => {
    let fluid1 = 'any_fluid';
    if (helpers?.hasConnection('input', 0)) {
      fluid1 = helpers.resolveProduct('input', 0) || 'any_fluid';
    }
    let fluid2 = 'any_fluid';
    if (helpers?.hasConnection('input', 1)) {
      fluid2 = helpers.resolveProduct('input', 1) || 'any_fluid';
    }

    const flow1 = helpers?.getFlowRate?.('input', 0) ?? 30;
    const flow2 = helpers?.getFlowRate?.('input', 1) ?? 30;
    const pollution = calculatePollution(fluid1, flow1) + calculatePollution(fluid2, flow2);

    const recipe: Recipe = {
      id: 'r_liquid_dump_01',
      name: 'Dump Fluids',
      machine_id: 'm_liquid_dump',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution,
      inputs: [
        { product_id: fluid1, quantity: 30, variable: true },
        { product_id: fluid2, quantity: 30, variable: true },
      ],
      outputs: [],
    };

    return recipe;
  },
};
