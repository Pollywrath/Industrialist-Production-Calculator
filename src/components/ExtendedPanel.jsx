import React from 'react';
import { metricFormat } from '../utils/appUtilities';

const ExtendedPanel = ({
  extendedPanelOpen,
  extendedPanelClosing,
  displayMode,
  setDisplayMode,
  machineDisplayMode,
  setMachineDisplayMode,
  globalPollution,
  setGlobalPollution,
  isPollutionPaused,
  setIsPollutionPaused,
  pollutionInputFocused,
  setPollutionInputFocused,
  excessProducts,
  setSoldProducts,
  deficientProducts,
  machineStats
}) => {
  if (!extendedPanelOpen && !extendedPanelClosing) return null;

  return (
    <div className={`extended-panel ${extendedPanelClosing ? 'closing' : ''}`}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '15px', 
        borderBottom: '2px solid var(--border-divider)',
        position: 'sticky', 
        top: 0, 
        background: 'var(--bg-secondary)', 
        zIndex: 1 
      }}>
        <h3 style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>
          More Statistics
        </h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setDisplayMode(prev => prev === 'perSecond' ? 'perCycle' : 'perSecond')} 
            className="btn btn-secondary"
            style={{ padding: '8px 16px', fontSize: 'var(--font-size-base)', minWidth: 'auto' }}
            title={displayMode === 'perSecond' ? 'Switch to per-cycle display' : 'Switch to per-second display'}
          >
            {displayMode === 'perSecond' ? 'Per Second' : 'Per Cycle'}
          </button>
          <button 
            onClick={() => setMachineDisplayMode(prev => prev === 'perMachine' ? 'total' : 'perMachine')} 
            className="btn btn-secondary"
            style={{ padding: '8px 16px', fontSize: 'var(--font-size-base)', minWidth: 'auto' }}
            title={machineDisplayMode === 'perMachine' ? 'Switch to total display' : 'Switch to per-machine display'}
          >
            {machineDisplayMode === 'perMachine' ? 'Per Machine' : 'Total'}
          </button>
        </div>
      </div>
      
      <div className="extended-panel-content" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingBottom: '120px' }}>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="global-pollution" style={{ 
            color: 'var(--text-primary)', 
            fontSize: 'var(--font-size-base)', 
            fontWeight: 600, 
            display: 'block', 
            marginBottom: '8px' 
          }}>
            Global Pollution (%):
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              onClick={() => setIsPollutionPaused(prev => !prev)}
              className="btn btn-secondary"
              style={{ 
                padding: '10px 16px', 
                minWidth: 'auto',
                fontSize: 'var(--font-size-lg)',
                lineHeight: 1
              }}
              title={isPollutionPaused ? 'Resume pollution change' : 'Pause pollution change'}
            >
              {isPollutionPaused ? '▶' : '❚❚'}
            </button>
            <input 
              id="global-pollution" 
              type="number"
              step="0.0001"
              value={globalPollution} 
              onFocus={() => setPollutionInputFocused(true)}
              onBlur={(e) => { 
                setPollutionInputFocused(false); 
                const val = e.target.value; 
                const num = parseFloat(val);
                setGlobalPollution(!isNaN(num) && isFinite(num) ? parseFloat(num.toFixed(4)) : 0); 
              }}
              onChange={(e) => setGlobalPollution(e.target.value === '' ? '' : parseFloat(e.target.value))} 
              className="input" 
              placeholder="Enter global pollution" 
              style={{ flex: 1, textAlign: 'left' }} 
            />
          </div>
        </div>

        <div style={{ marginTop: '30px' }}>
          <h4 style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: '12px' }}>
            Excess Products:
          </h4>
          {excessProducts.length === 0 ? (
            <div style={{ 
              color: 'var(--text-secondary)', 
              fontSize: 'var(--font-size-sm)', 
              padding: '15px', 
              textAlign: 'center', 
              background: 'var(--bg-main)', 
              borderRadius: 'var(--radius-sm)' 
            }}>
              No excess products. All outputs are consumed by connected inputs.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {excessProducts.map(item => (
                <div key={item.productId} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '10px 12px',
                  background: 'var(--bg-main)', 
                  borderRadius: 'var(--radius-sm)', 
                  border: item.isSold ? '2px solid var(--color-primary)' : '2px solid var(--border-light)' 
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                      {item.product.name}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: '2px' }}>
                      {metricFormat(item.excessRate)}/s
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {typeof item.product.price === 'number' && (
                      <div style={{ 
                        color: item.isSold ? 'var(--color-primary)' : 'var(--text-muted)', 
                        fontSize: 'var(--font-size-sm)', 
                        fontWeight: 600 
                      }}>
                        ${metricFormat(item.product.price * item.excessRate)}/s
                      </div>
                    )}
                    <label style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      cursor: 'pointer', 
                      color: 'var(--text-primary)', 
                      fontSize: 'var(--font-size-sm)' 
                    }}>
                      <input 
                        type="checkbox" 
                        checked={item.isSold} 
                        onChange={(e) => setSoldProducts(prev => ({ ...prev, [item.productId]: e.target.checked }))}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--color-primary)' }} 
                      />
                      Sell
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: '30px' }}>
          <h4 style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: '12px' }}>
            Deficient Products:
          </h4>
          {deficientProducts.length === 0 ? (
            <div style={{ 
              color: 'var(--text-secondary)', 
              fontSize: 'var(--font-size-sm)', 
              padding: '15px', 
              textAlign: 'center',
              background: 'var(--bg-main)', 
              borderRadius: 'var(--radius-sm)' 
            }}>
              No deficient products. All inputs are fully supplied by connected outputs.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {deficientProducts.map(item => (
                <div key={item.productId} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '10px 12px',
                  background: 'var(--bg-main)', 
                  borderRadius: 'var(--radius-sm)', 
                  border: '2px solid #fca5a5' 
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                      {item.product.name}
                    </div>
                    <div style={{ color: '#fca5a5', fontSize: 'var(--font-size-xs)', marginTop: '2px' }}>
                      Shortage: {metricFormat(item.deficiencyRate)}/s
                    </div>
                  </div>
                  <div style={{ color: '#fca5a5', fontSize: 'var(--font-size-xs)', fontWeight: 600, textAlign: 'right' }}>
                    {item.affectedNodes.length} node{item.affectedNodes.length !== 1 ? 's' : ''} affected
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: '30px' }}>
          <h4 style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: '12px' }}>
            Machine Costs:
          </h4>
          {machineStats.stats.length === 0 ? (
            <div style={{ 
              color: 'var(--text-secondary)', 
              fontSize: 'var(--font-size-sm)', 
              padding: '15px', 
              textAlign: 'center',
              background: 'var(--bg-main)', 
              borderRadius: 'var(--radius-sm)' 
            }}>
              No machines on canvas.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                {machineStats.stats.map(stat => (
                  <div key={stat.machineId} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '10px 12px',
                    background: 'var(--bg-main)', 
                    borderRadius: 'var(--radius-sm)', 
                    border: '2px solid var(--border-light)' 
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                        {stat.machine.name}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: '2px' }}>
                        Count: {stat.count} × ${metricFormat(stat.cost)}
                      </div>
                    </div>
                    <div style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                      ${metricFormat(stat.totalCost)}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ 
                padding: '12px', 
                background: 'var(--bg-main)', 
                borderRadius: 'var(--radius-sm)', 
                border: '2px solid var(--color-primary)' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-base)', fontWeight: 700 }}>
                    Total Cost:
                  </div>
                  <div style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-md)', fontWeight: 700 }}>
                    ${metricFormat(machineStats.totalCost)}
                  </div>
                </div>
                <div style={{ 
                  color: 'var(--text-muted)', 
                  fontSize: 'var(--font-size-xs)', 
                  fontStyle: 'italic', 
                  textAlign: 'center' 
                }}>
                  For machines only. Poles and pipes not accounted for.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExtendedPanel;