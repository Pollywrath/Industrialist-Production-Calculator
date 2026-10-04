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
        label: 'Can take a long time',
        timeRange: 'Minutes or longer on large plans',
        method: 'Recipe search with whole machines',
        priorityLevels,
        description:
          'Whole-machine counts require an integer search for each recipe plan. Large graphs and several priority levels can take much longer.',
      };
    }
    return {
      label: 'Slow',
      timeRange: 'Several minutes or longer',
      method: 'Recipe search with whole machines',
      priorityLevels,
      description:
        'Whole-machine counts require an integer search for each recipe plan. More complex plans take longer.',
    };
  }
  if (configuration.mode === 'autocomplete') {
    return {
      label: priorityLevels > 1 ? 'Can take longer' : 'Moderate',
      timeRange: priorityLevels > 1 ? 'Seconds to minutes' : 'A few seconds to minutes',
      method: 'Recipe search with fractional machines',
      priorityLevels,
      description:
        'Fractional counts avoid the whole-machine search, but autocomplete still compares recipe plans. Each priority level adds more work.',
    };
  }
  if (usesWholeMachineObjectives) {
    if (hasRepeatedWholeMachineSearch) {
      return {
        label: 'Slow',
        timeRange: 'A few minutes or longer',
        method: 'Current recipes with whole machines',
        priorityLevels,
        description:
          'The recipes stay as they are. Whole-machine counts and several priority levels add more integer searches.',
      };
    }
    return {
      label: 'Moderate',
      timeRange: 'A few seconds to minutes',
      method: 'Current recipes with whole machines',
      priorityLevels,
      description:
        'The recipes stay as they are. Exact cost, space, or model counts require comparing whole-machine combinations.',
    };
  }
  return {
    label: priorityLevels > 1 ? 'Quick to moderate' : 'Quick',
    timeRange: priorityLevels > 1 ? 'A few seconds' : 'Usually a few seconds',
    method: 'Current recipes with fractional machines',
    priorityLevels,
    description:
      priorityLevels > 1
        ? 'The recipes stay as they are. Each priority level adds another optimization pass.'
        : 'The recipes stay as they are, and fractional counts avoid the whole-machine search.',
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
    version: 4,
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
            {mode === 'autocomplete' ? 'Complete production chain' : 'Adjust machine counts'}
          </span>
          <p className={styles['configure-subtitle']}>
            Choose what to optimize. The solver reduces shortages and sink excess first.
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
            <strong>Adjust machine counts</strong>
            <span>Keep the recipes on the canvas.</span>
          </button>
          <button
            type="button"
            aria-pressed={mode === 'autocomplete'}
            data-active={mode === 'autocomplete'}
            onClick={() => setMode('autocomplete')}
          >
            <strong>Complete production (experimental)</strong>
            <span>Find upstream recipes for your targets.</span>
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
                <strong>Count whole machines</strong>
                <small>Round up counts for cost, space, and machine model count.</small>
              </span>
            </label>
            {machineCountBasis === 'continuous' && (
              <p>
                Fractional counts solve faster, but can understate the whole-machine totals shown on
                the dashboard.
              </p>
            )}
          </section>
        )}

        <section className={styles['solver-impact']} data-backend={validation.backend}>
          <div>
            <span>Estimated solve time</span>
            <strong>{solveImpact.label}</strong>
          </div>
          <dl className={styles['solver-impact-details']}>
            <dt>Usual range</dt>
            <dd>{solveImpact.timeRange}</dd>
            <dt>Method</dt>
            <dd>{solveImpact.method}</dd>
            <dt>Priorities</dt>
            <dd>
              {solveImpact.priorityLevels} {solveImpact.priorityLevels === 1 ? 'level' : 'levels'}
            </dd>
          </dl>
          <p>{solveImpact.description}</p>
          <small>This is a rough guide. Graph size and your device affect solve time.</small>
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
