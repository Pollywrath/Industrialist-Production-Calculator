export type OptimizationMode = 'ratios' | 'autocomplete';
export type MachineCountBasis = 'whole' | 'continuous';

export type OptimizationMetricId =
  | 'powerUse'
  | 'pollution'
  | 'machineCost'
  | 'machineSpace'
  | 'modelCount';

export interface OptimizationMetricConfig {
  enabled: boolean;
  weight: number;
  tier: number;
}

export interface OptimizationModeConfiguration {
  machineCountBasis: MachineCountBasis;
  metrics: Record<OptimizationMetricId, OptimizationMetricConfig>;
  metricOrder: OptimizationMetricId[];
}

export interface OptimizationConfiguration extends OptimizationModeConfiguration {
  version: 4;
  mode: OptimizationMode;
}

export interface OptimizationMetricDefinition {
  id: OptimizationMetricId;
  label: string;
  description: string;
  direction: 'minimize' | 'maximize';
  rounded: boolean;
  currentRatioSupport: boolean;
}

export const MAX_OPTIMIZATION_TIERS = 3;

export const OPTIMIZATION_IMPORTANCE_PRESETS = [
  { value: 0.5, label: 'Low' },
  { value: 1, label: 'Normal' },
  { value: 2, label: 'High' },
  { value: 4, label: 'Very high' },
] as const;

export interface OptimizationConfigurationValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  backend: 'soplex_lp' | 'scip_milp';
}

export const OPTIMIZATION_NORMALIZERS: Record<OptimizationMetricId, number> = {
  powerUse: 1_000_000,
  pollution: 1,
  machineCost: 1_000_000,
  machineSpace: 100,
  modelCount: 10,
};

export const OPTIMIZATION_METRIC_DEFINITIONS: Record<
  OptimizationMetricId,
  OptimizationMetricDefinition
> = {
  powerUse: {
    id: 'powerUse',
    label: 'Power Use',
    description: 'Use less power.',
    direction: 'minimize',
    rounded: false,
    currentRatioSupport: true,
  },
  pollution: {
    id: 'pollution',
    label: 'Produced Pollution',
    description: 'Reduce pollution produced by recipes and flows.',
    direction: 'minimize',
    rounded: false,
    currentRatioSupport: true,
  },
  machineCost: {
    id: 'machineCost',
    label: 'Machine Cost',
    description: 'Spend less on machines.',
    direction: 'minimize',
    rounded: true,
    currentRatioSupport: true,
  },
  machineSpace: {
    id: 'machineSpace',
    label: 'Machine Space',
    description: 'Use fewer squares.',
    direction: 'minimize',
    rounded: true,
    currentRatioSupport: true,
  },
  modelCount: {
    id: 'modelCount',
    label: 'Machine Model Count',
    description: 'Use fewer models inferred from machines, connections, and power.',
    direction: 'minimize',
    rounded: true,
    currentRatioSupport: true,
  },
};

export const OPTIMIZATION_METRIC_IDS = Object.keys(
  OPTIMIZATION_METRIC_DEFINITIONS,
) as OptimizationMetricId[];

function metric(enabled: boolean, weight: number): OptimizationMetricConfig {
  return { enabled, weight, tier: 1 };
}

function createModeConfiguration(mode: OptimizationMode): OptimizationModeConfiguration {
  return {
    machineCountBasis: mode === 'autocomplete' ? 'continuous' : 'whole',
    metrics: {
      powerUse: metric(mode === 'ratios', 1),
      pollution: metric(mode === 'ratios', 1),
      machineCost: metric(false, 1),
      machineSpace: metric(mode === 'autocomplete', 1),
      modelCount: metric(mode === 'autocomplete', 1),
    },
    metricOrder: [...OPTIMIZATION_METRIC_IDS],
  };
}

export const DEFAULT_OPTIMIZATION_MODE_CONFIGURATIONS: Record<
  OptimizationMode,
  OptimizationModeConfiguration
> = {
  ratios: createModeConfiguration('ratios'),
  autocomplete: createModeConfiguration('autocomplete'),
};

export function getDefaultOptimizationConfiguration(
  mode: OptimizationMode,
): OptimizationConfiguration {
  return {
    version: 4,
    mode,
    ...structuredClone(DEFAULT_OPTIMIZATION_MODE_CONFIGURATIONS[mode]),
  };
}

export const DEFAULT_OPTIMIZATION_CONFIGURATION = getDefaultOptimizationConfiguration('ratios');

function nonnegativeFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function sanitizeImportance(value: unknown, fallback: number): number {
  const finite = nonnegativeFinite(value, fallback);
  let closest: number = OPTIMIZATION_IMPORTANCE_PRESETS[0].value;
  let distance = Math.abs(finite - closest);
  for (let index = 1; index < OPTIMIZATION_IMPORTANCE_PRESETS.length; index += 1) {
    const candidate = OPTIMIZATION_IMPORTANCE_PRESETS[index].value;
    const candidateDistance = Math.abs(finite - candidate);
    if (candidateDistance < distance) {
      closest = candidate;
      distance = candidateDistance;
    }
  }
  return closest;
}

function sanitizeMetric(
  raw: unknown,
  fallback: OptimizationMetricConfig,
): OptimizationMetricConfig {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const candidate = raw as Partial<Record<keyof OptimizationMetricConfig, unknown>>;
  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : fallback.enabled,
    weight: sanitizeImportance(candidate.weight, fallback.weight),
    tier: Math.min(
      MAX_OPTIMIZATION_TIERS,
      Math.max(1, Math.round(nonnegativeFinite(candidate.tier, fallback.tier))),
    ),
  };
}

function sanitizeModeConfiguration(
  raw: unknown,
  mode: OptimizationMode,
): OptimizationModeConfiguration {
  const fallback = DEFAULT_OPTIMIZATION_MODE_CONFIGURATIONS[mode];
  if (!raw || typeof raw !== 'object') return structuredClone(fallback);
  const candidate = raw as {
    machineCountBasis?: unknown;
    metrics?: Record<string, unknown>;
    metricOrder?: unknown;
  };
  const rawMetrics = candidate.metrics ?? {};
  const metrics = {} as Record<OptimizationMetricId, OptimizationMetricConfig>;
  for (const id of OPTIMIZATION_METRIC_IDS) {
    const legacyId = id === 'powerUse' ? 'powerConsumption' : id;
    metrics[id] = sanitizeMetric(rawMetrics[id] ?? rawMetrics[legacyId], fallback.metrics[id]);
  }

  const rawOrder = Array.isArray(candidate.metricOrder)
    ? candidate.metricOrder.map((id) => (id === 'powerConsumption' ? 'powerUse' : id))
    : [];
  const validOrder = rawOrder.filter(
    (id, index): id is OptimizationMetricId =>
      typeof id === 'string' &&
      OPTIMIZATION_METRIC_IDS.includes(id as OptimizationMetricId) &&
      rawOrder.indexOf(id) === index,
  );
  for (const id of OPTIMIZATION_METRIC_IDS) {
    if (!validOrder.includes(id)) validOrder.push(id);
  }

  return {
    machineCountBasis:
      candidate.machineCountBasis === 'continuous'
        ? 'continuous'
        : candidate.machineCountBasis === 'whole'
          ? 'whole'
          : fallback.machineCountBasis,
    metrics,
    metricOrder: validOrder,
  };
}

export function sanitizeOptimizationConfiguration(raw: unknown): OptimizationConfiguration {
  const candidate = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const mode: OptimizationMode = candidate.mode === 'autocomplete' ? 'autocomplete' : 'ratios';
  return {
    version: 4,
    mode,
    ...sanitizeModeConfiguration(candidate, mode),
  };
}

export function validateOptimizationConfiguration(
  configuration: OptimizationConfiguration,
): OptimizationConfigurationValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const enabled = configuration.metricOrder.filter((id) => configuration.metrics[id].enabled);

  if (enabled.length === 0) {
    warnings.push(
      'No configurable metrics are enabled; only the final machine-count tie-breaker will apply.',
    );
  }

  for (const id of enabled) {
    const setting = configuration.metrics[id];
    const definition = OPTIMIZATION_METRIC_DEFINITIONS[id];
    if (setting.weight <= 0) {
      warnings.push(`${definition.label} is enabled with zero weight.`);
    }
    if (!definition.currentRatioSupport && configuration.mode === 'ratios') {
      errors.push(`${definition.label} cannot be used for ratio optimization.`);
    }
  }

  const needsRoundedModel = enabled.some(
    (id) => OPTIMIZATION_METRIC_DEFINITIONS[id].rounded && configuration.metrics[id].weight > 0,
  );

  return {
    valid: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    backend:
      configuration.machineCountBasis === 'whole' && needsRoundedModel ? 'scip_milp' : 'soplex_lp',
  };
}
