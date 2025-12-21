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
    { product_id: 'p_sand', quantity: 3 }, { product_id: 'p_gravel', quantity: 3 },
    { product_id: 'p_soil', quantity: 3 }, { product_id: 'p_rich_soil', quantity: 1 }
  ],
  300: [
    { product_id: 'p_sand', quantity: 3 }, { product_id: 'p_gravel', quantity: 3 },
    { product_id: 'p_soil', quantity: 3 }, { product_id: 'p_rich_soil', quantity: 1 }
  ],
  900: [
    { product_id: 'p_coal', quantity: 6 }, { product_id: 'p_gravel', quantity: 9 },
    { product_id: 'p_raw_iron', quantity: 5 }, { product_id: 'p_raw_copper', quantity: 5 }
  ],
  1200: [
    { product_id: 'p_coal', quantity: 20 }, { product_id: 'p_gravel', quantity: 6 },
    { product_id: 'p_raw_iron', quantity: 10 }, { product_id: 'p_shallow_earth_fragment', quantity: 3 }
  ],
  1500: [
    { product_id: 'p_raw_lead', quantity: 1 }, { product_id: 'p_gravel', quantity: 8 },
    { product_id: 'p_raw_iron', quantity: 8 }, { product_id: 'p_shallow_earth_fragment', quantity: 5 }
  ],
  1800: [
    { product_id: 'p_raw_lead', quantity: 5 }, { product_id: 'p_rock', quantity: 8 },
    { product_id: 'p_medium_earth_fragment', quantity: 2 }, { product_id: 'p_shallow_earth_fragment', quantity: 1 }
  ],
  2000: [
    { product_id: 'p_raw_lead', quantity: 9.3 }, { product_id: 'p_medium_earth_fragment', quantity: 3.4 },
    { product_id: 'p_rock', quantity: 9.4 }
  ],
  2200: [
    { product_id: 'p_raw_iron', quantity: 9.6 }, { product_id: 'p_shallow_earth_fragment', quantity: 2.3 },
    { product_id: 'p_raw_lead', quantity: 5.1 }, { product_id: 'p_medium_earth_fragment', quantity: 3.1 }
  ],
  2400: [
    { product_id: 'p_medium_earth_fragment', quantity: 4.5 }, { product_id: 'p_rock', quantity: 9.8 }
  ],
  2600: [
    { product_id: 'p_medium_earth_fragment', quantity: 8.4 }, { product_id: 'p_rock', quantity: 10.2 }
  ],
  2800: [
    { product_id: 'p_gravel', quantity: 1.8 }, { product_id: 'p_raw_iron', quantity: 10.4 },
    { product_id: 'p_shallow_earth_fragment', quantity: 2.5 }, { product_id: 'p_raw_lead', quantity: 2.9 }
  ],
  3000: [
    { product_id: 'p_shallow_earth_fragment', quantity: 1.5 }, { product_id: 'p_raw_lead', quantity: 1.9 },
    { product_id: 'p_rock', quantity: 6 }
  ],
  3200: [
    { product_id: 'p_rock', quantity: 5.1 }, { product_id: 'p_medium_earth_fragment', quantity: 4.6 },
    { product_id: 'p_raw_lead', quantity: 3.1 }, { product_id: 'p_raw_iron', quantity: 6.5 }
  ],
  3400: [
    { product_id: 'p_raw_iron', quantity: 8.3 }, { product_id: 'p_raw_lead', quantity: 8.6 },
    { product_id: 'p_rock', quantity: 7.8 }
  ],
  3600: [
    { product_id: 'p_medium_earth_fragment', quantity: 6.3 }, { product_id: 'p_raw_lead', quantity: 6.4 },
    { product_id: 'p_rock', quantity: 6.2 }
  ],
  3800: [
    { product_id: 'p_medium_earth_fragment', quantity: 6.4 }, { product_id: 'p_rock', quantity: 9.6 },
    { product_id: 'p_raw_lead', quantity: 3.5 }, { product_id: 'p_coal', quantity: 30.4 }
  ],
  4000: [
    { product_id: 'p_table_salt', quantity: 58.5 }, { product_id: 'p_medium_earth_fragment', quantity: 3.7 },
    { product_id: 'p_rock', quantity: 5.9 }, { product_id: 'p_raw_lead', quantity: 9.6 }
  ],
  4200: [
    { product_id: 'p_medium_earth_fragment', quantity: 6.3 }, { product_id: 'p_rock', quantity: 5 },
    { product_id: 'p_raw_lead', quantity: 4.8 }, { product_id: 'p_coal', quantity: 39.3 }
  ],
  4400: [
    { product_id: 'p_rock', quantity: 14.8 }, { product_id: 'p_coal', quantity: 40.2 }
  ],
  4600: [
    { product_id: 'p_raw_zinc', quantity: 7.6 }, { product_id: 'p_bauxite_residue', quantity: 1.6 },
    { product_id: 'p_rock', quantity: 7.8 }
  ],
  4800: [
    { product_id: 'p_medium_earth_fragment', quantity: 7.8 }, { product_id: 'p_raw_zinc', quantity: 9.8 },
    { product_id: 'p_bauxite_residue', quantity: 1.2 }, { product_id: 'p_rock', quantity: 2.6 }
  ],
  5000: [
    { product_id: 'p_medium_earth_fragment', quantity: 10.9 }, { product_id: 'p_raw_zinc', quantity: 4.8 },
    { product_id: 'p_bauxite_residue', quantity: 1.2 }, { product_id: 'p_rock', quantity: 5.2 }
  ],
  5200: [
    { product_id: 'p_raw_iron', quantity: 21.6 }, { product_id: 'p_rock', quantity: 7.6 },
    { product_id: 'p_deep_earth_fragment', quantity: 1.4 }, { product_id: 'p_raw_lead', quantity: 4.8 }
  ],
  5400: [
    { product_id: 'p_medium_earth_fragment', quantity: 9.5 }, { product_id: 'p_bauxite_residue', quantity: 1 },
    { product_id: 'p_rock', quantity: 8.5 }
  ],
  5600: [
    { product_id: 'p_rock', quantity: 5.4 }, { product_id: 'p_raw_lead', quantity: 3.8 },
    { product_id: 'p_raw_copper', quantity: 18.3 }, { product_id: 'p_bauxite_residue', quantity: 0.9 }
  ],
  5800: [
    { product_id: 'p_medium_earth_fragment', quantity: 10.9 }, { product_id: 'p_raw_lead', quantity: 15.8 }
  ],
  6000: [
    { product_id: 'p_coal', quantity: 54 }, { product_id: 'p_raw_lead', quantity: 12.1 },
    { product_id: 'p_rock', quantity: 5.2 }
  ],
  6200: [
    { product_id: 'p_raw_copper', quantity: 50.7 }, { product_id: 'p_deep_earth_fragment', quantity: 4.4 },
    { product_id: 'p_bauxite_residue', quantity: 1 }, { product_id: 'p_rock', quantity: 6.6 }
  ],
  6400: [
    { product_id: 'p_bauxite_residue', quantity: 2.3 }, { product_id: 'p_deep_earth_fragment', quantity: 7.7 },
    { product_id: 'p_rock', quantity: 7.7 }
  ],
  6600: [
    { product_id: 'p_rock', quantity: 8.8 }, { product_id: 'p_deep_earth_fragment', quantity: 9 },
    { product_id: 'p_bauxite_residue', quantity: 1.9 }
  ],
  6800: [
    { product_id: 'p_raw_copper', quantity: 80.8 }, { product_id: 'p_bauxite_residue', quantity: 1.6 },
    { product_id: 'p_deep_earth_fragment', quantity: 5.9 }, { product_id: 'p_rock', quantity: 10.4 }
  ],
  7000: [
    { product_id: 'p_raw_lead', quantity: 4.3 }, { product_id: 'p_deep_earth_fragment', quantity: 10.9 },
    { product_id: 'p_rock', quantity: 11.7 }, { product_id: 'p_bauxite_residue', quantity: 1.3 }
  ],
  7200: [
    { product_id: 'p_raw_lead', quantity: 5.5 }, { product_id: 'p_bauxite_residue', quantity: 1.1 },
    { product_id: 'p_deep_earth_fragment', quantity: 8.6 }, { product_id: 'p_rock', quantity: 10.8 }
  ],
  7400: [
    { product_id: 'p_raw_copper', quantity: 43 }, { product_id: 'p_bauxite_residue', quantity: 1.1 },
    { product_id: 'p_deep_earth_fragment', quantity: 8.7 }, { product_id: 'p_rock', quantity: 11.4 }
  ],
  7600: [
    { product_id: 'p_deep_earth_fragment', quantity: 4.9 }, { product_id: 'p_bauxite_residue', quantity: 1 },
    { product_id: 'p_rock', quantity: 9.8 }
  ],
  7800: [
    { product_id: 'p_medium_earth_fragment', quantity: 7.6 }, { product_id: 'p_bauxite_residue', quantity: 2.2 },
    { product_id: 'p_deep_earth_fragment', quantity: 8.4 }
  ],
  8000: [
    { product_id: 'p_bauxite_residue', quantity: 2.1 }, { product_id: 'p_rock', quantity: 10.7 },
    { product_id: 'p_deep_earth_fragment', quantity: 11.7 }
  ],
  8200: [
    { product_id: 'p_raw_zirconium', quantity: 0.6 }, { product_id: 'p_rock', quantity: 10.7 },
    { product_id: 'p_deep_earth_fragment', quantity: 3.5 }
  ],
  8400: [
    { product_id: 'p_raw_zirconium', quantity: 1.7 }, { product_id: 'p_raw_uranium', quantity: 0.2 },
    { product_id: 'p_deep_earth_fragment', quantity: 1.5 }
  ],
  8600: [
    { product_id: 'p_raw_zirconium', quantity: 0.5 }, { product_id: 'p_raw_uranium', quantity: 2.2 },
    { product_id: 'p_raw_iron', quantity: 10.5 }
  ],
  8800: [
    { product_id: 'p_deep_earth_fragment', quantity: 4.2 }, { product_id: 'p_raw_uranium', quantity: 2.2 },
    { product_id: 'p_raw_iron', quantity: 13.5 }
  ],
  9000: [
    { product_id: 'p_raw_lead', quantity: 8.6 }, { product_id: 'p_raw_zirconium', quantity: 0.7 },
    { product_id: 'p_raw_iron', quantity: 3.5 }
  ]
};

