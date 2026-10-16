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

export type NuclearFuelRodId =
  | 'p_low_enrichment_fuel_rod'
  | 'p_standard_fuel_rod'
  | 'p_mox_fuel_rod';

export interface NuclearFuelRodGroup {
  id: NuclearFuelRodId;
  count: number;
}

const RODS: NuclearFuelRodGroup[] = [{ id: 'p_low_enrichment_fuel_rod', count: 288 }];

const NO_RODS = 316;
const REFUEL_AT_FUEL_REMAINING = 51.0;
const MAINTENANCE_STARTUP_TIME = 60;
const BORIC_ACID_PPM = 50; // Results in 0.5 boric acid /s
const FLOW_RATE: 800 | 1600 | 2400 | 3200 = 3200;
const computationMode: string = COMPUTATION_MODE;

// TODO: Re-enable when modular_turbine presets are exported
// const ACTIVE_POWER_DEMAND = 1.32; // GMF/s
// const TURBINE_FLOW = 24000; // 24000, 12000, or 6000

// ─── DATA TABLES ─────────────────────────────────────────────────────

const FULL_LIFETIME_HOURS: Record<NuclearFuelRodId, number> = {
  p_low_enrichment_fuel_rod: 3.5,
  p_standard_fuel_rod: 35,
  p_mox_fuel_rod: 70,
};

const DEPLETION_DIVISOR: Record<NuclearFuelRodId, number> = {
  p_low_enrichment_fuel_rod: 1,
  p_standard_fuel_rod: 10,
  p_mox_fuel_rod: 30,
};

const BASE_CONST: Record<NuclearFuelRodId, number> = {
  p_low_enrichment_fuel_rod: 825,
  p_standard_fuel_rod: 942,
  p_mox_fuel_rod: 952,
};

const SPENT_MULTIPLIER: Record<NuclearFuelRodId, number> = {
  p_low_enrichment_fuel_rod: 1,
  p_standard_fuel_rod: 2.5,
  p_mox_fuel_rod: 2.5,
};

interface NuclearTurbineLookupRow {
  minimumOutputMmfPerSecond: number;
  tier: string;
  hpsTemperature: number;
}

// Workbook CSV values from Data Sheet rows 60–81, used by the H2, H4, and H5 lookups.
const NUCLEAR_TURBINE_LOOKUP_ROWS: NuclearTurbineLookupRow[] = [
  { minimumOutputMmfPerSecond: 80, tier: '2:1', hpsTemperature: 910 },
  { minimumOutputMmfPerSecond: 82, tier: '2:1', hpsTemperature: 910 },
  { minimumOutputMmfPerSecond: 124, tier: '3:1', hpsTemperature: 600.88852 },
  { minimumOutputMmfPerSecond: 133, tier: '3:1', hpsTemperature: 600.88852 },
  { minimumOutputMmfPerSecond: 166, tier: '4:1', hpsTemperature: 437.30718 },
  { minimumOutputMmfPerSecond: 179, tier: '4:1', hpsTemperature: 437.30718 },
  { minimumOutputMmfPerSecond: 195, tier: '5:1', hpsTemperature: 352.85777 },
  { minimumOutputMmfPerSecond: 216, tier: '5:1', hpsTemperature: 352.85777 },
  { minimumOutputMmfPerSecond: 250, tier: '4:3*', hpsTemperature: 321.63002 },
  { minimumOutputMmfPerSecond: 269, tier: '4:3*', hpsTemperature: 321.63002 },
  { minimumOutputMmfPerSecond: 292, tier: '4:2', hpsTemperature: 322.57049 },
  { minimumOutputMmfPerSecond: 299, tier: '4:2', hpsTemperature: 322.57049 },
  { minimumOutputMmfPerSecond: 300, tier: '4:3', hpsTemperature: 325 },
  { minimumOutputMmfPerSecond: 302, tier: '4:3', hpsTemperature: 325 },
  { minimumOutputMmfPerSecond: 303, tier: '4:4*', hpsTemperature: 297 },
  { minimumOutputMmfPerSecond: 314, tier: '4:4*', hpsTemperature: 297 },
  { minimumOutputMmfPerSecond: 327, tier: '4:4', hpsTemperature: 286.53557 },
  { minimumOutputMmfPerSecond: 370, tier: '4:4', hpsTemperature: 286.53557 },
  { minimumOutputMmfPerSecond: 376, tier: '4:5', hpsTemperature: 347.00058 },
  { minimumOutputMmfPerSecond: 402, tier: '4:5', hpsTemperature: 347.00058 },
  { minimumOutputMmfPerSecond: 404, tier: '4:6', hpsTemperature: 385 },
  { minimumOutputMmfPerSecond: 9999999, tier: '4:6', hpsTemperature: 385 },
];

