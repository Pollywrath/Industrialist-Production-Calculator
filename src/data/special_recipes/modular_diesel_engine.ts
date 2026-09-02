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

const sumIntegers = (end: number): number => (end * (end + 1)) / 2;
const sumSquares = (end: number): number => (end * (end + 1) * (2 * end + 1)) / 6;

const getCylMap = (cyl: number): number => {
  const count = Math.max(0, Math.floor(cyl));
  const belowMinimumTorque = Math.min(count, 12);
  const minimumTorqueTotal = 40 * belowMinimumTorque - (2 * sumSquares(belowMinimumTorque)) / 15;
  const cappedTorqueTotal = Math.max(0, count - 12) * 20;
  return minimumTorqueTotal + cappedTorqueTotal;
};

const getSinFactor = (cyl: number): number => Math.abs(Math.sin(0.1 * cyl)) + 0.5 + 0.005 * cyl;

const getEfficiency = (crankshafts: number, flywheels: number): number => {
  const count = Math.max(0, Math.floor(crankshafts));

  if (count === 0) return clamp(99 + flywheels, 10, 99);

  const sumLowerBound = 2 * (Math.sqrt(count + 1) - 1);
  const sumUpperBound = 2 * Math.sqrt(count) - 1;
  const boundMargin = Number.EPSILON * Math.max(1, Math.abs(flywheels), Math.sqrt(count)) * 8;

  if (flywheels > sumUpperBound + boundMargin) return 99;
  if (sumLowerBound > 89 + flywheels + boundMargin) return 10;

  let base = 99;

  for (let i = 1; i <= count; i++) {
    base -= 1 / Math.sqrt(i);

    if (base + flywheels <= 10) return 10;
  }

  return clamp(base + flywheels, 10, 99);
};

const getTorqueMapSum = (n: number): number => {
  const count = Math.max(0, Math.floor(n));
  const lowTorqueCount = Math.min(count, 22);
  let sum = lowTorqueCount * 5;

  if (count > 22) {
    const quadraticEnd = Math.min(count, 90);
    sum += (sumSquares(quadraticEnd) - sumSquares(22)) / 100;
  }

  if (count > 90) {
    const linearEnd = Math.min(count, 125);
    sum +=
      2 * (sumIntegers(linearEnd) - sumIntegers(90)) -
      100 * (linearEnd - 90);
  }

  if (count > 125) {
    const plateauEnd = Math.min(count, 170);
    sum += Math.max(0, plateauEnd - 125) * 150;
  }

  if (count > 170) {
    const penaltyEnd = Math.min(count, 249);
    const penaltyStart = 71;
    const penaltyCount = penaltyEnd - 170;
    sum +=
      penaltyCount * 200 -
      (sumSquares(penaltyEnd - 100) - sumSquares(penaltyStart - 1)) / 100;
  }

  if (count > 249) {
    sum -= (count - 249) * 25;
  }

  return sum;
};

const getGeneratorUnitPower = (torque: number): number =>
  Math.max(0, Math.floor(getTorqueMapSum(torque) * 2.6)) * 30;

const getGeneratorPower = (torque: number, generators: number): number => {
  const totalTorque = Math.max(0, Math.ceil(torque));
  const torquePerGenerator = Math.floor(totalTorque / generators);
  const remainder = totalTorque - torquePerGenerator * generators;

  return (
    (generators - remainder) * getGeneratorUnitPower(torquePerGenerator) +
    remainder * getGeneratorUnitPower(torquePerGenerator + 1)
  );
};

const getMaximumGenerators = (maxTorque: number): number => Math.max(1, Math.ceil(maxTorque));

const getEffectiveGenerators = (generators: number, maxTorque: number): number =>
  Math.min(getMaximumGenerators(maxTorque), Math.max(1, Math.floor(generators)));

