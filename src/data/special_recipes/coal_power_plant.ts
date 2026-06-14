// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
// TODO: Skipped for now. Update to new special recipe format later.
import { clamp } from '../../utils/precision';

const DISTILLED_WATER_INPUT = 400;
const COAL_INPUT = 160;
const DISTILLED_WATER_OUTPUT = 400;
const DISTILLED_WATER_OUTPUT_TEMP = 300;
const EXHAUST_OUTPUT = 12000;
const POWER_CONSUMPTION = 100000;

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const dwIn = clamp(DISTILLED_WATER_INPUT, 0.0001, 400);
const coalIn = clamp(COAL_INPUT, 0.0001, 160);
const dwOut = clamp(DISTILLED_WATER_OUTPUT, 0.0001, 400);
const exhaustOut = clamp(EXHAUST_OUTPUT, 0.0001, 12000);
const powerIn = Math.max(100000, POWER_CONSUMPTION);
const dwOutTemp = DISTILLED_WATER_OUTPUT_TEMP;

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
    id: 'r_coal_power_plant_01',
    name: 'Coal Power Plant',
    machine_id: 'm_coal_power_plant',
    cycle_time: 1,
    power_consumption: powerIn,
    power_type: 'HV',
    pollution: 0,
    inputs: [
      { product_id: 'p_coal', quantity: coalIn },
      { product_id: 'p_distilled_water', quantity: dwIn },
    ],
    outputs: [
      {
        product_id: 'p_distilled_water',
        quantity: dwOut,
        temperature: dwOutTemp,
      },
      { product_id: 'p_exhaust', quantity: exhaustOut },
    ],
  },
];

export { recipes };
