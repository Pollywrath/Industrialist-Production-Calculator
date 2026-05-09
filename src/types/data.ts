// ── Machine ──────────────────────────────────────────────────

export interface MachineSize {
  x: number;
  y: number;
}

export interface Machine {
  id: string;
  name: string;
  cost: number;
  tier: number;
  size: MachineSize;
  variant: string;
  limited: boolean;
  research: string;
  category: string;
  subcategory: string;
}

// ── Product ──────────────────────────────────────────────────

export type ProductType = 'Item' | 'Fluid';

export interface Product {
  id: string;
  name: string;
  sell_price: number;
  rp_multiplier: number;
  type: ProductType;
}

// ── Recipe ───────────────────────────────────────────────────

export type PowerType = 'MV' | 'HV';

export interface RecipeInput {
  product_id: string;
  quantity: number;
}

export interface RecipeOutput {
  product_id: string;
  quantity: number;
  temperature: number;
}

export interface Recipe {
  id: string;
  name: string;
  machine_id: string;
  cycle_time: number;
  power_consumption: number;
  power_type: PowerType;
  pollution: number;
  inputs: RecipeInput[];
  outputs: RecipeOutput[];
}

// ── Research ─────────────────────────────────────────────────

export interface Research {
  id: string;
  name: string;
  rp_cost: number;
  category: string;
  prerequisites: string[];
}
