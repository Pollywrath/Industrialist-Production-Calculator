import React, { useState } from 'react';
import { DRILL_HEADS, CONSUMABLES, getAvailableDepths, buildDrillInputs, buildDrillOutputs, calculateDrillMetrics } from '../data/mineshaftDrill';
import { getProductName } from '../utils/variableHandler';
import { getProduct } from '../data/dataLoader';

const DrillSettings = ({ nodeId, currentSettings, onSettingsChange, onClose }) => {
  const [drillHead, setDrillHead] = useState(currentSettings?.drillHead || '');
  const [consumable, setConsumable] = useState(currentSettings?.consumable || 'none');
  const [machineOil, setMachineOil] = useState(currentSettings?.machineOil || false);
  const [depth, setDepth] = useState(currentSettings?.depth || '');

  const metrics = drillHead && depth ? calculateDrillMetrics(drillHead, consumable, machineOil, parseInt(depth)) : null;
  const inputs = buildDrillInputs(drillHead, consumable, machineOil, depth ? parseInt(depth) : null);
  const outputs = buildDrillOutputs(drillHead, consumable, machineOil, depth ? parseInt(depth) : null);

  const handleApply = () => {
    onSettingsChange(nodeId, { drillHead, consumable, machineOil, depth: depth ? parseInt(depth) : null }, inputs, outputs);
    onClose();
  };

  const resetSettings = () => {
    setDrillHead('');
    setConsumable('none');
    setMachineOil(false);
    setDepth('');
  };

  return (
    <div className="drill-settings-overlay" onClick={onClose}>
      <div className="drill-settings-bubble" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <h3 className="drill-settings-title">Mineshaft Drill Settings</h3>

        <div className="drill-settings-content">
          <div className="drill-setting-group">
            <label className="drill-setting-label">Drill Head:</label>
            <select value={drillHead} onChange={(e) => setDrillHead(e.target.value)} className="select">
              <option value="">None (Variable)</option>
              {DRILL_HEADS.map(head => <option key={head.id} value={head.id}>{head.name}</option>)}
            </select>
          </div>

          <div className="drill-setting-group">
            <label className="drill-setting-label">Consumable:</label>
            <select value={consumable} onChange={(e) => setConsumable(e.target.value)} className="select">
              {CONSUMABLES.map(cons => <option key={cons.id} value={cons.id}>{cons.name}</option>)}
            </select>
          </div>

          <div className="drill-setting-group drill-setting-checkbox">
            <label className="drill-setting-label">
              <input type="checkbox" checked={machineOil} onChange={(e) => setMachineOil(e.target.checked)} 
                className="drill-checkbox" />
              <span>Machine Oil (2/s)</span>
            </label>
          </div>

          <div className="drill-setting-group">
            <label className="drill-setting-label">Target Depth:</label>
            <select value={depth} onChange={(e) => setDepth(e.target.value)} className="select">
              <option value="">None (Variable)</option>
              {getAvailableDepths().map(d => <option key={d} value={d}>{d} m</option>)}
            </select>
          </div>

          {metrics && (
            <div className="drill-setting-group" style={{ 
              marginTop: '20px', padding: '12px', background: 'rgba(212, 166, 55, 0.1)', 
              borderRadius: '8px', fontSize: '13px' 
            }}>
              <div style={{ color: '#f5d56a', fontWeight: 600, marginBottom: '12px' }}>Calculated Metrics:</div>
              <div style={{ color: '#999', lineHeight: '1.6', marginBottom: '12px' }}>
                <div>Deterioration: {metrics.deteriorationRate.toFixed(4)}%/s</div>
                <div>Life Time: {metrics.lifeTime.toFixed(2)}s</div>
                <div>Replacement: {metrics.replacementTime.toFixed(2)}s</div>
                <div>Travel Time: {metrics.travelTime.toFixed(2)}s</div>
                <div>Total Cycle: {metrics.totalCycleTime.toFixed(2)}s</div>
                <div>Efficiency: {(metrics.dutyCycle * 100).toFixed(1)}%</div>
              </div>

              <div style={{ 
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', 
                borderTop: '1px solid rgba(212, 166, 55, 0.3)', paddingTop: '12px' 
              }}>
                {inputs.length > 0 && (
                  <div>
                    <div style={{ color: '#86efac', fontWeight: 600, marginBottom: '8px', fontSize: '12px' }}>Inputs:</div>
                    <div style={{ color: '#999', lineHeight: '1.5', fontSize: '12px' }}>
                      {inputs.map((input, idx) => (
                        <div key={idx}>{(typeof input.quantity === 'number' ? input.quantity.toFixed(4) : input.quantity)}x {getProductName(input.product_id, getProduct)}</div>
                      ))}
                    </div>
                  </div>
                )}
                {outputs.length > 0 && (
                  <div>
                    <div style={{ color: '#fca5a5', fontWeight: 600, marginBottom: '8px', fontSize: '12px' }}>Outputs:</div>
                    <div style={{ color: '#999', lineHeight: '1.5', fontSize: '12px' }}>
                      {outputs.map((output, idx) => (
                        <div key={idx}>{(typeof output.quantity === 'number' ? output.quantity.toFixed(4) : output.quantity)}x {getProductName(output.product_id, getProduct)}</div>
                      ))}
                    </div>
                  </div>
                )}
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

export default DrillSettings;