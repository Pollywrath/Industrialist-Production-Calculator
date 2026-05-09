import products from '../products.json';
import type { Product } from '../../types/data';

// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const ITEM_ID_1: string = 'p_coal';

// ─── 2. COMPUTATIONS ───────────────────────────────────────────────────
const found1 = (products as Product[]).find((p) => p.id === ITEM_ID_1);
const isValid = found1 && found1.type === 'Item';

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
        id: 'r_research_station2_01',
        name: 'Research Station 2',
        machine_id: 'm_research_station2',
        cycle_time: 1,
        power_consumption: 17000,
        power_type: 'MV',
        pollution: 0,
        inputs: [{ product_id: ITEM_ID_1, quantity: 0.5 }],
        outputs: [],
      },
    ]
  : [];

export default recipes;
