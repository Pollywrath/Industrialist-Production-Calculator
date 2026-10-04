import { create } from 'zustand';
import {
  DEFAULT_OPTIMIZATION_MODE_CONFIGURATIONS,
  getDefaultOptimizationConfiguration,
  sanitizeOptimizationConfiguration,
  type OptimizationConfiguration,
  type OptimizationMetricConfig,
  type OptimizationMetricId,
  type OptimizationMode,
  type OptimizationModeConfiguration,
  type MachineCountBasis,
} from '../solver/optimizationConfig';

const STORAGE_KEY = 'industrialist_optimization_config_v4';
const LEGACY_STORAGE_KEYS = [
  'industrialist_optimization_config_v3',
  'industrialist_optimization_config_v2',
  'industrialist_optimization_config_v1',
] as const;

interface PersistedOptimizationConfiguration {
  version: 4;
  mode: OptimizationMode;
  modes: Record<OptimizationMode, OptimizationModeConfiguration>;
}

interface OptimizationConfigState extends OptimizationConfiguration {
  modeConfigurations: Record<OptimizationMode, OptimizationModeConfiguration>;
  setMode: (mode: OptimizationMode) => void;
  setMachineCountBasis: (basis: MachineCountBasis) => void;
  updateMetric: (id: OptimizationMetricId, update: Partial<OptimizationMetricConfig>) => void;
  reset: () => void;
}

function cloneDefaultModeConfigurations(): Record<OptimizationMode, OptimizationModeConfiguration> {
  return structuredClone(DEFAULT_OPTIMIZATION_MODE_CONFIGURATIONS);
}

function loadConfiguration(): Omit<
  OptimizationConfigState,
  'setMode' | 'setMachineCountBasis' | 'updateMetric' | 'reset'
> {
  const defaults = cloneDefaultModeConfigurations();
  try {
    let stored: string | null = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      for (const key of LEGACY_STORAGE_KEYS) {
        stored = localStorage.getItem(key);
        if (stored) break;
      }
    }
    if (!stored) {
      return {
        ...getDefaultOptimizationConfiguration('ratios'),
        modeConfigurations: defaults,
      };
    }

    const parsed = JSON.parse(stored) as Record<string, unknown>;
    const rawModes = parsed.modes as Record<string, Record<string, unknown>> | undefined;
    const modeConfigurations =
      parsed.version === 4 && rawModes
        ? {
            ratios: sanitizeOptimizationConfiguration({
              ...(rawModes.ratios ?? {}),
              mode: 'ratios',
            }),
            autocomplete: sanitizeOptimizationConfiguration({
              ...(rawModes.autocomplete ?? {}),
              mode: 'autocomplete',
            }),
          }
        : null;

    if (modeConfigurations) {
      const sanitizedModes: Record<OptimizationMode, OptimizationModeConfiguration> = {
        ratios: {
          machineCountBasis: modeConfigurations.ratios.machineCountBasis,
          metrics: modeConfigurations.ratios.metrics,
          metricOrder: modeConfigurations.ratios.metricOrder,
        },
        autocomplete: {
          machineCountBasis: modeConfigurations.autocomplete.machineCountBasis,
          metrics: modeConfigurations.autocomplete.metrics,
          metricOrder: modeConfigurations.autocomplete.metricOrder,
        },
      };
      const mode: OptimizationMode = parsed.mode === 'autocomplete' ? 'autocomplete' : 'ratios';
      return {
        version: 4,
        mode,
        ...sanitizedModes[mode],
        modeConfigurations: sanitizedModes,
      };
    }
    const ratios = sanitizeOptimizationConfiguration({ ...parsed, mode: 'ratios' });
    return {
      version: 4,
      mode: 'ratios',
      machineCountBasis: ratios.machineCountBasis,
      metrics: ratios.metrics,
      metricOrder: ratios.metricOrder,
      modeConfigurations: {
        ratios: {
          machineCountBasis: ratios.machineCountBasis,
          metrics: ratios.metrics,
          metricOrder: ratios.metricOrder,
        },
        autocomplete: defaults.autocomplete,
      },
    };
  } catch {
    return {
      ...getDefaultOptimizationConfiguration('ratios'),
      modeConfigurations: defaults,
    };
  }
}

function snapshot(state: OptimizationConfigState): OptimizationConfiguration {
  return {
    version: 4,
    mode: state.mode,
    machineCountBasis: state.machineCountBasis,
    metrics: state.metrics,
    metricOrder: state.metricOrder,
  };
}

function persistConfiguration(
  state: Pick<OptimizationConfigState, 'mode' | 'modeConfigurations'>,
): void {
  const stored: PersistedOptimizationConfiguration = {
    version: 4,
    mode: state.mode,
    modes: state.modeConfigurations,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);
  } catch {
    void 0;
  }
}

function withActiveModeConfiguration(
  state: OptimizationConfigState,
  mode: OptimizationMode,
  configuration: OptimizationModeConfiguration,
): Pick<
  OptimizationConfigState,
  'machineCountBasis' | 'metrics' | 'metricOrder' | 'modeConfigurations'
> {
  const modeConfigurations = {
    ...state.modeConfigurations,
    [mode]: configuration,
  };
  return { ...configuration, modeConfigurations };
}

const initial = loadConfiguration();

export const useOptimizationConfigStore = create<OptimizationConfigState>((set, get) => ({
  ...initial,
  setMode: (mode) => {
    const current = get();
    const next = {
      ...current,
      mode,
      ...current.modeConfigurations[mode],
    };
    set(next);
    persistConfiguration(next);
  },
  setMachineCountBasis: (machineCountBasis) => {
    const current = get();
    const configuration = { ...current.modeConfigurations[current.mode], machineCountBasis };
    const next = {
      ...current,
      ...withActiveModeConfiguration(current, current.mode, configuration),
    };
    set(next);
    persistConfiguration(next);
  },
  updateMetric: (id, update) => {
    const current = get();
    const sanitized = sanitizeOptimizationConfiguration({
      ...snapshot(current),
      metrics: {
        ...current.metrics,
        [id]: { ...current.metrics[id], ...update },
      },
    });
    const configuration = {
      machineCountBasis: current.machineCountBasis,
      metrics: sanitized.metrics,
      metricOrder: current.metricOrder,
    };
    const next = {
      ...current,
      ...withActiveModeConfiguration(current, current.mode, configuration),
    };
    set(next);
    persistConfiguration(next);
  },
  reset: () => {
    const defaults = cloneDefaultModeConfigurations();
    const next = {
      ...getDefaultOptimizationConfiguration('ratios'),
      modeConfigurations: defaults,
    };
    set(next);
    persistConfiguration(next);
  },
}));
