// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const STEAM_TEMP: number = 200;

// ─── DATA TABLES ──────────────────────────────────────────────────
const powerSteps = [
  [100, 432],
  [113, 2690],
  [116, 2769],
  [117, 2816],
  [118, 2878],
  [150, 4761],
  [170, 5202],
  [180, 5487],
  [190, 5791],
  [200, 6080],
  [312, 9046],
  [320, 9360],
];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────

const getInterpolatedPower = (temp: number) => {
  if (temp <= powerSteps[0][0]) return powerSteps[0][1];

  let lastRange = powerSteps[0];
  for (let i = 1; i < powerSteps.length; i++) {
    const v = powerSteps[i];
    if (temp <= v[0]) {
      const interpolation = (temp - lastRange[0]) / (v[0] - lastRange[0]);
      return lastRange[1] + (v[1] - lastRange[1]) * interpolation;
    }
    lastRange = v;
  }
  return lastRange[1];
};

const actualPowerProduction = Math.floor(getInterpolatedPower(STEAM_TEMP));
const waterOutputTemp = Math.floor(clamp(STEAM_TEMP / 3, 40, 99));

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

const recipes: Recipe[] = [
  {
    id: 'r_steam_turbine_01',
    name: 'Steam Turbine Power Generation',
    machine_id: 'm_steam_turbine',
    cycle_time: 1,
    power_consumption: -actualPowerProduction,
    power_type: 'MV',
    pollution: 0,
    inputs: [{ product_id: 'p_steam', quantity: 3, temperature: STEAM_TEMP }],
    outputs: [{ product_id: 'p_water', quantity: 0.1, temperature: waterOutputTemp }],
  },
];

export { actualPowerProduction, waterOutputTemp, recipes };
