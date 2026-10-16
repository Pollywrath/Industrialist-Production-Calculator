import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Calculator, RotateCcw, X } from 'lucide-react';
import {
  calculateNuclearPlantTurbineLookup,
  calculateNuclearPlantSimulator,
  type NuclearFuelRodGroup,
  type NuclearPlantSimulatorInputs,
  type NuclearPlantSimulatorResult,
  type NuclearPlantTurbineLookupResult,
} from '../../../data/special_recipes/nuclear_power_plant';
import { useUIStore } from '../../../stores/useUIStore';
import { formatPower, formatQuantity, formatTemperature } from '../../../utils/unitFormatting';
import styles from './NppSimulatorOverlay.module.css';

const FUEL_ROD_OPTIONS: { id: NuclearFuelRodGroup['id']; label: string }[] = [
  { id: 'p_low_enrichment_fuel_rod', label: 'Low-enrichment' },
  { id: 'p_standard_fuel_rod', label: 'Standard' },
  { id: 'p_mox_fuel_rod', label: 'MOX' },
];

function createDefaultInputs(): NuclearPlantSimulatorInputs {
  const inputs: Omit<
    NuclearPlantSimulatorInputs,
    'turbineOutputMmfPerSecond' | 'hpsTemperatureFromLookup'
  > = {
    totalRodPositions: 316,
    fuelRods: [
      { id: 'p_low_enrichment_fuel_rod', count: 288 },
      { id: 'p_standard_fuel_rod', count: 0 },
      { id: 'p_mox_fuel_rod', count: 0 },
    ],
    refuelAtFuelRemaining: 51,
    startupMaintenanceMinutes: 60,
    boricAcidRate: 0.5,
    waterFlow: 3200,
    turbineSize: '24kL/s',
    powerDemandGmfPerSecond: 1.32,
    useRecycledUptime: true,
    recycledUptimePercent: 91.85,
  };
  const turbineLookup = calculateNuclearPlantTurbineLookup(inputs);

  return {
    ...inputs,
    turbineOutputMmfPerSecond: turbineLookup.turbineOutputMmfPerSecond,
    hpsTemperatureFromLookup: turbineLookup.hpsTemperatureLookupValue,
  };
}

function formatPercent(value: number, digits = 2): string {
  return `${formatQuantity(value * 100, digits, digits)}%`;
}

function formatPercentPoints(value: number, digits = 2): string {
  return `${formatQuantity(value, digits, digits)}%`;
}

function formatDepletionRate(value: number): string {
  return `${formatQuantity(value * 100, 6, 3)}%/s`;
}

function formatRate(value: number): string {
  return `${formatQuantity(value, 6, 0)}/s`;
}

function formatHours(value: number): string {
  return `${formatQuantity(value, 3, 3)} h`;
}

function getProductLabel(productId: string): string {
  switch (productId) {
    case 'p_low_enrichment_fuel_rod':
      return 'Low-enrichment fuel rods';
    case 'p_standard_fuel_rod':
      return 'Standard fuel rods';
    case 'p_mox_fuel_rod':
      return 'MOX fuel rods';
    case 'p_boric_acid':
      return 'Boric acid';
    case 'p_distilled_water':
      return 'Distilled water';
    case 'p_spent_fuel':
      return 'Spent fuel';
    case 'p_spent_mox_fuel':
      return 'Spent MOX fuel';
    case 'p_contaminated_water':
      return 'Contaminated water';
    default:
      return productId;
  }
}

interface NumberFieldProps {
  label: string;
  value: number;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}

function NumberField({ label, value, unit, step, min, max, onChange }: NumberFieldProps) {
  const inputId = useId();

  return (
    <label className={styles['number-field']} htmlFor={inputId}>
      <span className={styles['field-label']}>{label}</span>
      <span className={styles['field-input-wrap']}>
        <input
          id={inputId}
          type="number"
          value={value}
          step={step ?? 'any'}
          min={min}
          max={max}
          onChange={(event) => {
            const nextValue = Number(event.currentTarget.value);
            onChange(Number.isFinite(nextValue) ? nextValue : 0);
          }}
        />
        {unit && <span className={styles['field-unit']}>{unit}</span>}
      </span>
    </label>
  );
}

