// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const CRANKERS: number = 1; // 1 to 4

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const powerProduction = 135810 * CRANKERS;

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
    id: 'r_hand_crank_mk2_01',
    name: 'Produces Power',
    machine_id: 'm_hand_crank_mk2',
    cycle_time: 1,
    power_consumption: -powerProduction,
    power_type: 'MV',
    pollution: 0,
    inputs: [],
    outputs: [],
  },
];

export { CRANKERS, recipes };
