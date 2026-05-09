// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────

const SPEED_FACTOR = 200;
const EFFICIENCY_FACTOR = 120;

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const clampedSpeed = Math.min(200, Math.max(50, SPEED_FACTOR));
const clampedEfficiency = Math.min(120, Math.max(80, EFFICIENCY_FACTOR));

const speedDiff = clampedSpeed - 100;
const speedSteps = speedDiff / 5;

let inputOutputMultFromSpeed = 1;
let powerMultFromSpeed = 1;

if (clampedSpeed < 100) {
  inputOutputMultFromSpeed = 1 + speedSteps * 0.05;
  powerMultFromSpeed = 1 + speedSteps * (1 / 15);
} else if (clampedSpeed > 100) {
  inputOutputMultFromSpeed = 1 + speedSteps * 0.05;
  powerMultFromSpeed = 1 + speedSteps * 0.1;
}

const efficiencyDiff = clampedEfficiency - 100;
const efficiencySteps = efficiencyDiff / 5;

let inputMultFromEfficiency = 1;
let powerMultFromEfficiency = 1;

if (clampedEfficiency < 100) {
  inputMultFromEfficiency = 1 + efficiencySteps * -0.0625;
  powerMultFromEfficiency = 1 + efficiencySteps * 0.05;
} else if (clampedEfficiency > 100) {
  inputMultFromEfficiency = 1 + efficiencySteps * -0.0425;
  powerMultFromEfficiency = 1 + efficiencySteps * 0.25;
}

