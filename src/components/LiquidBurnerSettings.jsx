import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { calculateLiquidBurnerPollution, buildLiquidBurnerInputs } from '../data/liquidBurner';
import { products } from '../data/dataLoader';

const LiquidBurnerSettings = ({ nodeId, currentSettings, recipe, onSettingsChange, onClose }) => {
  const [fluidProductIds, setFluidProductIds] = useState(
    currentSettings?.fluidProductIds || Array(8).fill('p_any_fluid')
  );
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

  const inputs = buildLiquidBurnerInputs(fluidProductIds);
  const pollution = calculateLiquidBurnerPollution(inputs);

  const handleProductChange = (index, productId) => {
    const newIds = [...fluidProductIds];
    newIds[index] = productId;
    setFluidProductIds(newIds);
  };

  const handleApply = () => {
    onSettingsChange(nodeId, { fluidProductIds }, inputs, []);
    onClose();
  };

  const resetSettings = () => {
    setFluidProductIds(Array(8).fill('p_any_fluid'));
  };

  return ReactDOM.createPortal(
    <div className="drill-settings-overlay" onClick={onClose}>
      <div ref={bubbleRef} className="drill-settings-bubble" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onWheel={handleWheel}>
        <h3 className="drill-settings-title">Liquid Burner Info</h3>

        <div className="drill-settings-content">
          {[0, 1, 2, 3, 4, 5, 6, 7].map(index => (
            <div key={index} className="drill-setting-group">
              <label className="drill-setting-label">Input {index + 1} Product:</label>
              <select 
                value={fluidProductIds[index]} 
                onChange={(e) => handleProductChange(index, e.target.value)} 
                className="select"
              >
                <option value="p_any_fluid">Any Fluid</option>
                {products.filter(p => p.type === 'fluid').map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          ))}

          <div className="drill-setting-group" style={{ 
            marginTop: '20px', padding: '12px', background: 'rgba(212, 166, 55, 0.1)', 
            borderRadius: '8px', fontSize: '13px' 
          }}>
            <div style={{ color: '#f5d56a', fontWeight: 600, marginBottom: '8px' }}>Pollution Calculation:</div>
            <div style={{ color: '#999', lineHeight: '1.6' }}>
              <div>• Water variants: 0%/hr</div>
              <div>• Residue: 8.64%/hr per /s</div>
              <div>• Other fluids: 0.0216%/hr per /s</div>
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(212, 166, 55, 0.3)' }}>
                <strong>Current Pollution: {pollution.toFixed(4)}%/hr</strong>
              </div>
            </div>
          </div>

          <div className="drill-setting-group" style={{ 
            marginTop: '15px', padding: '10px', background: 'rgba(59, 130, 246, 0.1)', 
            borderRadius: '8px', fontSize: '12px' 
          }}>
            <div style={{ color: '#60a5fa', fontWeight: 600, marginBottom: '6px' }}>💡 How it works:</div>
            <div style={{ color: '#999', lineHeight: '1.5' }}>
              <div>• Each input accepts up to 15/s of the selected fluid</div>
              <div>• Connect fluids to burn them for energy disposal</div>
              <div>• Water variants produce no pollution</div>
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

export default LiquidBurnerSettings;