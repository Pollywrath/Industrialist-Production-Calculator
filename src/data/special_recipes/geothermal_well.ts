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

const inputQty = 9.09;
const outputQty = 6.05;

export const geothermal_well_01: SpecialRecipe = {
  id: 'r_geothermal_well_01',
  name: 'Heats Water',
  machine_id: 'm_geothermal_well',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const inputTemp = (settings.input_temp as number) ?? 40;
    const outputTemp = Math.min(inputTemp + 80, 220);

    const recipe: Recipe = {
      id: 'r_geothermal_well_01',
      name: 'Heats Water',
      machine_id: 'm_geothermal_well',
      cycle_time: 1,
      power_consumption: 3000,
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: 'p_water', quantity: inputQty }],
      outputs: [{ product_id: 'p_water', quantity: outputQty, temperature: outputTemp }],
    };

    return recipe;
  },
};

export const geothermal_well_02: SpecialRecipe = {
  id: 'r_geothermal_well_02',
  name: 'Heats Filtered Water',
  machine_id: 'm_geothermal_well',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const inputTemp = (settings.input_temp as number) ?? 40;
    const outputTemp = Math.min(inputTemp + 80, 220);

    const recipe: Recipe = {
      id: 'r_geothermal_well_02',
      name: 'Heats Filtered Water',
      machine_id: 'm_geothermal_well',
      cycle_time: 1,
      power_consumption: 3000,
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: 'p_filtered_water', quantity: inputQty }],
      outputs: [{ product_id: 'p_filtered_water', quantity: outputQty, temperature: outputTemp }],
    };

    return recipe;
  },
};

export const geothermal_well_03: SpecialRecipe = {
  id: 'r_geothermal_well_03',
  name: 'Heats Distilled Water',
  machine_id: 'm_geothermal_well',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const inputTemp = (settings.input_temp as number) ?? 40;
    const outputTemp = Math.min(inputTemp + 80, 220);

    const recipe: Recipe = {
      id: 'r_geothermal_well_03',
      name: 'Heats Distilled Water',
      machine_id: 'm_geothermal_well',
      cycle_time: 1,
      power_consumption: 3000,
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: 'p_distilled_water', quantity: inputQty }],
      outputs: [{ product_id: 'p_distilled_water', quantity: outputQty, temperature: outputTemp }],
    };

    return recipe;
  },
};
