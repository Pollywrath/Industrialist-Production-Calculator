import { RotateCcw } from 'lucide-react';
import {
  MAX_OPTIMIZATION_TIERS,
  OPTIMIZATION_IMPORTANCE_PRESETS,
  OPTIMIZATION_METRIC_DEFINITIONS,
  validateOptimizationConfiguration,
  type OptimizationConfiguration,
} from '../../../solver/optimizationConfig';
import { useOptimizationConfigStore } from '../../../stores/useOptimizationConfigStore';
import styles from './LPSolverOverlay.module.css';

interface OptimizationConfigurePanelProps {
  onClose: () => void;
  onStart: (configuration: OptimizationConfiguration) => void;
}

function nullableNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function getSolveImpact(configuration: OptimizationConfiguration): {
  label: string;
  timeRange: string;
  method: string;
  priorityLevels: number;
  description: string;
} {
  const enabledMetrics = configuration.metricOrder.filter(
    (id) => configuration.metrics[id].enabled && configuration.metrics[id].weight > 0,
  );
  const priorityLevels = new Set(enabledMetrics.map((id) => configuration.metrics[id].tier)).size;
  const wholeMachineMetrics = enabledMetrics.filter(
    (id) => OPTIMIZATION_METRIC_DEFINITIONS[id].rounded,
  );
  const wholeMachinePriorityLevels = new Set(
    wholeMachineMetrics.map((id) => configuration.metrics[id].tier),
  ).size;
  const usesWholeMachineObjectives =
    wholeMachineMetrics.length > 0 && configuration.machineCountBasis === 'whole';
  const hasRepeatedWholeMachineSearch = wholeMachinePriorityLevels > 1;

  if (configuration.mode === 'autocomplete' && usesWholeMachineObjectives) {
    if (hasRepeatedWholeMachineSearch) {
      return {
        label: 'Potentially extreme',
        timeRange: 'Could take hours',
        method: 'Recipe search with exact full machines',
        priorityLevels,
        description:
          'App has to search using rounded up machine counts, this is the range of MILP, which takes a while to solve. Difficult plans can take much longer than this range. Recommended to disable counting full machines',
      };
    }
    return {
      label: 'Very slow',
      timeRange: '20 minutes or more',
      method: 'Recipe search with exact full machines',
      priorityLevels,
      description:
        'App has to search using rounded up machine counts, this is the range of MILP, which takes a while to solve. May take longer with more complex recipes. Recommended to disable counting full machines',
    };
  }
  if (configuration.mode === 'autocomplete') {
    return {
      label: priorityLevels > 1 ? 'Moderate to slow' : 'Moderate',
      timeRange: priorityLevels > 1 ? 'Seconds to several minutes' : 'Seconds to a few minutes',
      method: 'Recipe search with fractional machines',
      priorityLevels,
      description:
        'Fractional accounting avoids the expensive whole-machine search, but the app must still compare many possible recipes. More priorities repeat parts of that work.',
    };
  }
  if (usesWholeMachineObjectives) {
    if (hasRepeatedWholeMachineSearch) {
      return {
        label: 'Slow',
        timeRange: 'A few minutes or longer',
        method: 'Current recipes with exact full machines',
        priorityLevels,
        description:
          'Existing recipes are kept, but several whole-machine preferences or priority levels can require repeated searches through integer combinations.',
      };
    }
    return {
      label: 'Moderate',
      timeRange: 'Seconds to a few minutes',
      method: 'Current recipes with exact full machines',
      priorityLevels,
      description:
        'Existing recipes are kept, but exact costs, space, or model counts require comparing whole-machine combinations.',
    };
  }
  return {
    label: priorityLevels > 1 ? 'Quick to moderate' : 'Quick',
    timeRange: priorityLevels > 1 ? 'A few seconds' : 'Usually under a few seconds',
    method: 'Current recipes with fractional machines',
    priorityLevels,
    description:
      priorityLevels > 1
        ? 'The app keeps the current recipes and uses fast fractional calculations, but each priority level adds another optimization pass.'
        : 'The app keeps the current recipes and uses fast fractional calculations without searching whole-machine combinations.',
  };
}

