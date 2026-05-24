import type { SpecialRecipe } from '../../types/specialRecipes';
import { createSpecialRecipe } from '../../utils/specialRecipeFactory';

const settingDefinitions = {
  steam_temp: {
    type: 'number' as const,
    label: 'Steam Temperature (°C)',
    default: 400,
  },
};

const inputTemperatureSettings = {
  0: 'steam_temp',
};

const getMultiplier = (settings: Record<string, unknown>) => {
  const temp = (settings.steam_temp as number) ?? 100;
  return Math.min(4, Math.max(0, temp / 100));
};

const commonConfig = {
  machineId: 'm_industrial_drill',
  settings: settingDefinitions,
  inputTemperatureSettings,
  powerConsumption: 0,
  powerType: 'MV' as const,
  pollution: 0,
  cycleTime: 1,
  inputs: [{ product_id: 'p_steam', quantity: 720 }],
};

export const industrial_drill_iron: SpecialRecipe = createSpecialRecipe({
  ...commonConfig,
  id: 'r_industrial_drill_iron',
  name: 'Extract Raw Iron',
  outputs: (settings: Record<string, unknown>) => {
    const multiplier = getMultiplier(settings);
    return [{ product_id: 'p_raw_iron', quantity: 10 * multiplier, temperature: 18 }];
  },
});

export const industrial_drill_copper: SpecialRecipe = createSpecialRecipe({
  ...commonConfig,
  id: 'r_industrial_drill_copper',
  name: 'Extract Raw Copper',
  outputs: (settings: Record<string, unknown>) => {
    const multiplier = getMultiplier(settings);
    return [{ product_id: 'p_raw_copper', quantity: 10 * multiplier, temperature: 18 }];
  },
});

export const industrial_drill_bauxite: SpecialRecipe = createSpecialRecipe({
  ...commonConfig,
  id: 'r_industrial_drill_bauxite',
  name: 'Extract Bauxite Residue',
  outputs: (settings: Record<string, unknown>) => {
    const multiplier = getMultiplier(settings);
    return [{ product_id: 'p_bauxite_residue', quantity: 0.5 * multiplier, temperature: 18 }];
  },
});
