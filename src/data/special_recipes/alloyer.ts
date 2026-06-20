import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

const calculateCycleTime = (tempC: number): number => {
  const t = Math.max(0, tempC);
  return Math.max(2, 40 / (1 + t / 100));
};

const settingDefinitions = {
  steam_temp: {
    type: 'number' as const,
    label: 'Steam Temperature (°C)',
    default: 300,
    min: -273.15,
  },
};

const inputTemperatureSettings = {
  2: 'steam_temp',
};

export const alloyer_ferroaluminium: SpecialRecipe = {
  id: 'r_alloyer_01',
  name: 'Makes Molten Ferroaluminium Alloy',
  machine_id: 'm_alloyer',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const steamTemp = (settings.steam_temp as number) ?? 400;
    const cycleTime = calculateCycleTime(steamTemp);

    const recipe: Recipe = {
      id: 'r_alloyer_01',
      name: 'Makes Molten Ferroaluminium Alloy',
      machine_id: 'm_alloyer',
      cycle_time: cycleTime,
      power_consumption: 150000,
      power_type: 'MV',
      pollution: 0.324,
      inputs: [
        { product_id: 'p_iron_ingot', quantity: 4 },
        { product_id: 'p_aluminium_ingot', quantity: 2 },
        { product_id: 'p_steam', quantity: 200 },
      ],
      outputs: [
        {
          product_id: 'p_molten_ferroaluminium_alloy',
          quantity: 2,
          temperature: 18,
        },
      ],
    };

    return recipe;
  },
};

export const alloyer_purple_gold: SpecialRecipe = {
  id: 'r_alloyer_02',
  name: 'Makes Molten Purple Gold',
  machine_id: 'm_alloyer',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const steamTemp = (settings.steam_temp as number) ?? 400;
    const cycleTime = calculateCycleTime(steamTemp);

    const recipe: Recipe = {
      id: 'r_alloyer_02',
      name: 'Makes Molten Purple Gold',
      machine_id: 'm_alloyer',
      cycle_time: cycleTime,
      power_consumption: 150000,
      power_type: 'MV',
      pollution: 0.324,
      inputs: [
        { product_id: 'p_gold_ingot', quantity: 1 },
        { product_id: 'p_aluminium_ingot', quantity: 2 },
        { product_id: 'p_steam', quantity: 200 },
      ],
      outputs: [
        {
          product_id: 'p_molten_purple_gold',
          quantity: 2,
          temperature: 18,
        },
      ],
    };

    return recipe;
  },
};

export const alloyer_brass: SpecialRecipe = {
  id: 'r_alloyer_03',
  name: 'Makes Liquid Brass',
  machine_id: 'm_alloyer',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const steamTemp = (settings.steam_temp as number) ?? 400;
    const cycleTime = calculateCycleTime(steamTemp);

    const recipe: Recipe = {
      id: 'r_alloyer_03',
      name: 'Makes Liquid Brass',
      machine_id: 'm_alloyer',
      cycle_time: cycleTime,
      power_consumption: 150000,
      power_type: 'MV',
      pollution: 0.324,
      inputs: [
        { product_id: 'p_copper_ingot', quantity: 6 },
        { product_id: 'p_zinc', quantity: 3 },
        { product_id: 'p_steam', quantity: 200 },
      ],
      outputs: [
        {
          product_id: 'p_liquid_brass',
          quantity: 9,
          temperature: 18,
        },
      ],
    };

    return recipe;
  },
};
