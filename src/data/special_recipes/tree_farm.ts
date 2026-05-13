import machines from '../machines.json';
import type { Machine } from '../../types/data';

// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const TREES: number = 450;
const HARVESTERS: number = 20;
const SPRINKLERS: number = 24;
const OUTPUTS: number = 8;
const GLOBAL_POLLUTION: number = 0;

// ─── CONSTANTS ────────────────────────────────────────────────────
const GROWTH_POINTS = 4500;
const LOGS_PER_TREE = 2;
const HARVEST_CYCLE_TIME = 11;
const HARVESTER_POWER = 200000;
const WATER_PER_SPRINKLER = 1;
const SPRINKLERS_PER_TANK = 3;

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const pollutionDebuff = (p: number) => {
  if (p > 0) return 1 + 0.005 * p - 0.0001 * p * p;
  if (p < -60) return 0.005 * p + 1.25;
  return 1;
};

const debuff = clamp(pollutionDebuff(GLOBAL_POLLUTION), 0.5, 1.2);
const adjustedPoints = GROWTH_POINTS / debuff;

const growthTime =
  2 *
  (1000 / 30) *
  (1 / 5) *
  [7, 8, 9, 10, 11].reduce((sum, n) => sum + Math.ceil(adjustedPoints / (n * 100)), 0);

const waterTanks = Math.ceil(SPRINKLERS / SPRINKLERS_PER_TANK);
const waterConsumption = SPRINKLERS * WATER_PER_SPRINKLER;

const sustainableHarvestRate = TREES / growthTime;
const maxHarvestRate = HARVESTERS / HARVEST_CYCLE_TIME;
const actualHarvestRate = Math.min(sustainableHarvestRate, maxHarvestRate);

const logOutput = actualHarvestRate * LOGS_PER_TREE;
const avgPowerConsumption = (HARVESTERS * HARVESTER_POWER) / HARVEST_CYCLE_TIME;

// ─── COST CALCULATION ─────────────────────────────────────────────
const machineList = machines as Machine[];
const getCost = (id: string) => machineList.find((m) => m.id === id)?.cost ?? 0;

const totalCost =
  getCost('m_tree_farm_controller') +
  getCost('m_tree') * TREES +
  getCost('m_farm_harvester') * HARVESTERS +
  getCost('m_tree_farm_sprinkler') * SPRINKLERS +
  getCost('m_tree_farm_water_tank') * waterTanks +
  getCost('m_tree_farm_output') * OUTPUTS;

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
    id: 'r_tree_farm',
    name: 'Tree Farm',
    machine_id: 'm_tree_farm',
    cycle_time: 1,
    power_consumption: avgPowerConsumption,
    power_type: 'MV',
    pollution: 0,
    inputs: [{ product_id: 'p_water', quantity: waterConsumption }],
    outputs: [{ product_id: 'p_oak_log', quantity: parseFloat(logOutput.toFixed(6)) }],
  },
];

export {
  totalCost,
  waterTanks,
  growthTime,
  sustainableHarvestRate,
  maxHarvestRate,
  actualHarvestRate,
};
export { recipes };