function FormulaValue({ cell, formula, value }: { cell: string; formula: string; value: string }) {
  return (
    <div className={styles['formula-value']}>
      <div className={styles['formula-heading']}>
        <code>{cell}</code>
        <strong>{value}</strong>
      </div>
      <code className={styles['formula-expression']}>{formula}</code>
    </div>
  );
}

function calculate(inputs: NuclearPlantSimulatorInputs): {
  result: NuclearPlantSimulatorResult | null;
  turbineLookup: NuclearPlantTurbineLookupResult | null;
  error: string | null;
} {
  try {
    const turbineLookup = calculateNuclearPlantTurbineLookup(inputs);
    const result = calculateNuclearPlantSimulator({
      ...inputs,
      turbineOutputMmfPerSecond: turbineLookup.turbineOutputMmfPerSecond,
      hpsTemperatureFromLookup: turbineLookup.hpsTemperatureLookupValue,
    });
    return { result, turbineLookup, error: null };
  } catch (error) {
    return {
      result: null,
      turbineLookup: null,
      error: error instanceof Error ? error.message : 'Unable to calculate this configuration.',
    };
  }
}

export function NppSimulatorOverlay() {
  const isOpen = useUIStore((state) => state.isNppSimulatorOpen);
  const setOpen = useUIStore((state) => state.setNppSimulatorOpen);
  const handleClose = useCallback(() => setOpen(false), [setOpen]);

  if (!isOpen) return null;
  return <NppSimulatorDialog onClose={handleClose} />;
}

