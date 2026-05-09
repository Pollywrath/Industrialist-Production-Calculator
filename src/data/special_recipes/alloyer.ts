// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const STEAM_TEMPERATURE = 400;

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const calculateCycleTime = (tempC: number): number => {
  if (tempC <= 0) return 40;
  if (tempC < 300) return 1500 / tempC + 5;
  if (tempC >= 400) return 8;
  return 4000 / (tempC + 100);
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
    id: 'r_alloyer_ferroaluminium',
    name: 'Makes Molten Ferroaluminium Alloy',
    machine_id: 'm_alloyer',
    cycle_time: t,
    power_consumption: 150000,
    power_type: 'MV',
    pollution: 0.324,
    inputs: [
      { product_id: 'p_iron_ingot', quantity: 4 },
      { product_id: 'p_aluminium_ingot', quantity: 2 },
      { product_id: 'p_steam', quantity: 200 },
    ],
    outputs: [
      {
        product_id: 'p_molten_ferroaluminium_alloy',
        quantity: 2,
        temperature: 18,
      },
    ],
  },
  {
    id: 'r_alloyer_purple_gold',
    name: 'Makes Molten Purple Gold',
    machine_id: 'm_alloyer',
    cycle_time: t,
    power_consumption: 150000,
    power_type: 'MV',
    pollution: 0.324,
    inputs: [
      { product_id: 'p_gold_ingot', quantity: 1 },
      { product_id: 'p_aluminium_ingot', quantity: 2 },
      { product_id: 'p_steam', quantity: 200 },
    ],
    outputs: [{ product_id: 'p_molten_purple_gold', quantity: 2, temperature: 18 }],
  },
  {
    id: 'r_alloyer_brass',
    name: 'Makes Liquid Brass',
    machine_id: 'm_alloyer',
    cycle_time: t,
    power_consumption: 150000,
    power_type: 'MV',
    pollution: 0.324,
    inputs: [
      { product_id: 'p_copper_ingot', quantity: 6 },
      { product_id: 'p_zinc', quantity: 3 },
      { product_id: 'p_steam', quantity: 200 },
    ],
    outputs: [{ product_id: 'p_liquid_brass', quantity: 9, temperature: 18 }],
  },
];

export default recipes;
