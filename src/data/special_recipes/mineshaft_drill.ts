// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────

const DEPTH: number = 9000;
const DRILL_HEAD: 'copper' | 'iron' | 'steel' | 'tungsten' = 'tungsten';
const ACID_TYPE: 'none' | 'water' | 'acetic' | 'sulfuric' | 'hydrochloric' = 'sulfuric';
const HAS_MACHINE_OIL: boolean = true;

// ─── DATA TABLES ──────────────────────────────────────────────────

const DRILL_HEADS: Record<string, { getMulti: (d: number) => number; product_id: string }> = {
  copper: { getMulti: (d) => d / 150, product_id: 'p_copper_drill_head' },
  iron: { getMulti: (d) => 0.04 * d ** 0.25, product_id: 'p_iron_drill_head' },
  steel: {
    getMulti: (d) => 0.02 * d ** 0.25,
    product_id: 'p_steel_drill_head',
  },
  tungsten: {
    getMulti: (d) => 0.005 * d ** 0.25,
    product_id: 'p_tungsten_carbide_drill_head',
  },
};

const ACIDS: Record<
  string,
  { getMulti: (d: number) => number; rate: number; product_id: string | null }
> = {
  none: { getMulti: (d) => d ** 2 / 900e3, rate: 0, product_id: null },
  water: { getMulti: (d) => d ** 2 / 1875e3, rate: 10, product_id: 'p_water' },
  acetic: {
    getMulti: (d) => d ** 0.8 / 450,
    rate: 3,
    product_id: 'p_acetic_acid',
  },
  sulfuric: {
    getMulti: (d) => 0.09 * d ** 0.25,
    rate: 1,
    product_id: 'p_sulfuric_acid',
  },
  hydrochloric: {
    getMulti: (d) =>
      d < 6000
        ? 0.000013 * d ** (1.5 - 0.00005 * d) + 4.3875 * 10 ** -13.3 * d ** 3
        : 0.09 * d ** 0.25,
    rate: 1.5,
    product_id: 'p_hydrochloric_acid',
  },
};

