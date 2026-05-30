// SKIPPED - TODO: Convert to createSpecialRecipe factory pattern
// import { presets } from './modular_turbine';

// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────

// Valid modes: "MANUAL" | "BASIC_WIKI" | "ADVANCED_THERMAL"
const COMPUTATION_MODE: 'MANUAL' | 'BASIC_WIKI' | 'ADVANCED_THERMAL' = 'ADVANCED_THERMAL';

// Used only when COMPUTATION_MODE === "MANUAL"
const MANUAL_INPUTS: { product_id: string; quantity: number }[] = [
  { product_id: 'p_standard_fuel_rod', quantity: 0.003248 },
  { product_id: 'p_low_enrichment_fuel_rod', quantity: 0.003248 },
  { product_id: 'p_boric_acid', quantity: 0.1 },
  { product_id: 'p_distilled_water', quantity: 3200 },
];

const MANUAL_OUTPUTS: {
  product_id: string;
  quantity: number;
  temperature?: number;
}[] = [
  { product_id: 'p_spent_fuel', quantity: 0.4005 },
  { product_id: 'p_contaminated_water', quantity: 3200, temperature: 450 },
];

const RODS: {
  id: 'p_low_enrichment_fuel_rod' | 'p_standard_fuel_rod' | 'p_mox_fuel_rod';
  count: number;
}[] = [{ id: 'p_low_enrichment_fuel_rod', count: 288 }];

const NO_RODS = 316;
const REFUEL_AT_FUEL_REMAINING = 51.0;
const MAINTENANCE_STARTUP_TIME = 60;
const BORIC_ACID_PPM = 50; // Results in 0.5 boric acid /s
const FLOW_RATE: 800 | 1600 | 2400 | 3200 = 3200;

// TODO: Re-enable when modular_turbine presets are exported
// const ACTIVE_POWER_DEMAND = 1.32; // GMF/s
// const TURBINE_FLOW = 24000; // 24000, 12000, or 6000

// ─── DATA TABLES ─────────────────────────────────────────────────────

const FULL_LIFETIME_HOURS: Record<string, number> = {
  p_low_enrichment_fuel_rod: 3.5,
  p_standard_fuel_rod: 35,
  p_mox_fuel_rod: 70,
};

const DEPLETION_DIVISOR: Record<string, number> = {
  p_low_enrichment_fuel_rod: 1,
  p_standard_fuel_rod: 10,
  p_mox_fuel_rod: 30,
};

const BASE_CONST: Record<string, number> = {
  p_low_enrichment_fuel_rod: 825,
  p_standard_fuel_rod: 942,
  p_mox_fuel_rod: 952,
};

const SPENT_MULTIPLIER: Record<string, number> = {
  p_low_enrichment_fuel_rod: 1,
  p_standard_fuel_rod: 2.5,
  p_mox_fuel_rod: 2.5,
};

// ─── 2. COMPUTATIONS ─────────────────────────────────────

let totalFuelRods = 0;
for (let i = 0; i < RODS.length; i++) {
  totalFuelRods += RODS[i].count;
}

const rodPenalty = NO_RODS >= 276 ? 0.995 : 1;

// Interpolate presets linearly without filter/allocating arrays
// TODO: Re-enable when modular_turbine presets are exported
// const numTurbines = Math.floor(Math.min(FLOW_RATE, 3200) / (TURBINE_FLOW === 24000 ? 800 : 200));
// const targetPower = (ACTIVE_POWER_DEMAND / numTurbines) * 1e9;
//
// let selectedPreset = presets[0];
// for (let i = 0; i < presets.length; i++) {
//   const p = presets[i];
//   if (p.flow === TURBINE_FLOW) {
//     selectedPreset = p;
//     if (p.powerMax >= targetPower) break;
//   }
// }
//
// const interpRatio =
//   (targetPower - selectedPreset.powerMin) / (selectedPreset.powerMax - selectedPreset.powerMin);
// const hpsTemp = Math.max(
//   160,
//   selectedPreset.tempMin +
//     Math.min(1, Math.max(0, interpRatio)) * (selectedPreset.tempMax - selectedPreset.tempMin),
// );
// const waterTemp = hpsTemp / 0.8;

// Fallback values while presets are unavailable
const hpsTemp = 160;
const waterTemp = hpsTemp / 0.8;

// Thermal generation → shared depletion base
const rodFactor =
  NO_RODS > 276 ? -0.00504953 * NO_RODS + 2.59565 : -0.000444568 * NO_RODS + 1.32724;
