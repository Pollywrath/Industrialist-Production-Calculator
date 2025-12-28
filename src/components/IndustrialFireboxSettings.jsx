import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { FUEL_PRODUCTS, calculateFireboxMetrics, buildFireboxInputs } from '../data/industrialFirebox';
import { getProductName } from '../utils/variableHandler';
import { getProduct } from '../data/dataLoader';

const IndustrialFireboxSettings = ({ nodeId, currentSettings, recipe, onSettingsChange, onClose }) => {
  const [fuel, setFuel] = useState(currentSettings?.fuel || 'p_coal');
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

  const metrics = calculateFireboxMetrics(recipe.id, fuel);
  const inputs = metrics ? buildFireboxInputs(recipe.inputs, fuel, recipe.id) : recipe.inputs;

  const handleApply = () => {
    const settings = { fuel };
    onSettingsChange(nodeId, settings, inputs, metrics);
    onClose();
  };

  const resetSettings = () => {
    setFuel('p_coal');
  };

  return ReactDOM.createPortal(
    <div className="drill-settings-overlay" onClick={onClose}>
      <div ref={bubbleRef} className="drill-settings-bubble" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onWheel={handleWheel}>
        <h3 className="drill-settings-title">Industrial Firebox Settings</h3>

        <div className="drill-settings-content">
          <div className="drill-setting-group">
            <label className="drill-setting-label">Fuel Type:</label>
            <select value={fuel} onChange={(e) => setFuel(e.target.value)} className="select">
              {FUEL_PRODUCTS.map(fuelProduct => (
                <option key={fuelProduct.id} value={fuelProduct.id}>
                  {fuelProduct.name} ({(fuelProduct.energy / 1000).toFixed(0)}k energy)
                </option>
              ))}
            </select>
          </div>

          {metrics && (
            <div className="drill-setting-group" style={{ 
              marginTop: '20px', padding: '12px', background: 'rgba(212, 166, 55, 0.1)', 
              borderRadius: '8px', fontSize: '13px' 
            }}>
              <div style={{ color: '#f5d56a', fontWeight: 600, marginBottom: '12px' }}>Calculated Metrics:</div>
              <div style={{ color: '#999', lineHeight: '1.6', marginBottom: '12px' }}>
                <div>Energy Needed: {(metrics.energyNeeded / 1000).toFixed(0)}k</div>
                <div>Fuel Energy: {(metrics.fuelEnergy / 1000).toFixed(0)}k per unit</div>
                <div>Wait Time: {metrics.waitTime.toFixed(2)}s</div>
                {metrics.additionalWait > 0 && (
                  <div>Additional Wait: +{metrics.additionalWait}s</div>
                )}
                <div style={{ fontWeight: 600, marginTop: '8px', color: '#f5d56a' }}>
                  Total Cycle: {metrics.cycleTime.toFixed(2)}s
                </div>
                <div>Fuel Per Cycle: {metrics.fuelPerCycle.toFixed(2)} units</div>
                <div style={{ fontSize: '11px', fontStyle: 'italic', marginTop: '8px', color: 'var(--text-muted)' }}>
                  Rate: {(1 / metrics.cycleTime).toFixed(4)} cycles/s
                </div>
              </div>

              <div style={{ 
                borderTop: '1px solid rgba(212, 166, 55, 0.3)', 
                paddingTop: '12px' 
              }}>
                <div style={{ color: 'var(--settings-input-label)', fontWeight: 600, marginBottom: '8px', fontSize: '12px' }}>
                  Inputs (per cycle):
                </div>
                <div style={{ color: '#999', lineHeight: '1.5', fontSize: '12px' }}>
                  {inputs.map((input, idx) => (
                    <div key={idx}>
                      {(typeof input.quantity === 'number' ? input.quantity.toFixed(4) : input.quantity)}x {getProductName(input.product_id, getProduct)}
                    </div>
                  ))}
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
    </div>,
    document.body
  );
};

export default IndustrialFireboxSettings;