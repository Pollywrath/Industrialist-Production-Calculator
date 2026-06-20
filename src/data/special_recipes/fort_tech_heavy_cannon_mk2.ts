import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

const settingDefinitions = {
  input_temp: {
    type: 'number' as const,
    label: 'Input Temperature (°C)',
    default: 18,
    min: -273.15,
  },
};

const inputTemperatureSettings = {
  0: 'input_temp',
};

const inputQty = 2;
const outputQty = 2;
const minTemp = -273.15;

export const fort_tech_heavy_cannon_mk2_01: SpecialRecipe = {
  id: 'r_fort_tech_heavy_cannon_mk2_01',
  name: 'Cools Water',
  machine_id: 'm_fort_tech_heavy_cannon_mk2',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const inputTemp = (settings.input_temp as number) ?? 18;
    const outputTemp = Math.max(inputTemp - 40, minTemp);

    const recipe: Recipe = {
      id: 'r_fort_tech_heavy_cannon_mk2_01',
      name: 'Cools Water',
      machine_id: 'm_fort_tech_heavy_cannon_mk2',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: 'p_water', quantity: inputQty }],
      outputs: [
        {
          product_id: 'p_water',
          quantity: outputQty,
          temperature: outputTemp,
        },
      ],
    };

    return recipe;
  },
};

export const fort_tech_heavy_cannon_mk2_02: SpecialRecipe = {
  id: 'r_fort_tech_heavy_cannon_mk2_02',
  name: 'Cools Water',
  machine_id: 'm_fort_tech_heavy_cannon_mk2',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: () => {
    const recipe: Recipe = {
      id: 'r_fort_tech_heavy_cannon_mk2_02',
      name: 'Cools Water',
      machine_id: 'm_fort_tech_heavy_cannon_mk2',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution: -1.62,
      inputs: [],
      outputs: [],
    };

    return recipe;
  },
};