export interface NuclearPlantSimulatorInputs {
  totalRodPositions: number;
  fuelRods: NuclearFuelRodGroup[];
  refuelAtFuelRemaining: number;
  startupMaintenanceMinutes: number;
  boricAcidRate: number;
  waterFlow: number;
  turbineSize: '24kL/s' | 'other';
  powerDemandGmfPerSecond: number;
  turbineOutputMmfPerSecond: number;
  hpsTemperatureFromLookup: number;
  useRecycledUptime: boolean;
  recycledUptimePercent: number;
  computationMode?: 'BASIC_WIKI' | 'ADVANCED_THERMAL';
}

export interface NuclearPlantRodResult {
  id: NuclearFuelRodId;
  count: number;
  depletionRatePerSecond: number;
  runTimeHours: number;
  remainingAtRefuel: number;
  spentFuelEfficiency: number;
  spentFuelBatch: number;
}

export interface NuclearPlantSimulatorResult {
  totalFuelRods: number;
  turbineCount: number;
  demandPerTurbineMmfPerSecond: number;
  hpsTemperature: number;
  waterTemperature: number;
  rodFactor: number;
  thermalGenerationGmf: number;
  depletionBasePerSecond: number;
  rods: NuclearPlantRodResult[];
  coreRunTimeHours: number;
  maintenanceTimeHours: number;
  cycleTimeSeconds: number;
  baseUptime: number;
  uptime: number;
  spentFuelPerRefuel: number;
  spentMoxPerRefuel: number;
  spentFuelOutputPerSecond: number;
  spentMoxOutputPerSecond: number;
  powerOutputGmfPerSecond: number;
  contaminatedWaterTemperature: number;
  recipeInputs: { product_id: string; quantity: number }[];
  recipeOutputs: { product_id: string; quantity: number; temperature?: number }[];
}

export interface NuclearPlantTurbineLookupResult {
  turbineCount: number;
  demandPerTurbineMmfPerSecond: number;
  turbineTier: string;
  turbineMinimumOutputMmfPerSecond: number;
  turbineOutputMmfPerSecond: number;
  hpsTemperatureLookupValue: number;
}

export function calculateNuclearPlantTurbineLookup(
  inputs: Pick<
    NuclearPlantSimulatorInputs,
    'powerDemandGmfPerSecond' | 'turbineSize' | 'waterFlow'
  >,
): NuclearPlantTurbineLookupResult {
  if (
    !Number.isFinite(inputs.powerDemandGmfPerSecond) ||
    !Number.isFinite(inputs.waterFlow) ||
    inputs.powerDemandGmfPerSecond < 0 ||
    inputs.waterFlow < 0
  ) {
    throw new RangeError('Power demand and water flow must be finite, non-negative numbers.');
  }

  const turbineUnitFlow = inputs.turbineSize === '24kL/s' ? 800 : 200;
  const turbineCount = Math.floor(Math.min(inputs.waterFlow, 3200) / turbineUnitFlow);
  const demandPerTurbineMmfPerSecond = turbineCount
    ? (inputs.powerDemandGmfPerSecond / turbineCount) * 1000
    : 0;
  const selectedTier =
    NUCLEAR_TURBINE_LOOKUP_ROWS.find(
      (row) => demandPerTurbineMmfPerSecond <= row.minimumOutputMmfPerSecond,
    )?.tier ?? NUCLEAR_TURBINE_LOOKUP_ROWS[0].tier;
  const tierRow =
    NUCLEAR_TURBINE_LOOKUP_ROWS.find((row) => row.tier === selectedTier) ??
    NUCLEAR_TURBINE_LOOKUP_ROWS[0];
  const minimumOutputMmfPerSecond = inputs.turbineSize === '24kL/s' ? 80 : 38;
  const maximumOutputMmfPerSecond = inputs.turbineSize === '24kL/s' ? 404 : 101;
  const turbineOutputMmfPerSecond = Math.min(
    maximumOutputMmfPerSecond,
    Math.max(
      minimumOutputMmfPerSecond,
      Math.max(demandPerTurbineMmfPerSecond, tierRow.minimumOutputMmfPerSecond),
    ),
  );

  return {
    turbineCount,
    demandPerTurbineMmfPerSecond,
    turbineTier: selectedTier,
    turbineMinimumOutputMmfPerSecond: tierRow.minimumOutputMmfPerSecond,
    turbineOutputMmfPerSecond,
    hpsTemperatureLookupValue: tierRow.hpsTemperature,
  };
}

