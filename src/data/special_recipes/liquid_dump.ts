import type { SpecialRecipe } from '../../types/specialRecipes';
import { createSpecialRecipe } from '../../utils/specialRecipeFactory';

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
  return 0.02 * rate;
};

export const liquid_dump_01: SpecialRecipe = createSpecialRecipe({
  id: 'r_liquid_dump_01',
  name: 'Dump Fluids',
  machineId: 'm_liquid_dump',
  isSellTrash: true,
  powerConsumption: 0,
  powerType: 'MV' as const,
  cycleTime: 1,
  pollution: (_settings, _globalSettings, _nodeId, helpers) => {
    let fluid1 = 'any_fluid';
    if (helpers?.hasConnection('input', 0)) {
      fluid1 = helpers.resolveProduct('input', 0) || 'any_fluid';
    }
    let fluid2 = 'any_fluid';
    if (helpers?.hasConnection('input', 1)) {
      fluid2 = helpers.resolveProduct('input', 1) || 'any_fluid';
    }
    return calculatePollution(fluid1, 15) + calculatePollution(fluid2, 15);
  },
  inputs: (_settings, _globalSettings, _nodeId, helpers) => {
    let fluid1 = 'any_fluid';
    if (helpers?.hasConnection('input', 0)) {
      fluid1 = helpers.resolveProduct('input', 0) || 'any_fluid';
    }
    let fluid2 = 'any_fluid';
    if (helpers?.hasConnection('input', 1)) {
      fluid2 = helpers.resolveProduct('input', 1) || 'any_fluid';
    }
    return [
      { product_id: fluid1, quantity: 15, variable: true },
      { product_id: fluid2, quantity: 15, variable: true },
    ];
  },
  outputs: [],
});