const DEPTH_YIELDS: Record<number, { product_id: string; amount: number }[]> = {
  100: [
    { product_id: 'p_sand', amount: 3 },
    { product_id: 'p_gravel', amount: 3 },
    { product_id: 'p_soil', amount: 3 },
    { product_id: 'p_rich_soil', amount: 1 },
  ],
  300: [
    { product_id: 'p_sand', amount: 3 },
    { product_id: 'p_gravel', amount: 3 },
    { product_id: 'p_soil', amount: 3 },
    { product_id: 'p_rich_soil', amount: 1 },
  ],
  900: [
    { product_id: 'p_coal', amount: 6 },
    { product_id: 'p_gravel', amount: 9 },
    { product_id: 'p_raw_iron', amount: 5 },
    { product_id: 'p_raw_copper', amount: 5 },
  ],
  1200: [
    { product_id: 'p_coal', amount: 20 },
    { product_id: 'p_gravel', amount: 6 },
    { product_id: 'p_raw_iron', amount: 10 },
    { product_id: 'p_shallow_earth_fragment', amount: 3 },
  ],
  1500: [
    { product_id: 'p_raw_lead', amount: 1 },
    { product_id: 'p_gravel', amount: 8 },
    { product_id: 'p_raw_iron', amount: 8 },
    { product_id: 'p_shallow_earth_fragment', amount: 5 },
  ],
  1800: [
    { product_id: 'p_raw_lead', amount: 5 },
    { product_id: 'p_rock', amount: 8 },
    { product_id: 'p_medium_earth_fragment', amount: 2 },
    { product_id: 'p_shallow_earth_fragment', amount: 1 },
  ],
  2000: [
    { product_id: 'p_raw_lead', amount: 9.27 },
    { product_id: 'p_medium_earth_fragment', amount: 3.35 },
    { product_id: 'p_rock', amount: 9.36 },
  ],
  2200: [
    { product_id: 'p_raw_iron', amount: 9.57 },
    { product_id: 'p_shallow_earth_fragment', amount: 2.31 },
    { product_id: 'p_raw_lead', amount: 5.14 },
    { product_id: 'p_medium_earth_fragment', amount: 3.13 },
  ],
  2400: [
    { product_id: 'p_medium_earth_fragment', amount: 4.46 },
    { product_id: 'p_rock', amount: 9.79 },
  ],
  2600: [
    { product_id: 'p_medium_earth_fragment', amount: 8.44 },
    { product_id: 'p_rock', amount: 10.22 },
  ],
  2800: [
    { product_id: 'p_gravel', amount: 1.78 },
    { product_id: 'p_raw_iron', amount: 10.35 },
    { product_id: 'p_shallow_earth_fragment', amount: 2.51 },
    { product_id: 'p_raw_lead', amount: 2.9 },
  ],
  3000: [
    { product_id: 'p_shallow_earth_fragment', amount: 1.54 },
    { product_id: 'p_raw_lead', amount: 1.92 },
    { product_id: 'p_rock', amount: 6.04 },
  ],
  3200: [
    { product_id: 'p_rock', amount: 5.14 },
    { product_id: 'p_medium_earth_fragment', amount: 4.62 },
    { product_id: 'p_raw_lead', amount: 3.1 },
    { product_id: 'p_raw_iron', amount: 6.51 },
  ],
  3400: [
    { product_id: 'p_raw_iron', amount: 8.26 },
    { product_id: 'p_raw_lead', amount: 8.58 },
    { product_id: 'p_rock', amount: 7.76 },
  ],
  3600: [
    { product_id: 'p_medium_earth_fragment', amount: 6.34 },
    { product_id: 'p_raw_lead', amount: 6.41 },
    { product_id: 'p_rock', amount: 6.15 },
  ],
  3800: [
    { product_id: 'p_medium_earth_fragment', amount: 6.39 },
    { product_id: 'p_rock', amount: 9.58 },
    { product_id: 'p_raw_lead', amount: 3.45 },
    { product_id: 'p_coal', amount: 30.39 },
  ],
  4000: [
    { product_id: 'p_table_salt', amount: 58.54 },
    { product_id: 'p_medium_earth_fragment', amount: 3.67 },
    { product_id: 'p_rock', amount: 5.93 },
    { product_id: 'p_raw_lead', amount: 9.58 },
  ],
  4200: [
    { product_id: 'p_medium_earth_fragment', amount: 6.31 },
    { product_id: 'p_rock', amount: 5.01 },
    { product_id: 'p_raw_lead', amount: 4.81 },
    { product_id: 'p_coal', amount: 39.32 },
  ],
  4400: [
    { product_id: 'p_rock', amount: 14.79 },
    { product_id: 'p_coal', amount: 40.21 },
  ],
  4600: [
    { product_id: 'p_raw_zinc', amount: 7.61 },
    { product_id: 'p_bauxite_residue', amount: 1.59 },
    { product_id: 'p_rock', amount: 7.83 },
  ],
  4800: [
    { product_id: 'p_medium_earth_fragment', amount: 7.77 },
    { product_id: 'p_raw_zinc', amount: 9.79 },
    { product_id: 'p_bauxite_residue', amount: 1.2 },
    { product_id: 'p_rock', amount: 2.63 },
  ],
  5000: [
    { product_id: 'p_medium_earth_fragment', amount: 10.88 },
    { product_id: 'p_raw_zinc', amount: 4.8 },
    { product_id: 'p_bauxite_residue', amount: 1.22 },
    { product_id: 'p_rock', amount: 5.18 },
  ],
  5200: [
    { product_id: 'p_raw_iron', amount: 21.61 },
    { product_id: 'p_rock', amount: 7.61 },
    { product_id: 'p_deep_earth_fragment', amount: 1.4 },
    { product_id: 'p_raw_lead', amount: 4.79 },
  ],
  5400: [
    { product_id: 'p_medium_earth_fragment', amount: 9.5 },
    { product_id: 'p_bauxite_residue', amount: 1 },
    { product_id: 'p_rock', amount: 8.5 },
  ],
  5600: [
    { product_id: 'p_rock', amount: 5.4 },
    { product_id: 'p_raw_lead', amount: 3.82 },
    { product_id: 'p_raw_copper', amount: 18.32 },
    { product_id: 'p_bauxite_residue', amount: 0.92 },
  ],
  5800: [
    { product_id: 'p_medium_earth_fragment', amount: 10.86 },
    { product_id: 'p_raw_lead', amount: 15.83 },
  ],
  6000: [
    { product_id: 'p_coal', amount: 54 },
    { product_id: 'p_raw_lead', amount: 12.06 },
    { product_id: 'p_rock', amount: 5.18 },
  ],
  6200: [
    { product_id: 'p_raw_copper', amount: 50.73 },
    { product_id: 'p_deep_earth_fragment', amount: 4.42 },
    { product_id: 'p_bauxite_residue', amount: 0.96 },
    { product_id: 'p_rock', amount: 6.55 },
  ],
  6400: [
    { product_id: 'p_bauxite_residue', amount: 2.3 },
    { product_id: 'p_deep_earth_fragment', amount: 7.71 },
    { product_id: 'p_rock', amount: 7.69 },
  ],
  6600: [
    { product_id: 'p_rock', amount: 8.81 },
    { product_id: 'p_deep_earth_fragment', amount: 9.03 },
    { product_id: 'p_bauxite_residue', amount: 1.9 },
  ],
  6800: [
    { product_id: 'p_raw_copper', amount: 80.75 },
    { product_id: 'p_bauxite_residue', amount: 1.6 },
    { product_id: 'p_deep_earth_fragment', amount: 5.87 },
    { product_id: 'p_rock', amount: 10.35 },
  ],
  7000: [
    { product_id: 'p_raw_lead', amount: 4.3 },
    { product_id: 'p_deep_earth_fragment', amount: 10.9 },
    { product_id: 'p_rock', amount: 11.65 },
    { product_id: 'p_bauxite_residue', amount: 1.33 },
  ],
  7200: [
    { product_id: 'p_raw_lead', amount: 5.54 },
    { product_id: 'p_bauxite_residue', amount: 1.06 },
    { product_id: 'p_deep_earth_fragment', amount: 8.57 },
    { product_id: 'p_rock', amount: 10.79 },
  ],
  7400: [
    { product_id: 'p_raw_copper', amount: 42.95 },
    { product_id: 'p_bauxite_residue', amount: 1.05 },
    { product_id: 'p_deep_earth_fragment', amount: 8.7 },
    { product_id: 'p_rock', amount: 11.38 },
  ],
  7600: [
    { product_id: 'p_deep_earth_fragment', amount: 4.9 },
    { product_id: 'p_bauxite_residue', amount: 0.99 },
    { product_id: 'p_rock', amount: 9.79 },
  ],
  7800: [
    { product_id: 'p_medium_earth_fragment', amount: 7.67 },
    { product_id: 'p_bauxite_residue', amount: 2.23 },
    { product_id: 'p_deep_earth_fragment', amount: 8.43 },
  ],
  8000: [
    { product_id: 'p_bauxite_residue', amount: 2.11 },
    { product_id: 'p_rock', amount: 10.65 },
    { product_id: 'p_deep_earth_fragment', amount: 11.65 },
  ],
  8200: [
    { product_id: 'p_raw_zirconium', amount: 0.61 },
    { product_id: 'p_rock', amount: 10.65 },
    { product_id: 'p_deep_earth_fragment', amount: 3.52 },
  ],
  8400: [
    { product_id: 'p_raw_zirconium', amount: 1.73 },
    { product_id: 'p_raw_uranium', amount: 0.15 },
    { product_id: 'p_deep_earth_fragment', amount: 1.52 },
  ],
  8600: [
    { product_id: 'p_raw_zirconium', amount: 0.53 },
    { product_id: 'p_raw_uranium', amount: 2.15 },
    { product_id: 'p_raw_iron', amount: 10.52 },
  ],
  8800: [
    { product_id: 'p_deep_earth_fragment', amount: 4.24 },
    { product_id: 'p_raw_uranium', amount: 2.15 },
    { product_id: 'p_raw_iron', amount: 13.52 },
  ],
  9000: [
    { product_id: 'p_raw_lead', amount: 8.59 },
    { product_id: 'p_raw_zirconium', amount: 0.72 },
    { product_id: 'p_raw_iron', amount: 3.52 },
  ],
};

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────

