// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const FUEL_TYPE: 'Coal' | 'Coke Fuel' | 'Planks' | 'Oak Log' = 'Coal';

// ─── DATA TABLES ──────────────────────────────────────────────────
const FUEL_MAP: Record<string, { product_id: string; energy: number }> = {
  Coal: { product_id: 'p_coal', energy: 30000 },
  'Coke Fuel': { product_id: 'p_coke_fuel', energy: 600000 },
  Planks: { product_id: 'p_planks', energy: 9000 },
  'Oak Log': { product_id: 'p_oak_log', energy: 16000 },
};

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const fuel = FUEL_MAP[FUEL_TYPE];

const cycleTime = (energy: number, extra: number = 0) =>
  parseFloat((energy / fuel.energy + extra).toFixed(6));

const fuelQty = (energy: number) => parseFloat((energy / fuel.energy).toFixed(6));

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
    id: 'r_industrial_firebox_01',
    name: 'Makes Sulfur Dioxide',
    machine_id: 'm_industrial_firebox',
    cycle_time: cycleTime(900000),
    power_consumption: 0,
    power_type: 'MV',
    pollution: 1.8,
    inputs: [
      { product_id: fuel.product_id, quantity: fuelQty(900000) },
      { product_id: 'p_liquid_sulfur', quantity: 4.5 },
    ],
    outputs: [{ product_id: 'p_sulfur_dioxide', quantity: 9 }],
  },
  {
    id: 'r_industrial_firebox_02',
    name: 'Makes Boron',
    machine_id: 'm_industrial_firebox',
    cycle_time: cycleTime(900000, 1),
    power_consumption: 0,
    power_type: 'MV',
    pollution: 1.8,
    inputs: [
      { product_id: fuel.product_id, quantity: fuelQty(900000) },
      { product_id: 'p_boric_acid', quantity: 2 },
    ],
    outputs: [{ product_id: 'p_boron', quantity: 1 }],
  },
  {
    id: 'r_industrial_firebox_03',
    name: 'Heats Water',
    machine_id: 'm_industrial_firebox',
    cycle_time: cycleTime(300000),
    power_consumption: 0,
    power_type: 'MV',
    pollution: 1.8,
    inputs: [
      { product_id: fuel.product_id, quantity: fuelQty(300000) },
      { product_id: 'p_water', quantity: 12 },
    ],
    outputs: [{ product_id: 'p_water', quantity: 12, temperature: 240 }],
  },
  {
    id: 'r_industrial_firebox_04',
    name: 'Heats Filtered Water',
    machine_id: 'm_industrial_firebox',
    cycle_time: cycleTime(300000),
    power_consumption: 0,
    power_type: 'MV',
    pollution: 1.8,
    inputs: [
      { product_id: fuel.product_id, quantity: fuelQty(300000) },
      { product_id: 'p_filtered_water', quantity: 12 },
    ],
    outputs: [{ product_id: 'p_filtered_water', quantity: 12, temperature: 240 }],
  },
  {
    id: 'r_industrial_firebox_05',
    name: 'Heats Distilled Water',
    machine_id: 'm_industrial_firebox',
    cycle_time: cycleTime(300000),
    power_consumption: 0,
    power_type: 'MV',
    pollution: 1.8,
    inputs: [
      { product_id: fuel.product_id, quantity: fuelQty(300000) },
      { product_id: 'p_distilled_water', quantity: 12 },
    ],
    outputs: [{ product_id: 'p_distilled_water', quantity: 12, temperature: 240 }],
  },
  {
    id: 'r_industrial_firebox_06',
    name: 'Makes Water, Table Salt',
    machine_id: 'm_industrial_firebox',
    cycle_time: cycleTime(300000),
    power_consumption: 0,
    power_type: 'MV',
    pollution: 1.8,
    inputs: [
      { product_id: fuel.product_id, quantity: fuelQty(300000) },
      { product_id: 'p_concentrated_salt_solution', quantity: 12 },
    ],
    outputs: [
      { product_id: 'p_water', quantity: 12, temperature: 240 },
      { product_id: 'p_table_salt', quantity: 2 },
    ],
  },
  {
    id: 'r_industrial_firebox_07',
    name: 'Makes Sodium Carbonate',
    machine_id: 'm_industrial_firebox',
    cycle_time: 1,
    power_consumption: 0,
    power_type: 'MV',
    pollution: 1.8,
    inputs: [
      { product_id: 'p_water', quantity: 12 },
      { product_id: 'p_oak_log', quantity: 1 },
    ],
    outputs: [
      { product_id: 'p_water', quantity: 12 },
      { product_id: 'p_sodium_carbonate', quantity: 16 },
    ],
  },
];

export { FUEL_TYPE, fuel, recipes };
