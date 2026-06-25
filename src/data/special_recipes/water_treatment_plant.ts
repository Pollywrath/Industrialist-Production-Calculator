import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

const settingDefinitions = {
  steam_temp: {
    type: 'number' as const,
    label: 'Steam Temperature (°C)',
    default: 4000/11,
    min: -273.15,
  },
};

const inputTemperatureSettings = {
  1: 'steam_temp',
};

const calculateOutputQuantity = (tempC: number): number => {
  return Math.min(120, Math.abs(0.176 * tempC));
};

const calculateOutputTemperature = (tempC: number): number => {
  return 0.165 * tempC;
};

export const water_treatment_plant_01: SpecialRecipe = {
  id: 'r_water_treatment_plant_01',
  name: 'Makes Distilled Water',
  machine_id: 'm_water_treatment_plant',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const steamTemp = (settings.steam_temp as number) ?? 400;
    const outputQuantity = calculateOutputQuantity(steamTemp);
    const outputTemperature = calculateOutputTemperature(steamTemp);

    const recipe: Recipe = {
      id: 'r_water_treatment_plant_01',
      name: 'Makes Distilled Water',
      machine_id: 'm_water_treatment_plant',
      cycle_time: 1,
      power_consumption: 2000000,
      power_type: 'MV',
      pollution: 0,
      inputs: [
        { product_id: 'p_water', quantity: outputQuantity },
        { product_id: 'p_steam', quantity: 90 },
      ],
      outputs: [
        { product_id: 'p_distilled_water', quantity: outputQuantity, temperature: outputTemperature },
      ],
    };

    return recipe;
  },
};

export const water_treatment_plant_02: SpecialRecipe = {
  id: 'r_water_treatment_plant_02',
  name: 'Makes Distilled Water',
  machine_id: 'm_water_treatment_plant',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const steamTemp = (settings.steam_temp as number) ?? 400;
    const outputQuantity = calculateOutputQuantity(steamTemp);
    const outputTemperature = calculateOutputTemperature(steamTemp);

    const recipe: Recipe = {
      id: 'r_water_treatment_plant_02',
      name: 'Makes Distilled Water',
      machine_id: 'm_water_treatment_plant',
      cycle_time: 1,
      power_consumption: 2000000,
      power_type: 'MV',
      pollution: 0,
      inputs: [
        { product_id: 'p_condensate', quantity: outputQuantity },
        { product_id: 'p_steam', quantity: 90 },
      ],
      outputs: [
        { product_id: 'p_distilled_water', quantity: outputQuantity, temperature: outputTemperature },
      ],
    };

    return recipe;
  },
};

export const water_treatment_plant_03: SpecialRecipe = {
  id: 'r_water_treatment_plant_03',
  name: 'Makes Distilled Water',
  machine_id: 'm_water_treatment_plant',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const steamTemp = (settings.steam_temp as number) ?? 400;
    const outputQuantity = calculateOutputQuantity(steamTemp);
    const outputTemperature = calculateOutputTemperature(steamTemp);

    const recipe: Recipe = {
      id: 'r_water_treatment_plant_03',
      name: 'Makes Distilled Water',
      machine_id: 'm_water_treatment_plant',
      cycle_time: 1,
      power_consumption: 2000000,
      power_type: 'MV',
      pollution: 0,
      inputs: [
        { product_id: 'p_contaminated_water', quantity: outputQuantity },
        { product_id: 'p_steam', quantity: 90 },
      ],
      outputs: [
        { product_id: 'p_distilled_water', quantity: outputQuantity, temperature: outputTemperature },
      ],
    };

    return recipe;
  },
};
