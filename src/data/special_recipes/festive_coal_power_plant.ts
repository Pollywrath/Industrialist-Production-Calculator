import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { clamp, roundTo } from '../../utils/precision';

const AMBIENT_TEMP = 18;
const WATER_FLOW = 400;
const PRESSURIZATION = 4;
const OUTPUT_PRESSURE = PRESSURIZATION * 7;
const SAFE_TEMP_MAX = 500;
const SAFE_PRESSURE_MAX = 12;
const MIN_SILO_WATER = 20000;
const MAX_SILO_WATER = 400000;
const FINITE_LIMIT = 1e100;
const STEADY_STATE_CACHE_LIMIT = 128;
const WARM_STATE_CACHE_LIMIT = 64;
const RELAXED_SOLVE_MAX_ITERATIONS = 1600;
const RELAXED_SOLVE_STAGNATION_WINDOW = 200;
const RELAXED_SOLVE_MIN_IMPROVEMENT = 1e-7;

interface Controls {
  coalPct: number;
  airPct: number;
  exhaustPct: number;
}

interface CppState {
  temp: number;
  air: number;
  exhaust: number;
  fireboxPressure: number;
}

interface CppEval {
  next: CppState;
  coalBurn: number;
  burnCapacity: number;
  exhaustOutput: number;
  cppPowerUse: number;
  outputTemp: number;
  systemPressure: number;
  steamPressureLevel: number;
  finite: boolean;
}

interface CppSteadyStateResult {
  state: CppState;
  eval: CppEval;
  siloTemp: number;
  stable: boolean;
  working: boolean;
}

const steadyStateCache = new Map<string, CppSteadyStateResult>();
const warmStateCache = new Map<string, CppState>();

function sqr(value: number): number {
  return value * value;
}

function isFiniteValue(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) < FINITE_LIMIT;
}

function isFiniteState(state: CppState): boolean {
  return (
    isFiniteValue(state.temp) &&
    isFiniteValue(state.air) &&
    isFiniteValue(state.exhaust) &&
    isFiniteValue(state.fireboxPressure)
  );
}

function sanitizeState(state: CppState): CppState {
  return {
    temp: clamp(state.temp, AMBIENT_TEMP, 2000),
    air: clamp(state.air, 1e-9, 1e8),
    exhaust: clamp(state.exhaust, 1e-9, 1e8),
    fireboxPressure: clamp(state.fireboxPressure, 0, 1000),
  };
}

function coalFeed(controls: Controls): number {
  return controls.coalPct / 25;
}

function airControl(controls: Controls): number {
  return controls.airPct / 25;
}

function exhaustControl(controls: Controls): number {
  return controls.exhaustPct / 50;
}

function targetFeedBurn(controls: Controls): number {
  return coalFeed(controls) * 40;
}

function criticalWaterPressure(temp: number): number {
  const safeTemp = Math.max(0, temp);
  return Math.max(0, safeTemp ** 0.75 * 0.4 - 12.6413) + 0.1013;
}

