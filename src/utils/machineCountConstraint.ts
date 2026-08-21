import type {
  MachineCountConstraint,
  MachineCountConstraintKind,
  RecipeNodeData,
} from '../types/nodes';
import { cleanMachineCount } from './recipeComputation';

export type MachineCountConstraintMode = 'free' | MachineCountConstraintKind;

export function sanitizeMachineCountConstraint(value: unknown): MachineCountConstraint | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { kind?: unknown; value?: unknown };
  if (candidate.kind !== 'locked' && candidate.kind !== 'capped') return undefined;
  if (typeof candidate.value !== 'number' || !Number.isFinite(candidate.value)) return undefined;
  return {
    kind: candidate.kind,
    value: cleanMachineCount(Math.max(0, candidate.value)),
  };
}

export function createMachineCountConstraint(
  mode: MachineCountConstraintMode,
  value: number,
): MachineCountConstraint | undefined {
  if (mode === 'free') return undefined;
  return { kind: mode, value: cleanMachineCount(Math.max(0, value)) };
}

export function constrainMachineCount(data: RecipeNodeData, proposedCount: number): number {
  const cleaned = cleanMachineCount(Math.max(0, proposedCount));
  const constraint = sanitizeMachineCountConstraint(data.machineCountConstraint);
  if (!constraint) return cleaned;
  if (constraint.kind === 'locked') return constraint.value;
  return Math.min(cleaned, constraint.value);
}

export function getMachineCountBounds(data: RecipeNodeData): {
  lowerBound: number;
  upperBound: number | null;
} {
  const constraint = sanitizeMachineCountConstraint(data.machineCountConstraint);
  const targetLowerBound = data.isTarget ? Math.max(0, data.machineCount) : 0;
  if (!constraint) return { lowerBound: targetLowerBound, upperBound: null };
  if (constraint.kind === 'locked') {
    return { lowerBound: constraint.value, upperBound: constraint.value };
  }
  return {
    lowerBound: Math.min(targetLowerBound, constraint.value),
    upperBound: constraint.value,
  };
}
