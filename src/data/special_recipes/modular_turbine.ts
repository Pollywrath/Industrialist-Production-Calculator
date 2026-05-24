// SKIPPED - TODO: Convert to createSpecialRecipe factory pattern
import machines from '../machines.json';
import type { Machine } from '../../types/data';

// ─── DATA TABLES ──────────────────────────────────────────────────
export const presets = [
  // 6kL/s Presets
  {
    name: '6kL/s: 160-168°C (0:1)',
    flow: 6000,
    hpt: 0,
    lpt: 1,
    tempMin: 160,
    tempMax: 168,
    powerMin: 38000000,
    powerMax: 68000000,
  },
  {
    name: '6kL/s: 168-220°C (0:3)',
    flow: 6000,
    hpt: 0,
    lpt: 3,
    tempMin: 168,
    tempMax: 220,
    powerMin: 68000000,
    powerMax: 81000000,
  },
  {
    name: '6kL/s: 220-230°C (0:4)',
    flow: 6000,
    hpt: 0,
    lpt: 4,
    tempMin: 220,
    tempMax: 230,
    powerMin: 81000000,
    powerMax: 85000000,
  },
  {
    name: '6kL/s: 230-285°C (0:5)',
    flow: 6000,
    hpt: 0,
    lpt: 5,
    tempMin: 230,
    tempMax: 285,
    powerMin: 85000000,
    powerMax: 86000000,
  },
  {
    name: '6kL/s: 285-330°C (1:4)',
    flow: 6000,
    hpt: 1,
    lpt: 4,
    tempMin: 285,
    tempMax: 330,
    powerMin: 86000000,
    powerMax: 96000000,
  },
  {
    name: '6kL/s: >330°C (1:5)',
    flow: 6000,
    hpt: 1,
    lpt: 5,
    tempMin: 330,
    tempMax: 1000,
    powerMin: 101000000,
    powerMax: 101000000,
  },

  // 12kL/s Presets
  {
    name: '12kL/s: 160-167°C (0:1)',
    flow: 12000,
    hpt: 0,
    lpt: 1,
    tempMin: 160,
    tempMax: 167,
    powerMin: 38000000,
    powerMax: 38000000,
  },
  {
    name: '12kL/s: 167-185°C (1:2)',
    flow: 12000,
    hpt: 1,
    lpt: 2,
    tempMin: 167,
    tempMax: 185,
    powerMin: 75000000,
    powerMax: 78000000,
  },
  {
    name: '12kL/s: 185-205°C (1:3)',
    flow: 12000,
    hpt: 1,
    lpt: 3,
    tempMin: 185,
    tempMax: 205,
    powerMin: 101000000,
    powerMax: 104000000,
  },
  {
    name: '12kL/s: 205-250°C (2:3)',
    flow: 12000,
    hpt: 2,
    lpt: 3,
    tempMin: 205,
    tempMax: 250,
    powerMin: 101000000,
    powerMax: 139000000,
  },
  {
    name: '12kL/s: 250-285°C (2:4)',
    flow: 12000,
    hpt: 2,
    lpt: 4,
    tempMin: 250,
    tempMax: 285,
    powerMin: 139000000,
    powerMax: 143000000,
  },
  {
    name: '12kL/s: >285°C (2:5)',
    flow: 12000,
    hpt: 2,
    lpt: 5,
    tempMin: 285,
    tempMax: 1000,
    powerMin: 148000000,
    powerMax: 148000000,
  },

  // 24kL/s Presets
  {
    name: '24kL/s: 160-166°C (2:1)',
    flow: 24000,
    hpt: 2,
    lpt: 1,
    tempMin: 160,
    tempMax: 166,
    powerMin: 80000000,
    powerMax: 82000000,
  },
  {
    name: '24kL/s: 166-185°C (3:1)',
    flow: 24000,
    hpt: 3,
    lpt: 1,
    tempMin: 166,
    tempMax: 185,
    powerMin: 124000000,
    powerMax: 133000000,
  },
  {
    name: '24kL/s: 185-205°C (4:1)',
    flow: 24000,
    hpt: 4,
    lpt: 1,
    tempMin: 185,
    tempMax: 205,
    powerMin: 166000000,
    powerMax: 179000000,
  },
  {
    name: '24kL/s: 205-228°C (5:1)',
    flow: 24000,
    hpt: 5,
    lpt: 1,
    tempMin: 205,
    tempMax: 228,
    powerMin: 195000000,
    powerMax: 216000000,
  },
  {
    name: '24kL/s: 229-251°C (4:3*)',
    flow: 24000,
    hpt: 4,
    lpt: 3,
    tempMin: 229,
    tempMax: 251,
    powerMin: 250000000,
    powerMax: 269000000,
  },
  {
    name: '24kL/s: 252-265°C (4:2)',
    flow: 24000,
    hpt: 4,
    lpt: 2,
    tempMin: 252,
    tempMax: 265,
    powerMin: 292000000,
    powerMax: 299000000,
  },
  {
    name: '24kL/s: 265-269°C (4:3)',
    flow: 24000,
    hpt: 4,
    lpt: 3,
    tempMin: 265,
    tempMax: 269,
    powerMin: 300000000,
    powerMax: 302000000,
  },
  {
    name: '24kL/s: 270-281°C (4:4*)',
    flow: 24000,
    hpt: 4,
    lpt: 4,
    tempMin: 270,
    tempMax: 281,
    powerMin: 303000000,
    powerMax: 314000000,
  },
  {
    name: '24kL/s: 282-347°C (4:4)',
    flow: 24000,
    hpt: 4,
    lpt: 4,
    tempMin: 282,
    tempMax: 347,
    powerMin: 327000000,
    powerMax: 370000000,
  },
  {
    name: '24kL/s: 347-385°C (4:5)',
    flow: 24000,
    hpt: 4,
    lpt: 5,
    tempMin: 347,
    tempMax: 385,
    powerMin: 376000000,
    powerMax: 402000000,
  },
  {
    name: '24kL/s: >385°C (4:6)',
    flow: 24000,
    hpt: 4,
    lpt: 6,
    tempMin: 385,
    tempMax: 1000,
    powerMin: 404000000,
    powerMax: 404000000,
  },
];

// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const USE_PRESET = true;
const PRESET_INDEX = 0;

let INPUT_TEMP = 160;
let OUTPUT_TEMP = 80;
let HPT = 0;
let LPT = 1;
let HPS_FLOW = 6000;
let POWER_PRODUCTION = 38000000;

const STEAM_BYPASS = 0;
const GENERATOR_ENGAGEMENT = 100;

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

if (USE_PRESET) {
  const p = presets[PRESET_INDEX];
  HPT = p.hpt;
  LPT = p.lpt;
  HPS_FLOW = p.flow;

  INPUT_TEMP = clamp(INPUT_TEMP, p.tempMin, p.tempMax);
  OUTPUT_TEMP = INPUT_TEMP * 0.6;

  if (p.tempMax === p.tempMin || p.tempMax === 1000) {
    POWER_PRODUCTION = p.powerMin;
  } else {
    const ratio = (INPUT_TEMP - p.tempMin) / (p.tempMax - p.tempMin);
    POWER_PRODUCTION = p.powerMin + (p.powerMax - p.powerMin) * ratio;
  }
}

const customPower = POWER_PRODUCTION * (GENERATOR_ENGAGEMENT / 100) * ((100 - STEAM_BYPASS) / 100);

const inputCount = 1;
const iptCount = 1;
const lptCount = Math.max(1, LPT);
const generatorCount = 1;
const outputCount = 1;
const hptCount = Math.max(0, HPT);

const machineList = machines as Machine[];
const getCost = (id: string) => machineList.find((m) => m.id === id)?.cost ?? 0;

const totalCost =
  getCost('m_turbine_input') * inputCount +
  getCost('m_intermediate_pressure_turbine') * iptCount +
  getCost('m_low_pressure_turbine') * lptCount +
  getCost('m_turbine_generator') * generatorCount +
  getCost('m_turbine_output') * outputCount +
  getCost('m_high_pressure_turbine') * hptCount;

// ─── 3. EXPORT ───────────────────────────────────────────────────────
export interface Recipe {
  id: string;
  name: string;
  machine_id: string;
  cycle_time: number;
  power_consumption: number;
  power_type: 'MV' | 'HV';
  pollution: number;
  inputs: { product_id: string; quantity: number; temperature?: number }[];
  outputs: { product_id: string; quantity: number; temperature?: number }[];
}

const recipeName = USE_PRESET ? `Preset: ${presets[PRESET_INDEX].name}` : 'Custom Operation';

const recipes: Recipe[] = [
  {
    id: 'r_modular_turbine_01',
    name: recipeName,
    machine_id: 'm_modular_turbine',
    cycle_time: 1,
    power_consumption: -Math.floor(customPower),
    power_type: 'HV',
    pollution: 0,
    inputs: [
      {
        product_id: 'p_high_pressure_steam',
        quantity: HPS_FLOW,
        temperature: INPUT_TEMP,
      },
    ],
    outputs: [
      {
        product_id: 'p_low_pressure_steam',
        quantity: HPS_FLOW,
        temperature: OUTPUT_TEMP,
      },
    ],
  },
];

export {
  totalCost,
  inputCount,
  iptCount,
  lptCount,
  generatorCount,
  outputCount,
  hptCount,
  recipes,
};