const getBestGenerators = (torque: number, maxTorque = torque): number => {
  const maximumGenerators = getMaximumGenerators(maxTorque);
  const totalTorque = Math.max(0, Math.ceil(torque));
  let generators = 1;
  let bestGenerators = 1;
  let bestPower = getGeneratorPower(torque, generators);

  while (generators <= maximumGenerators) {
    const torquePerGenerator = Math.floor(totalTorque / generators);
    let intervalEnd = maximumGenerators;

    if (torquePerGenerator > 0) {
      intervalEnd = Math.min(maximumGenerators, Math.floor(totalTorque / torquePerGenerator));
    }

    intervalEnd = Math.max(generators, intervalEnd);
    const currentUnitPower = getGeneratorUnitPower(torquePerGenerator);
    const nextUnitPower = getGeneratorUnitPower(torquePerGenerator + 1);
    const intervalSlope =
      (torquePerGenerator + 1) * currentUnitPower - torquePerGenerator * nextUnitPower;
    const candidateGenerators = intervalSlope > 0 ? intervalEnd : generators;
    const intervalPower = getGeneratorPower(torque, candidateGenerators);
    if (intervalPower > bestPower) {
      bestGenerators = candidateGenerators;
      bestPower = intervalPower;
    }

    generators = intervalEnd + 1;
  }

  return bestGenerators;
};

interface MdeMetrics {
  cylinders: number;
  throttle: number;
  afr: number;
  flywheels: number;
  baseTorque: number;
  maxTorque: number;
  torque: number;
  loadFactor: number;
  loadRatio: number;
  sinFactor: number;
  fuelUsage: number;
  airTotal: number;
}

interface MdeMinimums {
  crankshafts: number;
  sidewaysCrankshafts: number;
  exhausts: number;
}

const getFuelDefinition = (fuelType: unknown) =>
  FUEL_MAP[(fuelType as string) ?? 'Refined Diesel'] ?? FUEL_MAP['Refined Diesel'];

function getMdeMetrics(settings: Record<string, unknown>): MdeMetrics {
  const cylinders = (settings.cylinders as number) ?? 32;
  const throttle = (settings.throttle as number) ?? 59;
  const afr = (settings.afr as number) ?? 14;
  const flywheels = (settings.flywheels as number) ?? 0;
  const baseTorque = getCylMap(cylinders);
  const maxTorque = baseTorque * (14 / afr);
  const torque = maxTorque * (throttle / 100);
  const loadFactor = clamp((torque * torque) / (baseTorque * baseTorque), 0, 1);
  const loadRatio = (torque + 1) / (baseTorque + 1);
  const sinFactor = getSinFactor(cylinders);
  const fuelDefinition = getFuelDefinition(settings.fuel_type);
  const fuelUsage =
    (cylinders * loadRatio * sinFactor * loadFactor * 13.5) / fuelDefinition.rate;
  const airTotal = cylinders * (sinFactor * loadRatio * 30 * loadFactor + flywheels * 0.2);

  return {
    cylinders,
    throttle,
    afr,
    flywheels,
    baseTorque,
    maxTorque,
    torque,
    loadFactor,
    loadRatio,
    sinFactor,
    fuelUsage,
    airTotal,
  };
}

const getAirInputMinimum = (metrics: MdeMetrics): number =>
  Math.max(1, Math.ceil(metrics.airTotal / 200));

const getFuelInputMinimum = (metrics: MdeMetrics): number =>
  Math.max(1, Math.ceil(metrics.fuelUsage / 0.7));

const getExhaustMinimum = (metrics: MdeMetrics, crankshafts: number): number => {
  const efficiency = getEfficiency(crankshafts, metrics.flywheels);
  const exhaustTotal =
    metrics.cylinders *
    metrics.loadRatio *
    metrics.sinFactor *
    30 *
    metrics.loadFactor *
    metrics.loadFactor *
    (1 - efficiency / 100);
  return Math.max(1, Math.ceil(exhaustTotal / 200));
};

const getSidewaysCrankshaftMinimum = (generators: number): number =>
  Math.max(0, Math.ceil((generators - 2) / 2));

