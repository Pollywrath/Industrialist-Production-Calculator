// Drill Settings Component
// Place in: src/components/DrillSettings.jsx

import React, { useState } from 'react';
import {
  DRILL_HEADS,
  CONSUMABLES,
  getAvailableDepths,
  buildDrillInputs,
  buildDrillOutputs,
  calculateDrillMetrics
} from '../data/mineshaftDrill';

const DrillSettings = ({ nodeId, currentSettings, onSettingsChange, onClose }) => {
  const [drillHead, setDrillHead] = useState(currentSettings?.drillHead || '');
  const [consumable, setConsumable] = useState(currentSettings?.consumable || 'none');
  const [machineOil, setMachineOil] = useState(currentSettings?.machineOil || false);
  const [depth, setDepth] = useState(currentSettings?.depth || '');

  const availableDepths = getAvailableDepths();

  // Calculate metrics for display
  const metrics = drillHead && depth 
    ? calculateDrillMetrics(drillHead, consumable, machineOil, parseInt(depth))
    : null;

  const handleApply = () => {
    const settings = {
      drillHead,
      consumable,
      machineOil,
      depth: depth ? parseInt(depth) : null
    };

    // Build recipe inputs/outputs based on settings (now with depth parameter)
    const inputs = buildDrillInputs(drillHead, consumable, machineOil, depth ? parseInt(depth) : null);
    const outputs = depth ? buildDrillOutputs(drillHead, consumable, machineOil, parseInt(depth)) : [];

    onSettingsChange(nodeId, settings, inputs, outputs);
    onClose();
  };

  const handleReset = () => {
    setDrillHead('');
    setConsumable('none');
    setMachineOil(false);
    setDepth('');
  };

  return (
    <div className="drill-settings-overlay" onClick={onClose}>
      <div className="drill-settings-bubble" onClick={(e) => e.stopPropagation()}>
        <h3 className="drill-settings-title">Mineshaft Drill Settings</h3>

        <div className="drill-settings-content">
          {/* Drill Head */}
          <div className="drill-setting-group">
            <label className="drill-setting-label">Drill Head:</label>
            <select
              value={drillHead}
              onChange={(e) => setDrillHead(e.target.value)}
              className="select"
            >
              <option value="">None (Variable)</option>
              {DRILL_HEADS.map(head => (
                <option key={head.id} value={head.id}>
                  {head.name}
                </option>
              ))}
            </select>
          </div>

          {/* Consumable */}
          <div className="drill-setting-group">
            <label className="drill-setting-label">Consumable:</label>
            <select
              value={consumable}
              onChange={(e) => setConsumable(e.target.value)}
              className="select"
            >
              {CONSUMABLES.map(cons => (
                <option key={cons.id} value={cons.id}>
                  {cons.name}
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
              <span>Machine Oil (2/s)</span>
            </label>
          </div>

          {/* Target Depth */}
          <div className="drill-setting-group">
            <label className="drill-setting-label">Target Depth:</label>
            <select
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
              className="select"
            >
              <option value="">None (Variable)</option>
              {availableDepths.map(d => (
                <option key={d} value={d}>
                  {d} m
                </option>
              ))}
            </select>
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
                <div>Deterioration: {metrics.deteriorationRate.toFixed(4)}%/s</div>
                <div>Life Time (Drilling): {metrics.lifeTime.toFixed(2)}s</div>
                <div>Replacement Time: {metrics.replacementTime.toFixed(2)}s</div>
                <div>Travel Time: {metrics.travelTime.toFixed(2)}s</div>
                <div>Total Cycle: {metrics.totalCycleTime.toFixed(2)}s</div>
                <div>Efficiency: {(metrics.dutyCycle * 100).toFixed(1)}%</div>
                <div style={{ marginTop: '8px', borderTop: '1px solid rgba(212, 166, 55, 0.3)', paddingTop: '8px' }}>
                  <div>Power (Drilling): {metrics.drillingPower} MMF/s</div>
                  <div>Power (Idle): {metrics.idlePower} MMF/s</div>
                  <div>Pollution: {metrics.pollution}%/h</div>
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

export default DrillSettings;