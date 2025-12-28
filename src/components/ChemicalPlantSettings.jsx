import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { calculateChemicalPlantMetrics } from '../data/chemicalPlant';

const ChemicalPlantSettings = ({ nodeId, currentSettings, recipe, onSettingsChange, onClose }) => {
  const [speedFactor, setSpeedFactor] = useState(currentSettings?.speedFactor || 100);
  const [efficiencyFactor, setEfficiencyFactor] = useState(currentSettings?.efficiencyFactor || 100);
  const bubbleRef = React.useRef(null);

  const handleWheel = (e) => {
    const element = bubbleRef.current;
    if (!element) return;

    const isScrollable = element.scrollHeight > element.clientHeight;
    const isAtTop = element.scrollTop === 0 && e.deltaY < 0;
    const isAtBottom = element.scrollTop + element.clientHeight >= element.scrollHeight && e.deltaY > 0;

    if (isScrollable && !isAtTop && !isAtBottom) {
      e.stopPropagation();
    } else if (isScrollable) {
      e.preventDefault();
      e.stopPropagation();
    } else {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const metrics = calculateChemicalPlantMetrics(speedFactor, efficiencyFactor);

  const adjustSpeed = (direction) => {
    setSpeedFactor(prev => {
      const newValue = prev + (direction * 5);
      return Math.max(50, Math.min(200, newValue));
    });
  };

  const adjustEfficiency = (direction) => {
    setEfficiencyFactor(prev => {
      const newValue = prev + (direction * 5);
      return Math.max(80, Math.min(120, newValue));
    });
  };

  const handleApply = () => {
    onSettingsChange(nodeId, { speedFactor, efficiencyFactor });
    onClose();
  };

  const resetSettings = () => {
    setSpeedFactor(100);
    setEfficiencyFactor(100);
  };

  return ReactDOM.createPortal(
    <div className="drill-settings-overlay" onClick={onClose}>
      <div ref={bubbleRef} className="drill-settings-bubble" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onWheel={handleWheel}>
        <h3 className="drill-settings-title">Chemical Plant Settings</h3>

        <div className="drill-settings-content">
          <div className="drill-setting-group">
            <label className="drill-setting-label">Speed Factor</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button 
                onClick={() => adjustSpeed(-1)} 
                disabled={speedFactor <= 50}
                className="btn btn-secondary"
                style={{ 
                  padding: '8px 16px', 
                  minWidth: 'auto',
                  fontSize: '18px',
                  opacity: speedFactor <= 50 ? 0.5 : 1,
                  cursor: speedFactor <= 50 ? 'not-allowed' : 'pointer'
                }}
              >
                ▼
              </button>
              <div style={{
                flex: 1,
                textAlign: 'center',
                padding: '12px',
                background: 'var(--bg-main)',
                border: '2px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '20px',
                fontWeight: 700
              }}>
                {speedFactor}
              </div>
              <button 
                onClick={() => adjustSpeed(1)} 
                disabled={speedFactor >= 200}
                className="btn btn-secondary"
                style={{ 
                  padding: '8px 16px', 
                  minWidth: 'auto',
                  fontSize: '18px',
                  opacity: speedFactor >= 200 ? 0.5 : 1,
                  cursor: speedFactor >= 200 ? 'not-allowed' : 'pointer'
                }}
              >
                ▲
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              <span>Min: 50</span>
              <span>Default: 100</span>
              <span>Max: 200</span>
            </div>
          </div>

          <div className="drill-setting-group">
            <label className="drill-setting-label">Efficiency Factor</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button 
                onClick={() => adjustEfficiency(-1)} 
                disabled={efficiencyFactor <= 80}
                className="btn btn-secondary"
                style={{ 
                  padding: '8px 16px', 
                  minWidth: 'auto',
                  fontSize: '18px',
                  opacity: efficiencyFactor <= 80 ? 0.5 : 1,
                  cursor: efficiencyFactor <= 80 ? 'not-allowed' : 'pointer'
                }}
              >
                ▼
              </button>
              <div style={{
                flex: 1,
                textAlign: 'center',
                padding: '12px',
                background: 'var(--bg-main)',
                border: '2px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '20px',
                fontWeight: 700
              }}>
                {efficiencyFactor}
              </div>
              <button 
                onClick={() => adjustEfficiency(1)} 
                disabled={efficiencyFactor >= 120}
                className="btn btn-secondary"
                style={{ 
                  padding: '8px 16px', 
                  minWidth: 'auto',
                  fontSize: '18px',
                  opacity: efficiencyFactor >= 120 ? 0.5 : 1,
                  cursor: efficiencyFactor >= 120 ? 'not-allowed' : 'pointer'
                }}
              >
                ▲
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              <span>Min: 80</span>
              <span>Default: 100</span>
              <span>Max: 120</span>
            </div>
          </div>

          <div className="drill-setting-group" style={{ 
            marginTop: '20px', padding: '12px', background: 'rgba(212, 166, 55, 0.1)', 
            borderRadius: '8px', fontSize: '13px' 
          }}>
            <div style={{ color: '#f5d56a', fontWeight: 600, marginBottom: '12px' }}>Applied Multipliers:</div>
            <div style={{ color: '#999', lineHeight: '1.6' }}>
              <div>Input Multiplier: {metrics.inputMultiplier.toFixed(4)}x</div>
              <div>Output Multiplier: {metrics.outputMultiplier.toFixed(4)}x</div>
              <div>Power Multiplier: {metrics.powerMultiplier.toFixed(4)}x</div>
            </div>
            
            <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              <div>• Speed affects input/output quantities and power</div>
              <div>• Efficiency affects input quantities and power</div>
              <div>• Effects combine additively</div>
            </div>
          </div>
        </div>

        <div className="drill-settings-buttons">
          <button onClick={resetSettings} className="btn btn-secondary">Reset</button>
          <button onClick={handleApply} className="btn btn-primary">Apply</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ChemicalPlantSettings;