function getMdeMinimums(
  settings: Record<string, unknown>,
  metrics: MdeMetrics = getMdeMetrics(settings),
): MdeMinimums {
  const generators = getEffectiveGenerators(
    (settings.generators as number) ?? 2,
    metrics.maxTorque,
  );
  const sidewaysCrankshafts = Math.max(
    getSidewaysCrankshaftMinimum(generators),
    Math.floor((settings.sideways_crankshafts as number) ?? 0),
  );
  const airInputs = Math.max(
    getAirInputMinimum(metrics),
    Math.floor((settings.air_inputs as number) ?? 1),
  );
  const fuelInputs = Math.max(
    getFuelInputMinimum(metrics),
    Math.floor((settings.fuel_inputs as number) ?? 1),
  );
  const configuredExhausts = Math.max(1, Math.floor((settings.exhausts as number) ?? 1));

  let crankshafts = 1;
  let exhausts = Math.max(configuredExhausts, getExhaustMinimum(metrics, crankshafts));

  for (let i = 0; i < 32; i++) {
    const attachmentMinimum =
      Math.ceil(
        (metrics.cylinders + exhausts + airInputs + fuelInputs + sidewaysCrankshafts - 2) / 2,
      ) + sidewaysCrankshafts;
    const nextCrankshafts = Math.max(1, attachmentMinimum);
    const nextExhausts = Math.max(
      configuredExhausts,
      getExhaustMinimum(metrics, nextCrankshafts),
    );
    if (nextCrankshafts === crankshafts && nextExhausts === exhausts) break;
    crankshafts = nextCrankshafts;
    exhausts = nextExhausts;
  }

  return { crankshafts, sidewaysCrankshafts, exhausts };
}

function resolveAutocompleteSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const metrics = getMdeMetrics(settings);
  const generators = getBestGenerators(metrics.torque, metrics.maxTorque);
  const airInputs = getAirInputMinimum(metrics);
  const fuelInputs = getFuelInputMinimum(metrics);
  const minimums = getMdeMinimums(
    { ...settings, generators, air_inputs: airInputs, fuel_inputs: fuelInputs },
    metrics,
  );

  return {
    ...settings,
    generators,
    air_inputs: airInputs,
    exhausts: minimums.exhausts,
    fuel_inputs: fuelInputs,
    crankshafts: minimums.crankshafts,
    sideways_crankshafts: minimums.sidewaysCrankshafts,
  };
}

