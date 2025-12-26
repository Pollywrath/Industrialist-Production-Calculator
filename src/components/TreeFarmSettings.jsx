import React, { useState } from 'react';
import { calculateTreeFarmMetrics, buildTreeFarmInputs, buildTreeFarmOutputs, calculateRequiredWaterTanks } from '../data/treeFarm';
import { getProductName } from '../utils/variableHandler';
import { getProduct } from '../data/dataLoader';

const TreeFarmSettings = ({ nodeId, currentSettings, globalPollution, onSettingsChange, onClose }) => {
  const [trees, setTrees] = useState(currentSettings?.trees || 450);
  const [harvesters, setHarvesters] = useState(currentSettings?.harvesters || 20);
  const [sprinklers, setSprinklers] = useState(currentSettings?.sprinklers || 24);
  const [outputs, setOutputs] = useState(currentSettings?.outputs || 8);
  const controller = 1; // Always 1

  const waterTanks = calculateRequiredWaterTanks(sprinklers);
  const metrics = calculateTreeFarmMetrics(trees, harvesters, sprinklers, outputs, controller, globalPollution);
  const inputs = buildTreeFarmInputs(sprinklers);
  const outputs_data = buildTreeFarmOutputs(trees, harvesters, globalPollution);

  const handleApply = () => {
    const settings = { trees, harvesters, sprinklers, outputs, controller };
    onSettingsChange(nodeId, settings, inputs, outputs_data);
    onClose();
  };

  const resetSettings = () => {
    setTrees(450);
    setHarvesters(20);
    setSprinklers(24);
    setOutputs(8);
  };

  const validateInput = (value, setter, min = 1, max = Infinity) => {
    const num = parseInt(value);
    if (!isNaN(num) && num >= min && num <= max) {
      setter(num);
    } else if (value === '') {
      setter('');
    }
  };

  const hasErrors = trees > 500 || trees < 1 || harvesters < 1 || sprinklers < 1 || outputs < 1;

  return (
    <div className="drill-settings-overlay" onClick={onClose}>
      <div className="drill-settings-bubble" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <h3 className="drill-settings-title">Tree Farm Settings</h3>

        <div className="drill-settings-content">
          <div className="drill-setting-group">
            <label className="drill-setting-label">Trees (max 500):</label>
            <input type="number" min="1" max="500" value={trees} 
              onChange={(e) => validateInput(e.target.value, setTrees, 1, 500)} 
              className="input" style={{ borderColor: trees > 500 || trees < 1 ? '#ef4444' : undefined }} />
          </div>

          <div className="drill-setting-group">
            <label className="drill-setting-label">Harvesters:</label>
            <input type="number" min="1" value={harvesters} 
              onChange={(e) => validateInput(e.target.value, setHarvesters, 1)} 
              className="input" style={{ borderColor: harvesters < 1 ? '#ef4444' : undefined }} />
          </div>

          <div className="drill-setting-group">
            <label className="drill-setting-label">Sprinklers:</label>
            <input type="number" min="1" value={sprinklers} 
              onChange={(e) => validateInput(e.target.value, setSprinklers, 1)} 
              className="input" style={{ borderColor: sprinklers < 1 ? '#ef4444' : undefined }} />
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Requires {waterTanks} water tank{waterTanks !== 1 ? 's' : ''} (3 sprinklers per tank)
            </p>
          </div>

          <div className="drill-setting-group">
            <label className="drill-setting-label">Outputs:</label>
            <input type="number" min="1" value={outputs} 
              onChange={(e) => validateInput(e.target.value, setOutputs, 1)} 
              className="input" style={{ borderColor: outputs < 1 ? '#ef4444' : undefined }} />
          </div>

          <div className="drill-setting-group">
            <label className="drill-setting-label">Controller:</label>
            <input type="number" value={1} disabled className="input" 
              style={{ backgroundColor: 'var(--bg-secondary)', cursor: 'not-allowed' }} />
          </div>

          {metrics && (
            <div className="drill-setting-group" style={{ 
              marginTop: '20px', padding: '12px', background: 'rgba(212, 166, 55, 0.1)', 
              borderRadius: '8px', fontSize: '13px' 
            }}>
              <div style={{ color: '#f5d56a', fontWeight: 600, marginBottom: '12px' }}>Calculated Metrics:</div>
              <div style={{ color: '#999', lineHeight: '1.6', marginBottom: '12px' }}>
                <div>Growth Time: {metrics.growthTime}s (at {typeof globalPollution === 'number' ? globalPollution.toFixed(1) : globalPollution}% pollution)</div>
                <div>Water Tanks: {metrics.waterTanks}</div>
                <div>Sustainable Rate: {metrics.sustainableHarvestRate.toFixed(4)} trees/s</div>
                <div>Max Harvest Rate: {metrics.maxHarvestRate.toFixed(4)} trees/s</div>
                <div>Actual Rate: {metrics.actualHarvestRate.toFixed(4)} trees/s</div>
                <div>Power: {(metrics.avgPowerConsumption / 1000).toFixed(2)} kMF/s</div>
                {metrics.isTreeLimited && (
                  <div style={{ color: '#fca5a5', marginTop: '8px', fontStyle: 'italic' }}>
                    ⚠️ Limited by tree regrowth rate
                  </div>
                )}
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
                {outputs_data.length > 0 && (
                  <div>
                    <div style={{ color: '#fca5a5', fontWeight: 600, marginBottom: '8px', fontSize: '12px' }}>Outputs:</div>
                    <div style={{ color: '#999', lineHeight: '1.5', fontSize: '12px' }}>
                      {outputs_data.map((output, idx) => (
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
          <button onClick={handleApply} className="btn btn-primary" disabled={hasErrors}>Apply</button>
        </div>
      </div>
    </div>
  );
};

export default TreeFarmSettings;