const thermalGen = (0.0136773 * waterTemp - 0.223546) * rodFactor;
const depletionBase = (0.00000634329 * thermalGen - 0.000000317165) * (316 / totalFuelRods);

// Compute mixed core run time using a single loop
let runTimeInverseSum = 0;
const runTimeHoursPerRod: Record<string, number> = {};

for (let i = 0; i < RODS.length; i++) {
  const group = RODS[i];
  const id = group.id;
  let rt: number;

  if (COMPUTATION_MODE === 'ADVANCED_THERMAL') {
    const rodDepletionRate = depletionBase / DEPLETION_DIVISOR[id];
    rt = ((0.1 / rodDepletionRate / 100) * (BASE_CONST[id] - REFUEL_AT_FUEL_REMAINING * 10)) / 3600;
  } else {
    rt = FULL_LIFETIME_HOURS[id] * (1 - REFUEL_AT_FUEL_REMAINING / 100);
  }

  runTimeHoursPerRod[id] = rt;
  if (group.count > 0) runTimeInverseSum += group.count / rt;
}

// coreRunTime is in hours
const coreRunTime = totalFuelRods / runTimeInverseSum;

// 524.75 = 254 (fuel loading) + 127 (coolant fill) + 68.75 (pressurize) + 75 (startup ramp)
const maintenanceTime = (totalFuelRods * 16.6 + MAINTENANCE_STARTUP_TIME * 60 + 524.75) / 3600;
const cycleTimeSeconds = (coreRunTime + maintenanceTime) * 3600;

// Calculate spent fuel directly without re-mapping the entire array
let spentFuelBatch = 0;
let spentMoxBatch = 0;
const refuelConstant = 100 - REFUEL_AT_FUEL_REMAINING;

for (let i = 0; i < RODS.length; i++) {
  const group = RODS[i];
  if (group.count <= 0) continue;

  const id = group.id;
  const remainingAtRefuel = 100 - (refuelConstant * coreRunTime) / runTimeHoursPerRod[id];
  const efficiency = Math.min(
    80.9 + 0.774 * remainingAtRefuel - 0.0158 * remainingAtRefuel ** 2,
    80,
  );
  const contribution = efficiency * group.count * SPENT_MULTIPLIER[id];

  if (id === 'p_mox_fuel_rod') spentMoxBatch += contribution;
  else spentFuelBatch += contribution;
}

const spentFuelPerRefuel = Math.floor(spentFuelBatch * rodPenalty);
const spentMoxPerRefuel = Math.floor(spentMoxBatch * rodPenalty);
const boricAcidUsagePerSec = BORIC_ACID_PPM / 100;
const spentFuelOutputPerSec = spentFuelPerRefuel / cycleTimeSeconds;
const spentMoxOutputPerSec = spentMoxPerRefuel / cycleTimeSeconds;

// Build inputs/outputs cleanly
const inputs: { product_id: string; quantity: number }[] = [];
for (let i = 0; i < RODS.length; i++) {
  if (RODS[i].count > 0) {
    inputs.push({
      product_id: RODS[i].id,
      quantity: RODS[i].count / cycleTimeSeconds,
    });
  }
}
inputs.push({ product_id: 'p_boric_acid', quantity: boricAcidUsagePerSec });
inputs.push({ product_id: 'p_distilled_water', quantity: FLOW_RATE });

const outputs: {
  product_id: string;
  quantity: number;
  temperature?: number;
}[] = [];
if (spentFuelPerRefuel > 0)
  outputs.push({ product_id: 'p_spent_fuel', quantity: spentFuelOutputPerSec });
if (spentMoxPerRefuel > 0)
  outputs.push({
    product_id: 'p_spent_mox_fuel',
    quantity: spentMoxOutputPerSec,
  });
const finalWaterTemp = COMPUTATION_MODE === 'ADVANCED_THERMAL' ? Math.floor(waterTemp) : 450;
outputs.push({
  product_id: 'p_contaminated_water',
  quantity: FLOW_RATE,
  temperature: finalWaterTemp,
});

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
    id: 'r_nuclear_power_plant_01',
    name: 'Nuclear Power Plant',
    machine_id: 'm_nuclear_power_plant',
    cycle_time: 1,
    power_consumption: 0,
    power_type: 'HV',
    pollution: 0,
    inputs: (COMPUTATION_MODE as string) === 'MANUAL' ? MANUAL_INPUTS : inputs,
    outputs: (COMPUTATION_MODE as string) === 'MANUAL' ? MANUAL_OUTPUTS : outputs,
  },
];

export { recipes };
