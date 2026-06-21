import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

const settingDefinitions = {
  input_temp: {
    type: 'number' as const,
    label: 'Input Temperature (C)',
    default: 18,
    min: -273.15,
  },
};

const inputTemperatureSettings = {
  0: 'input_temp',
};

export const solar_heater_01: SpecialRecipe = {
  id: 'r_solar_heater_01',
  name: 'Heats Water',
  machine_id: 'm_solar_heater',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const inputTemp = (settings.input_temp as number) ?? 18;
    const outputTemp = Math.min(inputTemp + 70, 150);

    const recipe: Recipe = {
      id: 'r_solar_heater_01',
      name: 'Heats Water',
      machine_id: 'm_solar_heater',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: 'p_water', quantity: 12 }],
      outputs: [{ product_id: 'p_water', quantity: 12, temperature: outputTemp }],
    };

    return recipe;
  },
};
