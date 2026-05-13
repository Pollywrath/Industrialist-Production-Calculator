import products from '../products.json';
import type { Product } from '../../types/data';

// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const PRODUCT_ID: string = 'p_coal';

// ─── 2. COMPUTATIONS ───────────────────────────────────────────────────
const found = (products as Product[]).find((p) => p.id === PRODUCT_ID);
const isValid = found && found.type === 'Item';

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
        id: 'r_truck_depot_01',
        name: `Sell ${found.name}`,
        machine_id: 'm_truck_depot',
        cycle_time: 15,
        power_consumption: 0,
        power_type: 'MV',
        pollution: 1.2,
        inputs: [{ product_id: PRODUCT_ID, quantity: 10 }],
        outputs: [],
      },
    ]
  : [];

export { recipes };
