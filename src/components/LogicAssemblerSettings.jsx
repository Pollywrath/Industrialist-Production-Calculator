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
  const [targetMicrochip, setTargetMicrochip] = useState(currentSettings?.targetMicrochip || '');
  const [machineOil, setMachineOil] = useState(currentSettings?.machineOil || false);

  // Calculate metrics for display
  const metrics = targetMicrochip 
    ? calculateLogicAssemblerMetrics(targetMicrochip, machineOil)
    : null;

  const handleApply = () => {
    const settings = {
      targetMicrochip,
      machineOil
    };

    // Build recipe inputs/outputs based on settings
    const inputs = buildLogicAssemblerInputs(targetMicrochip, machineOil);
    const outputs = buildLogicAssemblerOutputs(targetMicrochip, machineOil);

    onSettingsChange(nodeId, settings, inputs, outputs);
    onClose();
  };

  const handleReset = () => {
    setTargetMicrochip('');
    setMachineOil(false);
  };

  return (
    <div className="drill-settings-overlay" onClick={onClose}>
      <div className="drill-settings-bubble" onClick={(e) => e.stopPropagation()}>
        <h3 className="drill-settings-title">Logic Assembler Settings</h3>

        <div className="drill-settings-content">
          {/* Target Microchip */}
          <div className="drill-setting-group">
            <label className="drill-setting-label">Target Microchip:</label>
            <select
              value={targetMicrochip}
              onChange={(e) => setTargetMicrochip(e.target.value)}
              className="select"
              style={{ maxHeight: '200px' }}
            >
              <option value="">None (Variable)</option>
              {MICROCHIP_STAGES.map(stage => (
                <option key={stage.productId} value={stage.productId}>
                  {stage.name}
                </option>
              ))}
            </select>
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

          {/* Metrics Display */}
          {metrics && (
            <div className="drill-setting-group" style={{ 
              marginTop: '20px', 
              padding: '12px', 
              background: 'rgba(212, 166, 55, 0.1)', 
              borderRadius: '8px',
              fontSize: '13px'
            }}>
              <div style={{ color: '#f5d56a', fontWeight: 600, marginBottom: '8px' }}>
                Calculated Metrics:
              </div>
              <div style={{ color: '#999', lineHeight: '1.6' }}>
                <div>Outer Stage: {metrics.outerStage}x</div>
                <div>Inner Stage: {metrics.innerStage}x</div>
                <div>Total Stages: {metrics.totalStages}</div>
                <div>Total Steps: {metrics.totalSteps}</div>
                <div>Avg Step Time: {metrics.avgStepTime}s</div>
                <div>Cycle Time: {metrics.cycleTime.toFixed(2)}s (inc. +10s base)</div>
                <div style={{ marginTop: '8px', borderTop: '1px solid rgba(212, 166, 55, 0.3)', paddingTop: '8px' }}>
                  <div>Materials per Cycle:</div>
                  <div style={{ paddingLeft: '10px' }}>
                    <div>Logic Plates: {metrics.logicPlates}</div>
                    <div>Copper Wires: {metrics.copperWires}</div>
                    <div>Semiconductors: {metrics.semiconductors}</div>
                    <div>Gold Wires: {metrics.goldWires}</div>
                  </div>
                </div>
                <div style={{ marginTop: '8px', borderTop: '1px solid rgba(212, 166, 55, 0.3)', paddingTop: '8px' }}>
                  <div>Output: 1x per cycle</div>
                  <div>Avg Power: {(metrics.avgPowerConsumption / 1000).toFixed(2)} kMF/s</div>
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