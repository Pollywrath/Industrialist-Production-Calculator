import type { SpecialRecipe } from '../../types/specialRecipes';
import { createSpecialRecipe } from '../../utils/specialRecipeFactory';

const FUEL_MAP: Record<string, { product_id: string; energy: number }> = {
  Coal: { product_id: 'p_coal', energy: 30000 },
  'Coke Fuel': { product_id: 'p_coke_fuel', energy: 600000 },
  Planks: { product_id: 'p_planks', energy: 9000 },
  'Oak Log': { product_id: 'p_oak_log', energy: 16000 },
};

const settingDefinitions = {
  fuel_type: {
    type: 'select' as const,
    label: 'Fuel Type',
    default: 'Coke Fuel',
    options: [
      { label: 'Coal', value: 'Coal' },
      { label: 'Coke Fuel', value: 'Coke Fuel' },
      { label: 'Planks', value: 'Planks' },
      { label: 'Oak Log', value: 'Oak Log' },
    ],
  },
};

const getFuel = (settings: Record<string, unknown>) => {
  const fuelType = (settings.fuel_type as string) ?? 'Coal';
  return FUEL_MAP[fuelType] ?? FUEL_MAP['Coal'];
};

const getCycleTime = (energy: number, extra: number = 0) => (settings: Record<string, unknown>) => {
  const fuel = getFuel(settings);
  return parseFloat((energy / fuel.energy + extra).toFixed(6));
};

const getFuelQty = (energy: number) => (settings: Record<string, unknown>) => {
  const fuel = getFuel(settings);
  return parseFloat((energy / fuel.energy).toFixed(6));
};

export const industrial_firebox_01: SpecialRecipe = createSpecialRecipe({
  id: 'r_industrial_firebox_01',
  name: 'Makes Sulfur Dioxide',
  machineId: 'm_industrial_firebox',
  settings: settingDefinitions,
  computeCycleTime: getCycleTime(900000),
  powerConsumption: 0,
  powerType: 'MV' as const,
  pollution: 1.8,
  inputs: (settings) => [
    { product_id: getFuel(settings).product_id, quantity: getFuelQty(900000)(settings) },
    { product_id: 'p_liquid_sulfur', quantity: 4.5 },
  ],
  outputs: [{ product_id: 'p_sulfur_dioxide', quantity: 9, temperature: 18 }],
});

export const industrial_firebox_02: SpecialRecipe = createSpecialRecipe({
  id: 'r_industrial_firebox_02',
  name: 'Makes Boron',
  machineId: 'm_industrial_firebox',
  settings: settingDefinitions,
  computeCycleTime: getCycleTime(900000, 1),
  powerConsumption: 0,
  powerType: 'MV' as const,
  pollution: 1.8,
  inputs: (settings) => [
    { product_id: getFuel(settings).product_id, quantity: getFuelQty(900000)(settings) },
    { product_id: 'p_boric_acid', quantity: 2 },
  ],
  outputs: [{ product_id: 'p_boron', quantity: 1, temperature: 18 }],
});

export const industrial_firebox_03: SpecialRecipe = createSpecialRecipe({
  id: 'r_industrial_firebox_03',
  name: 'Heats Water',
  machineId: 'm_industrial_firebox',
  settings: settingDefinitions,
  computeCycleTime: getCycleTime(300000),
  powerConsumption: 0,
  powerType: 'MV' as const,
  pollution: 1.8,
  inputs: (settings) => [
    { product_id: getFuel(settings).product_id, quantity: getFuelQty(300000)(settings) },
    { product_id: 'p_water', quantity: 12 },
  ],
  outputs: [{ product_id: 'p_water', quantity: 12, temperature: 300 }],
});

export const industrial_firebox_04: SpecialRecipe = createSpecialRecipe({
  id: 'r_industrial_firebox_04',
  name: 'Heats Filtered Water',
  machineId: 'm_industrial_firebox',
  settings: settingDefinitions,
  computeCycleTime: getCycleTime(300000),
  powerConsumption: 0,
  powerType: 'MV' as const,
  pollution: 1.8,
  inputs: (settings) => [
    { product_id: getFuel(settings).product_id, quantity: getFuelQty(300000)(settings) },
    { product_id: 'p_filtered_water', quantity: 12 },
  ],
  outputs: [{ product_id: 'p_filtered_water', quantity: 12, temperature: 300 }],
});

export const industrial_firebox_05: SpecialRecipe = createSpecialRecipe({
  id: 'r_industrial_firebox_05',
  name: 'Heats Distilled Water',
  machineId: 'm_industrial_firebox',
  settings: settingDefinitions,
  computeCycleTime: getCycleTime(300000),
  powerConsumption: 0,
  powerType: 'MV' as const,
  pollution: 1.8,
  inputs: (settings) => [
    { product_id: getFuel(settings).product_id, quantity: getFuelQty(300000)(settings) },
    { product_id: 'p_distilled_water', quantity: 12 },
  ],
  outputs: [{ product_id: 'p_distilled_water', quantity: 12, temperature: 300 }],
});

export const industrial_firebox_06: SpecialRecipe = createSpecialRecipe({
  id: 'r_industrial_firebox_06',
  name: 'Makes Water, Table Salt',
  machineId: 'm_industrial_firebox',
  settings: settingDefinitions,
  computeCycleTime: getCycleTime(300000),
  powerConsumption: 0,
  powerType: 'MV' as const,
  pollution: 1.8,
  inputs: (settings) => [
    { product_id: getFuel(settings).product_id, quantity: getFuelQty(300000)(settings) },
    { product_id: 'p_concentrated_salt_solution', quantity: 12 },
  ],
  outputs: [
    { product_id: 'p_water', quantity: 12, temperature: 300 },
    { product_id: 'p_table_salt', quantity: 2, temperature: 18 },
  ],
});

export const industrial_firebox_07: SpecialRecipe = createSpecialRecipe({
  id: 'r_industrial_firebox_07',
  name: 'Makes Sodium Carbonate',
  machineId: 'm_industrial_firebox',
  cycleTime: 1,
  powerConsumption: 0,
  powerType: 'MV' as const,
  pollution: 1.8,
  inputs: [
    { product_id: 'p_water', quantity: 12 },
    { product_id: 'p_oak_log', quantity: 1 },
  ],
  outputs: [
    { product_id: 'p_water', quantity: 12, temperature: 18 },
    { product_id: 'p_sodium_carbonate', quantity: 16, temperature: 18 },
  ],
});
