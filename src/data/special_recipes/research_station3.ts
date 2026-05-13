import products from '../products.json';
import type { Product } from '../../types/data';

// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const ITEM_ID_1: string = 'p_coal';
const ITEM_ID_2: string = 'p_copper_ingot';
const HAS_STATION_4: boolean = false;

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const productList = products as Product[];
const found1 = productList.find((p) => p.id === ITEM_ID_1);
const found2 = productList.find((p) => p.id === ITEM_ID_2);

const inputs: { product_id: string; quantity: number }[] = [];
const nameParts: string[] = [];

if (found1 && found1.type === 'Item') {
  inputs.push({ product_id: ITEM_ID_1, quantity: 0.1 });
  nameParts.push(found1.name);
}
if (found2 && found2.type === 'Item') {
  inputs.push({ product_id: ITEM_ID_2, quantity: 0.1 });
  nameParts.push(found2.name);
}

const isValid = inputs.length > 0;
const power = HAS_STATION_4 ? 5000000 : 600000;

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
        id: 'r_research_station3_01',
        name: 'Research Station 3',
        machine_id: 'm_research_station3',
        cycle_time: 1,
        power_consumption: power,
        power_type: 'MV',
        pollution: 0,
        inputs: inputs,
        outputs: [],
      },
    ]
  : [];

export { recipes };
