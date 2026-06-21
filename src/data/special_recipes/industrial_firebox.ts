import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { roundTo } from '../../utils/precision';

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
  return Math.ceil(energy / fuel.energy) + extra;
};

const getFuelQty = (energy: number) => (settings: Record<string, unknown>) => {
  const fuel = getFuel(settings);
  return roundTo(energy / fuel.energy, 6);
};

const commonResolveSettings = (productId: string) => {
  const fuel = Object.entries(FUEL_MAP).find(([, f]) => f.product_id === productId);
  if (fuel) return { fuel_type: fuel[0] };
  return null;
};

const commonPotentialInputs = Object.values(FUEL_MAP).map((f) => f.product_id);

export const industrial_firebox_01: SpecialRecipe = {
  id: 'r_industrial_firebox_01',
  name: 'Makes Sulfur Dioxide',
  machine_id: 'm_industrial_firebox',
  settings: settingDefinitions,
  potentialInputs: commonPotentialInputs,
  resolveSettings: commonResolveSettings,
  compute: (settings) => {
    const cycleTime = getCycleTime(900000)(settings);
    const fuel = getFuel(settings);
    const fuelQty = getFuelQty(900000)(settings);

    const recipe: Recipe = {
      id: 'r_industrial_firebox_01',
      name: 'Makes Sulfur Dioxide',
      machine_id: 'm_industrial_firebox',
      cycle_time: cycleTime,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 1.8,
      inputs: [
        { product_id: fuel.product_id, quantity: fuelQty },
        { product_id: 'p_liquid_sulfur', quantity: 4.5 },
      ],
      outputs: [{ product_id: 'p_sulfur_dioxide', quantity: 9, temperature: 18 }],
    };

    return recipe;
  },
};

export const industrial_firebox_02: SpecialRecipe = {
  id: 'r_industrial_firebox_02',
  name: 'Makes Boron',
  machine_id: 'm_industrial_firebox',
  settings: settingDefinitions,
  potentialInputs: commonPotentialInputs,
  resolveSettings: commonResolveSettings,
  compute: (settings) => {
    const cycleTime = getCycleTime(900000)(settings);
    const fuel = getFuel(settings);
    const fuelQty = getFuelQty(900000)(settings);

    const recipe: Recipe = {
      id: 'r_industrial_firebox_02',
      name: 'Makes Boron',
      machine_id: 'm_industrial_firebox',
      cycle_time: cycleTime,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 1.8,
      inputs: [
        { product_id: fuel.product_id, quantity: fuelQty },
        { product_id: 'p_boric_acid', quantity: 2 },
      ],
      outputs: [{ product_id: 'p_boron', quantity: 1, temperature: 18 }],
    };

    return recipe;
  },
};

export const industrial_firebox_03: SpecialRecipe = {
  id: 'r_industrial_firebox_03',
  name: 'Heats Water',
  machine_id: 'm_industrial_firebox',
  settings: settingDefinitions,
  potentialInputs: commonPotentialInputs,
  resolveSettings: commonResolveSettings,
  compute: (settings) => {
    const cycleTime = getCycleTime(300000)(settings);
    const fuel = getFuel(settings);
    const fuelQty = getFuelQty(300000)(settings);

    const recipe: Recipe = {
      id: 'r_industrial_firebox_03',
      name: 'Heats Water',
      machine_id: 'm_industrial_firebox',
      cycle_time: cycleTime,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 1.8,
      inputs: [
        { product_id: fuel.product_id, quantity: fuelQty },
        { product_id: 'p_water', quantity: 12 },
      ],
      outputs: [{ product_id: 'p_water', quantity: 12, temperature: 300 }],
    };

    return recipe;
  },
};

export const industrial_firebox_04: SpecialRecipe = {
  id: 'r_industrial_firebox_04',
  name: 'Heats Filtered Water',
  machine_id: 'm_industrial_firebox',
  settings: settingDefinitions,
  potentialInputs: commonPotentialInputs,
  resolveSettings: commonResolveSettings,
  compute: (settings) => {
    const cycleTime = getCycleTime(300000)(settings);
    const fuel = getFuel(settings);
    const fuelQty = getFuelQty(300000)(settings);

    const recipe: Recipe = {
      id: 'r_industrial_firebox_04',
      name: 'Heats Filtered Water',
      machine_id: 'm_industrial_firebox',
      cycle_time: cycleTime,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 1.8,
      inputs: [
        { product_id: fuel.product_id, quantity: fuelQty },
        { product_id: 'p_filtered_water', quantity: 12 },
      ],
      outputs: [{ product_id: 'p_filtered_water', quantity: 12, temperature: 300 }],
    };

    return recipe;
  },
};

export const industrial_firebox_05: SpecialRecipe = {
  id: 'r_industrial_firebox_05',
  name: 'Heats Distilled Water',
  machine_id: 'm_industrial_firebox',
  settings: settingDefinitions,
  potentialInputs: commonPotentialInputs,
  resolveSettings: commonResolveSettings,
  compute: (settings) => {
    const cycleTime = getCycleTime(300000)(settings);
    const fuel = getFuel(settings);
    const fuelQty = getFuelQty(300000)(settings);

    const recipe: Recipe = {
      id: 'r_industrial_firebox_05',
      name: 'Heats Distilled Water',
      machine_id: 'm_industrial_firebox',
      cycle_time: cycleTime,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 1.8,
      inputs: [
        { product_id: fuel.product_id, quantity: fuelQty },
        { product_id: 'p_distilled_water', quantity: 12 },
      ],
      outputs: [{ product_id: 'p_distilled_water', quantity: 12, temperature: 300 }],
    };

    return recipe;
  },
};

export const industrial_firebox_06: SpecialRecipe = {
  id: 'r_industrial_firebox_06',
  name: 'Makes Water, Table Salt',
  machine_id: 'm_industrial_firebox',
  settings: settingDefinitions,
  potentialInputs: commonPotentialInputs,
  resolveSettings: commonResolveSettings,
  compute: (settings) => {
    const cycleTime = getCycleTime(300000)(settings);
    const fuel = getFuel(settings);
    const fuelQty = getFuelQty(300000)(settings);

    const recipe: Recipe = {
      id: 'r_industrial_firebox_06',
      name: 'Makes Water, Table Salt',
      machine_id: 'm_industrial_firebox',
      cycle_time: cycleTime,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 1.8,
      inputs: [
        { product_id: fuel.product_id, quantity: fuelQty },
        { product_id: 'p_concentrated_salt_solution', quantity: 12 },
      ],
      outputs: [
        { product_id: 'p_water', quantity: 12, temperature: 300 },
        { product_id: 'p_table_salt', quantity: 2, temperature: 18 },
      ],
    };

    return recipe;
  },
};

export const industrial_firebox_07: SpecialRecipe = {
  id: 'r_industrial_firebox_07',
  name: 'Makes Sodium Carbonate',
  machine_id: 'm_industrial_firebox',
  settings: {},
  compute: () => {
    const recipe: Recipe = {
      id: 'r_industrial_firebox_07',
      name: 'Makes Sodium Carbonate',
      machine_id: 'm_industrial_firebox',
      cycle_time: 1,
      power_consumption: 0,
      power_type: 'MV',
      pollution: 1.8,
      inputs: [
        { product_id: 'p_water', quantity: 16 },
        { product_id: 'p_oak_log', quantity: 1 },
      ],
      outputs: [
        { product_id: 'p_water', quantity: 16, temperature: 18 },
        { product_id: 'p_sodium_carbonate', quantity: 16, temperature: 18 },
      ],
    };

    return recipe;
  },
};