function evaluateCpp(rawState: CppState, controls: Controls, inputWaterTemp: number): CppEval {
  const state = sanitizeState(rawState);
  const feed = coalFeed(controls);
  const air = airControl(controls);
  const exhaust = exhaustControl(controls);

  const combinedPressure = Math.max(Math.sqrt(Math.max(0, state.temp)) / 10 + state.fireboxPressure, 1e-9);
  const exhaustRequest = combinedPressure * exhaust / 2 * 1000;
  const exhaustOut = clamp(clamp(exhaustRequest, -1, state.exhaust + state.air), 0, Infinity);
  const airIn = (1 / combinedPressure) * air / 4 * 3500 * 5;
  const totalGas = state.exhaust * 3 + state.air;
  const exhaustFraction = totalGas > 0 ? state.exhaust * 3 / totalGas : 0;

  const exhaustRemoved = clamp(exhaustOut * exhaustFraction, 0, state.exhaust / 3);
  const airRemoved = clamp(exhaustOut * (1 - exhaustFraction), 0, state.air / 3);
  const exhaustAfterAir = Math.max(0, state.exhaust - exhaustRemoved);
  const airAfterAir = Math.max(0, state.air - airRemoved) + airIn;
  const tempAfterAir =
    (state.temp * combinedPressure * 100000 + AMBIENT_TEMP * airIn) /
    (airIn + combinedPressure * 100000);

  const nextFireboxPressure =
    (exhaustAfterAir * 2 + airAfterAir) * tempAfterAir * 0.0036 / 100000;
  const steamPressureLevel = Math.max(Math.sqrt(Math.max(0, tempAfterAir)) / 10 + nextFireboxPressure, 1e-9);

  const airExhaustRatio = exhaustAfterAir > 0 ? airAfterAir * 4 / exhaustAfterAir : 40;
  const nominalBurn = steamPressureLevel / 2 * clamp(airExhaustRatio, 0.025, 40) * 1.6 * 1.6;
  const airLimitedBurn = Math.min(nominalBurn, airAfterAir / 6.25);
  const burnCapacity = Math.max(0, airLimitedBurn);
  const actualBurn = Math.min(targetFeedBurn(controls), burnCapacity);

  const airAfterBurn = Math.max(0, airAfterAir - actualBurn * 6.25);
  const exhaustAfterBurn = exhaustAfterAir + actualBurn * 25 * 0.625;
  const tempAfterBurn =
    tempAfterAir + (800 / Math.max(tempAfterAir, 1e-9)) * (actualBurn / 350) * 12.5;

  const pressureFactor = clamp(OUTPUT_PRESSURE / 14, 0.5, 2);
  const heatTransfer =
    (tempAfterBurn - inputWaterTemp) * 0.9 * clamp(steamPressureLevel / 16, 0.1, 0.5);
  const pressureAdjustedHeat = heatTransfer * pressureFactor;
  const tempAfterWater =
    (tempAfterBurn * 100000 * steamPressureLevel - WATER_FLOW * pressureAdjustedHeat * OUTPUT_PRESSURE) /
    (100000 * steamPressureLevel);
  const outputTemp = inputWaterTemp + pressureAdjustedHeat;
  const nextTemp = clamp(tempAfterWater - (0.5 + sqr(tempAfterWater) / 1000000), AMBIENT_TEMP, Infinity);

  const next = sanitizeState({
    temp: nextTemp,
    air: airAfterBurn,
    exhaust: exhaustAfterBurn,
    fireboxPressure: nextFireboxPressure,
  });

  const pressureDelta = Math.abs(OUTPUT_PRESSURE - criticalWaterPressure(inputWaterTemp));
  const cppPowerUse =
    100000 +
    feed * 100000 +
    combinedPressure * 250000 * air +
    exhaust * 10000 +
    pressureDelta ** 1.1 * WATER_FLOW * 500 +
    WATER_FLOW * 1000;

  return {
    next,
    coalBurn: actualBurn,
    burnCapacity,
    exhaustOutput: exhaustOut,
    cppPowerUse,
    outputTemp,
    systemPressure: combinedPressure,
    steamPressureLevel,
    finite:
      isFiniteState(next) &&
      isFiniteValue(actualBurn) &&
      isFiniteValue(exhaustOut) &&
      isFiniteValue(cppPowerUse) &&
      isFiniteValue(outputTemp) &&
      isFiniteValue(combinedPressure) &&
      isFiniteValue(steamPressureLevel),
  };
}

function residual(state: CppState, controls: Controls, inputWaterTemp: number): number[] {
  const evalResult = evaluateCpp(state, controls, inputWaterTemp);
  return [
    evalResult.next.temp - state.temp,
    evalResult.next.air - state.air,
    evalResult.next.exhaust - state.exhaust,
    evalResult.next.fireboxPressure - state.fireboxPressure,
  ];
}

