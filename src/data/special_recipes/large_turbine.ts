// ─── 1. SETTINGS / VARIABLES ─────────────────────────────────────────
const STEAM_TEMP: number = 300;

// ─── DATA TABLES ──────────────────────────────────────────────────
const powerSteps = [
  [0, 0, 1],
  [100, 2000, 1800],
  [110, 2001, 1801],
  [150, 4000, 3600],
  [155, 4001, 3601],
  [300, 7500, 4000],
  [400, 7800, 4001],
  [50000, 7801, 4001],
];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ─── 2. COMPUTATIONS ─────────────────────────────────────────────────

const getInterpolated = (temp: number) => {
  if (temp <= powerSteps[0][0]) return { power: powerSteps[0][1], rpm: powerSteps[0][2] };

  let lastRange = powerSteps[0];
  for (let i = 1; i < powerSteps.length; i++) {
    const v = powerSteps[i];
    if (temp <= v[0]) {
      const interpolation = (temp - lastRange[0]) / (v[0] - lastRange[0]);
      return {
        power: lastRange[1] + (v[1] - lastRange[1]) * interpolation,
        rpm: lastRange[2] + (v[2] - lastRange[2]) * interpolation,
      };
    }
    lastRange = v;
  }
  return { power: lastRange[1], rpm: lastRange[2] };
};

const interpolated = getInterpolated(STEAM_TEMP);
const targetPower = interpolated.power;
const targetRPM = Math.max(1, interpolated.rpm);

const powerPerTick = (targetPower * (targetRPM + 1)) / targetRPM + targetPower;
const actualPowerProduction = Math.floor(powerPerTick * 33);

const waterOutputTemp = clamp(STEAM_TEMP / 3, 40, 99);

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
    id: 'r_large_turbine_01',
    name: 'Makes Power. Makes Water',
    machine_id: 'm_large_turbine',
    cycle_time: 1,
    power_consumption: -actualPowerProduction,
    power_type: 'MV',
    pollution: 0,
    inputs: [{ product_id: 'p_steam', quantity: 90, temperature: STEAM_TEMP }],
    outputs: [{ product_id: 'p_water', quantity: 3, temperature: waterOutputTemp }],
  },
];

export { actualPowerProduction, waterOutputTemp, recipes };
