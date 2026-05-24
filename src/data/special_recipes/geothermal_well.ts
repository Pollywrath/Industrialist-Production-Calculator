import type { SpecialRecipe } from '../../types/specialRecipes';
import { createSpecialRecipe } from '../../utils/specialRecipeFactory';

const settingDefinitions = {
  input_temp: {
    type: 'number' as const,
    label: 'Input Temperature (°C)',
    default: 40,
  },
};

const inputTemperatureSettings = {
  0: 'input_temp',
};

const cycleTime = 1;
const inputQty = 9.09;
const outputQty = 6.05;

const commonConfig = {
  machineId: 'm_geothermal_well',
  settings: settingDefinitions,
  inputTemperatureSettings,
  powerConsumption: 3000,
  powerType: 'MV' as const,
  pollution: 0,
  cycleTime,
};

export const geothermal_well_01: SpecialRecipe = createSpecialRecipe({
  ...commonConfig,
  id: 'r_geothermal_well_01',
  name: 'Heats Water',
  inputs: [{ product_id: 'p_water', quantity: inputQty }],
  outputs: (settings: Record<string, unknown>) => {
    const inputTemp = (settings.input_temp as number) ?? 40;
    const outputTemp = Math.min(inputTemp + 80, 220);
    return [{ product_id: 'p_water', quantity: outputQty, temperature: outputTemp }];
  },
});

export const geothermal_well_02: SpecialRecipe = createSpecialRecipe({
  ...commonConfig,
  id: 'r_geothermal_well_02',
  name: 'Heats Filtered Water',
  inputs: [{ product_id: 'p_filtered_water', quantity: inputQty }],
  outputs: (settings: Record<string, unknown>) => {
    const inputTemp = (settings.input_temp as number) ?? 40;
    const outputTemp = Math.min(inputTemp + 80, 220);
    return [{ product_id: 'p_filtered_water', quantity: outputQty, temperature: outputTemp }];
  },
});

export const geothermal_well_03: SpecialRecipe = createSpecialRecipe({
  ...commonConfig,
  id: 'r_geothermal_well_03',
  name: 'Heats Distilled Water',
  inputs: [{ product_id: 'p_distilled_water', quantity: inputQty }],
  outputs: (settings: Record<string, unknown>) => {
    const inputTemp = (settings.input_temp as number) ?? 40;
    const outputTemp = Math.min(inputTemp + 80, 220);
    return [{ product_id: 'p_distilled_water', quantity: outputQty, temperature: outputTemp }];
  },
});
