import React, { useState } from 'react';

const BoilerSettings = ({ nodeId, currentSettings, onSettingsChange, onClose }) => {
  const [heatLoss, setHeatLoss] = useState(currentSettings?.heatLoss ?? 0);

  const handleApply = () => {
    onSettingsChange(nodeId, { heatLoss });
    onClose();
  };

  return (
    <div className="drill-settings-overlay" onClick={onClose}>
      <div className="drill-settings-bubble" onClick={(e) => e.stopPropagation()}>
        <h3 className="drill-settings-title">Boiler Settings</h3>

        <div className="drill-settings-content">
          <div className="drill-setting-group">
            <label className="drill-setting-label">Heat Loss (°C):</label>
            <input
              type="number"
              min="0"
              max="50"
              step="0.1"
              value={heatLoss}
              onChange={(e) => setHeatLoss(parseFloat(e.target.value) || 0)}
              className="input"
              placeholder="8"
            />
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              Temperature loss when converting hot water to steam. Default is 0°C.
            </p>
          </div>

          <div className="drill-setting-group" style={{ 
            marginTop: '20px', padding: '12px', background: 'rgba(212, 166, 55, 0.1)', 
            borderRadius: '8px', fontSize: '13px' 
          }}>
            <div style={{ color: '#f5d56a', fontWeight: 600, marginBottom: '8px' }}>How it works:</div>
            <div style={{ color: '#999', lineHeight: '1.6' }}>
              <div>• Boiler uses the <strong>second input</strong> (hot water coolant) temperature</div>
              <div>• Steam output temp = Coolant temp - {heatLoss}°C</div>
              <div>• If output temp &lt; 100°C, no steam is produced</div>
              <div>• Water output is cooled (no temperature)</div>
              <div style={{ marginTop: '8px', fontStyle: 'italic', fontSize: '12px' }}>
                Tip: For 100°C steam with {heatLoss}°C loss, use {100 + heatLoss}°C coolant
              </div>
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

export default BoilerSettings;