export const getAvailableDepths = () => Object.keys(DEPTH_OUTPUTS).map(d => parseInt(d)).sort((a, b) => a - b);

const getDrillHeadMultiplier = (drillHeadId, depth) => {
  const d = depth === 100 ? 300 : depth;
  switch (drillHeadId) {
    case 'copper': return d / 150;
    case 'iron': return 0.04 * Math.pow(d, 0.25);
    case 'steel': return 0.02 * Math.pow(d, 0.25);
    case 'tungsten_carbide': return 0.005 * Math.pow(d, 0.25);
    default: return 1;
  }
};

const getAcidMultiplier = (consumableId, depth) => {
  const d = depth === 100 ? 300 : depth;
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

export const calculateDrillMetrics = (drillHeadId, consumableId, machineOilEnabled, depth) => {
  if (!drillHeadId || !depth) return null;

  const drillHeadMulti = getDrillHeadMultiplier(drillHeadId, depth);
  const acidMulti = getAcidMultiplier(consumableId || 'none', depth);
  const oilMultiplier = machineOilEnabled ? 1.1 : 1;
  const deteriorationRate = 0.5 * drillHeadMulti * acidMulti * oilMultiplier;
  const lifeTime = Math.ceil(100 / deteriorationRate);
  const replacementTime = REPLACEMENT_TIME;
  const travelSpeed = machineOilEnabled ? 100 : 50;
  const travelTime = (2 * depth) / travelSpeed;
  const totalCycleTime = lifeTime + replacementTime + travelTime;
  const dutyCycle = lifeTime / totalCycleTime;
  
  return {
    deteriorationRate, lifeTime, replacementTime, travelTime, totalCycleTime, dutyCycle,
    drillingPower: POWER_DRILLING, idlePower: POWER_TRAVELING, pollution: POLLUTION_RATE
  };
};

export const buildDrillInputs = (drillHeadId, consumableId, machineOilEnabled, depth) => {
  const inputs = [];
  const metrics = calculateDrillMetrics(drillHeadId, consumableId, machineOilEnabled, depth);
  
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

export const buildDrillOutputs = (drillHeadId, consumableId, machineOilEnabled, depth) => {
  if (!depth) return [];
  const baseOutputs = DEPTH_OUTPUTS[depth];
  if (!baseOutputs) return [];
  
  const metrics = calculateDrillMetrics(drillHeadId, consumableId, machineOilEnabled, depth);
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
  pollution: 'Variable',
  inputs: [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
  outputs: [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
  isMineshaftDrill: true
};