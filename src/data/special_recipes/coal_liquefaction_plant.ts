import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

const calculateCycleTime = (tempC: number): number => {
  if (tempC <= 18) return 88;
  if (tempC <= 300) return 3000 / tempC + 10;
  if (tempC < 350) return 20 - 0.2 * (tempC - 300);
  return 10;
};

const settingDefinitions = {
  steam_temp: {
    type: 'number' as const,
    label: 'Steam Temperature (°C)',
    default: 400,
    min: -273.15,
  },
};

const inputTemperatureSettings = {
  2: 'steam_temp',
};

export const coal_liquefaction_01: SpecialRecipe = {
  id: 'r_coal_liquefaction_plant_01',
  name: 'Makes Residue, Heavy Oil, Light Oil',
  machine_id: 'm_coal_liquefaction_plant',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const steamTemp = (settings.steam_temp as number) ?? 400;
    const cycleTime = calculateCycleTime(steamTemp);

    const recipe: Recipe = {
      id: 'r_coal_liquefaction_plant_01',
      name: 'Makes Residue, Heavy Oil, Light Oil',
      machine_id: 'm_coal_liquefaction_plant',
      cycle_time: cycleTime,
      power_consumption: 1000000,
      power_type: 'MV',
      pollution: 6.48,
      inputs: [
        { product_id: 'p_coal', quantity: 40 },
        { product_id: 'p_crude_oil', quantity: 10 },
        { product_id: 'p_steam', quantity: 200 },
      ],
      outputs: [
        { product_id: 'p_residue', quantity: 10, temperature: 18 },
        { product_id: 'p_heavy_oil', quantity: 40, temperature: 18 },
        { product_id: 'p_light_oil', quantity: 30, temperature: 18 },
      ],
    };

    return recipe;
  },
};
