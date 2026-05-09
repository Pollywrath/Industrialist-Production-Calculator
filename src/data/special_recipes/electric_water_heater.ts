// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const TARGET_TEMPERATURE: 120 | 220 | 320 = 120;

// ─── DATA TABLES ──────────────────────────────────────────────────
const MODE_MAP: Record<number, { power: number; type: 'MV' | 'HV' }> = {
  120: { power: 300000, type: 'MV' },
  220: { power: 800000, type: 'MV' },
  320: { power: 1500000, type: 'HV' },
};

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const mode = MODE_MAP[TARGET_TEMPERATURE];

// ─── 3. EXPORT ───────────────────────────────────────────────────────
export interface Recipe {
  id: string;
  name: string;
  machine_id: string;
  cycle_time: number;
  power_consumption: number;
  power_type: 'MV' | 'HV';
  pollution: number;
  inputs: { product_id: string; quantity: number; temperature?: number }[];
  outputs: { product_id: string; quantity: number; temperature?: number }[];
}

const recipes: Recipe[] = [
  {
    id: 'r_electric_water_heater_01',
    name: `Heats Water to ${TARGET_TEMPERATURE}°C`,
    machine_id: 'm_electric_water_heater',
    cycle_time: 1,
    power_consumption: mode.power,
    power_type: mode.type,
    pollution: 0,
    inputs: [{ product_id: 'p_water', quantity: 6 }],
    outputs: [{ product_id: 'p_water', quantity: 6, temperature: TARGET_TEMPERATURE }],
  },
  {
    id: 'r_electric_water_heater_02',
    name: `Heats Filtered Water to ${TARGET_TEMPERATURE}°C`,
    machine_id: 'm_electric_water_heater',
    cycle_time: 1,
    power_consumption: mode.power,
    power_type: mode.type,
    pollution: 0,
    inputs: [{ product_id: 'p_filtered_water', quantity: 6 }],
    outputs: [
      {
        product_id: 'p_filtered_water',
        quantity: 6,
        temperature: TARGET_TEMPERATURE,
      },
    ],
  },
  {
    id: 'r_electric_water_heater_03',
    name: `Heats Distilled Water to ${TARGET_TEMPERATURE}°C`,
    machine_id: 'm_electric_water_heater',
    cycle_time: 1,
    power_consumption: mode.power,
    power_type: mode.type,
    pollution: 0,
    inputs: [{ product_id: 'p_distilled_water', quantity: 6 }],
    outputs: [
      {
        product_id: 'p_distilled_water',
        quantity: 6,
        temperature: TARGET_TEMPERATURE,
      },
    ],
  },
];

export { TARGET_TEMPERATURE, mode };
export default recipes;
