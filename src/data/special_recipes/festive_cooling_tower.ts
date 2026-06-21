import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

const settingDefinitions = {
  distilled_water_temp: {
    type: 'number' as const,
    label: 'Distilled Water Temperature (°C)',
    default: 320,
    min: -273.15,
  },
};

const inputTemperatureSettings = {
  0: 'distilled_water_temp',
};

export const festive_cooling_tower_01: SpecialRecipe = {
  id: 'r_festive_cooling_tower_01',
  name: 'Cools Distilled Water',
  machine_id: 'm_festive_cooling_tower',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const inputTemp = (settings.distilled_water_temp as number) ?? 100;
    const outputTemp = Math.max(inputTemp / 3, 21);

    const recipe: Recipe = {
      id: 'r_festive_cooling_tower_01',
      name: 'Cools Distilled Water',
      machine_id: 'm_festive_cooling_tower',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: 'p_distilled_water', quantity: 800 }],
      outputs: [
        {
          product_id: 'p_distilled_water',
          quantity: 800,
          temperature: outputTemp,
        },
      ],
    };

    return recipe;
  },
};
