import type { SpecialRecipe } from '../../types/specialRecipes';
import { createSpecialRecipe } from '../../utils/specialRecipeFactory';

const settingDefinitions = {
  distilled_water_temp: {
    type: 'number' as const,
    label: 'Distilled Water Temperature (°C)',
    default: 320,
  },
};

const inputTemperatureSettings = {
  0: 'distilled_water_temp',
};

export const cooling_tower_01: SpecialRecipe = createSpecialRecipe({
  id: 'r_cooling_tower_01',
  name: 'Cools Distilled Water',
  machineId: 'm_cooling_tower',
  settings: settingDefinitions,
  inputTemperatureSettings,
  powerConsumption: 0,
  powerType: 'MV' as const,
  pollution: 0,
  cycleTime: 1,
  inputs: [
    {
      product_id: 'p_distilled_water',
      quantity: 12000,
    },
  ],
  outputs: (settings: Record<string, unknown>) => {
    const inputTemp = (settings.distilled_water_temp as number) ?? 100;
    const outputTemp = Math.max(inputTemp / 3, 21);

    return [
      {
        product_id: 'p_distilled_water',
        quantity: 12000,
        temperature: outputTemp,
      },
    ];
  },
});