export function OptimizationConfigurePanel({ onClose, onStart }: OptimizationConfigurePanelProps) {
  const mode = useOptimizationConfigStore((state) => state.mode);
  const setMode = useOptimizationConfigStore((state) => state.setMode);
  const machineCountBasis = useOptimizationConfigStore((state) => state.machineCountBasis);
  const setMachineCountBasis = useOptimizationConfigStore((state) => state.setMachineCountBasis);
  const metrics = useOptimizationConfigStore((state) => state.metrics);
  const metricOrder = useOptimizationConfigStore((state) => state.metricOrder);
  const updateMetric = useOptimizationConfigStore((state) => state.updateMetric);
  const reset = useOptimizationConfigStore((state) => state.reset);
  const configuration: OptimizationConfiguration = {
    version: 3,
    mode,
    machineCountBasis,
    metrics,
    metricOrder,
  };
  const validation = validateOptimizationConfiguration(configuration);
  const solveImpact = getSolveImpact(configuration);
  const hasCountBasedObjective = metricOrder.some(
    (id) => metrics[id].enabled && OPTIMIZATION_METRIC_DEFINITIONS[id].rounded,
  );

  return (
    <div className={styles['configure-container']}>
      <div className={styles['modal-header']}>
        <div>
          <span className={styles['modal-title']}>
            {mode === 'autocomplete'
              ? 'Complete Production (Experimental)'
              : 'Optimize Production Ratios'}
          </span>
          <p className={styles['configure-subtitle']}>
            Choose what matters most. Shortages and connected sink excess are handled first.
          </p>
        </div>
        <button type="button" className={styles['header-reset-button']} onClick={reset}>
          <RotateCcw size={13} /> Reset
        </button>
      </div>

      <div className={styles['configure-content']}>
        <div className={styles['optimization-mode-picker']}>
          <button
            type="button"
            aria-pressed={mode === 'ratios'}
            data-active={mode === 'ratios'}
            onClick={() => setMode('ratios')}
          >
            <strong>Adjust ratios</strong>
            <span>Keep current recipes.</span>
          </button>
          <button
            type="button"
            aria-pressed={mode === 'autocomplete'}
            data-active={mode === 'autocomplete'}
            onClick={() => setMode('autocomplete')}
          >
            <strong>Autocomplete (Experimental)</strong>
            <span>Add missing recipes.</span>
          </button>
        </div>

        <div className={styles['simple-objective-list']}>
          {metricOrder.map((id) => {
            const definition = OPTIMIZATION_METRIC_DEFINITIONS[id];
            const setting = metrics[id];
            return (
              <div
                className={styles['simple-objective-row']}
                data-enabled={setting.enabled}
                key={id}
              >
                <label className={styles['simple-objective-toggle']}>
                  <input
                    type="checkbox"
                    checked={setting.enabled}
                    onChange={(event) => updateMetric(id, { enabled: event.target.checked })}
                  />
                  <span>
                    <strong>{definition.label}</strong>
                    <small>{definition.description}</small>
                  </span>
                </label>
                <label className={styles['simple-objective-control']}>
                  <span>Importance</span>
                  <select
                    value={setting.weight}
                    disabled={!setting.enabled}
                    onChange={(event) => updateMetric(id, { weight: Number(event.target.value) })}
                  >
                    {OPTIMIZATION_IMPORTANCE_PRESETS.map((preset) => (
                      <option value={preset.value} key={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles['simple-objective-control']}>
                  <span>Priority</span>
                  <select
                    value={setting.tier}
                    disabled={!setting.enabled}
                    onChange={(event) => updateMetric(id, { tier: Number(event.target.value) })}
                  >
                    {Array.from({ length: MAX_OPTIMIZATION_TIERS }, (_, index) => index + 1).map(
                      (value) => (
                        <option value={value} key={value}>
                          {value}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                {id === 'powerOutput' && setting.enabled && (
                  <label className={styles['power-output-target']}>
                    <span>Output target</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={setting.outputGoal ?? ''}
                      placeholder="Required"
                      onChange={(event) =>
                        updateMetric(id, { outputGoal: nullableNumber(event.target.value) })
                      }
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>

        {hasCountBasedObjective && (
          <section className={styles['machine-accounting-option']}>
            <label>
              <input
                type="checkbox"
                checked={machineCountBasis === 'whole'}
                onChange={(event) =>
                  setMachineCountBasis(event.target.checked ? 'whole' : 'continuous')
                }
              />
              <span>
                <strong>Count full machines</strong>
                <small>Use rounded-up counts for cost, space, and machine models.</small>
              </span>
            </label>
            {machineCountBasis === 'continuous' && (
              <p>
                Faster, but fractional machines are charged fractionally. This can underestimate the
                real cost, space, and model count shown by the dashboard.
              </p>
            )}
          </section>
        )}

        <section className={styles['solver-impact']} data-backend={validation.backend}>
          <div>
            <span>Expected solve time</span>
            <strong>{solveImpact.label}</strong>
          </div>
          <dl className={styles['solver-impact-details']}>
            <dt>Typical range</dt>
            <dd>{solveImpact.timeRange}</dd>
            <dt>Method</dt>
            <dd>{solveImpact.method}</dd>
            <dt>Priorities</dt>
            <dd>
              {solveImpact.priorityLevels} {solveImpact.priorityLevels === 1 ? 'level' : 'levels'}
            </dd>
          </dl>
          <p>{solveImpact.description}</p>
          <small>
            Rough guide only. Canvas size, recipe choices, and device speed can vary it.
          </small>
        </section>

        {(validation.errors.length > 0 || validation.warnings.length > 0) && (
          <div className={styles['config-validation']}>
            {validation.errors.map((error) => (
              <div className={styles['validation-error']} key={error}>
                {error}
              </div>
            ))}
            {validation.warnings.map((warning) => (
              <div className={styles['validation-warning']} key={warning}>
                {warning}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles['modal-footer']}>
        <button type="button" className={styles['action-btn-neutral']} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={styles['action-btn-primary']}
          disabled={!validation.valid}
          onClick={() => onStart(configuration)}
        >
          {mode === 'autocomplete' ? 'Build Plan' : 'Optimize'}
        </button>
      </div>
    </div>
  );
}
