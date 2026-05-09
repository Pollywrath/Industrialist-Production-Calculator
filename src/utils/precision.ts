// ── Snapping & Clamping ──────────────────────────────────────────────────────

export function snapToCleanFraction(val: number, tolerance = 5e-6): number {
  const allowedDenominators = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 30, 48, 60, 120];
  let bestVal = val;
  let bestDiff = Infinity;

  for (const d of allowedDenominators) {
    const n = Math.round(val * d);
    const candidate = n / d;
    const diff = Math.abs(val - candidate);
    if (diff < tolerance && diff < bestDiff) {
      bestDiff = diff;
      bestVal = candidate;
    }
  }

  return bestVal;
}

export function cleanMachineCount(val: number): number {
  const snapped = snapToCleanFraction(val, 5e-6);
  return Number(snapped.toFixed(12));
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

export function showQuantity(val: number): string {
  if (val === 0) return '0';
  const fixedStr = val.toFixed(4);
  if (Number(fixedStr) === 0) {
    return '0.0000';
  }
  return fixedStr.replace(/\.?0+$/, '');
}

export function showCycleTime(val: number): string {
  if (val === 0) return '0';
  const fixedStr = val.toFixed(2);
  if (Number(fixedStr) === 0) {
    return '0.00';
  }
  return fixedStr.replace(/\.?0+$/, '');
}

export function showMachineCount(val: number): string {
  if (val === 0) return '0';
  const fixedStr = val.toFixed(2);
  if (Number(fixedStr) === 0) {
    return '0.00';
  }
  return fixedStr.replace(/\.?0+$/, '');
}
