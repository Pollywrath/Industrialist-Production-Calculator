// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const STEAM_TEMPERATURE = 400;

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const calculateCycleTime = (tempC: number): number => {
  if (tempC <= 0) return 30;
  const T3 = 2973 / 11;
  const T4 = 4000 / 11;
  if (tempC <= T3) return 30 + (-165 / 1982) * tempC;
  if (tempC < T4) return (-99 / 2054) * tempC + 21081 / 1027;
  return 3;
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
    id: 'r_steam_cracking_plant_01',
    name: 'Makes Paraxylene, Ethylene',
    machine_id: 'm_steam_cracking_plant',
    cycle_time: t,
    power_consumption: 60000,
    power_type: 'MV',
    pollution: 0.432,
    inputs: [
      { product_id: 'p_crude_oil', quantity: 2 },
      { product_id: 'p_steam', quantity: 150 },
    ],
    outputs: [
      { product_id: 'p_paraxylene', quantity: 2, temperature: 18 },
      { product_id: 'p_ethylene', quantity: 3, temperature: 18 },
    ],
  },
  {
    id: 'r_steam_cracking_plant_02',
    name: 'Makes Crude Diesel, Residue',
    machine_id: 'm_steam_cracking_plant',
    cycle_time: t,
    power_consumption: 60000,
    power_type: 'MV',
    pollution: 0.432,
    inputs: [
      { product_id: 'p_light_oil', quantity: 15 },
      { product_id: 'p_steam', quantity: 150 },
    ],
    outputs: [
      { product_id: 'p_crude_diesel', quantity: 12, temperature: 18 },
      { product_id: 'p_residue', quantity: 3, temperature: 18 },
    ],
  },
  {
    id: 'r_steam_cracking_plant_03',
    name: 'Makes Light Oil, Residue',
    machine_id: 'm_steam_cracking_plant',
    cycle_time: t,
    power_consumption: 60000,
    power_type: 'MV',
    pollution: 0.432,
    inputs: [
      { product_id: 'p_heavy_oil', quantity: 20 },
      { product_id: 'p_steam', quantity: 150 },
    ],
    outputs: [
      { product_id: 'p_light_oil', quantity: 12, temperature: 18 },
      { product_id: 'p_residue', quantity: 8, temperature: 18 },
    ],
  },
  {
    id: 'r_steam_cracking_plant_04',
    name: 'Makes Naphtha, Residue',
    machine_id: 'm_steam_cracking_plant',
    cycle_time: 3,
    power_consumption: 60000,
    power_type: 'MV',
    pollution: 0.432,
    inputs: [
      { product_id: 'p_heavy_oil', quantity: 20 },
      { product_id: 'p_hydrogen', quantity: 3 },
    ],
    outputs: [
      { product_id: 'p_naphtha', quantity: 15, temperature: 18 },
      { product_id: 'p_residue', quantity: 5, temperature: 18 },
    ],
  },
  {
    id: 'r_steam_cracking_plant_05',
    name: 'Makes Light Oil, Residue',
    machine_id: 'm_steam_cracking_plant',
    cycle_time: 3,
    power_consumption: 60000,
    power_type: 'MV',
    pollution: 0.432,
    inputs: [
      { product_id: 'p_naphtha', quantity: 20 },
      { product_id: 'p_hydrogen', quantity: 3 },
    ],
    outputs: [
      { product_id: 'p_light_oil', quantity: 15, temperature: 18 },
      { product_id: 'p_residue', quantity: 5, temperature: 18 },
    ],
  },
];

export default recipes;
