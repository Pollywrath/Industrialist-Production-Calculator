// ── Precision & Clamping ──────────────────────────────────────────────────────

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

// ── Plain Output Formatting ──────────────────────────────────────────────────

export function toPlainString(num: number, maxDecimals: number): string {
  const fixed = num.toFixed(maxDecimals);
  return fixed.replace(/\.?0+$/, '');
}

function formatValueWithDecimals(val: number, decimals: number): string {
  if (val === 0) return '0';
  const fixedStr = val.toFixed(decimals);
  if (Number(fixedStr) === 0) {
    return '0.' + '0'.repeat(decimals);
  }
  return fixedStr.replace(/\.?0+$/, '');
}

export function showQuantity(val: number): string {
  return formatValueWithDecimals(val, 4);
}

export function showCycleTime(val: number): string {
  return formatValueWithDecimals(val, 2);
}

export function showMachineCount(val: number): string {
  return formatValueWithDecimals(val, 2);
}
