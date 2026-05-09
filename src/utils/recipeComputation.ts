import type { RateMode } from '../stores/useControlStore';

export {
  cleanMachineCount,
  cleanFlow,
  toPlainString,
  showQuantity,
  showCycleTime,
  showMachineCount,
} from './precision';

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
