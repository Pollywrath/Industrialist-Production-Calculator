import type { RateMode } from '../types/ui';
import { cleanFlow, toPlainString, cleanMachineCount } from './precision';

export { cleanMachineCount, cleanFlow, toPlainString } from './precision';

export function getRateMultiplier(cycleTime: number, mode: RateMode): number {
  let multiplier = 1;
  if (mode === 'minute') {
    multiplier = 60;
  } else if (mode === 'hour') {
    multiplier = 3600;
  }

  if (mode !== 'raw') {
    return multiplier / cycleTime;
  }

  return multiplier;
}

export function getNormalizedCycleTime(cycleTime: number, mode: RateMode): number {
  switch (mode) {
    case 'second':
      return 1;
    case 'minute':
      return 60;
    case 'hour':
      return 3600;
    case 'raw':
    default:
      return cycleTime;
  }
}

import type { Recipe } from '../types/data';

export function computeQuantityMap(
  recipe: Recipe,
  inputs: number[],
  outputs: number[],
  machineCount: number,
  multiplier: number,
  excludeKey?: string,
  excludeValue?: string,
): Record<string, string> {
  const map: Record<string, string> = {};

  inputs.forEach((idx) => {
    const key = `input-${idx}`;
    if (key === excludeKey && excludeValue !== undefined) {
      map[key] = excludeValue;
    } else {
      const entry = recipe.inputs[idx];
      if (entry) {
        const baseQty = entry.quantity * multiplier;
        const scale = entry.independentOfMachineCount ? 1 : machineCount;
        map[key] = machineCount > 0 ? toPlainString(cleanFlow(baseQty * scale), 8) : '';
      }
    }
  });

  outputs.forEach((idx) => {
    const key = `output-${idx}`;
    if (key === excludeKey && excludeValue !== undefined) {
      map[key] = excludeValue;
    } else {
      const entry = recipe.outputs[idx];
      if (entry) {
        const baseQty = entry.quantity * multiplier;
        const scale = entry.independentOfMachineCount ? 1 : machineCount;
        map[key] = machineCount > 0 ? toPlainString(cleanFlow(baseQty * scale), 8) : '';
      }
    }
  });

  return map;
}

export function calculateMachineCountFromRate(
  targetRate: number,
  cycleTime: number,
  baseQuantity: number,
): number {
  if (baseQuantity <= 0) return 1;
  return cleanMachineCount((targetRate * cycleTime) / baseQuantity);
}
