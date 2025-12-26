import React, { useState } from 'react';
import { calculateLogicAssemblerMetrics, buildLogicAssemblerInputs, buildLogicAssemblerOutputs } from '../data/logicAssembler';

const outerStages = [1, 2, 3, 4, 5, 6, 7, 8];
const innerStages = [2, 4, 8, 16, 32, 64];
const POWER_STORAGE_REQUIREMENT = 500000;

const LogicAssemblerSettings = ({ nodeId, currentSettings, onSettingsChange, onClose }) => {
  const [outerStage, setOuterStage] = useState(currentSettings?.outerStage || '');
  const [innerStage, setInnerStage] = useState(currentSettings?.innerStage || '');
  const [machineOil, setMachineOil] = useState(currentSettings?.machineOil || false);
  const [tickCircuitDelay, setTickCircuitDelay] = useState(currentSettings?.tickCircuitDelay ?? 0);

  const getTargetMicrochip = () => {
    if (!outerStage || !innerStage) return '';
    return parseInt(outerStage) === 1 ? `p_${innerStage}x_microchip` : `p_${outerStage}x${innerStage}x_microchip`;
  };

  const targetMicrochip = getTargetMicrochip();
  const metrics = targetMicrochip ? calculateLogicAssemblerMetrics(targetMicrochip, machineOil, tickCircuitDelay) : null;
  const inputs = buildLogicAssemblerInputs(targetMicrochip, machineOil);
  const outputs = buildLogicAssemblerOutputs(targetMicrochip, machineOil);
  const maxPower = metrics ? POWER_STORAGE_REQUIREMENT / (machineOil ? 0.8 : 4) : null;

  const handleApply = () => {
    onSettingsChange(nodeId, { 
      outerStage: outerStage ? parseInt(outerStage) : '', 
      innerStage: innerStage ? parseInt(innerStage) : '', 
      machineOil, 
      tickCircuitDelay 
    }, inputs, outputs);
    onClose();
  };

  const resetSettings = () => {
    setOuterStage('');
    setInnerStage('');
    setMachineOil(false);
    setTickCircuitDelay(0);
  };

  return (
    <div className="drill-settings-overlay" onClick={onClose}>
      <div className="drill-settings-bubble" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <h3 className="drill-settings-title">Logic Assembler Settings</h3>

        <div className="drill-settings-content">
          <div className="drill-setting-group">
            <label className="drill-setting-label">Target Microchip:</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <select value={outerStage} onChange={(e) => setOuterStage(e.target.value)} 
                className="select" style={{ flex: 1 }}>
                <option value="">Outer</option>
                {outerStages.map(stage => <option key={stage} value={stage}>{stage}x</option>)}
              </select>
              <select value={innerStage} onChange={(e) => setInnerStage(e.target.value)} 
                className="select" style={{ flex: 1 }}>
                <option value="">Inner</option>
                {innerStages.map(stage => <option key={stage} value={stage}>{stage}x</option>)}
              </select>
              <span style={{ color: '#f5d56a', fontWeight: 600, whiteSpace: 'nowrap' }}>Microchip</span>
            </div>
            {targetMicrochip && (
              <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                {outerStage === '1' ? `${innerStage}x Microchip` : `${outerStage}x${innerStage}x Microchip`}
              </div>
            )}
          </div>

          <div className="drill-setting-group drill-setting-checkbox">
            <label className="drill-setting-label">
              <input type="checkbox" checked={machineOil} onChange={(e) => setMachineOil(e.target.checked)} 
                className="drill-checkbox" />
              <span>Machine Oil (0.3/s, 5x speed)</span>
            </label>
          </div>

          <div className="drill-setting-group">
            <label className="drill-setting-label">Tick Circuit Delay (ticks):</label>
            <input type="text" value={tickCircuitDelay} 
              onChange={(e) => setTickCircuitDelay(e.target.value === '' ? 0 : parseFloat(e.target.value))} 
              className="input" placeholder="0" />
          </div>

          {metrics && (
            <div className="drill-setting-group" style={{ 
              marginTop: '20px', padding: '12px', background: 'rgba(212, 166, 55, 0.1)', 
              borderRadius: '8px', fontSize: '13px' 
            }}>
              <div style={{ color: '#f5d56a', fontWeight: 600, marginBottom: '12px' }}>Calculated Metrics:</div>
              <div style={{ color: '#999', lineHeight: '1.6', marginBottom: '12px' }}>
                <div>Total Stages: {metrics.totalStages}</div>
                <div>Total Steps: {metrics.totalSteps}</div>
                <div>Avg Step Time: {metrics.avgStepTime}s</div>
                <div>Cycle Time: {metrics.cycleTime.toFixed(2)}s</div>
              </div>

              <div style={{ borderTop: '1px solid rgba(212, 166, 55, 0.3)', paddingTop: '10px', marginBottom: '10px' }}>
                <div style={{ color: '#f5d56a', fontWeight: 600, marginBottom: '6px' }}>Power Consumption:</div>
                <div style={{ color: '#999', lineHeight: '1.6', paddingLeft: '10px' }}>
                  <div>Max: {(maxPower / 1000).toFixed(2)} kMF/s</div>
                  <div>Avg: {(metrics.avgPowerConsumption / 1000).toFixed(2)} kMF/s</div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(212, 166, 55, 0.3)', paddingTop: '10px' }}>
                <div style={{ color: 'var(--settings-input-label)', fontWeight: 600, marginBottom: '6px' }}>Materials per Cycle:</div>
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
          <button onClick={resetSettings} className="btn btn-secondary">Reset</button>
          <button onClick={handleApply} className="btn btn-primary">Apply</button>
        </div>
      </div>
    </div>
  );
};

export default LogicAssemblerSettings;