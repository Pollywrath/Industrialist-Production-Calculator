import type { Recipe } from '../../types/data';
import type { SpecialRecipe } from '../../types/specialRecipes';
import { getMachine } from '../lookup';
import { formatPower, formatTemperature } from '../../utils/unitFormatting';
import { roundTo } from '../../utils/precision';

const STEAM_FLOW_CAPACITY = 24000;
const DEFAULT_SYNC_RPM = 3600;
const SYNC_RPM_DELTA_LIMIT = 5;
const NORMAL_SPINDOWN_RATE = 0.002;
const GENERATOR_INERTIA = 2000;
const IPT_INERTIA = 700;
const HPT_INERTIA = 1500;
const LPT_INERTIA = 1000;

export interface SteadyStateResult {
  steamFlow: number;
  bypassedFlow: number;
  turbineFlow: number;
  specificPower: number;
  hptTorque: number;
  lptTorque: number;
  totalTorque: number;
  rawPower: number;
  targetPower: number;
  currentPowerOutput: number;
  syncedPowerOutput: number;
  effectiveStages: { hpt: number; lpt: number };
  inertia: number;
  rpm: number;
  driveAcceleration: number;
  loadDrag: number;
  aerodynamicDrag: number;
  rpmChange: number;
  canSync: boolean;
  finalTemp: number;
  finalFlow: number;
}

export function computeSteadyState(
  inputSteam: number,
  inputTemperature: number,
  hptCount: number,
  lptCount: number,
  bypass: number,
  generatorClutch: number,
  gridMax: number = 500000000,
  gridBuffer: number = 0,
  rpm: number = DEFAULT_SYNC_RPM,
): SteadyStateResult {
  const steamFlow = Math.min(inputSteam, STEAM_FLOW_CAPACITY);
  const bypassedFlow = steamFlow * bypass;
  const turbineFlow = steamFlow * (1 - bypass);
  const specificPower = turbineFlow * 0.04 * (inputTemperature + 273) / 24000;

  let remainingFlow = turbineFlow;
  let remainingTemp = inputTemperature;
  let hptTorque = 0;
  let effectiveHPT = 0;

  for (let i = 0; i < hptCount; i++) {
    if (remainingTemp < 150) break;
    const stagePower = remainingFlow * 0.04 * (remainingTemp + 273) / 24000;
    if (stagePower > 11.1) {
      hptTorque += 5 * stagePower ** 1.8;
    } else if (stagePower > 10) {
      hptTorque += 5 * stagePower ** (20 / stagePower);
    } else {
      hptTorque += 5 * stagePower ** 2;
    }
    remainingFlow *= 0.7;
    remainingTemp *= 0.9;
    effectiveHPT++;
  }

  if (lptCount > 0) {
    if (remainingFlow * 0.04 * (remainingTemp + 273) / 48000 > 2) {
      remainingFlow = 96000 / (0.04 * (remainingTemp + 273));
    }
  }

  let lptTorque = 0;
  let effectiveLPT = 0;
  for (let i = 0; i < lptCount; i++) {
    if (remainingTemp < 150) break;
    lptTorque += (remainingFlow * 0.04 * (remainingTemp + 273) / 48000 * 10) ** 2;
    remainingFlow *= 0.8;
    remainingTemp *= 0.9;
    effectiveLPT++;
  }

  const totalTorque = hptTorque + lptTorque;
  const rawPower = totalTorque * 240;

  const targetPower = (rawPower * rpm / 10) * 1.1;
  const maxAvailable = gridMax - gridBuffer + 0.1;
  let syncedPowerOutput = Math.min(rawPower * rpm / 10, maxAvailable);
  syncedPowerOutput *= generatorClutch;

  const inertia =
    GENERATOR_INERTIA +
    IPT_INERTIA +
    HPT_INERTIA * Math.max(0, hptCount) +
    LPT_INERTIA * Math.max(0, lptCount);
  const safeInertia = Math.max(1, inertia);
  const driveAcceleration = rawPower / safeInertia;
  const baseDrag = Math.max(NORMAL_SPINDOWN_RATE * 2.5 * (rpm / 60) ** 2, 4);
  const loadDrag = baseDrag * (syncedPowerOutput / 120000000 + 1);
  const aerodynamicDrag = Math.exp(-0.001 * rpm) * 0.7 * rawPower / safeInertia;
  const rpmChange = driveAcceleration - loadDrag - aerodynamicDrag;
  const canSync = Math.abs(rpmChange) <= SYNC_RPM_DELTA_LIMIT;

  let currentPowerOutput = syncedPowerOutput;
  if (steamFlow < 6000) {
    currentPowerOutput *= steamFlow / 6000;
  }
  currentPowerOutput *= 1.1;

  return {
    steamFlow,
    bypassedFlow,
    turbineFlow,
    specificPower,
    hptTorque,
    lptTorque,
    totalTorque,
    rawPower,
    targetPower,
    currentPowerOutput,
    syncedPowerOutput,
    effectiveStages: { hpt: effectiveHPT, lpt: effectiveLPT },
    inertia,
    rpm,
    driveAcceleration,
    loadDrag,
    aerodynamicDrag,
    rpmChange,
    canSync,
    finalTemp: inputTemperature * 0.6,
    finalFlow: steamFlow,
  };
}

