// SKIPPED - TODO: Convert to createSpecialRecipe factory pattern
import { getMachine } from '../lookup';

// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const THROTTLE: number = 70;
const RATIO: number = 16;
const CYLINDERS: number = 31;
const GENERATORS: number = 2;
const FUEL_TYPE: 'Refined Diesel' | 'Diesel' | 'Poor Quality Diesel' | 'Crude Diesel' =
  'Refined Diesel';

// ─── DATA TABLES ──────────────────────────────────────────────────
const FUEL_MAP: Record<string, { product_id: string; rate: number }> = {
  'Refined Diesel': { product_id: 'p_refined_diesel', rate: 690 },
  Diesel: { product_id: 'p_diesel', rate: 540 },
  'Poor Quality Diesel': { product_id: 'p_poor_quality_diesel', rate: 420 },
  'Crude Diesel': { product_id: 'p_crude_diesel', rate: 300 },
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────

const getCylMapSum = (cyl: number): number => {
  let sum = 0;
  for (let i = 1; i <= Math.min(cyl, 12); i++) {
    sum += (10 - (i * i) / 30) * 4;
  }
  return cyl > 12 ? sum + 20 * (cyl - 12) : sum;
};

const getTorqueMapSum = (n: number): number => {
  let sum = 0;
  for (let i = 1; i <= n; i++) {
    const base = clamp((i * i) / 100, 5, 200);
    const penalty = i > 90 ? (i - 100) ** 2 / 100 : 0;
    sum += clamp(base - penalty, -25, 150);
  }
  return sum;
};

const cylMap = getCylMapSum(CYLINDERS);
const torque = (cylMap * (Math.max(1, THROTTLE) / 100) * 14) / RATIO;

const sinFactor = Math.abs(Math.sin(0.1 * CYLINDERS)) + 0.5 + 0.005 * CYLINDERS;
const loadRatio = (torque + 1) / (cylMap + 1);
const torqueClamp = clamp(torque ** 2 / cylMap ** 2, 0, 1);
const baseFactor = sinFactor * loadRatio * torqueClamp * CYLINDERS;

const fuelUsage = (baseFactor * 135) / FUEL_MAP[FUEL_TYPE].rate;
const power =
  clamp(Math.floor(getTorqueMapSum(Math.ceil(torque / GENERATORS)) * 2.6), 0, Infinity) *
  30 *
  GENERATORS;
const air = baseFactor * 30;
const airInputs = Math.floor(air / 200) + 1;

// ─── COMPONENT COUNTS ────────────────────────────────────────────
const exhausts = Math.max(1, Math.ceil(airInputs / 3));
const fuelInputCount = Math.ceil(fuelUsage / 0.6);
const genAbove1 = Math.max(0, GENERATORS - 1);
const crankshafts = Math.ceil(CYLINDERS / 2 + fuelInputCount + airInputs) + genAbove1;
const sidewaysCrankshafts = 2 * genAbove1;

// ─── COST CALCULATION ────────────────────────────────────────────
const getCost = (id: string) => getMachine(id)?.cost ?? 0;

const totalCost =
  getCost('m_diesel_engine_controller') +
  getCost('m_diesel_engine_cylinder') * CYLINDERS +
  getCost('m_diesel_engine_generator') * GENERATORS +
  getCost('m_diesel_engine_exhaust') * exhausts +
  getCost('m_diesel_engine_fuel_input') * (fuelInputCount + airInputs) +
  getCost('m_diesel_engine_crankshaft') * crankshafts +
  getCost('m_diesel_engine_crankshaft_sideways') * sidewaysCrankshafts;

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
    id: 'r_modular_diesel_engine_01',
    name: `${CYLINDERS} Cyl, ${RATIO}:${THROTTLE} MDE`,
    machine_id: 'm_modular_diesel_engine',
    cycle_time: 1,
    power_consumption: -power,
    power_type: 'MV',
    pollution: 0.648 * exhausts,
    inputs: [{ product_id: FUEL_MAP[FUEL_TYPE].product_id, quantity: fuelUsage }],
    outputs: [],
  },
];

export {
  totalCost,
  airInputs,
  exhausts,
  fuelInputCount,
  crankshafts,
  sidewaysCrankshafts,
  recipes,
};
