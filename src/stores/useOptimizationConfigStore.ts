import { create } from 'zustand';
import {
  DEFAULT_OPTIMIZATION_CONFIGURATION,
  sanitizeOptimizationConfiguration,
  type OptimizationConfiguration,
  type OptimizationMetricConfig,
  type OptimizationMetricId,
  type OptimizationMode,
  type MachineCountBasis,
} from '../solver/optimizationConfig';

const STORAGE_KEY = 'industrialist_optimization_config_v3';
const LEGACY_STORAGE_KEYS = [
  'industrialist_optimization_config_v2',
  'industrialist_optimization_config_v1',
] as const;

interface OptimizationConfigState extends OptimizationConfiguration {
  setMode: (mode: OptimizationMode) => void;
  setMachineCountBasis: (basis: MachineCountBasis) => void;
  updateMetric: (id: OptimizationMetricId, update: Partial<OptimizationMetricConfig>) => void;
  reset: () => void;
}

function loadConfiguration(): OptimizationConfiguration {
  try {
    let stored = localStorage.getItem(STORAGE_KEY);
    for (const key of LEGACY_STORAGE_KEYS) stored ??= localStorage.getItem(key);
    return stored
      ? sanitizeOptimizationConfiguration(JSON.parse(stored))
      : structuredClone(DEFAULT_OPTIMIZATION_CONFIGURATION);
  } catch {
    return structuredClone(DEFAULT_OPTIMIZATION_CONFIGURATION);
  }
}

function persistConfiguration(configuration: OptimizationConfiguration): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configuration));
    for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);
  } catch {
    void 0;
  }
}

function snapshot(state: OptimizationConfigState): OptimizationConfiguration {
  return {
    version: 3,
    mode: state.mode,
    machineCountBasis: state.machineCountBasis,
    metrics: state.metrics,
    metricOrder: state.metricOrder,
  };
}

const initial = loadConfiguration();

export const useOptimizationConfigStore = create<OptimizationConfigState>((set, get) => ({
  ...initial,
  setMode: (mode) => {
    set({ mode });
    persistConfiguration(snapshot({ ...get(), mode }));
  },
  setMachineCountBasis: (machineCountBasis) => {
    set({ machineCountBasis });
    persistConfiguration(snapshot({ ...get(), machineCountBasis }));
  },
  updateMetric: (id, update) => {
    const current = get();
    const nextMetric = sanitizeOptimizationConfiguration({
      ...snapshot(current),
      metrics: {
        ...current.metrics,
        [id]: { ...current.metrics[id], ...update },
      },
    }).metrics[id];
    const metrics = { ...current.metrics, [id]: nextMetric };
    set({ metrics });
    persistConfiguration(snapshot({ ...get(), metrics }));
  },
  reset: () => {
    const next = structuredClone(DEFAULT_OPTIMIZATION_CONFIGURATION);
    persistConfiguration(next);
    set(next);
  },
}));