function NppSimulatorDialog({ onClose }: { onClose: () => void }) {
  const [inputs, setInputs] = useState(createDefaultInputs);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { result, turbineLookup, error } = calculate(inputs);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [onClose]);

  const updateInput = <K extends keyof NuclearPlantSimulatorInputs>(
    key: K,
    value: NuclearPlantSimulatorInputs[K],
  ) => {
    setInputs((current) => ({ ...current, [key]: value }));
  };

  const updateFuelRodCount = (id: NuclearFuelRodGroup['id'], count: number) => {
    setInputs((current) => ({
      ...current,
      fuelRods: current.fuelRods.map((group) => (group.id === id ? { ...group, count } : group)),
    }));
  };

  return (
    <div
      className={styles['simulator-overlay']}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="npp-simulator-title"
        aria-modal="true"
        className={styles['simulator-modal']}
        role="dialog"
      >
        <header className={styles['simulator-header']}>
          <div className={styles['simulator-title']}>
            <Calculator size={18} />
            <div>
              <h1 id="npp-simulator-title">Nuclear Plant Formula Simulator</h1>
              <p>Temporary worksheet model · per-plant values</p>
            </div>
          </div>
          <div className={styles['header-actions']}>
            <button
              className={styles['reset-button']}
              aria-label="Reset simulator to CSV example"
              onClick={() => setInputs(createDefaultInputs())}
              type="button"
            >
              <RotateCcw size={14} />
              <span>Reset CSV example</span>
            </button>
            <button
              ref={closeButtonRef}
              aria-label="Close NPP formula simulator"
              className={styles['close-button']}
              onClick={onClose}
              title="Close simulator"
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className={styles['simulator-body']}>
          <aside className={styles['simulator-inputs']}>
            <div className={styles['section-heading']}>
              <h2>Inputs</h2>
              <span>Change a value to recalculate</span>
            </div>

            <fieldset className={styles['input-group']}>
              <legend>Turbine and water</legend>
              <NumberField
                label="Power demand · B2"
                min={0}
                step={0.01}
                unit="GMF/s"
                value={inputs.powerDemandGmfPerSecond}
                onChange={(value) => updateInput('powerDemandGmfPerSecond', value)}
              />
              <NumberField
                label="Water flow · B5"
                min={0}
                step={100}
                unit="L/s"
                value={inputs.waterFlow}
                onChange={(value) => updateInput('waterFlow', value)}
              />
              <label className={styles['number-field']}>
                <span className={styles['field-label']}>Turbine size · B6</span>
                <select
                  value={inputs.turbineSize}
                  onChange={(event) =>
                    updateInput(
                      'turbineSize',
                      event.currentTarget.value === '24kL/s' ? '24kL/s' : 'other',
                    )
                  }
                >
                  <option value="24kL/s">24 kL/s</option>
                  <option value="other">12 kL/s or smaller</option>
                </select>
              </label>
              <p className={styles['input-note']}>
                H2, H4, and H5 are calculated from the turbine table captured in the CSV. H5 is
                rounded to two decimals before it feeds the water-temperature formula.
              </p>
            </fieldset>

            <fieldset className={styles['input-group']}>
              <legend>Core and fuel</legend>
              <NumberField
                label="Total rod positions · B3"
                min={1}
                step={1}
                value={inputs.totalRodPositions}
                onChange={(value) => updateInput('totalRodPositions', value)}
              />
              {FUEL_ROD_OPTIONS.map((option) => (
                <NumberField
                  key={option.id}
                  label={`${option.label} rods`}
                  min={0}
                  step={1}
                  value={inputs.fuelRods.find((group) => group.id === option.id)?.count ?? 0}
                  onChange={(value) => updateFuelRodCount(option.id, value)}
                />
              ))}
              <NumberField
                label="Fuel remaining at refuel · E5"
                min={0}
                max={100}
                step={1}
                unit="%"
                value={inputs.refuelAtFuelRemaining}
                onChange={(value) => updateInput('refuelAtFuelRemaining', value)}
              />
              <NumberField
                label="Startup and maintenance · B7"
                min={0}
                step={1}
                unit="min"
                value={inputs.startupMaintenanceMinutes}
                onChange={(value) => updateInput('startupMaintenanceMinutes', value)}
              />
              <NumberField
                label="Boric acid · H10"
                min={0}
                step={0.1}
                unit="/s"
                value={inputs.boricAcidRate}
                onChange={(value) => updateInput('boricAcidRate', value)}
              />
            </fieldset>

            <fieldset className={styles['input-group']}>
              <legend>Recycling uptime</legend>
              <label className={styles['checkbox-field']}>
                <input
                  checked={inputs.useRecycledUptime}
                  onChange={(event) =>
                    updateInput('useRecycledUptime', event.currentTarget.checked)
                  }
                  type="checkbox"
                />
                <span>Use recycling uptime · B17</span>
              </label>
              {inputs.useRecycledUptime && (
                <>
                  <NumberField
                    label="Average cycle uptime · Data Sheet O3"
                    min={0}
                    max={100}
                    step={0.01}
                    unit="%"
                    value={inputs.recycledUptimePercent}
                    onChange={(value) => updateInput('recycledUptimePercent', value)}
                  />
                  <p className={styles['input-note']}>
                    O3 comes from the workbook’s 1,000-cycle recycling schedule. It is an input
                    here; this temporary simulator does not rerun that schedule.
                  </p>
                </>
              )}
            </fieldset>
          </aside>

          <main className={styles['simulator-results']}>
            {error || !result || !turbineLookup ? (
              <div className={styles['calculation-error']} role="alert">
                {error ?? 'Unable to calculate this configuration.'}
              </div>
            ) : (
              <SimulatorResults result={result} inputs={inputs} turbineLookup={turbineLookup} />
            )}
          </main>
        </div>
      </section>
    </div>
  );
}

