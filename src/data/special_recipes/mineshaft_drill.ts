import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';

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

const DEPTHS = Object.keys(DEPTH_YIELDS).map(Number).sort((a, b) => a - b);

const settingDefinitions = {
  depth: {
    type: 'select' as const,
    label: 'Depth (m)',
    default: 6000,
    options: DEPTHS.map((d) => ({ label: `${d}m`, value: d })),
  },
  drill_head: {
    type: 'select' as const,
    label: 'Drill Head',
    default: 'steel',
    options: [
      { label: 'Copper', value: 'copper' },
      { label: 'Iron', value: 'iron' },
      { label: 'Steel', value: 'steel' },
      { label: 'Tungsten Carbide', value: 'tungsten' },
    ],
  },
  acid_type: {
    type: 'select' as const,
    label: 'Acid Type',
    default: 'hydrochloric',
    options: [
      { label: 'None', value: 'none' },
      { label: 'Water', value: 'water' },
      { label: 'Acetic Acid', value: 'acetic' },
      { label: 'Sulfuric Acid', value: 'sulfuric' },
      { label: 'Hydrochloric Acid', value: 'hydrochloric' },
    ],
  },
  has_machine_oil: {
    type: 'select' as const,
    label: 'Use Machine Oil?',
    default: 'No',
    options: [
      { label: 'Yes', value: 'Yes' },
      { label: 'No', value: 'No' },
    ],
  },
};

const getComputedValues = (settings: Record<string, unknown>) => {
  const depth = (settings.depth as number) ?? 9000;
  const drillHeadType = (settings.drill_head as string) ?? 'tungsten';
  const acidType = (settings.acid_type as string) ?? 'sulfuric';
  const hasMachineOil = (settings.has_machine_oil as string) === 'Yes';

  const effectiveDepth = depth === 100 ? 300 : depth;
  const drillHead = DRILL_HEADS[drillHeadType];
  const acid = ACIDS[acidType];
  const oilMultiplier = hasMachineOil ? 1.1 : 1;

  const deteriorationRate =
    0.5 * drillHead.getMulti(effectiveDepth) * acid.getMulti(effectiveDepth) * oilMultiplier;
  const lifeTime = Math.ceil(100 / deteriorationRate);
  const travelSpeed = hasMachineOil ? 100 : 50;
  const travelTime = (2 * depth) / travelSpeed;
  const replacementTime = 12;
  const cycleTime = lifeTime + travelTime + replacementTime;

  const drillingEfficiency = lifeTime / cycleTime;
  const activeRatio = (lifeTime + travelTime) / cycleTime;

  const powerConsumption = ((0.1 * replacementTime + 0.5 * travelTime + 2 * lifeTime) / cycleTime) * 1000000;

  return {
    depth,
    drillHead,
    acid,
    oilMultiplier,
    deteriorationRate,
    lifeTime,
    travelTime,
    replacementTime,
    cycleTime,
    drillingEfficiency,
    activeRatio,
    hasMachineOil,
    powerConsumption,
  };
};

const getPotentialOutputs = () => {
  const outputs = new Set<string>();
  for (const depth of DEPTHS) {
    const yields = DEPTH_YIELDS[depth] ?? [];
    for (const yieldItem of yields) {
      outputs.add(yieldItem.product_id);
    }
  }
  return Array.from(outputs);
};

export const m_mineshaft_drill_01: SpecialRecipe = {
  id: 'r_mineshaft_drill_01',
  name: 'Mineshaft Drill',
  machine_id: 'm_mineshaft_drill',
  settings: settingDefinitions,
  potentialOutputs: getPotentialOutputs(),
  potentialInputs: [
    'p_copper_drill_head',
    'p_iron_drill_head',
    'p_steel_drill_head',
    'p_tungsten_carbide_drill_head',
    'p_water',
    'p_acetic_acid',
    'p_sulfuric_acid',
    'p_hydrochloric_acid',
    'p_machine_oil',
  ],
  resolveSettings: (productId: string) => {
    const defaultSettings = Object.entries(settingDefinitions).reduce(
      (acc, [key, def]) => {
        acc[key] = def.default;
        return acc;
      },
      {} as Record<string, unknown>,
    );

    const drillHeadEntry = Object.entries(DRILL_HEADS).find(([, val]) => val.product_id === productId);
    if (drillHeadEntry) {
      defaultSettings.drill_head = drillHeadEntry[0];
      return defaultSettings;
    }

    const acidEntry = Object.entries(ACIDS).find(([, val]) => val.product_id === productId);
    if (acidEntry) {
      defaultSettings.acid_type = acidEntry[0];
      return defaultSettings;
    }

    if (productId === 'p_machine_oil') {
      defaultSettings.has_machine_oil = 'Yes';
      return defaultSettings;
    }

    let bestDepth = 6000;
    let bestYield = 0;
    let foundYield = false;

    for (const depth of DEPTHS) {
      const yields = DEPTH_YIELDS[depth] || [];
      const yieldItem = yields.find((y) => y.product_id === productId);
      if (yieldItem && yieldItem.amount > bestYield) {
        bestYield = yieldItem.amount;
        bestDepth = depth;
        foundYield = true;
      }
    }

    if (foundYield) {
      defaultSettings.depth = bestDepth;
      return defaultSettings;
    }

    return null;
  },
  compute: (settings) => {
    const { drillHead, acid, cycleTime, drillingEfficiency, hasMachineOil, depth, oilMultiplier, powerConsumption } =
      getComputedValues(settings);

    const inputsList: { product_id: string; quantity: number }[] = [
      { product_id: drillHead.product_id, quantity: 1 / cycleTime },
    ];

    if (acid.product_id) {
      inputsList.push({
        product_id: acid.product_id,
        quantity: acid.rate * drillingEfficiency,
      });
    }

    if (hasMachineOil) {
      const oilRate = 2 * (1 - 12 / cycleTime);
      inputsList.push({ product_id: 'p_machine_oil', quantity: oilRate });
    }

    const baseYields = DEPTH_YIELDS[depth] ?? [];
    const outputsList = baseYields.map((o) => ({
      product_id: o.product_id,
      quantity: o.amount * oilMultiplier * drillingEfficiency,
      temperature: 18,
      voidable: true,
    }));

    const recipe: Recipe = {
      id: 'r_mineshaft_drill_01',
      name: `${depth}m Mineshaft Drill`,
      machine_id: 'm_mineshaft_drill',
      cycle_time: 1,
      power_consumption: powerConsumption,
      power_type: 'HV',
      pollution: 0,
      inputs: inputsList,
      outputs: outputsList,
    };

    return recipe;
  },
};
