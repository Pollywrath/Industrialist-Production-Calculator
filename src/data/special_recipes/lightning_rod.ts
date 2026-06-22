import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

const MAMYFLUX_PER_BOLT = 60000000;
const SECONDS_PER_HOUR = 3600;

const settingDefinitions = {
  bolts_per_hour: {
    type: 'number' as const,
    label: 'Bolts per Hour',
    default: 1,
    min: 0,
    step: 0.1,
  },
};

export const lightning_rod_01: SpecialRecipe = {
  id: 'r_lightning_rod_01',
  name: 'Produces Power',
  machine_id: 'm_lightning_rod',
  settings: settingDefinitions,
  compute: (settings) => {
    const boltsPerHour = (settings.bolts_per_hour as number) ?? 1;
    const averagePower = MAMYFLUX_PER_BOLT * boltsPerHour / SECONDS_PER_HOUR;

    const recipe: Recipe = {
      id: 'r_lightning_rod_01',
      name: 'Produces Power',
      machine_id: 'm_lightning_rod',
      cycle_time: 1,
      power_consumption: -averagePower,
      power_type: 'HV',
      pollution: 0,
      inputs: [],
      outputs: [],
    };

    return recipe;
  },
};
