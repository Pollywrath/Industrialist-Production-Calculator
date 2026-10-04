import type { RateMode } from '../../types/ui';
import { cleanFlow, toPlainString, cleanMachineCount } from '../numeric/precision';

export { cleanMachineCount, cleanFlow, toPlainString } from '../numeric/precision';

const RATE_MODE_SCALE: Partial<Record<RateMode, number>> = {
  second: 1,
  minute: 60,
  hour: 3600,
};

export function getRateMultiplier(cycleTime: number, mode: RateMode): number {
  if (mode === 'raw') return 1;
  return (RATE_MODE_SCALE[mode] ?? 1) / cycleTime;
}

export function getNormalizedCycleTime(cycleTime: number, mode: RateMode): number {
  return RATE_MODE_SCALE[mode] ?? cycleTime;
}

import type { Recipe } from '../../types/data';

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
