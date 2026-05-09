// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const STEAM_TEMPERATURE = 400;

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const calculateCycleTime = (tempC: number): number => {
  if (tempC <= 18) return 88;
  if (tempC <= 300) return 3000 / tempC + 10;
  if (tempC < 350) return 20 - 0.2 * (tempC - 300);
  return 10;
};

const t = calculateCycleTime(STEAM_TEMPERATURE);

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
    id: 'r_coal_liquefaction_01',
    name: 'Makes Residue, Heavy Oil, Light Oil',
    machine_id: 'm_coal_liquefaction_plant',
    cycle_time: t,
    power_consumption: 1000000,
    power_type: 'MV',
    pollution: 6.48,
    inputs: [
      { product_id: 'p_coal', quantity: 40 },
      { product_id: 'p_crude_oil', quantity: 10 },
      { product_id: 'p_steam', quantity: 200 },
    ],
    outputs: [
      { product_id: 'p_residue', quantity: 10, temperature: 18 },
      { product_id: 'p_heavy_oil', quantity: 40, temperature: 18 },
      { product_id: 'p_light_oil', quantity: 30, temperature: 18 },
    ],
  },
];

export default recipes;
