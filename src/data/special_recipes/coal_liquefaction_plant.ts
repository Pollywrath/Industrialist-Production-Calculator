import type { SpecialRecipe } from '../../types/specialRecipes';
import { createSpecialRecipe } from '../../utils/specialRecipeFactory';

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
  },
};

const inputTemperatureSettings = {
  2: 'steam_temp',
};

export const coal_liquefaction_01: SpecialRecipe = createSpecialRecipe({
  id: 'r_coal_liquefaction_01',
  name: 'Makes Residue, Heavy Oil, Light Oil',
  machineId: 'm_coal_liquefaction_plant',
  settings: settingDefinitions,
  inputTemperatureSettings,
  powerConsumption: 1000000,
  powerType: 'MV' as const,
  pollution: 6.48,
  computeCycleTime: (settings: Record<string, unknown>) => {
    const steamTemp = (settings.steam_temp as number) ?? 400;
    return calculateCycleTime(steamTemp);
  },
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
});
