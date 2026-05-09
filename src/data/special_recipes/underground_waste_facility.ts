import products from '../products.json';
import type { Product } from '../../types/data';

// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const ITEM_ID: string = 'p_uranium_fuel_rod';
const ITEM_RATE: number = 120;

const FLUID_ID: string = 'p_contaminated_water';
const FLUID_RATE: number = 120;

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const productList = products as Product[];
const foundItem = productList.find((p) => p.id === ITEM_ID);
const foundFluid = productList.find((p) => p.id === FLUID_ID);

const validItem = foundItem && foundItem.type === 'Item';
const validFluid = foundFluid && foundFluid.type === 'Fluid';

const totalRate =
  (validItem ? Math.min(240, ITEM_RATE) : 0) + (validFluid ? Math.min(240, FLUID_RATE) : 0);
const isValid = totalRate > 0;

const cycleTime = isValid ? 7000 / totalRate : 1;

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

const inputs: { product_id: string; quantity: number }[] = [];
if (isValid) {
  if (validItem) {
    inputs.push({
      product_id: ITEM_ID,
      quantity: Math.min(240, ITEM_RATE) * cycleTime,
    });
  }
  if (validFluid) {
    inputs.push({
      product_id: FLUID_ID,
      quantity: Math.min(240, FLUID_RATE) * cycleTime,
    });
  }
  inputs.push({ product_id: 'p_concrete_block', quantity: 140 });
  inputs.push({ product_id: 'p_lead_ingot', quantity: 70 });
}

const recipes: Recipe[] = isValid
  ? [
      {
        id: 'r_underground_waste_facility_01',
        name: 'Underground Waste Disposal',
        machine_id: 'm_underground_waste_facility',
        cycle_time: cycleTime,
        power_consumption: 1000000,
        power_type: 'MV',
        pollution: 0,
        inputs: inputs,
        outputs: [],
      },
    ]
  : [];

export default recipes;
