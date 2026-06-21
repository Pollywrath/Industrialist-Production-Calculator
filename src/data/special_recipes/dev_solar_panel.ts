import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

const MV_POWER_OUTPUT = 30000000000;
const HV_POWER_OUTPUT = 3141600000000;

export const dev_solar_panel_01: SpecialRecipe = {
  id: 'r_dev_solar_panel_01',
  name: 'Produces Power',
  machine_id: 'm_dev_solar_panel',
  settings: {},
  compute: () => {
    const recipe: Recipe = {
      id: 'r_dev_solar_panel_01',
      name: 'Produces Power',
      machine_id: 'm_dev_solar_panel',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      powerEffects: [
        {
          power_type: 'MV',
          power_consumption: -MV_POWER_OUTPUT,
          label: 'MV Output',
        },
        {
          power_type: 'HV',
          power_consumption: -HV_POWER_OUTPUT,
          label: 'HV Output',
        },
      ],
      pollution: 0,
      inputs: [],
      outputs: [],
    };

    return recipe;
  },
};