function residualNorm(state: CppState, controls: Controls, inputWaterTemp: number): number {
  const r = residual(state, controls, inputWaterTemp);
  return Math.sqrt(
    sqr(r[0] / 1) +
      sqr(r[1] / 50) +
      sqr(r[2] / 50) +
      sqr(r[3] / 0.01),
  );
}

function solveLinear4(matrix: number[][]): number[] | null {
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    for (let row = col + 1; row < 4; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) {
        pivot = row;
      }
    }
    if (Math.abs(matrix[pivot][col]) < 1e-12) {
      return null;
    }
    if (pivot !== col) {
      [matrix[pivot], matrix[col]] = [matrix[col], matrix[pivot]];
    }

    const divisor = matrix[col][col];
    for (let k = col; k < 5; k++) {
      matrix[col][k] /= divisor;
    }
    for (let row = 0; row < 4; row++) {
      if (row === col) continue;
      const factor = matrix[row][col];
      for (let k = col; k < 5; k++) {
        matrix[row][k] -= factor * matrix[col][k];
      }
    }
  }

  return [matrix[0][4], matrix[1][4], matrix[2][4], matrix[3][4]];
}

function addDelta(state: CppState, delta: number[], scale: number): CppState {
  return sanitizeState({
    temp: state.temp + delta[0] * scale,
    air: state.air + delta[1] * scale,
    exhaust: state.exhaust + delta[2] * scale,
    fireboxPressure: state.fireboxPressure + delta[3] * scale,
  });
}

function newtonSolve(seed: CppState, controls: Controls, inputWaterTemp: number): CppState | null {
  let state = sanitizeState(seed);
  let norm = residualNorm(state, controls, inputWaterTemp);

  for (let iter = 0; iter < 80; iter++) {
    if (!isFiniteState(state) || !Number.isFinite(norm)) {
      return null;
    }
    if (norm < 1e-7) {
      return state;
    }

    const baseResidual = residual(state, controls, inputWaterTemp);
    const values = [state.temp, state.air, state.exhaust, state.fireboxPressure];
    const minSteps = [1e-3, 1e-2, 1e-2, 1e-5];
    const augmented = Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => 0));

    for (let variable = 0; variable < 4; variable++) {
      const h = Math.max(Math.abs(values[variable]) * 1e-5, minSteps[variable]);
      let stepped = { ...state };
      if (variable === 0) {
        stepped.temp += h;
      } else if (variable === 1) {
        stepped.air += h;
      } else if (variable === 2) {
        stepped.exhaust += h;
      } else {
        stepped.fireboxPressure += h;
      }
      stepped = sanitizeState(stepped);
      const steppedResidual = residual(stepped, controls, inputWaterTemp);
      for (let row = 0; row < 4; row++) {
        augmented[row][variable] = (steppedResidual[row] - baseResidual[row]) / h;
      }
    }
    for (let row = 0; row < 4; row++) {
      augmented[row][4] = -baseResidual[row];
    }

    let delta = solveLinear4(augmented);
    if (delta === null) {
      delta = baseResidual;
    }

    let accepted = false;
    for (let scale = 1; scale >= 1 / 1024; scale *= 0.5) {
      const candidate = addDelta(state, delta, scale);
      const candidateNorm = residualNorm(candidate, controls, inputWaterTemp);
      if (Number.isFinite(candidateNorm) && candidateNorm < norm) {
        state = candidate;
        norm = candidateNorm;
        accepted = true;
        break;
      }
    }

    if (!accepted) {
      const evalResult = evaluateCpp(state, controls, inputWaterTemp);
      const fixedPointDelta = [
        evalResult.next.temp - state.temp,
        evalResult.next.air - state.air,
        evalResult.next.exhaust - state.exhaust,
        evalResult.next.fireboxPressure - state.fireboxPressure,
      ];
      state = addDelta(state, fixedPointDelta, 0.15);
      norm = residualNorm(state, controls, inputWaterTemp);
    }
  }

  return norm < 1e-5 ? state : null;
}

