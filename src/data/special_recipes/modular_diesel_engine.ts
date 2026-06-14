import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { getMachine } from '../lookup';
import { formatPower, formatQuantity } from '../../utils/unitFormatting';
import { clamp, roundTo } from '../../utils/precision';

const FUEL_MAP: Record<string, { product_id: string; rate: number }> = {
  'Refined Diesel': { product_id: 'p_refined_diesel', rate: 690 },
  Diesel: { product_id: 'p_diesel', rate: 540 },
  'Poor Quality Diesel': { product_id: 'p_poor_quality_diesel', rate: 420 },
  'Crude Diesel': { product_id: 'p_crude_diesel', rate: 300 },
};

const getCylMap = (cyl: number): number => {
  let sum = 0;
  for (let i = 1; i <= Math.floor(cyl); i++) {
    sum += clamp(10 - (i * i) / 30, 5, 30) * 4;
  }
  return sum;
};

const getSinFactor = (cyl: number): number =>
  Math.abs(Math.sin(0.1 * cyl)) + 0.5 + 0.005 * cyl;

const getEfficiencyBase = (crankshafts: number): number => {
  let base = 99;
  for (let i = 1; i <= Math.floor(crankshafts); i++) {
    base -= 1 / Math.sqrt(i);
  }
  return base;
};

const getEfficiency = (crankshafts: number, flywheels: number): number =>
  clamp(getEfficiencyBase(crankshafts) + flywheels, 10, 99);

const getTorqueMapSum = (n: number): number => {
  let sum = 0;
  for (let i = 1; i <= n; i++) {
    const base = clamp((i * i) / 100, 5, 200);
    const penalty = i > 90 ? (i - 100) ** 2 / 100 : 0;
    sum += clamp(base - penalty, -25, 150);
  }
  return sum;
};

const getBestGenerators = (torque: number): number => {
  let bestG = 1;
  let maxPower = -1;
  for (let g = 1; g <= 20; g++) {
    const n = Math.ceil(torque / g);
    const power = clamp(Math.floor(getTorqueMapSum(n) * 2.6), 0, Infinity) * 30 * g;
    if (power > maxPower) {
      maxPower = power;
      bestG = g;
    }
  }
  return bestG;
};

