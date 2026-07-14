import { create } from 'zustand';
import {
  DEFAULT_OPTIMIZATION_CONFIGURATION,
  sanitizeOptimizationConfiguration,
  type OptimizationConfiguration,
  type OptimizationMetricConfig,
  type OptimizationMetricId,
  type OptimizationMode,
} from '../solver/optimizationConfig';

const STORAGE_KEY = 'industrialist_optimization_config_v2';
const LEGACY_STORAGE_KEY = 'industrialist_optimization_config_v1';

interface OptimizationConfigState extends OptimizationConfiguration {
  setMode: (mode: OptimizationMode) => void;
  updateMetric: (id: OptimizationMetricId, update: Partial<OptimizationMetricConfig>) => void;
  moveMetric: (id: OptimizationMetricId, direction: -1 | 1) => void;
  reset: () => void;
}

function loadConfiguration(): OptimizationConfiguration {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
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
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    void 0;
  }
}

function snapshot(state: OptimizationConfigState): OptimizationConfiguration {
  return {
    version: 2,
    mode: state.mode,
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
  moveMetric: (id, direction) => {
    const current = get();
    const movingMetric = current.metrics[id];
    const visibleTierMetrics = current.metricOrder.filter(
      (candidateId) =>
        current.metrics[candidateId].enabled &&
        current.metrics[candidateId].tier === movingMetric.tier,
    );
    const visibleIndex = visibleTierMetrics.indexOf(id);
    const adjacentId = visibleTierMetrics[visibleIndex + direction];
    if (visibleIndex < 0 || !adjacentId) return;

    const index = current.metricOrder.indexOf(id);
    const target = current.metricOrder.indexOf(adjacentId);
    const metricOrder = [...current.metricOrder];
    [metricOrder[index], metricOrder[target]] = [metricOrder[target], metricOrder[index]];
    set({ metricOrder });
    persistConfiguration(snapshot({ ...get(), metricOrder }));
  },
  reset: () => {
    const next = structuredClone(DEFAULT_OPTIMIZATION_CONFIGURATION);
    persistConfiguration(next);
    set(next);
  },
}));
