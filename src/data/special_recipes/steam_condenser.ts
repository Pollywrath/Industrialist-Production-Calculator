import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { clamp } from '../../utils/precision';
import { formatTemperature } from '../../utils/unitFormatting';

const MAX_COOLANT_FLOW = 800;
const MAX_STEAM_FLOW = 24000;
const DEFAULT_STEAM_FLOW = MAX_STEAM_FLOW;

export interface CondenserSteadyStateResult {
  coolantFlow: number;
  steamFlow: number;
  actualSteamFlow: number;
  actualCondensate: number;
  tCoolant: number;
  tCoolantOutput: number;
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
  const f = MAX_COOLANT_FLOW;
  const q = Number.isFinite(steamFlow) ? clamp(steamFlow, 0, MAX_STEAM_FLOW) : 0;

  const a = f / 3000;
  const b = q / 360000;
  const D = a + b - a * b;

  const threshold = Math.max(40, Math.min(100, steamTemp / 2));

  let tCoolant = coolantTemp;
  let tCoolantOutput = coolantTemp;
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
      tCoolantOutput = tCondensate;
      actualSteamFlow = q;
      actualCondensate = q / 30;
      isCondensing = true;
    } else {
      tCoolant = coolantTemp;
      tCoolantOutput = coolantTemp;
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
    tCoolantOutput,
    tCondensate,
    isCondensing,
    threshold,
    hypCondensate,
  };
}

function getConfiguredSteamFlow(settings: Record<string, unknown>): number {
  return (settings.steam_flow as number) ?? DEFAULT_STEAM_FLOW;
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
      min: -273.15,
    },
    steam_temp: {
      type: 'number',
      label: 'Steam Temp (°C)',
      default: 198,
      min: -273.15,
    },
    steam_flow: {
      type: 'number',
      label: 'Input Steam Flow',
      default: DEFAULT_STEAM_FLOW,
      min: 0,
      max: 24000,
      step: 100,
      dynamicLabel: (settings) => {
        const coolantTemp = (settings.coolant_temp as number) ?? 21;
        const steamTemp = (settings.steam_temp as number) ?? 198;
        const steamFlow = getConfiguredSteamFlow(settings);

        const result = computeSteadyState(coolantTemp, steamTemp, steamFlow);
        if (result.isCondensing) {
          return `Input Steam Flow - Status: Condensing (Coolant Out: ${formatTemperature(result.tCoolantOutput)}, Condensate: ${formatTemperature(result.tCondensate)})`;
        } else {
          return `Input Steam Flow - Status: Condensation Shut Off (T_condensate ${formatTemperature(result.hypCondensate)} >= threshold ${formatTemperature(result.threshold)})`;
        }
      },
    },
  },
  compute: (settings) => {
    const coolantTemp = (settings.coolant_temp as number) ?? 21;
    const steamTemp = (settings.steam_temp as number) ?? 198;
    const steamFlow = getConfiguredSteamFlow(settings);

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
          product_link_id: 'coolant',
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
          temperature: result.tCoolantOutput,
          product_link_id: 'coolant',
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