export function calculateNuclearPlantSimulator(
  inputs: NuclearPlantSimulatorInputs,
): NuclearPlantSimulatorResult {
  const numericInputs = [
    inputs.totalRodPositions,
    inputs.refuelAtFuelRemaining,
    inputs.startupMaintenanceMinutes,
    inputs.boricAcidRate,
    inputs.waterFlow,
    inputs.powerDemandGmfPerSecond,
    inputs.turbineOutputMmfPerSecond,
    inputs.hpsTemperatureFromLookup,
    inputs.recycledUptimePercent,
    ...inputs.fuelRods.map((group) => group.count),
  ];

  if (!numericInputs.every(Number.isFinite)) {
    throw new RangeError('Use finite numbers for every simulator input.');
  }
  if (
    !Number.isInteger(inputs.totalRodPositions) ||
    inputs.fuelRods.some((group) => !Number.isInteger(group.count))
  ) {
    throw new RangeError('Rod positions and fuel-rod counts must be whole numbers.');
  }
  if (
    inputs.totalRodPositions <= 0 ||
    inputs.refuelAtFuelRemaining < 0 ||
    inputs.refuelAtFuelRemaining > 100 ||
    inputs.startupMaintenanceMinutes < 0 ||
    inputs.boricAcidRate < 0 ||
    inputs.waterFlow < 0 ||
    inputs.powerDemandGmfPerSecond < 0 ||
    inputs.turbineOutputMmfPerSecond < 0 ||
    inputs.fuelRods.some((group) => group.count < 0)
  ) {
    throw new RangeError(
      'Counts, rates, and times must be non-negative; rod positions must be positive.',
    );
  }

  if (
    inputs.useRecycledUptime &&
    (inputs.recycledUptimePercent < 0 || inputs.recycledUptimePercent > 100)
  ) {
    throw new RangeError('Recycled uptime must be between 0% and 100%.');
  }

  let totalFuelRods = 0;
  for (let i = 0; i < inputs.fuelRods.length; i++) {
    totalFuelRods += inputs.fuelRods[i].count;
  }
  if (totalFuelRods <= 0) {
    throw new RangeError('Add at least one fuel rod to calculate a core cycle.');
  }
  if (totalFuelRods > inputs.totalRodPositions) {
    throw new RangeError('Fuel rod count cannot exceed total rod positions.');
  }

  const turbineLookup = calculateNuclearPlantTurbineLookup(inputs);
  const { turbineCount, demandPerTurbineMmfPerSecond } = turbineLookup;
  const hpsTemperature = Math.max(160, Math.round(inputs.hpsTemperatureFromLookup * 100) / 100);
  const waterTemperature = hpsTemperature / 0.8;
  const rodFactor =
    inputs.totalRodPositions > 276
      ? -0.00504953 * inputs.totalRodPositions + 2.59565
      : -0.000444568 * inputs.totalRodPositions + 1.32724;
  const thermalGenerationGmf = (0.0136773 * waterTemperature - 0.223546) * rodFactor;
  const depletionBasePerSecond =
    (0.00000634329 * thermalGenerationGmf - 0.000000317165) * (316 / totalFuelRods);

  if (depletionBasePerSecond <= 0) {
    throw new RangeError(
      'These temperature and rod settings do not produce a positive depletion rate.',
    );
  }

  let runTimeInverseSum = 0;
  const rods: NuclearPlantRodResult[] = [];
  for (let i = 0; i < inputs.fuelRods.length; i++) {
    const group = inputs.fuelRods[i];
    if (group.count <= 0) continue;

    const depletionRatePerSecond = depletionBasePerSecond / DEPLETION_DIVISOR[group.id];
    const runTimeHours =
      inputs.computationMode === 'BASIC_WIKI'
        ? FULL_LIFETIME_HOURS[group.id] * (1 - inputs.refuelAtFuelRemaining / 100)
        : ((0.1 / depletionRatePerSecond / 100) *
            (BASE_CONST[group.id] - inputs.refuelAtFuelRemaining * 10)) /
          3600;

    if (!Number.isFinite(runTimeHours) || runTimeHours <= 0) {
      throw new RangeError('The selected refuel point must produce a positive fuel run time.');
    }

    runTimeInverseSum += group.count / runTimeHours;
    rods.push({
      id: group.id,
      count: group.count,
      depletionRatePerSecond,
      runTimeHours,
      remainingAtRefuel: 0,
      spentFuelEfficiency: 0,
      spentFuelBatch: 0,
    });
  }

  const coreRunTimeHours = totalFuelRods / runTimeInverseSum;
  // 524.75 seconds combines loading, coolant fill, pressurizing, and startup ramp.
  const maintenanceTimeHours =
    (totalFuelRods * 16.6 + inputs.startupMaintenanceMinutes * 60 + 524.75) / 3600;
  const cycleTimeSeconds = (coreRunTimeHours + maintenanceTimeHours) * 3600;
  const refuelConstant = 100 - inputs.refuelAtFuelRemaining;
  let spentFuelBatch = 0;
  let spentMoxBatch = 0;

  for (let i = 0; i < rods.length; i++) {
    const rod = rods[i];
    const remainingAtRefuel = 100 - (refuelConstant * coreRunTimeHours) / rod.runTimeHours;
    const spentFuelEfficiency = Math.min(
      80.9 + 0.774 * remainingAtRefuel - 0.0158 * remainingAtRefuel ** 2,
      80,
    );
    const batch = spentFuelEfficiency * rod.count * SPENT_MULTIPLIER[rod.id];
    rod.remainingAtRefuel = remainingAtRefuel;
    rod.spentFuelEfficiency = spentFuelEfficiency;
    rod.spentFuelBatch = batch;

    if (rod.id === 'p_mox_fuel_rod') spentMoxBatch += batch;
    else spentFuelBatch += batch;
  }

  const rodPenalty = inputs.totalRodPositions >= 276 ? 0.995 : 1;
  const spentFuelPerRefuel = Math.floor(spentFuelBatch * rodPenalty);
  const spentMoxPerRefuel = Math.floor(spentMoxBatch * rodPenalty);
  const spentFuelOutputPerSecond = spentFuelPerRefuel / cycleTimeSeconds;
  const spentMoxOutputPerSecond = spentMoxPerRefuel / cycleTimeSeconds;
  const baseUptime = coreRunTimeHours / (coreRunTimeHours + maintenanceTimeHours);
  const uptime = inputs.useRecycledUptime ? inputs.recycledUptimePercent / 100 : baseUptime;
  const powerOutputGmfPerSecond = (inputs.turbineOutputMmfPerSecond * turbineCount * uptime) / 1000;
  const recipeInputs: { product_id: string; quantity: number }[] = [];

  for (let i = 0; i < rods.length; i++) {
    recipeInputs.push({
      product_id: rods[i].id,
      quantity: rods[i].count / cycleTimeSeconds,
    });
  }
  recipeInputs.push({ product_id: 'p_boric_acid', quantity: inputs.boricAcidRate });
  recipeInputs.push({ product_id: 'p_distilled_water', quantity: inputs.waterFlow });

  const recipeOutputs: { product_id: string; quantity: number; temperature?: number }[] = [];
  if (spentFuelPerRefuel > 0) {
    recipeOutputs.push({ product_id: 'p_spent_fuel', quantity: spentFuelOutputPerSecond });
  }
  if (spentMoxPerRefuel > 0) {
    recipeOutputs.push({ product_id: 'p_spent_mox_fuel', quantity: spentMoxOutputPerSecond });
  }
  const contaminatedWaterTemperature =
    inputs.computationMode === 'BASIC_WIKI' ? 450 : Math.floor(waterTemperature);
  recipeOutputs.push({
    product_id: 'p_contaminated_water',
    quantity: inputs.waterFlow,
    temperature: contaminatedWaterTemperature,
  });

  return {
    totalFuelRods,
    turbineCount,
    demandPerTurbineMmfPerSecond,
    hpsTemperature,
    waterTemperature,
    rodFactor,
    thermalGenerationGmf,
    depletionBasePerSecond,
    rods,
    coreRunTimeHours,
    maintenanceTimeHours,
    cycleTimeSeconds,
    baseUptime,
    uptime,
    spentFuelPerRefuel,
    spentMoxPerRefuel,
    spentFuelOutputPerSecond,
    spentMoxOutputPerSecond,
    powerOutputGmfPerSecond,
    contaminatedWaterTemperature,
    recipeInputs,
    recipeOutputs,
  };
}

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
const simulation = calculateNuclearPlantSimulator({
  totalRodPositions: NO_RODS,
  fuelRods: RODS,
  refuelAtFuelRemaining: REFUEL_AT_FUEL_REMAINING,
  startupMaintenanceMinutes: MAINTENANCE_STARTUP_TIME,
  boricAcidRate: BORIC_ACID_PPM / 100,
  waterFlow: FLOW_RATE,
  turbineSize: '24kL/s',
  powerDemandGmfPerSecond: 0,
  turbineOutputMmfPerSecond: 0,
  hpsTemperatureFromLookup: hpsTemp,
  useRecycledUptime: false,
  recycledUptimePercent: 0,
  computationMode: computationMode === 'BASIC_WIKI' ? 'BASIC_WIKI' : 'ADVANCED_THERMAL',
});
const inputs = simulation.recipeInputs;
const outputs = computationMode === 'MANUAL' ? MANUAL_OUTPUTS : simulation.recipeOutputs;

// ─── 3. EXPORT ───────────────────────────────────────────────────────

export interface Recipe {
  id: string;
  name: string;
  machine_id: string;
  cycle_time: number;
  power_use: number;
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
    power_use: 0,
    power_type: 'HV',
    pollution: 0,
    inputs: computationMode === 'MANUAL' ? MANUAL_INPUTS : inputs,
    outputs,
  },
];

export { recipes };
