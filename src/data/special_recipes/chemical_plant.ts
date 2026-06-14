import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { clamp } from '../../utils/precision';

export function computeChemicalPlantMultipliers(speedFactor: number, efficiencyFactor: number) {
  const clampedSpeed = clamp(speedFactor, 50, 200);
  const clampedEfficiency = clamp(efficiencyFactor, 80, 120);

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

  return { inputMultiplier, outputMultiplier, totalPowerMultiplier };
}

const baseRecipes: Recipe[] = [
  {
    id: 'r_chemical_plant_01',
    name: 'Makes Ammonia',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 100000,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_hydrogen', quantity: 30 },
      { product_id: 'p_nitrogen', quantity: 10 },
    ],
    outputs: [
      { product_id: 'p_ammonia', quantity: 20, temperature: 18 },
    ],
  },
  {
    id: 'r_chemical_plant_02',
    name: 'Makes Hardened Plastic Pellets',
    machine_id: 'm_chemical_plant',
    cycle_time: 5,
    power_consumption: 1000000,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_ammonia', quantity: 25 },
      { product_id: 'p_naphtha', quantity: 5 },
    ],
    outputs: [
      { product_id: 'p_hardened_plastic_pellets', quantity: 50, temperature: 18 },
    ],
  },
  {
    id: 'r_chemical_plant_03',
    name: 'Makes Hydrogen',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 500000,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_steam', quantity: 90 },
      { product_id: 'p_refined_gas', quantity: 60 },
    ],
    outputs: [
      { product_id: 'p_hydrogen', quantity: 15, temperature: 18 },
    ],
  },
  {
    id: 'r_chemical_plant_04',
    name: 'Makes Unenriched UF6 Gas',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 500000,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_yellowcake', quantity: 0.5 },
      { product_id: 'p_hydrofluoric_acid', quantity: 0.5 },
    ],
    outputs: [
      { product_id: 'p_unenriched_uf6_gas', quantity: 1.5, temperature: 18 },
    ],
  },
  {
    id: 'r_chemical_plant_05',
    name: 'Makes Residue, Reprocessed Uranium, Plutonium Oxide Pellets',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 500000,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_mixed_fissile_oxides', quantity: 0.5 },
      { product_id: 'p_hydrochloric_acid', quantity: 0.5 },
      { product_id: 'p_sodium_hydroxide_solution', quantity: 0.5 },
      { product_id: 'p_argon', quantity: 30 },
    ],
    outputs: [
      { product_id: 'p_residue', quantity: 3, temperature: 18 },
      { product_id: 'p_reprocessed_uranium', quantity: 0.1, temperature: 18 },
      { product_id: 'p_plutonium_oxide_pellets', quantity: 0.05, temperature: 18 },
    ],
  },
  {
    id: 'r_chemical_plant_06',
    name: 'Makes Hydrofluoric Acid, Residue',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 100000,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_deep_earth_fragment', quantity: 0.5 },
      { product_id: 'p_sulfuric_acid', quantity: 0.5 },
    ],
    outputs: [
      { product_id: 'p_hydrofluoric_acid', quantity: 2, temperature: 18 },
      { product_id: 'p_residue', quantity: 2, temperature: 18 },
    ],
  },
  {
    id: 'r_chemical_plant_07',
    name: 'Makes Slightly Enriched UF6 Gas',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 100000,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_reprocessed_uranium', quantity: 1 },
      { product_id: 'p_hydrofluoric_acid', quantity: 0.5 },
    ],
    outputs: [
      { product_id: 'p_slightly_enriched_uf6_gas', quantity: 2, temperature: 18 },
    ],
  },
  {
    id: 'r_chemical_plant_08',
    name: 'Makes Boric Acid, Residue',
    machine_id: 'm_chemical_plant',
    cycle_time: 10,
    power_consumption: 250000,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_impure_boron', quantity: 1.6 },
      { product_id: 'p_hydrochloric_acid', quantity: 0.5 },
    ],
    outputs: [
      { product_id: 'p_boric_acid', quantity: 2, temperature: 18 },
      { product_id: 'p_residue', quantity: 2, temperature: 18 },
    ],
  },
  {
    id: 'r_chemical_plant_09',
    name: 'Makes Boric Acid, Residue',
    machine_id: 'm_chemical_plant',
    cycle_time: 10,
    power_consumption: 250000,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_impure_boron', quantity: 1.6 },
      { product_id: 'p_sulfuric_acid', quantity: 0.35 },
    ],
    outputs: [
      { product_id: 'p_boric_acid', quantity: 2, temperature: 18 },
      { product_id: 'p_residue', quantity: 2, temperature: 18 },
    ],
  },
  {
    id: 'r_chemical_plant_10',
    name: 'Makes Phosphorus Oxychloride, Residue',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 1000000,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_shallow_earth_fragment', quantity: 2 },
      { product_id: 'p_hydrochloric_acid', quantity: 6 },
    ],
    outputs: [
      { product_id: 'p_phosphorus_oxychloride', quantity: 3, temperature: 18 },
      { product_id: 'p_residue', quantity: 2, temperature: 18 },
    ],
  },
  {
    id: 'r_chemical_plant_11',
    name: 'Makes Tributyl Phosphate, Hydrochloric Acid',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 1100000,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_phosphorus_oxychloride', quantity: 1.5 },
      { product_id: 'p_ethanol', quantity: 1.5 },
      { product_id: 'p_steam', quantity: 90 },
    ],
    outputs: [
      { product_id: 'p_tributyl_phosphate', quantity: 1, temperature: 18 },
      { product_id: 'p_hydrochloric_acid', quantity: 1, temperature: 18 },
    ],
  },
  {
    id: 'r_chemical_plant_12',
    name: 'Makes Enriched UO2 Pellets, Residue',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 2000000,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_enriched_uf6_gas', quantity: 0.05 },
      { product_id: 'p_steam', quantity: 90 },
      { product_id: 'p_tributyl_phosphate', quantity: 1 },
    ],
    outputs: [
      { product_id: 'p_enriched_uo2_pellets', quantity: 0.05, temperature: 18 },
      { product_id: 'p_residue', quantity: 5, temperature: 18 },
    ],
  },
  {
    id: 'r_chemical_plant_13',
    name: 'Makes Enriched UO2 Pellets, Residue',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 2500000,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_enriched_uf6_gas', quantity: 0.02 },
      { product_id: 'p_steam', quantity: 90 },
      { product_id: 'p_hydrogen', quantity: 4 },
    ],
    outputs: [
      { product_id: 'p_enriched_uo2_pellets', quantity: 0.01, temperature: 18 },
      { product_id: 'p_residue', quantity: 5, temperature: 18 },
    ],
  },
  {
    id: 'r_chemical_plant_14',
    name: 'Makes Sulfuric Acid, Residue',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 1500000,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_sulfur_trioxide', quantity: 14 },
      { product_id: 'p_distilled_water', quantity: 11 },
      { product_id: 'p_argon', quantity: 70 },
    ],
    outputs: [
      { product_id: 'p_sulfuric_acid', quantity: 11, temperature: 18 },
      { product_id: 'p_residue', quantity: 2, temperature: 18 },
    ],
  },
  {
    id: 'r_chemical_plant_15',
    name: 'Makes Hydrochloric Acid',
    machine_id: 'm_chemical_plant',
    cycle_time: 1,
    power_consumption: 1500000,
    power_type: 'HV',
    pollution: 0.72,
    inputs: [
      { product_id: 'p_chlorine', quantity: 20 },
      { product_id: 'p_hydrogen', quantity: 20 },
      { product_id: 'p_distilled_water', quantity: 10 },
      { product_id: 'p_argon', quantity: 20 },
    ],
    outputs: [
      { product_id: 'p_hydrochloric_acid', quantity: 10, temperature: 18 },
    ],
  },
];

export const chemical_plant_recipes: SpecialRecipe[] = baseRecipes.map((base) => ({
  id: base.id,
  name: base.name,
  machine_id: base.machine_id,
  settings: {
    speed_factor: {
      type: 'number',
      label: 'Speed Factor (%)',
      default: 100,
      min: 50,
      max: 200,
      step: 5,
    },
    efficiency_factor: {
      type: 'number',
      label: 'Efficiency Factor (%)',
      default: 100,
      min: 80,
      max: 120,
      step: 5,
    },
  },
  compute: (settings) => {
    const speed = (settings.speed_factor as number) ?? 200;
    const efficiency = (settings.efficiency_factor as number) ?? 120;

    const { inputMultiplier, outputMultiplier, totalPowerMultiplier } =
      computeChemicalPlantMultipliers(speed, efficiency);

    return {
      ...base,
      power_consumption: base.power_consumption * totalPowerMultiplier,
      inputs: base.inputs.map((inp) => ({
        ...inp,
        quantity: inp.quantity * inputMultiplier,
      })),
      outputs: base.outputs.map((out) => ({
        ...out,
        quantity: out.quantity * outputMultiplier,
      })),
    };
  },
}));
