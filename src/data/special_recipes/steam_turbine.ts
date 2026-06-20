import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { clamp } from '../../utils/precision';

const powerSteps = [
  [100, 432],
  [113, 2690],
  [116, 2769],
  [117, 2816],
  [118, 2878],
  [150, 4761],
  [170, 5202],
  [180, 5487],
  [190, 5791],
  [200, 6080],
  [312, 9046],
  [320, 9360],
];

const getInterpolatedPower = (temp: number) => {
  if (temp <= powerSteps[0][0]) return powerSteps[0][1];

  let lastRange = powerSteps[0];
  for (let i = 1; i < powerSteps.length; i++) {
    const v = powerSteps[i];
    if (temp <= v[0]) {
      const interpolation = (temp - lastRange[0]) / (v[0] - lastRange[0]);
      return lastRange[1] + (v[1] - lastRange[1]) * interpolation;
    }
    lastRange = v;
  }
  return lastRange[1];
};

const settingDefinitions = {
  steam_temp: {
    type: 'number' as const,
    label: 'Steam Temperature (°C)',
    default: 200,
    min: -273.15,
  },
};

const inputTemperatureSettings = {
  0: 'steam_temp',
};

export const steam_turbine_01: SpecialRecipe = {
  id: 'r_steam_turbine_01',
  name: 'Makes Power',
  machine_id: 'm_steam_turbine',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const steamTemp = (settings.steam_temp as number) ?? 200;
    const actualPowerProduction = Math.floor(getInterpolatedPower(steamTemp));
    const waterOutputTemp = Math.floor(clamp(steamTemp / 3, 40, 99));

    const recipe: Recipe = {
      id: 'r_steam_turbine_01',
      name: 'Steam Turbine Power Generation',
      machine_id: 'm_steam_turbine',
      cycle_time: 1,
      power_consumption: -actualPowerProduction,
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: 'p_steam', quantity: 3 }],
      outputs: [{ product_id: 'p_water', quantity: 0.1, temperature: waterOutputTemp }],
    };

    return recipe;
  },
};
