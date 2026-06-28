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
  sandboxOnly?: boolean;
  sandboxPlusOnly?: boolean;
}

export type ProductType = 'Item' | 'Fluid';
export type HandleDataType = 'item' | 'fluid';

export interface Product {
  id: string;
  name: string;
  sell_price: number;
  rp_multiplier: number;
  type: ProductType;
  profit?: boolean;
  research?: boolean;
}

export type PowerType = 'MV' | 'HV';

export interface RecipePowerEffect {
  power_type: PowerType;
  power_consumption: number;
  label?: string;
  accounting?: 'normal' | 'production_delta';
}

export interface RecipeInput {
  product_id: string;
  quantity: number;
  handle_type?: HandleDataType;
  product_link_id?: string;
  variable?: boolean;
  independentOfMachineCount?: boolean;
}

export interface RecipeOutput {
  product_id: string;
  quantity: number;
  temperature: number;
  handle_type?: HandleDataType;
  product_link_id?: string;
  voidable?: boolean;
  variable?: boolean;
  independentOfMachineCount?: boolean;
}

export interface RecipeRuntimeState {
  boilerTemp?: number;
  hxTemp?: number;
}

export interface Recipe {
  id: string;
  name: string;
  machine_id: string;
  cycle_time: number;
  power_consumption: number;
  power_type: PowerType;
  powerEffects?: RecipePowerEffect[];
  powerAccountingEffects?: RecipePowerEffect[];
  pollution: number;
  inputs: RecipeInput[];
  outputs: RecipeOutput[];
  runtime?: RecipeRuntimeState;
  isSellTrash?: boolean;
  potential_inputs?: string[];
  potential_outputs?: string[];
  powerIndependentOfMachineCount?: boolean;
  pollutionIndependentOfMachineCount?: boolean;
}

export interface Research {
  id: string;
  name: string;
  rp_cost: number;
  category: string;
  prerequisites: string[];
}
