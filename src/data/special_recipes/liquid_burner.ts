import products from '../products.json';
import type { Product } from '../../types/data';

// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const FLUID_ID_1: string = 'p_crude_oil';
const RATE_1: number = 60;

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const ZERO_POLLUTION_FLUIDS = [
  'p_water',
  'p_filtered_water',
  'p_distilled_water',
  'p_steam',
  'p_high_pressure_steam',
  'p_low_pressure_steam',
];

const calculatePollution = (fluidId: string, rate: number): number => {
  if (ZERO_POLLUTION_FLUIDS.includes(fluidId)) return 0;
  if (fluidId === 'p_residue') return 8.64 * rate;
  return 0.02 * rate;
};

const found1 = (products as Product[]).find((p) => p.id === FLUID_ID_1);
const isValid = found1 && found1.type === 'Fluid' && RATE_1 > 0;

const pollution = isValid ? calculatePollution(FLUID_ID_1, RATE_1) : 0;

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

const recipes: Recipe[] = isValid
  ? [
      {
        id: 'r_liquid_burner_01',
        name: `Burn ${found1.name}`,
        machine_id: 'm_liquid_burner',
        cycle_time: 1,
        power_consumption: 0,
        power_type: 'MV',
        pollution: pollution,
        inputs: [{ product_id: FLUID_ID_1, quantity: Math.min(120, RATE_1) }],
        outputs: [],
      },
    ]
  : [];

export { recipes };