function SimulatorResults({
  result,
  inputs,
  turbineLookup,
}: {
  result: NuclearPlantSimulatorResult;
  inputs: NuclearPlantSimulatorInputs;
  turbineLookup: NuclearPlantTurbineLookupResult;
}) {
  return (
    <>
      <section className={styles['summary-grid']} aria-label="Key results">
        <div className={styles['summary-value']}>
          <span>Thermal generation · E3</span>
          <strong>{formatPower(result.thermalGenerationGmf * 1_000_000_000, true)}</strong>
        </div>
        <div className={styles['summary-value']}>
          <span>Core run time</span>
          <strong>{formatHours(result.coreRunTimeHours)}</strong>
        </div>
        <div className={styles['summary-value']}>
          <span>Plant uptime · E14</span>
          <strong>{formatPercent(result.uptime)}</strong>
        </div>
        <div className={styles['summary-value']}>
          <span>Electric output · E2</span>
          <strong>{formatQuantity(result.powerOutputGmfPerSecond, 3, 3)} GMF/s</strong>
        </div>
      </section>

      <section className={styles['result-section']}>
        <div className={styles['section-heading']}>
          <h2>1 · Turbine lookup and water temperature</h2>
          <span>H3 → H2 → H4/H5 → E4</span>
        </div>
        <div className={styles['formula-grid']}>
          <FormulaValue
            cell="H3"
            formula={`ROUNDDOWN(MIN(${inputs.waterFlow}, 3200) / ${inputs.turbineSize === '24kL/s' ? 800 : 200}, 0)`}
            value={`${result.turbineCount} turbines`}
          />
          <FormulaValue
            cell="H2 target"
            formula={`(${inputs.powerDemandGmfPerSecond} / ${result.turbineCount || '0 turbines'}) × 1000`}
            value={
              result.turbineCount
                ? formatPower(result.demandPerTurbineMmfPerSecond * 1_000_000)
                : 'No turbine at this flow'
            }
          />
          <FormulaValue
            cell="H2 tier"
            formula="XLOOKUP(H2 target, Data Sheet!B60:B82, C60:C82, C60, 1, 1)"
            value={turbineLookup.turbineTier}
          />
          <FormulaValue
            cell="H4"
            formula={`MIN(${inputs.turbineSize === '24kL/s' ? 404 : 101}, MAX(${inputs.turbineSize === '24kL/s' ? 80 : 38}, MAX(H2 target, XLOOKUP(H2, Data Sheet!C60:C82, B60:B82,,1,1))))`}
            value={formatPower(turbineLookup.turbineOutputMmfPerSecond * 1_000_000)}
          />
          <FormulaValue
            cell="H5"
            formula="MAX(160, ROUND(XLOOKUP(H2, Data Sheet!C60:C82, E60:E82,,1,1), 2))"
            value={formatTemperature(result.hpsTemperature)}
          />
          <FormulaValue
            cell="E4"
            formula={`${result.hpsTemperature} / 0.8`}
            value={formatTemperature(result.waterTemperature)}
          />
        </div>
      </section>

      <section className={styles['result-section']}>
        <div className={styles['section-heading']}>
          <h2>2 · Thermal generation and depletion</h2>
          <span>E3 → E13 → E12</span>
        </div>
        <p className={styles['formula-note']}>
          The rod-count branch changes only above 276 positions. Fuel depletion is then divided by
          fuel type: 1× low-enrichment, 10× standard, 30× MOX.
        </p>
        <div className={styles['formula-grid']}>
          <FormulaValue
            cell="Rod factor"
            formula={
              inputs.totalRodPositions > 276
                ? `−0.00504953 × ${inputs.totalRodPositions} + 2.59565`
                : `−0.000444568 × ${inputs.totalRodPositions} + 1.32724`
            }
            value={formatQuantity(result.rodFactor, 6, 6)}
          />
          <FormulaValue
            cell="E3"
            formula={`(0.0136773 × ${formatQuantity(result.waterTemperature, 2, 2)} − 0.223546) × ${formatQuantity(result.rodFactor, 6, 6)}`}
            value={formatPower(result.thermalGenerationGmf * 1_000_000_000, true)}
          />
          <FormulaValue
            cell="Shared depletion base"
            formula={`(0.00000634329 × E3 − 0.000000317165) × (316 / ${result.totalFuelRods})`}
            value={formatDepletionRate(result.depletionBasePerSecond)}
          />
        </div>
        <div className={styles['table-scroll']}>
          <table>
            <thead>
              <tr>
                <th>Fuel type</th>
                <th>Count</th>
                <th>Depletion · E13</th>
                <th>Run time · E12</th>
                <th>Fuel remaining at refuel</th>
              </tr>
            </thead>
            <tbody>
              {result.rods.map((rod, index) => (
                <tr key={`${rod.id}-${index}`}>
                  <th>{getProductLabel(rod.id)}</th>
                  <td>{formatQuantity(rod.count, 0, 0)}</td>
                  <td>{formatDepletionRate(rod.depletionRatePerSecond)}</td>
                  <td>{formatHours(rod.runTimeHours)}</td>
                  <td>{formatPercentPoints(rod.remainingAtRefuel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles['result-section']}>
        <div className={styles['section-heading']}>
          <h2>3 · Cycle, uptime, and power</h2>
          <span>E7 → E14 → E2</span>
        </div>
        <div className={styles['formula-grid']}>
          <FormulaValue
            cell="E7"
            formula={`(${result.totalFuelRods} × 16.6 + ${inputs.startupMaintenanceMinutes} × 60 + 524.75) / 3600`}
            value={formatHours(result.maintenanceTimeHours)}
          />
          <FormulaValue
            cell="Cycle"
            formula="core run time + maintenance time"
            value={formatHours(result.cycleTimeSeconds / 3600)}
          />
          <FormulaValue
            cell="E14"
            formula={
              inputs.useRecycledUptime ? 'Data Sheet!O3' : 'core run time / (core run time + E7)'
            }
            value={formatPercent(result.uptime)}
          />
          <FormulaValue
            cell="E2"
            formula={`(${inputs.turbineOutputMmfPerSecond} × ${result.turbineCount}) / 1000 × E14`}
            value={`${formatQuantity(result.powerOutputGmfPerSecond, 3, 3)} GMF/s`}
          />
        </div>
        <FormulaValue
          cell="E6"
          formula={`MAX((${inputs.powerDemandGmfPerSecond} − ${formatQuantity(result.powerOutputGmfPerSecond, 4, 4)}) × 1000, 0)`}
          value={`${formatPower(
            Math.max(inputs.powerDemandGmfPerSecond - result.powerOutputGmfPerSecond, 0) *
              1_000_000_000,
          )} additional demand buffer`}
        />
      </section>

      <section className={styles['result-section']}>
        <div className={styles['section-heading']}>
          <h2>4 · Spent fuel and recipe rates</h2>
          <span>E16 → E17</span>
        </div>
        <div className={styles['formula-grid']}>
          <FormulaValue
            cell="Fuel remaining"
            formula="100 − ((100 − E5) × core run time / rod run time)"
            value={result.rods.map((rod) => formatPercentPoints(rod.remainingAtRefuel)).join(' / ')}
          />
          <FormulaValue
            cell="E16"
            formula="INT(spent-fuel efficiency × rod count × type multiplier × rod penalty)"
            value={`${formatQuantity(result.spentFuelPerRefuel, 0, 0)} spent fuel / refuel`}
          />
          <FormulaValue
            cell="E17"
            formula="E16 / ((core run time + E7) × 3600)"
            value={formatRate(result.spentFuelOutputPerSecond)}
          />
          {result.spentMoxPerRefuel > 0 && (
            <FormulaValue
              cell="Spent MOX"
              formula="MOX batch / cycle seconds"
              value={`${formatRate(result.spentMoxOutputPerSecond)} (${formatQuantity(result.spentMoxPerRefuel, 0, 0)} / refuel)`}
            />
          )}
        </div>
        <h3 className={styles['table-title']}>Per-plant recipe inputs</h3>
        <div className={styles['table-scroll']}>
          <table>
            <thead>
              <tr>
                <th>Input</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              {result.recipeInputs.map((item, index) => (
                <tr key={`${item.product_id}-${index}`}>
                  <th>{getProductLabel(item.product_id)}</th>
                  <td>{formatRate(item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className={styles['table-title']}>Per-plant recipe outputs</h3>
        <div className={styles['table-scroll']}>
          <table>
            <thead>
              <tr>
                <th>Output</th>
                <th>Rate and temperature</th>
              </tr>
            </thead>
            <tbody>
              {result.recipeOutputs.map((item, index) => (
                <tr key={`${item.product_id}-${index}`}>
                  <th>{getProductLabel(item.product_id)}</th>
                  <td>
                    {formatRate(item.quantity)}
                    {item.temperature !== undefined && ` · ${formatTemperature(item.temperature)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles['scope-note']}>
          Recycling uptime is applied from O3, but the sheet’s alternating 1,000-cycle fuel
          inventory, reprocessed-uranium share, and system-wide auxiliary power totals are outside
          this temporary simulator.
        </p>
      </section>
    </>
  );
}
