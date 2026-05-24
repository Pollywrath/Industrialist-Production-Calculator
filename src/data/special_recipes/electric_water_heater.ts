import type { SpecialRecipe } from '../../types/specialRecipes';
import { createSpecialRecipe } from '../../utils/specialRecipeFactory';
import type { PowerType } from '../../types/data';

const MODE_MAP: Record<number, { power: number; type: PowerType }> = {
  120: { power: 300000, type: 'MV' },
  220: { power: 800000, type: 'MV' },
  320: { power: 1500000, type: 'HV' },
};

const settingDefinitions = {
  target_temperature: {
    type: 'select' as const,
    label: 'Target Temperature (°C)',
    default: 120,
    options: [
      { label: '120°C', value: 120 },
      { label: '220°C', value: 220 },
      { label: '320°C', value: 320 },
    ],
  },
};

const getPowerConsumption = (settings: Record<string, unknown>) => {
  const target = (settings.target_temperature as number) ?? 120;
  return MODE_MAP[target]?.power ?? 300000;
};

const getPowerType = (settings: Record<string, unknown>) => {
  const target = (settings.target_temperature as number) ?? 120;
  return MODE_MAP[target]?.type ?? 'MV';
};

export const electric_water_heater_01: SpecialRecipe = createSpecialRecipe({
  id: 'r_electric_water_heater_01',
  name: 'Heats Water',
  machineId: 'm_electric_water_heater',
  settings: settingDefinitions,
  powerConsumption: getPowerConsumption,
  powerType: getPowerType,
  pollution: 0,
  cycleTime: 1,
  inputs: [{ product_id: 'p_water', quantity: 6 }],
  outputs: (settings: Record<string, unknown>) => {
    const target = (settings.target_temperature as number) ?? 120;
    return [{ product_id: 'p_water', quantity: 6, temperature: target }];
  },
});

export const electric_water_heater_02: SpecialRecipe = createSpecialRecipe({
  id: 'r_electric_water_heater_02',
  name: 'Heats Filtered Water',
  machineId: 'm_electric_water_heater',
  settings: settingDefinitions,
  powerConsumption: getPowerConsumption,
  powerType: getPowerType,
  pollution: 0,
  cycleTime: 1,
  inputs: [{ product_id: 'p_filtered_water', quantity: 6 }],
  outputs: (settings: Record<string, unknown>) => {
    const target = (settings.target_temperature as number) ?? 120;
    return [{ product_id: 'p_filtered_water', quantity: 6, temperature: target }];
  },
});

export const electric_water_heater_03: SpecialRecipe = createSpecialRecipe({
  id: 'r_electric_water_heater_03',
  name: 'Heats Distilled Water',
  machineId: 'm_electric_water_heater',
  settings: settingDefinitions,
  powerConsumption: getPowerConsumption,
  powerType: getPowerType,
  pollution: 0,
  cycleTime: 1,
  inputs: [{ product_id: 'p_distilled_water', quantity: 6 }],
  outputs: (settings: Record<string, unknown>) => {
    const target = (settings.target_temperature as number) ?? 120;
    return [{ product_id: 'p_distilled_water', quantity: 6, temperature: target }];
  },
});
