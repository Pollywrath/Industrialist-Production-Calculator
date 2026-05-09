import products from '../products.json';
import type { Product } from '../../types/data';

// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const FLUID_ID_1: string = 'p_water';
const RATE_1: number = 15;
const FLUID_ID_2: string = 'p_residue';
const RATE_2: number = 10;

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

const productList = products as Product[];
const found1 = productList.find((p) => p.id === FLUID_ID_1);
const found2 = productList.find((p) => p.id === FLUID_ID_2);

const inputs: { product_id: string; quantity: number }[] = [];
let totalPollution = 0;
const recipeNameParts: string[] = [];

if (found1 && found1.type === 'Fluid' && RATE_1 > 0) {
  inputs.push({ product_id: FLUID_ID_1, quantity: Math.min(15, RATE_1) });
  totalPollution += calculatePollution(FLUID_ID_1, Math.min(15, RATE_1));
  recipeNameParts.push(found1.name);
}

if (found2 && found2.type === 'Fluid' && RATE_2 > 0) {
  inputs.push({ product_id: FLUID_ID_2, quantity: Math.min(15, RATE_2) });
  totalPollution += calculatePollution(FLUID_ID_2, Math.min(15, RATE_2));
  recipeNameParts.push(found2.name);
}

const isValid = inputs.length > 0;
const recipeName = isValid ? `Dump ${recipeNameParts.join(' and ')}` : 'Invalid Configuration';

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
        id: 'r_liquid_dump_01',
        name: recipeName,
        machine_id: 'm_liquid_dump',
        cycle_time: 1,
        power_consumption: 0,
        power_type: 'MV',
        pollution: totalPollution,
        inputs: inputs,
        outputs: [],
      },
    ]
  : [];

export default recipes;