function formatSyncStatus(result: SteadyStateResult): string {
  const delta = roundTo(result.rpmChange, 2);
  return result.canSync
    ? `Can Sync (RPM change: ${delta}/tick)`
    : `Unsynced (RPM change: ${delta}/tick)`;
}

export const modular_turbine_01: SpecialRecipe = {
  id: 'r_modular_turbine_01',
  name: 'Modular Turbine',
  machine_id: 'm_modular_turbine',
  description: 'Modular steam turbine for high-capacity power generation. Input high pressure steam and configure turbine stages.',
  potentialInputs: ['p_high_pressure_steam'],
  potentialOutputs: ['p_low_pressure_steam'],
  inputTemperatureSettings: {
    0: 'input_temp',
  },
  settings: {
    input_flow: {
      type: 'number',
      label: 'Input Flow',
      default: 6000,
      min: 0,
      max: 24000,
      dynamicLabel: (settings) => {
        const inputFlow = (settings.input_flow as number) ?? 6000;
        const inputTemp = (settings.input_temp as number) ?? 330;
        const hptCount = (settings.hpt_count as number) ?? 1;
        const lptCount = (settings.lpt_count as number) ?? 5;
        const bypass = ((settings.steam_bypass as number) ?? 0) / 100;
        const generatorClutch = ((settings.generator_engagement as number) ?? 100) / 100;

        const result = computeSteadyState(inputFlow, inputTemp, hptCount, lptCount, bypass, generatorClutch);
        return result.canSync
          ? `Input Flow - Power: ${formatPower(result.currentPowerOutput)}`
          : `Input Flow - Unsynced: ${formatPower(0)}`;
      },
    },
    input_temp: {
      type: 'number',
      label: 'Input Temp (°C)',
      default: 330,
      min: -273.15,
      dynamicLabel: (settings) => {
        const inputTemp = (settings.input_temp as number) ?? 330;
        const finalTemp = roundTo(inputTemp * 0.6, 1);
        return `Input Temp - Output: ${formatTemperature(finalTemp)}`;
      },
    },
    hpt_count: {
      type: 'number',
      label: 'HPT Count',
      default: 1,
      min: 0,
      step: 1,
      dynamicLabel: (settings) => {
        const inputFlow = (settings.input_flow as number) ?? 6000;
        const inputTemp = (settings.input_temp as number) ?? 330;
        const hptCount = (settings.hpt_count as number) ?? 1;
        const lptCount = (settings.lpt_count as number) ?? 5;
        const bypass = ((settings.steam_bypass as number) ?? 0) / 100;
        const generatorClutch = ((settings.generator_engagement as number) ?? 100) / 100;

        const result = computeSteadyState(inputFlow, inputTemp, hptCount, lptCount, bypass, generatorClutch);
        return `HPT Count (Effective: ${result.effectiveStages.hpt})`;
      },
    },
    lpt_count: {
      type: 'number',
      label: 'LPT Count',
      default: 5,
      min: 1,
      step: 1,
      dynamicLabel: (settings) => {
        const inputFlow = (settings.input_flow as number) ?? 6000;
        const inputTemp = (settings.input_temp as number) ?? 330;
        const hptCount = (settings.hpt_count as number) ?? 1;
        const lptCount = (settings.lpt_count as number) ?? 5;
        const bypass = ((settings.steam_bypass as number) ?? 0) / 100;
        const generatorClutch = ((settings.generator_engagement as number) ?? 100) / 100;

        const result = computeSteadyState(inputFlow, inputTemp, hptCount, lptCount, bypass, generatorClutch);
        return `LPT Count (Effective: ${result.effectiveStages.lpt})`;
      },
    },
    steam_bypass: {
      type: 'number',
      label: 'Steam Bypass (%)',
      default: 0,
      min: 0,
      max: 100,
      step: 2.5,
    },
    generator_engagement: {
      type: 'number',
      label: 'Generator Engagement (%)',
      default: 100,
      min: 0,
      max: 100,
      step: 2.5,
      dynamicLabel: (settings) => {
        const inputFlow = (settings.input_flow as number) ?? 6000;
        const inputTemp = (settings.input_temp as number) ?? 330;
        const hptCount = (settings.hpt_count as number) ?? 1;
        const lptCount = (settings.lpt_count as number) ?? 5;
        const bypass = ((settings.steam_bypass as number) ?? 0) / 100;
        const generatorClutch = ((settings.generator_engagement as number) ?? 100) / 100;

        const result = computeSteadyState(inputFlow, inputTemp, hptCount, lptCount, bypass, generatorClutch);
        return `Generator Engagement - ${formatSyncStatus(result)}`;
      },
    },
  },
  compute: (settings) => {
    const inputFlow = (settings.input_flow as number) ?? 6000;
    const inputTemp = (settings.input_temp as number) ?? 330;
    const hptCount = (settings.hpt_count as number) ?? 1;
    const lptCount = (settings.lpt_count as number) ?? 5;
    const bypass = ((settings.steam_bypass as number) ?? 0) / 100;
    const generatorClutch = ((settings.generator_engagement as number) ?? 100) / 100;

    const result = computeSteadyState(inputFlow, inputTemp, hptCount, lptCount, bypass, generatorClutch);

    const recipe: Recipe = {
      id: 'r_modular_turbine_01',
      name: result.canSync ? `${hptCount} HPT - ${lptCount} LPT Turbine` : 'Unsynced',
      machine_id: 'm_modular_turbine',
      cycle_time: 1,
      power_consumption: result.canSync ? -Math.floor(result.currentPowerOutput) : 0,
      power_type: 'HV',
      pollution: 0,
      inputs: [
        {
          product_id: 'p_high_pressure_steam',
          quantity: roundTo(result.steamFlow, 1),
        },
      ],
      outputs: [
        {
          product_id: 'p_low_pressure_steam',
          quantity: roundTo(result.steamFlow, 1),
          temperature: result.finalTemp,
        },
      ],
    };

    return recipe;
  },
  computeMachineCost: (settings) => {
    const hptCount = (settings.hpt_count as number) ?? 1;
    const lptCount = (settings.lpt_count as number) ?? 5;

    const getCost = (id: string) => getMachine(id)?.cost ?? 0;

    const totalCost =
      getCost('m_turbine_input') * 1 +
      getCost('m_intermediate_pressure_turbine') * 1 +
      getCost('m_low_pressure_turbine') * Math.max(1, lptCount) +
      getCost('m_turbine_generator') * 1 +
      getCost('m_turbine_output') * 1 +
      getCost('m_high_pressure_turbine') * Math.max(0, hptCount);

    return totalCost;
  },
  computeModelCount: (settings) => {
    const hptCount = (settings.hpt_count as number) ?? 1;
    const lptCount = (settings.lpt_count as number) ?? 5;
    const inputFlow = (settings.input_flow as number) ?? 6000;

    const iptCount = 1;
    const generatorCount = 2;
    const inputOutputCount = inputFlow > 12000 ? 6 : 4;

    return hptCount + lptCount + iptCount + inputOutputCount + generatorCount;
  },
};
