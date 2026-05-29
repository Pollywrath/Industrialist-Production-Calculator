export function cleanMachineCount(val: number): number {
  return Number(val.toFixed(12));
}

export function cleanFlow(val: number): number {
  if (val <= 0) return 0;
  const cleaned = Number(val.toFixed(10));
  return cleaned === 0 ? 1e-10 : cleaned;
}

export const EPSILON = 1e-11;

export function clampFlow(flow: number): number {
  return Math.abs(flow) < EPSILON ? 0 : Number(flow.toFixed(10));
}

export function toPlainString(num: number, maxDecimals: number): string {
  const fixed = num.toFixed(maxDecimals);
  if (num !== 0 && parseFloat(fixed) === 0) {
    return fixed.startsWith('-') ? fixed.slice(1) : fixed;
  }
  return fixed.replace(/\.?0+$/, '');
}
