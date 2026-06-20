import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { clamp } from '../../utils/precision';

const powerSteps = [
  [0, 0, 1],
  [100, 2000, 1800],
  [110, 2001, 1801],
  [150, 4000, 3600],
  [155, 4001, 3601],
  [300, 7500, 4000],
  [400, 7800, 4001],
  [50000, 7801, 4001],
];

const getInterpolated = (temp: number) => {
  if (temp <= powerSteps[0][0]) return { power: powerSteps[0][1], rpm: powerSteps[0][2] };

  let lastRange = powerSteps[0];
  for (let i = 1; i < powerSteps.length; i++) {
    const v = powerSteps[i];
    if (temp <= v[0]) {
      const interpolation = (temp - lastRange[0]) / (v[0] - lastRange[0]);
      return {
        power: lastRange[1] + (v[1] - lastRange[1]) * interpolation,
        rpm: lastRange[2] + (v[2] - lastRange[2]) * interpolation,
      };
    }
    lastRange = v;
  }
  return { power: lastRange[1], rpm: lastRange[2] };
};

const settingDefinitions = {
  steam_temp: {
    type: 'number' as const,
    label: 'Steam Temperature (C)',
    default: 400,
    min: -273.15,
  },
};

const inputTemperatureSettings = {
  0: 'steam_temp',
};

const getComputedValues = (settings: Record<string, unknown>) => {
  const temp = (settings.steam_temp as number) ?? 400;
  const interpolated = getInterpolated(temp);
  const targetPower = interpolated.power;
  const targetRPM = Math.max(1, interpolated.rpm);
  const powerPerTick = (targetPower * (targetRPM + 1)) / targetRPM + targetPower;
  const actualPowerProduction = Math.floor(powerPerTick * 33 * 0.25);
  const waterOutputTemp = clamp(temp / 3, 40, 99);

  return { actualPowerProduction, waterOutputTemp };
};

export const small_turbine_01: SpecialRecipe = {
  id: 'r_small_turbine_01',
  name: 'Makes Power. Makes Water',
  machine_id: 'm_small_turbine',
  description:
    'Converts a steam into power and water. Uses 1/5 of the Steam of Large Turbine but is 25% more efficient',
  settings: settingDefinitions,
  inputTemperatureSettings,
  compute: (settings) => {
    const { actualPowerProduction, waterOutputTemp } = getComputedValues(settings);

    const recipe: Recipe = {
      id: 'r_small_turbine_01',
      name: 'Makes Power. Makes Water',
      machine_id: 'm_small_turbine',
      cycle_time: 1,
      power_consumption: -actualPowerProduction,
      power_type: 'MV',
      pollution: 0,
      inputs: [{ product_id: 'p_steam', quantity: 18 }],
      outputs: [{ product_id: 'p_water', quantity: 0.6, temperature: waterOutputTemp }],
    };

    return recipe;
  },
};