const effectiveDepth = DEPTH === 100 ? 300 : DEPTH;
const drillHead = DRILL_HEADS[DRILL_HEAD];
const acid = ACIDS[ACID_TYPE];
const oilMultiplier = HAS_MACHINE_OIL ? 1.1 : 1;

const deteriorationRate =
  0.5 * drillHead.getMulti(effectiveDepth) * acid.getMulti(effectiveDepth) * oilMultiplier;
const lifeTime = Math.ceil(100 / deteriorationRate);
const travelSpeed = HAS_MACHINE_OIL ? 100 : 50;
const travelTime = (2 * DEPTH) / travelSpeed;
const replacementTime = 12;
const cycleTime = lifeTime + travelTime + replacementTime;

const drillingEfficiency = lifeTime / cycleTime;
const activeRatio = (lifeTime + travelTime) / cycleTime;

const inputs: { product_id: string; quantity: number }[] = [
  { product_id: drillHead.product_id, quantity: 1 / cycleTime },
];

if (acid.product_id) {
  inputs.push({
    product_id: acid.product_id,
    quantity: acid.rate * drillingEfficiency,
  });
}

if (HAS_MACHINE_OIL) {
  inputs.push({ product_id: 'p_machine_oil', quantity: 2 * activeRatio });
}

const baseYields = DEPTH_YIELDS[DEPTH] ?? [];
const outputs = baseYields.map((o) => ({
  product_id: o.product_id,
  quantity: o.amount * oilMultiplier * drillingEfficiency,
}));

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

const averagePower = (3.0 * activeRatio + 0.1) * 1000000;

const recipes: Recipe[] = [
  {
    id: 'r_mineshaft_drill_01',
    name: `${DEPTH}m Mineshaft Drill`,
    machine_id: 'm_mineshaft_drill',
    cycle_time: 1,
    power_consumption: averagePower,
    power_type: 'HV',
    pollution: 0,
    inputs: inputs,
    outputs: outputs,
  },
];

export { recipes };
