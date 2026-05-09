// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const GLOBAL_POLLUTION = 10;

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const residueQuantity = Math.max(1, 0.1 * GLOBAL_POLLUTION);

const outputs = [
  { product_id: 'p_liquid_nitrogen', quantity: 60, temperature: -205 },
  { product_id: 'p_liquid_oxygen', quantity: 15, temperature: -190 },
  { product_id: 'p_liquid_argon', quantity: 3, temperature: -195 },
  { product_id: 'p_residue', quantity: residueQuantity, temperature: 18 },
];

// ─── 3. EXPORT ───────────────────────────────────────────────────────
export interface Recipe {
  id: string;
  name: string;
  machine_id: string;
  cycle_time: number;
  power_consumption: number;
  power_type: 'MV' | 'HV';
  pollution: number;
  inputs: { product_id: string; quantity: number }[];
  outputs: { product_id: string; quantity: number; temperature?: number }[];
}

const recipes: Recipe[] = [
  {
    id: 'r_air_separation_unit_01',
    name: 'Standard Separation',
    machine_id: 'm_air_separation_unit',
    cycle_time: 1,
    power_consumption: 20000000,
    power_type: 'HV',
    pollution: 0,
    inputs: [],
    outputs: outputs,
  },
];

export default recipes;
