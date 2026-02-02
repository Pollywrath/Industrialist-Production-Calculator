export const DRILL_HEADS = [
  { id: 'copper', name: 'Copper Drill Head', product_id: 'p_copper_drill_head' },
  { id: 'iron', name: 'Iron Drill Head', product_id: 'p_iron_drill_head' },
  { id: 'steel', name: 'Steel Drill Head', product_id: 'p_steel_drill_head' },
  { id: 'tungsten_carbide', name: 'Tungsten-Carbide Drill Head', product_id: 'p_tungsten_carbide_drill_head' }
];

export const CONSUMABLES = [
  { id: 'none', name: 'None', product_id: null },
  { id: 'water', name: 'Water', product_id: 'p_water' },
  { id: 'acetic_acid', name: 'Acetic Acid', product_id: 'p_acetic_acid' },
  { id: 'hydrochloric_acid', name: 'Hydrochloric Acid', product_id: 'p_hydrochloric_acid' },
  { id: 'sulfuric_acid', name: 'Sulfuric Acid', product_id: 'p_sulfuric_acid' }
];

const CONSUMABLE_RATES = { water: 10, acetic_acid: 3, hydrochloric_acid: 1.5, sulfuric_acid: 1 };
const REPLACEMENT_TIME = 12;
const POWER_DRILLING = 3.1;
const POWER_TRAVELING = 0.1;
const POLLUTION_RATE = 0.02;
const MACHINE_OIL_RATE = 2;

