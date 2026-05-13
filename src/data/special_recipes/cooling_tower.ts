// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const DISTILLED_WATER_INPUT_TEMP: number = 100;

// ─── DATA TABLES ──────────────────────────────────────────────────
const PRODUCT_ID = 'p_distilled_water';

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const INPUT_QUANTITY = 12000;
const OUTPUT_QUANTITY = 12000;

const outputTemperature = Math.max(DISTILLED_WATER_INPUT_TEMP / 3, 21);

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
    id: 'r_cooling_tower_01',
    name: 'Cooling Distilled Water',
    machine_id: 'm_cooling_tower',
    cycle_time: 1,
    power_consumption: 0,
    power_type: 'MV',
    pollution: 0,
    inputs: [
      {
        product_id: PRODUCT_ID,
        quantity: INPUT_QUANTITY,
        temperature: DISTILLED_WATER_INPUT_TEMP,
      },
    ],
    outputs: [
      {
        product_id: PRODUCT_ID,
        quantity: OUTPUT_QUANTITY,
        temperature: outputTemperature,
      },
    ],
  },
];

export { outputTemperature , recipes };
