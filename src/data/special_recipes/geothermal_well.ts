// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const INPUT_TEMP: number = 40;

// ─── DATA TABLES ──────────────────────────────────────────────────
const OUTPUT_TEMP = Math.min(INPUT_TEMP + 80, 220);

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const cycleTime = 1;
const inputQty = 9.09;
const outputQty = 6.05;

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
    id: 'r_geothermal_well_01',
    name: 'Heats Water (+80°C)',
    machine_id: 'm_geothermal_well',
    cycle_time: cycleTime,
    power_consumption: 3000,
    power_type: 'MV',
    pollution: 0,
    inputs: [{ product_id: 'p_water', quantity: inputQty, temperature: INPUT_TEMP }],
    outputs: [{ product_id: 'p_water', quantity: outputQty, temperature: OUTPUT_TEMP }],
  },
  {
    id: 'r_geothermal_well_02',
    name: 'Heats Filtered Water (+80°C)',
    machine_id: 'm_geothermal_well',
    cycle_time: cycleTime,
    power_consumption: 3000,
    power_type: 'MV',
    pollution: 0,
    inputs: [
      {
        product_id: 'p_filtered_water',
        quantity: inputQty,
        temperature: INPUT_TEMP,
      },
    ],
    outputs: [
      {
        product_id: 'p_filtered_water',
        quantity: outputQty,
        temperature: OUTPUT_TEMP,
      },
    ],
  },
  {
    id: 'r_geothermal_well_03',
    name: 'Heats Distilled Water (+80°C)',
    machine_id: 'm_geothermal_well',
    cycle_time: cycleTime,
    power_consumption: 3000,
    power_type: 'MV',
    pollution: 0,
    inputs: [
      {
        product_id: 'p_distilled_water',
        quantity: inputQty,
        temperature: INPUT_TEMP,
      },
    ],
    outputs: [
      {
        product_id: 'p_distilled_water',
        quantity: outputQty,
        temperature: OUTPUT_TEMP,
      },
    ],
  },
];

export { INPUT_TEMP, OUTPUT_TEMP , recipes };