export const DEPTH_OUTPUTS = {
  100: [
    { product_id: 'p_sand', quantity: 3 },
    { product_id: 'p_gravel', quantity: 3 },
    { product_id: 'p_soil', quantity: 3 },
    { product_id: 'p_rich_soil', quantity: 1 }
  ],
  300: [
    { product_id: 'p_sand', quantity: 3 },
    { product_id: 'p_gravel', quantity: 3 },
    { product_id: 'p_soil', quantity: 3 },
    { product_id: 'p_rich_soil', quantity: 1 }
  ],
  900: [
    { product_id: 'p_coal', quantity: 6 },
    { product_id: 'p_gravel', quantity: 9 },
    { product_id: 'p_raw_iron', quantity: 5 },
    { product_id: 'p_raw_copper', quantity: 5 }
  ],
  1200: [
    { product_id: 'p_coal', quantity: 20 },
    { product_id: 'p_gravel', quantity: 6 },
    { product_id: 'p_raw_iron', quantity: 10 },
    { product_id: 'p_shallow_earth_fragment', quantity: 3 }
  ],
  1500: [
    { product_id: 'p_raw_lead', quantity: 1 },
    { product_id: 'p_gravel', quantity: 8 },
    { product_id: 'p_raw_iron', quantity: 8 },
    { product_id: 'p_shallow_earth_fragment', quantity: 5 }
  ],
  1800: [
    { product_id: 'p_raw_lead', quantity: 5 },
    { product_id: 'p_rock', quantity: 8 },
    { product_id: 'p_medium_earth_fragment', quantity: 2 },
    { product_id: 'p_shallow_earth_fragment', quantity: 1 }
  ],
  2000: [
    { product_id: 'p_raw_lead', quantity: 9.27 },
    { product_id: 'p_medium_earth_fragment', quantity: 3.35 },
    { product_id: 'p_rock', quantity: 9.36 }
  ],
  2200: [
    { product_id: 'p_raw_iron', quantity: 9.57 },
    { product_id: 'p_shallow_earth_fragment', quantity: 2.31 },
    { product_id: 'p_raw_lead', quantity: 5.14 },
    { product_id: 'p_medium_earth_fragment', quantity: 3.13 }
  ],
  2400: [
    { product_id: 'p_medium_earth_fragment', quantity: 4.46 },
    { product_id: 'p_rock', quantity: 9.79 }
  ],
  2600: [
    { product_id: 'p_medium_earth_fragment', quantity: 8.44 },
    { product_id: 'p_rock', quantity: 10.22 }
  ],
  2800: [
    { product_id: 'p_gravel', quantity: 1.78 },
    { product_id: 'p_raw_iron', quantity: 10.35 },
    { product_id: 'p_shallow_earth_fragment', quantity: 2.51 },
    { product_id: 'p_raw_lead', quantity: 2.9 }
  ],
  3000: [
    { product_id: 'p_shallow_earth_fragment', quantity: 1.54 },
    { product_id: 'p_raw_lead', quantity: 1.92 },
    { product_id: 'p_rock', quantity: 6.04 }
  ],
  3200: [
    { product_id: 'p_rock', quantity: 5.14 },
    { product_id: 'p_medium_earth_fragment', quantity: 4.62 },
    { product_id: 'p_raw_lead', quantity: 3.1 },
    { product_id: 'p_raw_iron', quantity: 6.51 }
  ],
  3400: [
    { product_id: 'p_raw_iron', quantity: 8.26 },
    { product_id: 'p_raw_lead', quantity: 8.58 },
    { product_id: 'p_rock', quantity: 7.76 }
  ],
  3600: [
    { product_id: 'p_medium_earth_fragment', quantity: 6.34 },
    { product_id: 'p_raw_lead', quantity: 6.41 },
    { product_id: 'p_rock', quantity: 6.15 }
  ],
  3800: [
    { product_id: 'p_medium_earth_fragment', quantity: 6.39 },
    { product_id: 'p_rock', quantity: 9.58 },
    { product_id: 'p_raw_lead', quantity: 3.45 },
    { product_id: 'p_coal', quantity: 30.39 }
  ],
  4000: [
    { product_id: 'p_table_salt', quantity: 58.54 },
    { product_id: 'p_medium_earth_fragment', quantity: 3.67 },
    { product_id: 'p_rock', quantity: 5.93 },
    { product_id: 'p_raw_lead', quantity: 9.58 }
  ],
  4200: [
    { product_id: 'p_medium_earth_fragment', quantity: 6.31 },
    { product_id: 'p_rock', quantity: 5.01 },
    { product_id: 'p_raw_lead', quantity: 4.81 },
    { product_id: 'p_coal', quantity: 39.32 }
  ],
  4400: [
    { product_id: 'p_rock', quantity: 14.79 },
    { product_id: 'p_coal', quantity: 40.21 }
  ],
  4600: [
    { product_id: 'p_raw_zinc', quantity: 7.61 },
    { product_id: 'p_bauxite_residue', quantity: 1.59 },
    { product_id: 'p_rock', quantity: 7.83 }
  ],
  4800: [
    { product_id: 'p_medium_earth_fragment', quantity: 7.77 },
    { product_id: 'p_raw_zinc', quantity: 9.79 },
    { product_id: 'p_bauxite_residue', quantity: 1.2 },
    { product_id: 'p_rock', quantity: 2.63 }
  ],
  5000: [
    { product_id: 'p_medium_earth_fragment', quantity: 10.88 },
    { product_id: 'p_raw_zinc', quantity: 4.8 },
    { product_id: 'p_bauxite_residue', quantity: 1.22 },
    { product_id: 'p_rock', quantity: 5.18 }
  ],
  5200: [
    { product_id: 'p_raw_iron', quantity: 21.61 },
    { product_id: 'p_rock', quantity: 7.61 },
    { product_id: 'p_deep_earth_fragment', quantity: 1.4 },
    { product_id: 'p_raw_lead', quantity: 4.79 }
  ],
  5400: [
    { product_id: 'p_medium_earth_fragment', quantity: 9.5 },
    { product_id: 'p_bauxite_residue', quantity: 1 },
    { product_id: 'p_rock', quantity: 8.5 }
  ],
  5600: [
    { product_id: 'p_rock', quantity: 5.4 },
    { product_id: 'p_raw_lead', quantity: 3.82 },
    { product_id: 'p_raw_copper', quantity: 18.32 },
    { product_id: 'p_bauxite_residue', quantity: 0.92 }
  ],
  5800: [
    { product_id: 'p_medium_earth_fragment', quantity: 10.86 },
    { product_id: 'p_raw_lead', quantity: 15.83 }
  ],
  6000: [
    { product_id: 'p_coal', quantity: 54 },
    { product_id: 'p_raw_lead', quantity: 12.06 },
    { product_id: 'p_rock', quantity: 5.18 }
  ],
  6200: [
    { product_id: 'p_raw_copper', quantity: 50.73 },
    { product_id: 'p_deep_earth_fragment', quantity: 4.42 },
    { product_id: 'p_bauxite_residue', quantity: 0.96 },
    { product_id: 'p_rock', quantity: 6.55 }
  ],
  6400: [
    { product_id: 'p_bauxite_residue', quantity: 2.3 },
    { product_id: 'p_deep_earth_fragment', quantity: 7.71 },
    { product_id: 'p_rock', quantity: 7.69 }
  ],
  6600: [
    { product_id: 'p_rock', quantity: 8.81 },
    { product_id: 'p_deep_earth_fragment', quantity: 9.03 },
    { product_id: 'p_bauxite_residue', quantity: 1.9 }
  ],
  6800: [
    { product_id: 'p_raw_copper', quantity: 80.75 },
    { product_id: 'p_bauxite_residue', quantity: 1.6 },
    { product_id: 'p_deep_earth_fragment', quantity: 5.87 },
    { product_id: 'p_rock', quantity: 10.35 }
  ],
  7000: [
    { product_id: 'p_raw_lead', quantity: 4.3 },
    { product_id: 'p_deep_earth_fragment', quantity: 10.9 },
    { product_id: 'p_rock', quantity: 11.65 },
    { product_id: 'p_bauxite_residue', quantity: 1.33 }
  ],
  7200: [
    { product_id: 'p_raw_lead', quantity: 5.54 },
    { product_id: 'p_bauxite_residue', quantity: 1.06 },
    { product_id: 'p_deep_earth_fragment', quantity: 8.57 },
    { product_id: 'p_rock', quantity: 10.79 }
  ],
  7400: [
    { product_id: 'p_raw_copper', quantity: 42.95 },
    { product_id: 'p_bauxite_residue', quantity: 1.05 },
    { product_id: 'p_deep_earth_fragment', quantity: 8.7 },
    { product_id: 'p_rock', quantity: 11.38 }
  ],
  7600: [
    { product_id: 'p_deep_earth_fragment', quantity: 4.9 },
    { product_id: 'p_bauxite_residue', quantity: 0.99 },
    { product_id: 'p_rock', quantity: 9.79 }
  ],
  7800: [
    { product_id: 'p_medium_earth_fragment', quantity: 7.67 },
    { product_id: 'p_bauxite_residue', quantity: 2.23 },
    { product_id: 'p_deep_earth_fragment', quantity: 8.43 }
  ],
  8000: [
    { product_id: 'p_bauxite_residue', quantity: 2.11 },
    { product_id: 'p_rock', quantity: 10.65 },
    { product_id: 'p_deep_earth_fragment', quantity: 11.65 }
  ],
  8200: [
    { product_id: 'p_raw_zirconium', quantity: 0.61 },
    { product_id: 'p_rock', quantity: 10.65 },
    { product_id: 'p_deep_earth_fragment', quantity: 3.52 }
  ],
  8400: [
    { product_id: 'p_raw_zirconium', quantity: 1.73 },
    { product_id: 'p_raw_uranium', quantity: 0.15 },
    { product_id: 'p_deep_earth_fragment', quantity: 1.52 }
  ],
  8600: [
    { product_id: 'p_raw_zirconium', quantity: 0.53 },
    { product_id: 'p_raw_uranium', quantity: 2.15 },
    { product_id: 'p_raw_iron', quantity: 10.52 }
  ],
  8800: [
    { product_id: 'p_deep_earth_fragment', quantity: 4.24 },
    { product_id: 'p_raw_uranium', quantity: 2.15 },
    { product_id: 'p_raw_iron', quantity: 13.52 }
  ],
  9000: [
    { product_id: 'p_raw_lead', quantity: 8.59 },
    { product_id: 'p_raw_zirconium', quantity: 0.72 },
    { product_id: 'p_raw_iron', quantity: 3.52 }
  ]
};

