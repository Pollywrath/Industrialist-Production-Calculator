// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const STEAM_TEMPERATURE = 400;

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const calculateOutputQuantity = (tempC: number): number => {
  return Math.min(120, 0.176 * tempC);
};

const calculateOutputTemperature = (tempC: number): number => {
  return 0.165 * tempC;
};

const q = calculateOutputQuantity(STEAM_TEMPERATURE);
const t = calculateOutputTemperature(STEAM_TEMPERATURE);

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
    id: 'r_water_treatment_plant_01',
    name: 'Makes Distilled Water',
    machine_id: 'm_water_treatment_plant',
    cycle_time: 1,
    power_consumption: 2000000,
    power_type: 'MV',
    pollution: 0,
    inputs: [
      { product_id: 'p_water', quantity: 64 },
      { product_id: 'p_steam', quantity: 90 },
    ],
    outputs: [{ product_id: 'p_distilled_water', quantity: q, temperature: t }],
  },
  {
    id: 'r_water_treatment_plant_02',
    name: 'Makes Distilled Water',
    machine_id: 'm_water_treatment_plant',
    cycle_time: 1,
    power_consumption: 2000000,
    power_type: 'MV',
    pollution: 0,
    inputs: [
      { product_id: 'p_condensate', quantity: 64 },
      { product_id: 'p_steam', quantity: 90 },
    ],
    outputs: [{ product_id: 'p_distilled_water', quantity: q, temperature: t }],
  },
  {
    id: 'r_water_treatment_plant_03',
    name: 'Makes Distilled Water',
    machine_id: 'm_water_treatment_plant',
    cycle_time: 1,
    power_consumption: 2000000,
    power_type: 'MV',
    pollution: 0,
    inputs: [
      { product_id: 'p_contaminated_water', quantity: 64 },
      { product_id: 'p_steam', quantity: 90 },
    ],
    outputs: [{ product_id: 'p_distilled_water', quantity: q, temperature: t }],
  },
];

export { recipes };