function relaxedSolve(seed: CppState, controls: Controls, inputWaterTemp: number): CppState | null {
  let state = sanitizeState(seed);
  let alpha = 0.12;
  let bestNorm = residualNorm(state, controls, inputWaterTemp);
  let best = state;
  let iterationsSinceImprovement = 0;

  for (let iter = 0; iter < RELAXED_SOLVE_MAX_ITERATIONS; iter++) {
    const evalResult = evaluateCpp(state, controls, inputWaterTemp);
    if (!evalResult.finite) {
      return null;
    }
    const delta = [
      evalResult.next.temp - state.temp,
      evalResult.next.air - state.air,
      evalResult.next.exhaust - state.exhaust,
      evalResult.next.fireboxPressure - state.fireboxPressure,
    ];
    state = addDelta(state, delta, alpha);
    const norm = residualNorm(state, controls, inputWaterTemp);
    if (Number.isFinite(norm) && norm < bestNorm - RELAXED_SOLVE_MIN_IMPROVEMENT) {
      bestNorm = norm;
      best = state;
      iterationsSinceImprovement = 0;
    } else {
      iterationsSinceImprovement++;
    }
    if (bestNorm < 1e-5) {
      return best;
    }
    if (iterationsSinceImprovement >= RELAXED_SOLVE_STAGNATION_WINDOW) {
      break;
    }
    if (iter % 400 === 399) {
      alpha = Math.max(0.02, alpha * 0.8);
    }
  }

  return newtonSolve(best, controls, inputWaterTemp) ?? (bestNorm < 1e-4 ? best : null);
}

function initialSeeds(inputWaterTemp: number, warmStart?: CppState): CppState[] {
  const seeds = [
    { temp: Math.max(180, inputWaterTemp + 180), air: 900, exhaust: 900, fireboxPressure: 1 },
    { temp: 260, air: 1200, exhaust: 1400, fireboxPressure: 3 },
    { temp: 360, air: 1800, exhaust: 2600, fireboxPressure: 6 },
    { temp: 470, air: 2600, exhaust: 4800, fireboxPressure: 9 },
    { temp: 120, air: 700, exhaust: 700, fireboxPressure: 0.8 },
  ];

  return warmStart ? [sanitizeState(warmStart), ...seeds] : seeds;
}

function solveSteadyState(
  controls: Controls,
  inputWaterTemp: number,
  warmStart?: CppState,
): CppState | null {
  const seeds = initialSeeds(inputWaterTemp, warmStart);
  let best: CppState | null = null;
  let bestNorm = Infinity;

  for (const seed of seeds) {
    const solved = newtonSolve(seed, controls, inputWaterTemp);
    if (solved === null) continue;

    const norm = residualNorm(solved, controls, inputWaterTemp);
    if (Number.isFinite(norm) && norm < 1e-7) {
      return solved;
    }
    if (Number.isFinite(norm) && norm < bestNorm) {
      bestNorm = norm;
      best = solved;
    }
  }

  if (best !== null && bestNorm < 1e-4) {
    return best;
  }

  for (let i = 0; i < Math.min(seeds.length, 2); i++) {
    const solved = relaxedSolve(seeds[i], controls, inputWaterTemp);
    if (solved === null) continue;

    const norm = residualNorm(solved, controls, inputWaterTemp);
    if (Number.isFinite(norm) && norm < bestNorm) {
      bestNorm = norm;
      best = solved;
    }
  }

  return best !== null && bestNorm < 1e-4 ? best : null;
}

function calculateSiloSteadyTemp(returnTemp: number, siloWater: number): number {
  const safeReturnTemp = Math.max(0, returnTemp);
  const exchangeRate = WATER_FLOW / Math.max(WATER_FLOW, siloWater);
  const inputDelta = safeReturnTemp - AMBIENT_TEMP;

  if (inputDelta <= 0 || exchangeRate >= 1) {
    return safeReturnTemp;
  }

  const passiveCoolingShare = 1 - exchangeRate;
  const discriminant =
    sqr(1600 * exchangeRate) +
    4 * passiveCoolingShare * 1600 * exchangeRate * inputDelta;
  const mixedDelta =
    (-1600 * exchangeRate + Math.sqrt(Math.max(0, discriminant))) /
    (2 * passiveCoolingShare);
  const steadySiloTemp =
    AMBIENT_TEMP + mixedDelta - sqr(mixedDelta) / 1600;

  return clamp(steadySiloTemp, Math.min(AMBIENT_TEMP, safeReturnTemp), Math.max(AMBIENT_TEMP, safeReturnTemp));
}

