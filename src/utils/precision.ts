export function cleanMachineCount(val: number): number {
  return Number(val.toFixed(12));
}

export function cleanFlow(val: number): number {
  if (val <= 0) return 0;
  const cleaned = Number(val.toFixed(10));
  return cleaned === 0 ? 1e-10 : cleaned;
}

export const EPSILON = 1e-11;
export const RATE_NUMERICAL_ZERO = 1e-12;
export const RATE_ABSOLUTE_TOLERANCE = 1e-12;
export const RATE_RELATIVE_TOLERANCE = 1e-9;
export const FLOW_STATUS_ABSOLUTE_TOLERANCE = 1e-6;
export const FLOW_STATUS_RELATIVE_TOLERANCE = 1e-12;
export const MACHINE_INTEGER_ABSOLUTE_TOLERANCE = 1e-7;
export const MACHINE_INTEGER_RELATIVE_TOLERANCE = Number.EPSILON * 8;

export function getMachineIntegerTolerance(value: number): number {
  if (!Number.isFinite(value)) return MACHINE_INTEGER_ABSOLUTE_TOLERANCE;
  return MACHINE_INTEGER_ABSOLUTE_TOLERANCE + Math.abs(value) * MACHINE_INTEGER_RELATIVE_TOLERANCE;
}

/** Preserve finite positive solver rates above the numerical-zero threshold. */
export function normalizeSolverRate(value: number): number {
  if (!Number.isFinite(value) || value <= RATE_NUMERICAL_ZERO) return 0;
  return Number(value.toPrecision(15));
}

export function getRateTolerance(required: number, supplied = 0): number {
  const scale = Math.max(Math.abs(required), Math.abs(supplied));
  return Math.max(RATE_ABSOLUTE_TOLERANCE, scale * RATE_RELATIVE_TOLERANCE);
}

export function getRateDeficit(required: number, supplied: number): number {
  return Math.max(0, normalizeSolverRate(required) - normalizeSolverRate(supplied));
}

export function getRateExcess(produced: number, routed: number): number {
  return Math.max(0, normalizeSolverRate(produced) - normalizeSolverRate(routed));
}

export function hasMeaningfulExcess(produced: number, routed: number): boolean {
  return getRateExcess(produced, routed) > getRateTolerance(produced, routed);
}

export function isPositiveSolverFlow(value: number | undefined): boolean {
  return value !== undefined && normalizeSolverRate(value) > 0;
}

export function isMachineCountNumericallyZero(value: number | undefined): boolean {
  return value === undefined || !Number.isFinite(value) || value <= RATE_NUMERICAL_ZERO;
}

export function isMachineCountNearInteger(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  return Math.abs(value - Math.round(value)) <= getMachineIntegerTolerance(value);
}

export function ceilMachineCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const nearestInteger = Math.round(value);
  if (Math.abs(value - nearestInteger) <= getMachineIntegerTolerance(value)) {
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

export function snapToReferenceIfNearlyEqual(
  reference: number,
  value: number,
  absoluteTolerance = FLOW_STATUS_ABSOLUTE_TOLERANCE,
  relativeTolerance = FLOW_STATUS_RELATIVE_TOLERANCE,
): number {
  return areNearlyEqual(reference, value, absoluteTolerance, relativeTolerance) ? reference : value;
}

export function hasMeaningfulDeficit(
  required: number,
  supplied: number,
  absoluteTolerance = FLOW_STATUS_ABSOLUTE_TOLERANCE,
  relativeTolerance = FLOW_STATUS_RELATIVE_TOLERANCE,
): boolean {
  if (required <= 0) return false;
  return (
    required - supplied >
    getScaledTolerance(required, supplied, absoluteTolerance, relativeTolerance)
  );
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, decimals = 0): number {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

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
