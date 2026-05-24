import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

const settingDefinitions = {
  crankers: {
    type: 'number' as const,
    label: 'Crankers',
    default: 1,
    min: 1,
    max: 4,
    step: 1,
  },
};

export const hand_crank_mk2_01: SpecialRecipe = {
  id: 'r_hand_crank_mk2_01',
  name: 'Produces Power',
  machine_id: 'm_hand_crank_mk2',
  settings: settingDefinitions,
  compute: (settings) => {
    const crankers = (settings.crankers as number) ?? 1;
    const powerConsumption = -135810 * crankers;

    const recipe: Recipe = {
      id: 'r_hand_crank_mk2_01',
      name: 'Produces Power',
      machine_id: 'm_hand_crank_mk2',
      cycle_time: 1,
      power_consumption: powerConsumption,
      power_type: 'MV',
      pollution: 0,
      inputs: [],
      outputs: [],
    };

    return recipe;
  },
};