const inputMultiplier = inputOutputMultFromSpeed * inputMultFromEfficiency;
const outputMultiplier = inputOutputMultFromSpeed;
const totalPowerMultiplier = powerMultFromSpeed + powerMultFromEfficiency - 1;

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
    id: 'r_chemical_plant_01',
    name: 'Makes Ammonia',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 100000 * totalPowerMultiplier,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_hydrogen', quantity: 30 * inputMultiplier },
      { product_id: 'p_nitrogen', quantity: 10 * inputMultiplier },
    ],
    outputs: [
      {
        product_id: 'p_ammonia',
        quantity: 20 * outputMultiplier,
        temperature: 18,
      },
    ],
  },
  {
    id: 'r_chemical_plant_02',
    name: 'Makes Hardened Plastic Pellets',
    machine_id: 'm_chemical_plant',
    cycle_time: 5,
    power_consumption: 1000000 * totalPowerMultiplier,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_ammonia', quantity: 25 * inputMultiplier },
      { product_id: 'p_naphtha', quantity: 5 * inputMultiplier },
    ],
    outputs: [
      {
        product_id: 'p_hardened_plastic_pellets',
        quantity: 50 * outputMultiplier,
        temperature: 18,
      },
    ],
  },
  {
    id: 'r_chemical_plant_03',
    name: 'Makes Hydrogen',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 500000 * totalPowerMultiplier,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_steam', quantity: 90 * inputMultiplier },
      { product_id: 'p_refined_gas', quantity: 60 * inputMultiplier },
    ],
    outputs: [
      {
        product_id: 'p_hydrogen',
        quantity: 15 * outputMultiplier,
        temperature: 18,
      },
    ],
  },
  {
    id: 'r_chemical_plant_04',
    name: 'Makes Unenriched UF6 Gas',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 500000 * totalPowerMultiplier,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_yellowcake', quantity: 0.5 * inputMultiplier },
      { product_id: 'p_hydrofluoric_acid', quantity: 0.5 * inputMultiplier },
    ],
    outputs: [
      {
        product_id: 'p_unenriched_uf6_gas',
        quantity: 1.5 * outputMultiplier,
        temperature: 18,
      },
    ],
  },
  {
    id: 'r_chemical_plant_05',
    name: 'Makes Residue, Reprocessed Uranium, Plutonium Oxide Pellets',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 500000 * totalPowerMultiplier,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_mixed_fissile_oxides', quantity: 0.5 * inputMultiplier },
      { product_id: 'p_hydrochloric_acid', quantity: 0.5 * inputMultiplier },
      {
        product_id: 'p_sodium_hydroxide_solution',
        quantity: 0.5 * inputMultiplier,
      },
      { product_id: 'p_argon', quantity: 30 * inputMultiplier },
    ],
    outputs: [
      {
        product_id: 'p_residue',
        quantity: 3 * outputMultiplier,
        temperature: 18,
      },
      {
        product_id: 'p_reprocessed_uranium',
        quantity: 0.1 * outputMultiplier,
        temperature: 18,
      },
      {
        product_id: 'p_plutonium_oxide_pellets',
        quantity: 0.05 * outputMultiplier,
        temperature: 18,
      },
    ],
  },
  {
    id: 'r_chemical_plant_06',
    name: 'Makes Hydrofluoric Acid, Residue',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 100000 * totalPowerMultiplier,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_deep_earth_fragment', quantity: 0.5 * inputMultiplier },
      { product_id: 'p_sulfuric_acid', quantity: 0.5 * inputMultiplier },
    ],
    outputs: [
      {
        product_id: 'p_hydrofluoric_acid',
        quantity: 2 * outputMultiplier,
        temperature: 18,
      },
      {
        product_id: 'p_residue',
        quantity: 2 * outputMultiplier,
        temperature: 18,
      },
    ],
  },
  {
    id: 'r_chemical_plant_07',
    name: 'Makes Slightly Enriched UF6 Gas',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 100000 * totalPowerMultiplier,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_reprocessed_uranium', quantity: 1 * inputMultiplier },
      { product_id: 'p_hydrofluoric_acid', quantity: 0.5 * inputMultiplier },
    ],
    outputs: [
      {
        product_id: 'p_slightly_enriched_uf6_gas',
        quantity: 2 * outputMultiplier,
        temperature: 18,
      },
    ],
  },
  {
    id: 'r_chemical_plant_08',
    name: 'Makes Boric Acid, Residue',
    machine_id: 'm_chemical_plant',
    cycle_time: 10,
    power_consumption: 250000 * totalPowerMultiplier,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_impure_boron', quantity: 1.6 * inputMultiplier },
      { product_id: 'p_hydrochloric_acid', quantity: 0.5 * inputMultiplier },
    ],
    outputs: [
      {
        product_id: 'p_boric_acid',
        quantity: 2 * outputMultiplier,
        temperature: 18,
      },
      {
        product_id: 'p_residue',
        quantity: 2 * outputMultiplier,
        temperature: 18,
      },
    ],
  },
  {
    id: 'r_chemical_plant_09',
    name: 'Makes Boric Acid, Residue',
    machine_id: 'm_chemical_plant',
    cycle_time: 10,
    power_consumption: 250000 * totalPowerMultiplier,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_impure_boron', quantity: 1.6 * inputMultiplier },
      { product_id: 'p_sulfuric_acid', quantity: 0.35 * inputMultiplier },
    ],
    outputs: [
      {
        product_id: 'p_boric_acid',
        quantity: 2 * outputMultiplier,
        temperature: 18,
      },
      {
        product_id: 'p_residue',
        quantity: 2 * outputMultiplier,
        temperature: 18,
      },
    ],
  },
  {
    id: 'r_chemical_plant_10',
    name: 'Makes Phosphorus Oxychloride, Residue',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 1000000 * totalPowerMultiplier,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_shallow_earth_fragment', quantity: 2 * inputMultiplier },
      { product_id: 'p_hydrochloric_acid', quantity: 6 * inputMultiplier },
    ],
    outputs: [
      {
        product_id: 'p_phosphorus_oxychloride',
        quantity: 3 * outputMultiplier,
        temperature: 18,
      },
      {
        product_id: 'p_residue',
        quantity: 2 * outputMultiplier,
        temperature: 18,
      },
    ],
  },
  {
    id: 'r_chemical_plant_11',
    name: 'Makes Tributyl Phosphate, Hydrochloric Acid',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 1100000 * totalPowerMultiplier,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      {
        product_id: 'p_phosphorus_oxychloride',
        quantity: 1.5 * inputMultiplier,
      },
      { product_id: 'p_ethanol', quantity: 1.5 * inputMultiplier },
      { product_id: 'p_steam', quantity: 90 * inputMultiplier },
    ],
    outputs: [
      {
        product_id: 'p_tributyl_phosphate',
        quantity: 1 * outputMultiplier,
        temperature: 18,
      },
      {
        product_id: 'p_hydrochloric_acid',
        quantity: 1 * outputMultiplier,
        temperature: 18,
      },
    ],
  },
  {
    id: 'r_chemical_plant_12',
    name: 'Makes Enriched UO2 Pellets, Residue',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 2000000 * totalPowerMultiplier,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_enriched_uf6_gas', quantity: 0.05 * inputMultiplier },
      { product_id: 'p_steam', quantity: 90 * inputMultiplier },
      { product_id: 'p_tributyl_phosphate', quantity: 1 * inputMultiplier },
    ],
    outputs: [
      {
        product_id: 'p_enriched_uo2_pellets',
        quantity: 0.05 * outputMultiplier,
        temperature: 18,
      },
      {
        product_id: 'p_residue',
        quantity: 5 * outputMultiplier,
        temperature: 18,
      },
    ],
  },
  {
    id: 'r_chemical_plant_13',
    name: 'Makes Enriched UO2 Pellets, Residue',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 2500000 * totalPowerMultiplier,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_enriched_uf6_gas', quantity: 0.02 * inputMultiplier },
      { product_id: 'p_steam', quantity: 90 * inputMultiplier },
      { product_id: 'p_hydrogen', quantity: 4 * inputMultiplier },
    ],
    outputs: [
      {
        product_id: 'p_enriched_uo2_pellets',
        quantity: 0.01 * outputMultiplier,
        temperature: 18,
      },
      {
        product_id: 'p_residue',
        quantity: 5 * outputMultiplier,
        temperature: 18,
      },
    ],
  },
  {
    id: 'r_chemical_plant_14',
    name: 'Makes Sulfuric Acid, Residue',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 1500000 * totalPowerMultiplier,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_sulfur_trioxide', quantity: 14 * inputMultiplier },
      { product_id: 'p_distilled_water', quantity: 11 * inputMultiplier },
      { product_id: 'p_argon', quantity: 70 * inputMultiplier },
    ],
    outputs: [
      {
        product_id: 'p_sulfuric_acid',
        quantity: 11 * outputMultiplier,
        temperature: 18,
      },
      {
        product_id: 'p_residue',
        quantity: 2 * outputMultiplier,
        temperature: 18,
      },
    ],
  },
  {
    id: 'r_chemical_plant_15',
    name: 'Makes Hydrochloric Acid',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 1500000 * totalPowerMultiplier,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_chlorine', quantity: 20 * inputMultiplier },
      { product_id: 'p_hydrogen', quantity: 20 * inputMultiplier },
      { product_id: 'p_distilled_water', quantity: 10 * inputMultiplier },
      { product_id: 'p_argon', quantity: 20 * inputMultiplier },
    ],
    outputs: [
      {
        product_id: 'p_hydrochloric_acid',
        quantity: 10 * outputMultiplier,
        temperature: 18,
      },
    ],
  },
];

export default recipes;
