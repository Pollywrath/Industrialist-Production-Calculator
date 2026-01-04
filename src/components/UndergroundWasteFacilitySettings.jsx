import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { calculateWasteFacilityMetrics, buildWasteFacilityInputs, MAX_INPUT_FLOW } from '../data/undergroundWasteFacility';
import { getProduct, products } from '../data/dataLoader';

const UndergroundWasteFacilitySettings = ({ nodeId, currentSettings, onSettingsChange, onClose }) => {
  const [itemProductId, setItemProductId] = useState(currentSettings?.itemProductId || 'p_any_item');
  const [fluidProductId, setFluidProductId] = useState(currentSettings?.fluidProductId || 'p_any_fluid');
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

  const inputs = buildWasteFacilityInputs(0, 0, itemProductId, fluidProductId, 'p_concrete_block');

  const handleProductChange = (type, productId) => {
    if (type === 'item') {
      setItemProductId(productId);
    } else if (type === 'fluid') {
      setFluidProductId(productId);
    }
  };

  const handleApply = () => {
    onSettingsChange(nodeId, { itemProductId, fluidProductId }, inputs, []);
    onClose();
  };

  const resetSettings = () => {
    setItemProductId('p_any_item');
    setFluidProductId('p_any_fluid');
  };

  return ReactDOM.createPortal(
    <div className="drill-settings-overlay" onClick={onClose}>
      <div ref={bubbleRef} className="drill-settings-bubble" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onWheel={handleWheel}>
        <h3 className="drill-settings-title">Underground Waste Facility Settings</h3>

        <div className="drill-settings-content">
          <div className="drill-setting-group">
            <label className="drill-setting-label">Item Input Product:</label>
            <select 
              value={itemProductId} 
              onChange={(e) => handleProductChange('item', e.target.value)} 
              className="select"
            >
              <option value="p_any_item">Any Item</option>
              {products.filter(p => p.type === 'item').map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="drill-setting-group">
            <label className="drill-setting-label">Fluid Input Product:</label>
            <select 
              value={fluidProductId} 
              onChange={(e) => handleProductChange('fluid', e.target.value)} 
              className="select"
            >
              <option value="p_any_fluid">Any Fluid</option>
              {products.filter(p => p.type === 'fluid').map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="drill-setting-group" style={{
            marginTop: '20px', padding: '10px', background: 'rgba(59, 130, 246, 0.1)', 
            borderRadius: '8px', fontSize: '12px' 
          }}>
            <div style={{ color: '#60a5fa', fontWeight: 600, marginBottom: '6px' }}>💡 How it works:</div>
            <div style={{ color: '#999', lineHeight: '1.5' }}>
              <div>• Each input accepts up to 240/s</div>
              <div>• Fixed requirements per cycle:</div>
              <div style={{ marginLeft: '15px' }}>- 4.8 Concrete Blocks/s</div>
              <div style={{ marginLeft: '15px' }}>- 2.4 Lead Ingots/s</div>
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

export default UndergroundWasteFacilitySettings;