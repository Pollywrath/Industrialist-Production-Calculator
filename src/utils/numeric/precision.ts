export function cleanMachineCount(val: number): number {
  return val;
}

export function cleanFlow(val: number): number {
  return normalizeSolverRate(val);
}

export const EPSILON = 1e-11;
export const RATE_NUMERICAL_ZERO = 1e-12;
export const RATE_ABSOLUTE_TOLERANCE = 1e-12;
export const RATE_RELATIVE_TOLERANCE = 1e-9;
export const FLOW_STATUS_ABSOLUTE_TOLERANCE = 1e-6;
export const FLOW_STATUS_RELATIVE_TOLERANCE = 1e-12;
export const MACHINE_INTEGER_ABSOLUTE_TOLERANCE = 0;
export const MACHINE_INTEGER_RELATIVE_TOLERANCE = Number.EPSILON * 8;
export const MACHINE_COUNT_RESULT_ABSOLUTE_TOLERANCE = 1e-10;
export const MACHINE_COUNT_RESULT_RELATIVE_TOLERANCE = Number.EPSILON * 8;

export function getMachineIntegerTolerance(value: number): number {
  if (!Number.isFinite(value)) return MACHINE_INTEGER_ABSOLUTE_TOLERANCE;
  return MACHINE_INTEGER_ABSOLUTE_TOLERANCE + Math.abs(value) * MACHINE_INTEGER_RELATIVE_TOLERANCE;
}

export function getMachineCountComparisonTolerance(left: number, right: number): number {
  const scale = Math.max(Math.abs(left), Math.abs(right));
  return Math.max(
    MACHINE_COUNT_RESULT_ABSOLUTE_TOLERANCE,
    scale * MACHINE_COUNT_RESULT_RELATIVE_TOLERANCE,
  );
}

export function hasMeaningfulMachineCountDifference(left: number, right: number): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return left !== right;
  return Math.abs(left - right) > getMachineCountComparisonTolerance(left, right);
}

export function normalizeSolverRate(value: number): number {
  if (!Number.isFinite(value) || value <= RATE_NUMERICAL_ZERO) return 0;
  return Number(value.toPrecision(15));
}

export function getRateTolerance(required: number, supplied = 0): number {
  const scale = Math.max(Math.abs(required), Math.abs(supplied));
  return Math.max(RATE_ABSOLUTE_TOLERANCE, scale * RATE_RELATIVE_TOLERANCE);
}

export function areRatesEquivalent(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= getRateTolerance(a, b);
}

export function getMeaningfulRateDelta(delta: number, left: number, right: number): number {
  return Math.abs(delta) > getRateTolerance(left, right) ? delta : 0;
}

function getPositiveDifference(minuend: number, subtrahend: number): number {
  return Math.max(0, normalizeSolverRate(minuend) - normalizeSolverRate(subtrahend));
}

export function getRateDeficit(required: number, supplied: number): number {
  return getPositiveDifference(required, supplied);
}

export function getRateExcess(produced: number, routed: number): number {
  return getPositiveDifference(produced, routed);
}

export function isPositiveSolverFlow(value: number | undefined): boolean {
  return value !== undefined && normalizeSolverRate(value) > 0;
}

export function isMachineCountNumericallyZero(value: number | undefined): boolean {
  return value === undefined || !Number.isFinite(value) || value <= RATE_NUMERICAL_ZERO;
}

export function ceilMachineCount(value: number): number {
  if (!Number.isFinite(value) || value <= RATE_NUMERICAL_ZERO) return 0;
  const nearestInteger = Math.round(value);
  if (nearestInteger > 0 && Math.abs(value - nearestInteger) <= getMachineIntegerTolerance(value)) {
    return nearestInteger;
  }
  return Math.ceil(value);
}

export function getScaledTolerance(
  a: number,
  b = 0,
  absoluteTolerance = FLOW_STATUS_ABSOLUTE_TOLERANCE,
  relativeTolerance = FLOW_STATUS_RELATIVE_TOLERANCE,
): number {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.max(absoluteTolerance, scale * relativeTolerance);
}

export function areNearlyEqual(
  a: number,
  b: number,
  absoluteTolerance = FLOW_STATUS_ABSOLUTE_TOLERANCE,
  relativeTolerance = FLOW_STATUS_RELATIVE_TOLERANCE,
): boolean {
  return Math.abs(a - b) <= getScaledTolerance(a, b, absoluteTolerance, relativeTolerance);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, decimals = 0): number {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

export function toPlainString(num: number, maxDecimals: number): string {
  const fixed = num.toFixed(maxDecimals);
  if (num !== 0 && parseFloat(fixed) === 0) {
    return fixed.startsWith('-') ? fixed.slice(1) : fixed;
  }
  return fixed.replace(/\.?0+$/, '');
}
