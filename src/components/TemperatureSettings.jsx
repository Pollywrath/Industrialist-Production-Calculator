import React, { useState } from 'react';
import { HEAT_SOURCES, calculateOutputTemperature, getPowerConsumptionForTemperature, formatTemperature } from '../utils/temperatureHandler';

const TemperatureSettings = ({ nodeId, machineId, currentSettings, recipe, onSettingsChange, onClose }) => {
  const heatSource = HEAT_SOURCES[machineId];
  const [temperature, setTemperature] = useState(currentSettings?.temperature || heatSource?.tempOptions?.[0]?.temp || 120);

  if (!heatSource || heatSource.type !== 'configurable') return null;

  const powerConsumption = getPowerConsumptionForTemperature(machineId, temperature);
  const formatPower = (power) => {
    if (!power) return 'N/A';
    if (power >= 1000000) return `${(power / 1000000).toFixed(1)} MMF/s`;
    if (power >= 1000) return `${(power / 1000).toFixed(1)} kMF/s`;
    return `${power.toFixed(0)} MF/s`;
  };

  const handleApply = () => {
    const settings = { temperature };
    const updatedOutputs = recipe.outputs.map(output => ({
      ...output,
      temperature: calculateOutputTemperature(machineId, settings)
    }));
    onSettingsChange(nodeId, settings, updatedOutputs, powerConsumption);
    onClose();
  };

  return (
    <div className="drill-settings-overlay" onClick={onClose}>
      <div className="drill-settings-bubble" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <h3 className="drill-settings-title">{heatSource.name} Settings</h3>

        <div className="drill-settings-content">
          <div className="drill-setting-group">
            <label className="drill-setting-label">Output Temperature:</label>
            <select value={temperature} onChange={(e) => setTemperature(parseInt(e.target.value))} className="select">
              {heatSource.tempOptions.map(option => (
                <option key={option.temp} value={option.temp}>
                  {formatTemperature(option.temp)} - {formatPower(option.power)}
                </option>
              ))}
            </select>
          </div>

          <div className="drill-setting-group" style={{ 
            marginTop: '20px', padding: '12px', background: 'rgba(212, 166, 55, 0.1)', 
            borderRadius: '8px', fontSize: '13px' 
          }}>
            <div style={{ color: '#f5d56a', fontWeight: 600, marginBottom: '8px' }}>Preview:</div>
            <div style={{ color: '#999', lineHeight: '1.6' }}>
              <div>Output Temperature: {formatTemperature(temperature)}</div>
              <div>Power Consumption: {formatPower(powerConsumption)}</div>
            </div>
          </div>
        </div>

        <div className="drill-settings-buttons">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button onClick={handleApply} className="btn btn-primary">Apply</button>
        </div>
      </div>
    </div>
  );
};

export default TemperatureSettings;