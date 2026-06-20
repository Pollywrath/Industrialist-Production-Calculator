import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

const settingDefinitions = {
  condensate_temp: {
    type: 'number' as const,
    label: 'Condensate Temperature (°C)',
    default: 18,
    min: -273.15,
  },
};

const inputTemperatureSettings = {
  0: 'condensate_temp',
};

export const polisher_01: SpecialRecipe = {
  id: 'r_polisher_01',
  name: 'Makes Distilled Water',
  machine_id: 'm_polisher',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const condensateTemp = (settings.condensate_temp as number) ?? 18;

    const recipe: Recipe = {
      id: 'r_polisher_01',
      name: 'Makes Distilled Water',
      machine_id: 'm_polisher',
      cycle_time: 1,
      power_consumption: 500000,
      power_type: 'MV',
      pollution: 0,
      inputs: [
        { product_id: 'p_condensate', quantity: 400 },
        { product_id: 'p_hydrochloric_acid', quantity: 1 },
        { product_id: 'p_sodium_hydroxide_solution', quantity: 1 },
      ],
      outputs: [
        {
          product_id: 'p_distilled_water',
          quantity: 400,
          temperature: condensateTemp * 0.9,
        },
      ],
    };

    return recipe;
  },
};
