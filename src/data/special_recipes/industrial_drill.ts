// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const STEAM_TEMPERATURE = 100;

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const multiplier = Math.min(4, Math.max(0, STEAM_TEMPERATURE / 100));

const ironYield = 10 * multiplier;
const copperYield = 10 * multiplier;
const bauxiteYield = 0.5 * multiplier;

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
    id: 'r_industrial_drill_iron',
    name: 'Extract Raw Iron',
    machine_id: 'm_industrial_drill',
    cycle_time: 1,
    power_consumption: 0,
    power_type: 'MV',
    pollution: 0,
    inputs: [{ product_id: 'p_steam', quantity: 720 }],
    outputs: [{ product_id: 'p_raw_iron', quantity: ironYield, temperature: 18 }],
  },
  {
    id: 'r_industrial_drill_copper',
    name: 'Extract Raw Copper',
    machine_id: 'm_industrial_drill',
    cycle_time: 1,
    power_consumption: 0,
    power_type: 'MV',
    pollution: 0,
    inputs: [{ product_id: 'p_steam', quantity: 720 }],
    outputs: [{ product_id: 'p_raw_copper', quantity: copperYield, temperature: 18 }],
  },
  {
    id: 'r_industrial_drill_bauxite',
    name: 'Extract Bauxite Residue',
    machine_id: 'm_industrial_drill',
    cycle_time: 1,
    power_consumption: 0,
    power_type: 'MV',
    pollution: 0,
    inputs: [{ product_id: 'p_steam', quantity: 720 }],
    outputs: [
      {
        product_id: 'p_bauxite_residue',
        quantity: bauxiteYield,
        temperature: 18,
      },
    ],
  },
];

export default recipes;
