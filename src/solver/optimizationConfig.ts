export type OptimizationMode = 'ratios' | 'autocomplete';

export type OptimizationMetricId =
  | 'powerUse'
  | 'powerOutput'
  | 'pollution'
  | 'machineCost'
  | 'machineSpace'
  | 'modelCount';

export interface OptimizationMetricConfig {
  enabled: boolean;
  weight: number;
  tier: number;
  limit: number | null;
  outputGoal: number | null;
}

export interface OptimizationConfiguration {
  version: 2;
  mode: OptimizationMode;
  metrics: Record<OptimizationMetricId, OptimizationMetricConfig>;
  metricOrder: OptimizationMetricId[];
}

export interface OptimizationMetricDefinition {
  id: OptimizationMetricId;
  label: string;
  description: string;
  direction: 'minimize' | 'maximize';
  rounded: boolean;
  currentRatioSupport: boolean;
  limitLabel: string;
}

export const MAX_OPTIMIZATION_TIERS = 3;

export interface OptimizationConfigurationValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  backend: 'soplex_lp' | 'scip_milp';
}

export const OPTIMIZATION_NORMALIZERS: Record<OptimizationMetricId, number> = {
  powerUse: 1_000_000,
  powerOutput: 1_000_000,
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
    limitLabel: 'Maximum',
  },
  powerOutput: {
    id: 'powerOutput',
    label: 'Power Output',
    description: 'Output power up to your goal.',
    direction: 'maximize',
    rounded: false,
    currentRatioSupport: true,
    limitLabel: 'Minimum',
  },
  pollution: {
    id: 'pollution',
    label: 'Pollution',
    description: 'Reduce net pollution.',
    direction: 'minimize',
    rounded: false,
    currentRatioSupport: true,
    limitLabel: 'Maximum',
  },
  machineCost: {
    id: 'machineCost',
    label: 'Machine Cost',
    description: 'Spend less on machines.',
    direction: 'minimize',
    rounded: true,
    currentRatioSupport: true,
    limitLabel: 'Maximum',
  },
  machineSpace: {
    id: 'machineSpace',
    label: 'Machine Space',
    description: 'Use fewer squares.',
    direction: 'minimize',
    rounded: true,
    currentRatioSupport: true,
    limitLabel: 'Maximum',
  },
  modelCount: {
    id: 'modelCount',
    label: 'Machine Model Count',
    description: 'Use fewer models inferred from machines, connections, and power.',
    direction: 'minimize',
    rounded: true,
    currentRatioSupport: true,
    limitLabel: 'Maximum',
  },
};

export const OPTIMIZATION_METRIC_IDS = Object.keys(
  OPTIMIZATION_METRIC_DEFINITIONS,
) as OptimizationMetricId[];

function metric(
  enabled: boolean,
  weight: number,
  overrides: Partial<OptimizationMetricConfig> = {},
): OptimizationMetricConfig {
  return {
    enabled,
    weight,
    tier: 1,
    limit: null,
    outputGoal: null,
    ...overrides,
  };
}

export const DEFAULT_OPTIMIZATION_CONFIGURATION: OptimizationConfiguration = {
  version: 2,
  mode: 'ratios',
  metrics: {
    powerUse: metric(true, 1),
    powerOutput: metric(false, 0.1),
    pollution: metric(true, 1),
    machineCost: metric(false, 1),
    machineSpace: metric(false, 1),
    modelCount: metric(false, 1),
  },
  metricOrder: [...OPTIMIZATION_METRIC_IDS],
};

function nonnegativeFinite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function nullableNonnegativeFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
}

function sanitizeMetric(
  raw: unknown,
  fallback: OptimizationMetricConfig,
): OptimizationMetricConfig {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const candidate = raw as Partial<Record<keyof OptimizationMetricConfig, unknown>> & {
    productionGoal?: unknown;
  };
  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : fallback.enabled,
    weight: nonnegativeFinite(candidate.weight, fallback.weight),
    tier: Math.min(
      MAX_OPTIMIZATION_TIERS,
      Math.max(1, Math.round(nonnegativeFinite(candidate.tier, fallback.tier))),
    ),
    limit: nullableNonnegativeFinite(candidate.limit),
    outputGoal: nullableNonnegativeFinite(candidate.outputGoal ?? candidate.productionGoal),
  };
}

export function sanitizeOptimizationConfiguration(raw: unknown): OptimizationConfiguration {
  if (!raw || typeof raw !== 'object') {
    return structuredClone(DEFAULT_OPTIMIZATION_CONFIGURATION);
  }

  const candidate = raw as {
    mode?: unknown;
    metrics?: Partial<
      Record<OptimizationMetricId | 'powerConsumption' | 'powerProduction', unknown>
    >;
    metricOrder?: unknown;
  };
  const rawMetrics = candidate.metrics;
  const migratedMetrics = rawMetrics
    ? {
        ...rawMetrics,
        powerUse: rawMetrics.powerUse ?? rawMetrics.powerConsumption,
        powerOutput: rawMetrics.powerOutput ?? rawMetrics.powerProduction,
      }
    : undefined;
  const metrics = {} as Record<OptimizationMetricId, OptimizationMetricConfig>;
  for (const id of OPTIMIZATION_METRIC_IDS) {
    metrics[id] = sanitizeMetric(
      migratedMetrics?.[id],
      DEFAULT_OPTIMIZATION_CONFIGURATION.metrics[id],
    );
  }

  const rawOrder = Array.isArray(candidate.metricOrder)
    ? candidate.metricOrder.map((id) => {
        if (id === 'powerConsumption') return 'powerUse';
        if (id === 'powerProduction') return 'powerOutput';
        return id;
      })
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
    version: 2,
    mode: candidate.mode === 'autocomplete' ? 'autocomplete' : 'ratios',
    metrics,
    metricOrder: validOrder,
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

  const powerOutput = configuration.metrics.powerOutput;
  if (powerOutput.enabled && powerOutput.outputGoal === null) {
    errors.push('Power Output needs a finite output goal before it can be rewarded safely.');
  }
  if (configuration.mode === 'autocomplete') {
    errors.push('Autocomplete recipe selection is coming soon and cannot be started yet.');
  }

  const needsRoundedModel = enabled.some(
    (id) =>
      OPTIMIZATION_METRIC_DEFINITIONS[id].rounded &&
      (configuration.metrics[id].weight > 0 || configuration.metrics[id].limit !== null),
  );

  return {
    valid: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    backend: configuration.mode === 'autocomplete' || needsRoundedModel ? 'scip_milp' : 'soplex_lp',
  };
}
