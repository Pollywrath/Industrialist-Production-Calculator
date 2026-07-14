import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, RotateCcw, X } from 'lucide-react';
import {
  MAX_OPTIMIZATION_TIERS,
  OPTIMIZATION_METRIC_DEFINITIONS,
  validateOptimizationConfiguration,
  type OptimizationConfiguration,
  type OptimizationMetricId,
} from '../../../solver/optimizationConfig';
import { useOptimizationConfigStore } from '../../../stores/useOptimizationConfigStore';
import { ValidatedNumberInput } from '../../shared/ValidatedNumberInput';
import styles from './LPSolverOverlay.module.css';

interface OptimizationConfigurePanelProps {
  onClose: () => void;
  onStart: (configuration: OptimizationConfiguration) => void;
}

const IMPORTANCE_PRESETS = [
  { value: 0.5, label: 'Low' },
  { value: 1, label: 'Balanced' },
  { value: 2, label: 'High' },
  { value: 4, label: 'Very high' },
] as const;

function nullableNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function importanceValue(weight: number): string {
  return IMPORTANCE_PRESETS.some((preset) => preset.value === weight) ? String(weight) : 'custom';
}

export function OptimizationConfigurePanel({ onClose, onStart }: OptimizationConfigurePanelProps) {
  const [isObjectivePickerOpen, setIsObjectivePickerOpen] = useState(false);
  const mode = useOptimizationConfigStore((state) => state.mode);
  const metrics = useOptimizationConfigStore((state) => state.metrics);
  const metricOrder = useOptimizationConfigStore((state) => state.metricOrder);
  const updateMetric = useOptimizationConfigStore((state) => state.updateMetric);
  const moveMetric = useOptimizationConfigStore((state) => state.moveMetric);
  const reset = useOptimizationConfigStore((state) => state.reset);
  const configuration: OptimizationConfiguration = { version: 2, mode, metrics, metricOrder };
  const validation = validateOptimizationConfiguration(configuration);
  const enabledMetricIds = metricOrder.filter((id) => metrics[id].enabled);
  const availableMetricIds = metricOrder.filter((id) => !metrics[id].enabled);

  const addObjective = (id: OptimizationMetricId) => {
    updateMetric(id, { enabled: true });
    setIsObjectivePickerOpen(false);
  };

  return (
    <div className={styles['configure-container']}>
      <div className={styles['modal-header']}>
        <div>
          <span className={styles['modal-title']}>Optimize Production Ratios</span>
          <p className={styles['configure-subtitle']}>Choose what a good production plan means.</p>
        </div>
        <button type="button" className={styles['header-reset-button']} onClick={reset}>
          <RotateCcw size={13} /> Reset
        </button>
      </div>

      <div className={styles['configure-content']}>
        <div className={styles['priority-explanation']}>
          Objectives in the same priority trade off together. A lower priority cannot make a higher
          one worse.
        </div>

        {Array.from({ length: MAX_OPTIMIZATION_TIERS }, (_, index) => index + 1).map((tier) => {
          const tierMetricIds = enabledMetricIds.filter((id) => metrics[id].tier === tier);
          if (
            tier > 1 &&
            tierMetricIds.length === 0 &&
            tier > Math.max(1, ...enabledMetricIds.map((id) => metrics[id].tier))
          ) {
            return null;
          }

          return (
            <section className={styles['priority-group']} key={tier}>
              <div className={styles['priority-heading']}>
                <strong>Priority {tier}</strong>
                <span>{tier === 1 ? 'Optimized first' : `After Priority ${tier - 1}`}</span>
              </div>

              {tierMetricIds.length === 0 ? (
                <div className={styles['priority-empty']}>No objectives at this priority.</div>
              ) : (
                <div className={styles['objective-builder-list']}>
                  {tierMetricIds.map((id) => {
                    const definition = OPTIMIZATION_METRIC_DEFINITIONS[id];
                    const setting = metrics[id];
                    const orderIndex = tierMetricIds.indexOf(id);
                    const selectedImportance = importanceValue(setting.weight);

                    return (
                      <article className={styles['objective-builder-row']} key={id}>
                        <div className={styles['objective-builder-main']}>
                          <div className={styles['objective-builder-name']}>
                            <strong>{definition.label}</strong>
                            <span>{definition.description}</span>
                          </div>
                          <div className={styles['objective-row-actions']}>
                            <button
                              type="button"
                              aria-label={`Move ${definition.label} up`}
                              onClick={() => moveMetric(id, -1)}
                              disabled={orderIndex === 0}
                            >
                              <ChevronUp size={13} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${definition.label} down`}
                              onClick={() => moveMetric(id, 1)}
                              disabled={orderIndex === tierMetricIds.length - 1}
                            >
                              <ChevronDown size={13} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove ${definition.label}`}
                              onClick={() => updateMetric(id, { enabled: false })}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>

                        <div className={styles['objective-builder-controls']}>
                          <label className={styles['inline-expanding-control']}>
                            <span>Importance</span>
                            <div>
                              <select
                                value={selectedImportance}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  updateMetric(id, {
                                    weight: value === 'custom' ? 3 : Number(value),
                                  });
                                }}
                              >
                                {IMPORTANCE_PRESETS.map((preset) => (
                                  <option value={preset.value} key={preset.value}>
                                    {preset.label}
                                  </option>
                                ))}
                                <option value="custom">Custom</option>
                              </select>
                              {selectedImportance === 'custom' && (
                                <ValidatedNumberInput
                                  value={setting.weight}
                                  onChange={(weight) => updateMetric(id, { weight })}
                                  defaultValue={1}
                                  min={0}
                                  allowNegatives={false}
                                  allowDecimals={true}
                                  className={styles['config-number-input']}
                                />
                              )}
                            </div>
                          </label>
                          <label>
                            <span>Priority</span>
                            <select
                              value={setting.tier}
                              onChange={(event) =>
                                updateMetric(id, { tier: Number(event.target.value) })
                              }
                            >
                              {Array.from(
                                { length: MAX_OPTIMIZATION_TIERS },
                                (_, index) => index + 1,
                              ).map((value) => (
                                <option value={value} key={value}>
                                  Priority {value}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className={styles['inline-expanding-control']}>
                            <span>{definition.limitLabel} limit</span>
                            <div>
                              <select
                                value={setting.limit === null ? 'none' : 'set'}
                                onChange={(event) =>
                                  updateMetric(id, {
                                    limit: event.target.value === 'none' ? null : 0,
                                  })
                                }
                              >
                                <option value="none">No limit</option>
                                <option value="set">Set limit</option>
                              </select>
                              {setting.limit !== null && (
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={setting.limit}
                                  onChange={(event) =>
                                    updateMetric(id, {
                                      limit: nullableNumber(event.target.value) ?? 0,
                                    })
                                  }
                                />
                              )}
                            </div>
                          </label>
                          {id === 'powerOutput' && (
                            <label className={styles['output-goal-control']}>
                              <span>Reward output until</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={setting.outputGoal ?? ''}
                                placeholder="Required"
                                onChange={(event) =>
                                  updateMetric(id, {
                                    outputGoal: nullableNumber(event.target.value),
                                  })
                                }
                              />
                              <small>
                                More output after this point does not improve the result.
                              </small>
                            </label>
                          )}
                        </div>

                        {definition.rounded && (
                          <div className={styles['rounded-objective-note']}>
                            Uses exact whole-machine totals and may take longer.
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        <div className={styles['add-objective-area']}>
          <button
            type="button"
            className={styles['add-objective-button']}
            onClick={() => setIsObjectivePickerOpen((open) => !open)}
            disabled={availableMetricIds.length === 0}
          >
            <Plus size={14} /> Add objective
          </button>
          {isObjectivePickerOpen && (
            <div className={styles['objective-picker']}>
              <div className={styles['objective-picker-group']}>
                <strong>Usually fast</strong>
                {availableMetricIds
                  .filter((id) => !OPTIMIZATION_METRIC_DEFINITIONS[id].rounded)
                  .map((id) => (
                    <button type="button" onClick={() => addObjective(id)} key={id}>
                      <span>{OPTIMIZATION_METRIC_DEFINITIONS[id].label}</span>
                      <small>{OPTIMIZATION_METRIC_DEFINITIONS[id].description}</small>
                    </button>
                  ))}
              </div>
              <div className={styles['objective-picker-group']}>
                <strong>Exact whole machines</strong>
                {availableMetricIds
                  .filter((id) => OPTIMIZATION_METRIC_DEFINITIONS[id].rounded)
                  .map((id) => (
                    <button type="button" onClick={() => addObjective(id)} key={id}>
                      <span>{OPTIMIZATION_METRIC_DEFINITIONS[id].label}</span>
                      <small>{OPTIMIZATION_METRIC_DEFINITIONS[id].description}</small>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        <section className={styles['solver-impact']} data-backend={validation.backend}>
          <div>
            <span>Estimated solve</span>
            <strong>
              {validation.backend === 'soplex_lp' ? 'Usually fast' : 'May take longer'}
            </strong>
          </div>
          <p>
            {validation.backend === 'soplex_lp'
              ? 'The selected preferences can be compared directly.'
              : 'One or more preferences use exact whole-machine totals.'}
          </p>
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

        <p className={styles['autocomplete-note']}>
          Recipe autocomplete is planned for a future update.
        </p>
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
          Optimize Ratios
        </button>
      </div>
    </div>
  );
}