export const modular_diesel_engine_01: SpecialRecipe = {
  id: 'r_modular_diesel_engine_01',
  name: 'Modular Diesel Engine',
  machine_id: 'm_modular_diesel_engine',
  description:
    'Modular diesel engine. Configure components. Throttle and AFR dictate target torque. Cylinders scale base torque, fuel, air, and exhaust. Crankshafts/Flywheels drive efficiency (reducing exhaust). Generators convert torque to power; too much torque per generator causes overload penalties.',
  potentialInputs: ['p_refined_diesel', 'p_diesel', 'p_poor_quality_diesel', 'p_crude_diesel'],
  potentialOutputs: [],
  resolveAutocompleteSettings,
  resolveSettings: (productId: string) => {
    const fuel = Object.entries(FUEL_MAP).find(([, f]) => f.product_id === productId);
    if (fuel) return { fuel_type: fuel[0] };
    return null;
  },
  settings: {
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
        const metrics = getMdeMetrics(settings);
        const generators = getEffectiveGenerators(
          (settings.generators as number) ?? 2,
          metrics.maxTorque,
        );
        const bestG = getBestGenerators(metrics.torque, metrics.maxTorque);
        return `Generators (Optimal: ${bestG}) - Power: ${formatPower(getGeneratorPower(metrics.torque, generators))}`;
      },
    },
    air_inputs: {
      type: 'number',
      label: 'Air Inputs',
      default: 1,
      min: 1,
      step: 1,
      dynamicLabel: (settings) => {
        return `Air Inputs (Min: ${getAirInputMinimum(getMdeMetrics(settings))})`;
      },
    },
    exhausts: {
      type: 'number',
      label: 'Exhausts',
      default: 1,
      min: 1,
      step: 1,
      dynamicLabel: (settings) => {
        const metrics = getMdeMetrics(settings);
        const crankshafts = (settings.crankshafts as number) ?? 20;
        return `Exhausts (Min: ${getExhaustMinimum(metrics, crankshafts)}) (Affected by crankshaft count)`;
      },
    },
    fuel_inputs: {
      type: 'number',
      label: 'Fuel Inputs',
      default: 1,
      min: 1,
      step: 1,
      dynamicLabel: (settings) => {
        return `Fuel Inputs (Min: ${getFuelInputMinimum(getMdeMetrics(settings))})`;
      },
    },
    crankshafts: {
      type: 'number',
      label: 'Crankshafts',
      default: 20,
      min: 1,
      step: 1,
      dynamicLabel: (settings) => {
        const minimums = getMdeMinimums(settings);
        return `Crankshafts (Min: ${minimums.crankshafts})`;
      },
    },
    sideways_crankshafts: {
      type: 'number',
      label: 'Sideways Crankshafts',
      default: 1,
      min: 0,
      step: 1,
      dynamicLabel: (settings) => {
        const metrics = getMdeMetrics(settings);
        const generators = getEffectiveGenerators(
          (settings.generators as number) ?? 2,
          metrics.maxTorque,
        );
        return `Sideways Crankshafts (Min: ${getSidewaysCrankshaftMinimum(generators)})`;
      },
    },
    flywheels: {
      type: 'number',
      label: 'Flywheels',
      default: 0,
      min: 0,
      step: 1,
    },
  },
  compute: (settings) => {
    const cylinders = (settings.cylinders as number) ?? 32;
    const exhaustsSetting = (settings.exhausts as number) ?? 1;
    const metrics = getMdeMetrics(settings);
    const generators = getEffectiveGenerators(
      (settings.generators as number) ?? 2,
      metrics.maxTorque,
    );
    const fuelDefinition = getFuelDefinition(settings.fuel_type);
    const power = getGeneratorPower(metrics.torque, generators);

    const recipe: Recipe = {
      id: 'r_modular_diesel_engine_01',
      name: `${cylinders} Cyl, ${metrics.afr}:${metrics.throttle} MDE`,
      machine_id: 'm_modular_diesel_engine',
      cycle_time: 1,
      power_use: -roundTo(power, 6),
      power_type: 'MV',
      pollution: roundTo(0.648 * exhaustsSetting, 6),
      inputs: [
        { product_id: fuelDefinition.product_id, quantity: roundTo(metrics.fuelUsage, 6) },
      ],
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
  computeMachineSpace: (settings) => {
    const cylinders = (settings.cylinders as number) ?? 32;
    const crankshafts = (settings.crankshafts as number) ?? 20;
    const sidewaysCrankshafts = (settings.sideways_crankshafts as number) ?? 1;
    const flywheels = (settings.flywheels as number) ?? 0;
    const generators = (settings.generators as number) ?? 2;
    const airInputs = (settings.air_inputs as number) ?? 1;
    const exhausts = (settings.exhausts as number) ?? 1;
    const fuelInputs = (settings.fuel_inputs as number) ?? 1;
    const area = (id: string) => {
      const machine = getMachine(id);
      return machine ? machine.size.x * machine.size.y : 0;
    };

    return (
      area('m_diesel_engine_controller') +
      area('m_diesel_engine_cylinder') * cylinders +
      area('m_diesel_engine_generator') * generators +
      area('m_diesel_engine_exhaust') * exhausts +
      area('m_diesel_engine_fuel_input') * fuelInputs +
      area('m_diesel_engine_air_input') * airInputs +
      area('m_diesel_engine_crankshaft') * crankshafts +
      area('m_diesel_engine_crankshaft_sideways') * sidewaysCrankshafts +
      area('m_diesel_engine_flywheel') * flywheels
    );
  },
};
export { getBestGenerators };