function getCacheKey(controls: Controls, incomingWaterTemp: number, siloWater: number): string {
  return [
    controls.coalPct.toFixed(4),
    controls.airPct.toFixed(4),
    controls.exhaustPct.toFixed(4),
    incomingWaterTemp.toFixed(4),
    siloWater.toFixed(2),
  ].join('|');
}

function getWarmStateKey(controls: Controls, siloWater: number): string {
  return [
    controls.coalPct.toFixed(4),
    controls.airPct.toFixed(4),
    controls.exhaustPct.toFixed(4),
    siloWater.toFixed(2),
  ].join('|');
}

function getCachedSteadyState(key: string): CppSteadyStateResult | null {
  const cached = steadyStateCache.get(key);
  if (!cached) return null;
  steadyStateCache.delete(key);
  steadyStateCache.set(key, cached);
  return cached;
}

function getWarmState(key: string): CppState | undefined {
  const warmState = warmStateCache.get(key);
  if (!warmState) return undefined;
  warmStateCache.delete(key);
  warmStateCache.set(key, warmState);
  return warmState;
}

function setCachedSteadyState(key: string, result: CppSteadyStateResult): void {
  steadyStateCache.set(key, result);
  if (steadyStateCache.size > STEADY_STATE_CACHE_LIMIT) {
    const oldestKey = steadyStateCache.keys().next().value;
    if (oldestKey !== undefined) {
      steadyStateCache.delete(oldestKey);
    }
  }
}

function setWarmState(key: string, state: CppState): void {
  warmStateCache.set(key, state);
  if (warmStateCache.size > WARM_STATE_CACHE_LIMIT) {
    const oldestKey = warmStateCache.keys().next().value;
    if (oldestKey !== undefined) {
      warmStateCache.delete(oldestKey);
    }
  }
}

function isObviouslyNotWorking(controls: Controls): boolean {
  return controls.coalPct <= 0 || controls.airPct <= 0 || controls.exhaustPct <= 0;
}

function createFallbackResult(controls: Controls, siloTemp: number): CppSteadyStateResult {
  const fallbackState = sanitizeState({
    temp: Math.max(AMBIENT_TEMP, siloTemp),
    air: 1,
    exhaust: 1,
    fireboxPressure: 0,
  });
  const evalResult = evaluateCpp(fallbackState, controls, siloTemp);

  return {
    state: fallbackState,
    eval: evalResult,
    siloTemp,
    stable: false,
    working: false,
  };
}

export function calculateCoalPowerPlantSteadyState(
  controls: Controls,
  incomingWaterTemp: number,
  siloWater: number,
): CppSteadyStateResult {
  const cacheKey = getCacheKey(controls, incomingWaterTemp, siloWater);
  const warmStateKey = getWarmStateKey(controls, siloWater);
  const cached = getCachedSteadyState(cacheKey);
  if (cached) {
    return cached;
  }

  const siloTemp = calculateSiloSteadyTemp(incomingWaterTemp, siloWater);

  if (isObviouslyNotWorking(controls)) {
    const result = createFallbackResult(controls, siloTemp);
    setCachedSteadyState(cacheKey, result);
    return result;
  }

  const state = solveSteadyState(controls, siloTemp, getWarmState(warmStateKey));

  if (state === null) {
    const result = createFallbackResult(controls, siloTemp);
    setCachedSteadyState(cacheKey, result);
    return result;
  }

  const evalResult = evaluateCpp(state, controls, siloTemp);
  const working =
    evalResult.finite &&
    evalResult.coalBurn > 1e-6 &&
    evalResult.exhaustOutput > 1e-6 &&
    state.temp >= 150 &&
    state.temp <= SAFE_TEMP_MAX &&
    evalResult.systemPressure <= SAFE_PRESSURE_MAX &&
    criticalWaterPressure(evalResult.outputTemp) <= OUTPUT_PRESSURE + 0.05;

  const result = {
    state,
    eval: evalResult,
    siloTemp,
    stable: evalResult.finite,
    working,
  };
  setCachedSteadyState(cacheKey, result);
  setWarmState(warmStateKey, state);
  return result;
}

