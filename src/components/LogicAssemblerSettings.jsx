// Logic Assembler Settings Component
// Place in: src/components/LogicAssemblerSettings.jsx

import React, { useState } from 'react';
import {
  MICROCHIP_STAGES,
  calculateLogicAssemblerMetrics,
  buildLogicAssemblerInputs,
  buildLogicAssemblerOutputs
} from '../data/logicAssembler';

const LogicAssemblerSettings = ({ nodeId, currentSettings, onSettingsChange, onClose }) => {
  const [outerStage, setOuterStage] = useState(currentSettings?.outerStage || '');
  const [innerStage, setInnerStage] = useState(currentSettings?.innerStage || '');
  const [machineOil, setMachineOil] = useState(currentSettings?.machineOil || false);
  const [tickCircuitDelay, setTickCircuitDelay] = useState(currentSettings?.tickCircuitDelay !== undefined ? currentSettings.tickCircuitDelay : 0);

  // Get unique outer and inner stages
  const outerStages = [1, 2, 3, 4, 5, 6, 7, 8];
  const innerStages = [2, 4, 8, 16, 32, 64];

  // Construct product ID from selected stages
  const getTargetMicrochipProductId = () => {
    if (!outerStage || !innerStage) return '';
    if (outerStage === '1') {
      return `p_${innerStage}x_microchip`;
    }
    return `p_${outerStage}x${innerStage}x_microchip`;
  };

  const targetMicrochip = getTargetMicrochipProductId();

  // Calculate metrics for display
  const metrics = targetMicrochip 
    ? calculateLogicAssemblerMetrics(targetMicrochip, machineOil, tickCircuitDelay)
    : null;

  // Get inputs and outputs for applying to recipe
  const inputs = buildLogicAssemblerInputs(targetMicrochip, machineOil);
  const outputs = buildLogicAssemblerOutputs(targetMicrochip, machineOil);

  // Calculate max power consumption based on quickest step time
  const getMaxPowerConsumption = () => {
    if (!metrics) return null;
    // Quickest step time: 4s without machine oil, 0.8s with machine oil
    const quickestStepTime = machineOil ? 0.8 : 4;
    const POWER_STORAGE_REQUIREMENT = 500000; // 500kMF per step
    return POWER_STORAGE_REQUIREMENT / quickestStepTime; // MF/s
  };

  const maxPower = getMaxPowerConsumption();

  const handleApply = () => {
    const settings = {
      outerStage: outerStage ? parseInt(outerStage) : '',
      innerStage: innerStage ? parseInt(innerStage) : '',
      machineOil,
      tickCircuitDelay
    };

    onSettingsChange(nodeId, settings, inputs, outputs);
    onClose();
  };

  const handleReset = () => {
    setOuterStage('');
    setInnerStage('');
    setMachineOil(false);
    setTickCircuitDelay(0);
  };

  const handleDelayChange = (e) => {
    const value = e.target.value;
    setTickCircuitDelay(value === '' ? 0 : parseFloat(value));
  };

  return (
    <div className="drill-settings-overlay" onClick={onClose}>
      <div className="drill-settings-bubble" onClick={(e) => e.stopPropagation()}>
        <h3 className="drill-settings-title">Logic Assembler Settings</h3>

        <div className="drill-settings-content">
          {/* Target Microchip - Two selects on same line */}
          <div className="drill-setting-group">
            <label className="drill-setting-label">Target Microchip:</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <select
                value={outerStage}
                onChange={(e) => setOuterStage(e.target.value)}
                className="select"
                style={{ flex: 1 }}
              >
                <option value="">Outer</option>
                {outerStages.map(stage => (
                  <option key={stage} value={stage}>
                    {stage}x
                  </option>
                ))}
              </select>
              
              <select
                value={innerStage}
                onChange={(e) => setInnerStage(e.target.value)}
                className="select"
                style={{ flex: 1 }}
              >
                <option value="">Inner</option>
                {innerStages.map(stage => (
                  <option key={stage} value={stage}>
                    {stage}x
                  </option>
                ))}
              </select>
              
              <span style={{ color: '#f5d56a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                Microchip
              </span>
            </div>
            {targetMicrochip && (
              <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                {outerStage === '1' ? `${innerStage}x Microchip` : `${outerStage}x${innerStage}x Microchip`}
              </div>
            )}
          </div>

          {/* Machine Oil */}
          <div className="drill-setting-group drill-setting-checkbox">
            <label className="drill-setting-label">
              <input
                type="checkbox"
                checked={machineOil}
                onChange={(e) => setMachineOil(e.target.checked)}
                className="drill-checkbox"
              />
              <span>Machine Oil (0.3/s, 5x speed)</span>
            </label>
          </div>

          {/* Tick Circuit Delay */}
          <div className="drill-setting-group">
            <label className="drill-setting-label">Tick Circuit Delay (ticks):</label>
            <input
              type="text"
              value={tickCircuitDelay}
              onChange={handleDelayChange}
              className="input"
              placeholder="0"
            />
          </div>

          {/* Metrics Display */}
          {metrics && (
            <div className="drill-setting-group" style={{ 
              marginTop: '20px', 
              padding: '12px', 
              background: 'rgba(212, 166, 55, 0.1)', 
              borderRadius: '8px',
              fontSize: '13px'
            }}>
              <div style={{ color: '#f5d56a', fontWeight: 600, marginBottom: '12px' }}>
                Calculated Metrics:
              </div>

              {/* Basic Metrics */}
              <div style={{ color: '#999', lineHeight: '1.6', marginBottom: '12px' }}>
                <div>Total Stages: {metrics.totalStages}</div>
                <div>Total Steps: {metrics.totalSteps}</div>
                <div>Avg Step Time: {metrics.avgStepTime}s</div>
                <div>Cycle Time: {metrics.cycleTime.toFixed(2)}s</div>
              </div>

              {/* Power Consumption (Max and Average) */}
              <div style={{ borderTop: '1px solid rgba(212, 166, 55, 0.3)', paddingTop: '10px', marginBottom: '10px' }}>
                <div style={{ color: '#f5d56a', fontWeight: 600, marginBottom: '6px' }}>
                  Power Consumption:
                </div>
                <div style={{ color: '#999', lineHeight: '1.6', paddingLeft: '10px' }}>
                  <div>Max Power: {(maxPower / 1000).toFixed(2)} kMF/s</div>
                  <div>Avg Power: {(metrics.avgPowerConsumption / 1000).toFixed(2)} kMF/s</div>
                </div>
              </div>

              {/* Materials per Cycle */}
              <div style={{ borderTop: '1px solid rgba(212, 166, 55, 0.3)', paddingTop: '10px' }}>
                <div style={{ color: '#86efac', fontWeight: 600, marginBottom: '6px' }}>
                  Materials per Cycle:
                </div>
                <div style={{ color: '#999', lineHeight: '1.5', fontSize: '12px', paddingLeft: '10px' }}>
                  <div>Logic Plates: {metrics.logicPlates}</div>
                  <div>Copper Wires: {metrics.copperWires}</div>
                  <div>Semiconductors: {metrics.semiconductors}</div>
                  <div>Gold Wires: {metrics.goldWires}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="drill-settings-buttons">
          <button onClick={handleReset} className="btn btn-secondary">
            Reset
          </button>
          <button onClick={handleApply} className="btn btn-primary">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogicAssemblerSettings;