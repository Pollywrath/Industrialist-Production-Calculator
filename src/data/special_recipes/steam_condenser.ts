import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { formatTemperature } from '../../utils/unitFormatting';

export interface CondenserSteadyStateResult {
  coolantFlow: number;
  steamFlow: number;
  actualSteamFlow: number;
  actualCondensate: number;
  tCoolant: number;
  tCondensate: number;
  isCondensing: boolean;
  threshold: number;
  hypCondensate: number;
}

export function computeSteadyState(
  coolantTemp: number,
  steamTemp: number,
  steamFlow: number,
): CondenserSteadyStateResult {
  const f = 800;
  const q = steamFlow;

  const a = f / 3000;
  const b = q / 360000;
  const D = a + b - a * b;

  const threshold = Math.max(40, Math.min(100, steamTemp / 2));

  let tCoolant = coolantTemp;
  let tCondensate = steamTemp;
  let actualSteamFlow = 0;
  let actualCondensate = 0;
  let isCondensing = false;
  let hypCondensate = coolantTemp;

  if (D > 0) {
    hypCondensate = (a * (1 - b) * coolantTemp + b * steamTemp) / D;
    if (hypCondensate < threshold) {
      tCoolant = (a * coolantTemp + b * (1 - a) * steamTemp) / D;
      tCondensate = hypCondensate;
      actualSteamFlow = q;
      actualCondensate = q / 30;
      isCondensing = true;
    } else {
      tCoolant = coolantTemp;
      tCondensate = steamTemp;
      actualSteamFlow = 0;
      actualCondensate = 0;
      isCondensing = false;
    }
  }

  return {
    coolantFlow: f,
    steamFlow: q,
    actualSteamFlow,
    actualCondensate,
    tCoolant,
    tCondensate,
    isCondensing,
    threshold,
    hypCondensate,
  };
}

export const steam_condenser_01: SpecialRecipe = {
  id: 'r_steam_condenser_01',
  name: 'Makes Distilled Water, Condensate',
  machine_id: 'm_steam_condenser',
  description: 'Condenses low pressure steam back into condensate using distilled water as a coolant. Operating window: condensate temp must stay below half of steam temp (clamped 40°C - 100°C).',
  potentialInputs: ['p_distilled_water', 'p_low_pressure_steam'],
  potentialOutputs: ['p_distilled_water', 'p_condensate'],
  inputTemperatureSettings: {
    0: 'coolant_temp',
    1: 'steam_temp',
  },
  settings: {
    coolant_temp: {
      type: 'number',
      label: 'Coolant Temp (°C)',
      default: 21,
    },
    steam_temp: {
      type: 'number',
      label: 'Steam Temp (°C)',
      default: 198,
    },
    steam_flow: {
      type: 'number',
      label: 'Steam Flow',
      default: 6000,
      min: 0,
      max: 24000,
      step: 100,
      dynamicLabel: (settings) => {
        const coolantTemp = (settings.coolant_temp as number) ?? 21;
        const steamTemp = (settings.steam_temp as number) ?? 198;
        const steamFlow = (settings.steam_flow as number) ?? 6000;

        const result = computeSteadyState(coolantTemp, steamTemp, steamFlow);
        if (result.isCondensing) {
          return `Steam Flow - Status: Condensing (Coolant Out: ${formatTemperature(result.tCoolant)}, Condensate: ${formatTemperature(result.tCondensate)})`;
        } else {
          return `Steam Flow - Status: Condensation Shut Off (T_condensate ${formatTemperature(result.hypCondensate)} >= threshold ${formatTemperature(result.threshold)})`;
        }
      },
    },
  },
  compute: (settings) => {
    const coolantTemp = (settings.coolant_temp as number) ?? 21;
    const steamTemp = (settings.steam_temp as number) ?? 198;
    const steamFlow = (settings.steam_flow as number) ?? 6000;

    const result = computeSteadyState(coolantTemp, steamTemp, steamFlow);

    const recipe: Recipe = {
      id: 'r_steam_condenser_01',
      name: 'Makes Distilled Water, Condensate',
      machine_id: 'm_steam_condenser',
      cycle_time: 1,
      power_consumption: 500000,
      power_type: 'MV',
      pollution: 0,
      inputs: [
        {
          product_id: 'p_distilled_water',
          quantity: result.coolantFlow,
        },
        {
          product_id: 'p_low_pressure_steam',
          quantity: result.actualSteamFlow,
        },
      ],
      outputs: [
        {
          product_id: 'p_distilled_water',
          quantity: result.coolantFlow,
          temperature: result.tCoolant,
        },
        {
          product_id: 'p_condensate',
          quantity: result.actualCondensate,
          temperature: result.tCondensate,
        },
      ],
    };

    return recipe;
  },
};