export const festive_coal_power_plant_01: SpecialRecipe = {
  id: 'r_festive_coal_power_plant_01',
  name: 'Coal Power Plant',
  machine_id: 'm_festive_coal_power_plant',
  description:
    'CPP-only steady state. Central valve and pressurization are fixed at 100%, recirculation is fixed at 0%..',
  potentialInputs: ['p_coal', 'p_distilled_water'],
  potentialOutputs: ['p_distilled_water', 'p_exhaust'],
  inputTemperatureSettings: {
    1: 'distilled_water_temp',
  },
  settings: {
    coal_feed: {
      type: 'number',
      label: 'Coal Feed (%)',
      default: 60,
      min: 0,
      max: 100,
      step: 2.5,
    },
    air: {
      type: 'number',
      label: 'Air (%)',
      default: 92.5,
      min: 0,
      max: 100,
      step: 2.5,
    },
    exhaust: {
      type: 'number',
      label: 'Exhaust (%)',
      default: 20,
      min: 0,
      max: 100,
      step: 5,
    },
    distilled_water_temp: {
      type: 'number',
      label: 'Input Water Temp (C)',
      default: AMBIENT_TEMP,
      min: -273.15,
      step: 0.1,
    },
    silo_water: {
      type: 'number',
      label: 'Silo Water Fill (L)',
      default: 200000,
      min: MIN_SILO_WATER,
      max: MAX_SILO_WATER,
      step: 1000,
    },
  },
  compute: (settings) => {
    const controls = {
      coalPct: clamp(settings.coal_feed as number, 0, 100),
      airPct: clamp(settings.air as number, 0, 100),
      exhaustPct: clamp(settings.exhaust as number, 0, 100),
    };
    const siloWater = clamp(settings.silo_water as number, MIN_SILO_WATER, MAX_SILO_WATER);
    const incomingWaterTemp = settings.distilled_water_temp as number;

    const result = calculateCoalPowerPlantSteadyState(controls, incomingWaterTemp, siloWater);
    const evalResult = result.eval;
    const coalBurn = result.working ? evalResult.coalBurn : 0;
    const exhaustOutput = result.working ? evalResult.exhaustOutput : 0;
    const outputTemp = result.working ? evalResult.outputTemp : result.siloTemp;

    const recipe: Recipe = {
      id: 'r_festive_coal_power_plant_01',
      name: result.working
        ? `${controls.coalPct}% C, ${controls.airPct}% A, ${controls.exhaustPct}% E`
        : 'Tripped',
      machine_id: 'm_festive_coal_power_plant',
      cycle_time: 1,
      power_consumption: roundTo(evalResult.cppPowerUse, 6),
      power_type: 'HV',
      pollution: 0,
      inputs: [
        { product_id: 'p_coal', quantity: roundTo(coalBurn, 6) },
        { product_id: 'p_distilled_water', quantity: WATER_FLOW },
      ],
      outputs: [
        {
          product_id: 'p_distilled_water',
          quantity: WATER_FLOW,
          temperature: roundTo(outputTemp, 6),
        },
        {
          product_id: 'p_exhaust',
          quantity: roundTo(exhaustOutput, 6),
          temperature: AMBIENT_TEMP,
        },
      ],
      runtime: {
        boilerTemp: roundTo(result.state.temp, 1),
      },
    };

    return recipe;
  },
};