export const modular_diesel_engine_01: SpecialRecipe = {
  id: 'r_modular_diesel_engine_01',
  name: 'Modular Diesel Engine',
  machine_id: 'm_modular_diesel_engine',
  description: 'Modular diesel engine. Configure components. Throttle and AFR dictate target torque. Cylinders scale base torque, fuel, air, and exhaust. Crankshafts/Flywheels drive efficiency (reducing exhaust). Generators convert torque to power; too much torque per generator causes overload penalties.',
  potentialInputs: ['p_refined_diesel', 'p_diesel', 'p_poor_quality_diesel', 'p_crude_diesel'],
  potentialOutputs: [],
  resolveSettings: (productId: string) => {
    const fuel = Object.entries(FUEL_MAP).find(([, f]) => f.product_id === productId);
    if (fuel) return { fuel_type: fuel[0] };
    return null;
  },
  settings: {
    throttle: {
      type: 'number',
      label: 'Throttle (%)',
      default: 59,
      min: 1,
      max: 100,
      step: 1,
    },
    afr: {
      type: 'number',
      label: 'AFR (Air-to-Fuel Ratio)',
      default: 14,
      min: 10,
      max: 16,
      step: 1,
    },
    cylinders: {
      type: 'number',
      label: 'Cylinders',
      default: 32,
      min: 1,
      step: 1,
      dynamicLabel: (settings) => {
        const cylinders = (settings.cylinders as number) ?? 32;
        const throttle = (settings.throttle as number) ?? 59;
        const afr = (settings.afr as number) ?? 14;
        const fuelType = (settings.fuel_type as string) ?? 'Refined Diesel';

        const cylMap = getCylMap(cylinders);
        const torque = cylMap * (throttle / 100) * (14 / afr);
        const loadFactor = clamp((torque * torque) / (cylMap * cylMap), 0, 1);
        const loadRatio = (torque + 1) / (cylMap + 1);
        const sinFactor = getSinFactor(cylinders);

        const fuelUsage =
          (cylinders * loadRatio * sinFactor * loadFactor * 13.5) / FUEL_MAP[fuelType].rate;
        return `Cylinders - Fuel: ${formatQuantity(fuelUsage)}/s`;
      },
    },
    generators: {
      type: 'number',
      label: 'Generators',
      default: 2,
      min: 1,
      step: 1,
      dynamicLabel: (settings) => {
        const throttle = (settings.throttle as number) ?? 59;
        const cylinders = (settings.cylinders as number) ?? 32;
        const afr = (settings.afr as number) ?? 14;
        const generators = (settings.generators as number) ?? 2;

        const cylMap = getCylMap(cylinders);
        const torque = cylMap * (throttle / 100) * (14 / afr);
        const bestG = getBestGenerators(torque);
        const currentPower = clamp(Math.floor(getTorqueMapSum(Math.ceil(torque / generators)) * 2.6), 0, Infinity) * 30 * generators;
        return `Generators (Optimal: ${bestG}) - Power: ${formatPower(currentPower)}`;
      },
    },
    air_inputs: {
      type: 'number',
      label: 'Air Inputs',
      default: 1,
      min: 1,
      step: 1,
      dynamicLabel: (settings) => {
        const cylinders = (settings.cylinders as number) ?? 32;
        const throttle = (settings.throttle as number) ?? 59;
        const afr = (settings.afr as number) ?? 14;
        const flywheels = (settings.flywheels as number) ?? 0;

        const cylMap = getCylMap(cylinders);
        const torque = cylMap * (throttle / 100) * (14 / afr);
        const loadFactor = clamp((torque * torque) / (cylMap * cylMap), 0, 1);
        const loadRatio = (torque + 1) / (cylMap + 1);
        const sinFactor = getSinFactor(cylinders);

        const airTotal =
          cylinders * (sinFactor * loadRatio * 30 * loadFactor + flywheels * 0.2);
        const airInputs = Math.ceil(airTotal / 200);
        return `Air Inputs (Min: ${airInputs})`;
      },
    },
    exhausts: {
      type: 'number',
      label: 'Exhausts',
      default: 1,
      min: 1,
      step: 1,
      dynamicLabel: (settings) => {
        const cylinders = (settings.cylinders as number) ?? 32;
        const crankshafts = (settings.crankshafts as number) ?? 20;
        const flywheels = (settings.flywheels as number) ?? 0;
        const throttle = (settings.throttle as number) ?? 59;
        const afr = (settings.afr as number) ?? 14;

        const cylMap = getCylMap(cylinders);
        const torque = cylMap * (throttle / 100) * (14 / afr);
        const loadFactor = clamp((torque * torque) / (cylMap * cylMap), 0, 1);
        const loadRatio = (torque + 1) / (cylMap + 1);
        const sinFactor = getSinFactor(cylinders);

        const efficiency = getEfficiency(crankshafts, flywheels);
        const exhaustTotal =
          cylinders *
          loadRatio *
          sinFactor *
          30 *
          loadFactor *
          loadFactor *
          (1 - efficiency / 100);
        const exhausts = Math.max(1, Math.ceil(exhaustTotal / 200));
        return `Exhausts (Min: ${exhausts}) (Affected by crankshaft count)`;
      },
    },
    fuel_inputs: {
      type: 'number',
      label: 'Fuel Inputs',
      default: 1,
      min: 1,
      step: 1,
      dynamicLabel: (settings) => {
        const cylinders = (settings.cylinders as number) ?? 32;
        const throttle = (settings.throttle as number) ?? 59;
        const afr = (settings.afr as number) ?? 14;
        const fuelType = (settings.fuel_type as string) ?? 'Refined Diesel';

        const cylMap = getCylMap(cylinders);
        const torque = cylMap * (throttle / 100) * (14 / afr);
        const loadFactor = clamp((torque * torque) / (cylMap * cylMap), 0, 1);
        const loadRatio = (torque + 1) / (cylMap + 1);
        const sinFactor = getSinFactor(cylinders);

        const fuelUsage =
          (cylinders * loadRatio * sinFactor * loadFactor * 13.5) / FUEL_MAP[fuelType].rate;
        const fuelInputCount = Math.max(1, Math.ceil(fuelUsage / 0.7));
        return `Fuel Inputs (Min: ${fuelInputCount})`;
      },
    },
    crankshafts: {
      type: 'number',
      label: 'Crankshafts',
      default: 20,
      min: 1,
      step: 1,
    },
    sideways_crankshafts: {
      type: 'number',
      label: 'Sideways Crankshafts',
      default: 1,
      min: 0,
      step: 1,
    },
    flywheels: {
      type: 'number',
      label: 'Flywheels',
      default: 0,
      min: 0,
      step: 1,
    },
    fuel_type: {
      type: 'select',
      label: 'Fuel Type',
      default: 'Refined Diesel',
      options: [
        { label: 'Refined Diesel', value: 'Refined Diesel' },
        { label: 'Diesel', value: 'Diesel' },
        { label: 'Poor Quality Diesel', value: 'Poor Quality Diesel' },
        { label: 'Crude Diesel', value: 'Crude Diesel' },
      ],
    },
  },
  compute: (settings) => {
    const cylinders = (settings.cylinders as number) ?? 32;
    const generators = (settings.generators as number) ?? 2;
    const fuelType = (settings.fuel_type as string) ?? 'Refined Diesel';
    const throttle = (settings.throttle as number) ?? 59;
    const afr = (settings.afr as number) ?? 14;
    const exhaustsSetting = (settings.exhausts as number) ?? 1;

    const cylMap = getCylMap(cylinders);
    const torque = cylMap * (throttle / 100) * (14 / afr);
    const loadFactor = clamp((torque * torque) / (cylMap * cylMap), 0, 1);
    const loadRatio = (torque + 1) / (cylMap + 1);
    const sinFactor = getSinFactor(cylinders);

    const fuelUsage =
      (cylinders * loadRatio * sinFactor * loadFactor * 13.5) / FUEL_MAP[fuelType].rate;

    const power =
      clamp(Math.floor(getTorqueMapSum(Math.ceil(torque / generators)) * 2.6), 0, Infinity) *
      30 *
      generators;

    const recipe: Recipe = {
      id: 'r_modular_diesel_engine_01',
      name: `${cylinders} Cyl, ${afr}:${throttle} MDE`,
      machine_id: 'm_modular_diesel_engine',
      cycle_time: 1,
      power_consumption: -roundTo(power, 6),
      power_type: 'MV',
      pollution: roundTo(0.648 * exhaustsSetting, 6),
      inputs: [{ product_id: FUEL_MAP[fuelType].product_id, quantity: roundTo(fuelUsage, 6) }],
      outputs: [],
    };

    return recipe;
  },
  computeMachineCost: (settings) => {
    const cylinders = (settings.cylinders as number) ?? 32;
    const crankshafts = (settings.crankshafts as number) ?? 20;
    const sidewaysCrankshafts = (settings.sideways_crankshafts as number) ?? 1;
    const flywheels = (settings.flywheels as number) ?? 0;
    const generators = (settings.generators as number) ?? 2;
    const airInputsSetting = (settings.air_inputs as number) ?? 1;
    const exhaustsSetting = (settings.exhausts as number) ?? 1;
    const fuelInputsSetting = (settings.fuel_inputs as number) ?? 1;

    const getCost = (id: string) => getMachine(id)?.cost ?? 0;

    const totalCost =
      getCost('m_diesel_engine_controller') +
      getCost('m_diesel_engine_cylinder') * cylinders +
      getCost('m_diesel_engine_generator') * generators +
      getCost('m_diesel_engine_exhaust') * exhaustsSetting +
      getCost('m_diesel_engine_fuel_input') * fuelInputsSetting +
      getCost('m_diesel_engine_air_input') * airInputsSetting +
      getCost('m_diesel_engine_crankshaft') * crankshafts +
      getCost('m_diesel_engine_crankshaft_sideways') * sidewaysCrankshafts +
      getCost('m_diesel_engine_flywheel') * flywheels;

    return totalCost;
  },
  computeModelCount: (settings) => {
    const cylinders = (settings.cylinders as number) ?? 32;
    const crankshafts = (settings.crankshafts as number) ?? 20;
    const sidewaysCrankshafts = (settings.sideways_crankshafts as number) ?? 1;
    const flywheels = (settings.flywheels as number) ?? 0;
    const generators = (settings.generators as number) ?? 2;
    const airInputsSetting = (settings.air_inputs as number) ?? 1;
    const exhaustsSetting = (settings.exhausts as number) ?? 1;
    const fuelInputsSetting = (settings.fuel_inputs as number) ?? 1;

    return (
      1 +
      cylinders +
      generators * 2 +
      exhaustsSetting +
      fuelInputsSetting * 2 +
      airInputsSetting +
      crankshafts +
      sidewaysCrankshafts +
      flywheels
    );
  },
};
export { getBestGenerators };
