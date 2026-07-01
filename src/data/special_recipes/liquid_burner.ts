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

export const liquid_burner_01: SpecialRecipe = {
  id: 'r_liquid_burner_01',
  name: 'Burn Fluid',
  machine_id: 'm_liquid_burner',
  isSellTrash: true,
  settings: {},
  compute: (_settings, _globalSettings, _nodeId, helpers) => {
    let resolvedFluid = 'any_fluid';
    if (helpers?.hasConnection('input', 0)) {
      resolvedFluid = helpers.resolveProduct('input', 0) || 'any_fluid';
    }

    const pollution = calculatePollution(resolvedFluid, 120);

    const recipe: Recipe = {
      id: 'r_liquid_burner_01',
      name: 'Burn Fluid',
      machine_id: 'm_liquid_burner',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution,
      inputs: [{ product_id: resolvedFluid, quantity: 120 }],
      outputs: [],
    };

    return recipe;
  },
};