export const getAvailableDepths = () => Object.keys(DEPTH_OUTPUTS).map(d => parseInt(d)).sort((a, b) => a - b);

const getDrillHeadMultiplier = (drillHeadId, d) => {
  switch (drillHeadId) {
    case 'copper': return d / 150;
    case 'iron': return 0.04 * Math.pow(d, 0.25);
    case 'steel': return 0.02 * Math.pow(d, 0.25);
    case 'tungsten_carbide': return 0.005 * Math.pow(d, 0.25);
    default: return 1;
  }
};

const getAcidMultiplier = (consumableId, d) => {
  switch (consumableId) {
    case 'none': return Math.pow(d, 2) / 900000;
    case 'water': return Math.pow(d, 2) / 1875000;
    case 'acetic_acid': return Math.pow(d, 0.8) / 450;
    case 'sulfuric_acid': return 0.09 * Math.pow(d, 0.25);
    case 'hydrochloric_acid':
      return d < 6000 
        ? 0.000013 * Math.pow(d, 1.5 - 0.00005 * d) + 4.3875 * Math.pow(10, -13.3) * Math.pow(d, 3)
        : 0.09 * Math.pow(d, 0.25);
    default: return 1;
  }
};

export const calculateDrillMetrics = (drillHeadId, consumableId, machineOilEnabled, d) => {
  if (!drillHeadId || !d) return null;

  const drillHeadMulti = getDrillHeadMultiplier(drillHeadId, d);
  const acidMulti = getAcidMultiplier(consumableId || 'none', d);
  const oilMultiplier = machineOilEnabled ? 1.1 : 1;
  const deteriorationRate = 0.5 * drillHeadMulti * acidMulti * oilMultiplier;
  const lifeTime = Math.ceil(100 / deteriorationRate);
  const replacementTime = REPLACEMENT_TIME;
  const travelSpeed = machineOilEnabled ? 100 : 50;
  const travelTime = (2 * d) / travelSpeed;
  const totalCycleTime = lifeTime + replacementTime + travelTime;
  const dutyCycle = lifeTime / totalCycleTime;
  
  return {
    deteriorationRate, lifeTime, replacementTime, travelTime, totalCycleTime, dutyCycle,
    drillingPower: POWER_DRILLING, idlePower: POWER_TRAVELING, pollution: POLLUTION_RATE
  };
};

export const buildDrillInputs = (drillHeadId, consumableId, machineOilEnabled, d) => {
  const inputs = [];
  const metrics = calculateDrillMetrics(drillHeadId, consumableId, machineOilEnabled, d);
  
  if (!metrics) {
    if (drillHeadId) {
      const drillHead = DRILL_HEADS.find(d => d.id === drillHeadId);
      if (drillHead) inputs.push({ product_id: drillHead.product_id, quantity: 'Variable' });
    }
    if (consumableId && consumableId !== 'none') {
      const consumable = CONSUMABLES.find(c => c.id === consumableId);
      if (consumable?.product_id) inputs.push({ product_id: consumable.product_id, quantity: 'Variable' });
    }
    if (machineOilEnabled) inputs.push({ product_id: 'p_machine_oil', quantity: 'Variable' });
    return inputs;
  }
  
  if (drillHeadId) {
    const drillHead = DRILL_HEADS.find(d => d.id === drillHeadId);
    if (drillHead) {
      const drillHeadRate = 1 / metrics.totalCycleTime;
      inputs.push({ product_id: drillHead.product_id, quantity: parseFloat(drillHeadRate.toFixed(6)) });
    }
  }
  
  if (consumableId && consumableId !== 'none') {
    const consumable = CONSUMABLES.find(c => c.id === consumableId);
    if (consumable?.product_id) {
      const baseRate = CONSUMABLE_RATES[consumableId] || 0;
      const effectiveRate = baseRate * metrics.dutyCycle;
      inputs.push({ product_id: consumable.product_id, quantity: parseFloat(effectiveRate.toFixed(6)) });
    }
  }
  
  if (machineOilEnabled) {
    inputs.push({ product_id: 'p_machine_oil', quantity: MACHINE_OIL_RATE });
  }
  
  return inputs;
};

export const buildDrillOutputs = (drillHeadId, consumableId, machineOilEnabled, d) => {
  if (!d) return [];
  const baseOutputs = DEPTH_OUTPUTS[d];
  if (!baseOutputs) return [];
  
  const metrics = calculateDrillMetrics(drillHeadId, consumableId, machineOilEnabled, d);
  if (!metrics) return baseOutputs.map(output => ({ ...output, quantity: 'Variable' }));
  
  const oilBonus = machineOilEnabled ? 1.1 : 1;
  return baseOutputs.map(output => {
    const effectiveRate = output.quantity * oilBonus * metrics.dutyCycle;
    return { product_id: output.product_id, quantity: parseFloat(effectiveRate.toFixed(4)) };
  });
};

export const DEFAULT_DRILL_RECIPE = {
  id: 'r_mineshaft_drill',
  name: 'Mineshaft Drill',
  machine_id: 'm_mineshaft_drill',
  cycle_time: 1,
  power_consumption: 'Variable',
  power_type: 'HV',
  pollution: 'Variable',
  inputs: [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
  outputs: [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
  isMineshaftDrill: true
};