import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { getLastDebugInfo, DEBUG_MODE, setDebugMode } from '../utils/machineCountPropagator';

const PropagationDebugPanel = ({ onClose }) => {
  const debugInfo = getLastDebugInfo();
  const [expandedSteps, setExpandedSteps] = useState(new Set([0]));
  
  if (!debugInfo) {
    return ReactDOM.createPortal(
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '600px' }}>
          <h2 className="modal-title">Propagation Debug</h2>
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No propagation data available. Make a machine count change to see debug info.
          </div>
          <button onClick={onClose} className="btn btn-primary">Close</button>
        </div>
      </div>,
      document.body
    );
  }
  
  const toggleStep = (stepIndex) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepIndex)) {
      newExpanded.delete(stepIndex);
    } else {
      newExpanded.add(stepIndex);
    }
    setExpandedSteps(newExpanded);
  };
  
  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '900px', maxHeight: '90vh' }}>
        <h2 className="modal-title">Propagation Debug Info</h2>
        
        <div className="modal-content" style={{ maxHeight: '70vh' }}>
          {/* Summary */}
          <div style={{ 
            padding: '15px', 
            background: 'var(--bg-main)', 
            borderRadius: 'var(--radius-md)',
            marginBottom: '20px',
            border: '2px solid var(--color-primary)'
          }}>
            <h3 style={{ color: 'var(--color-primary)', fontSize: '16px', marginBottom: '10px' }}>Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Source Node: </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{debugInfo.sourceNodeId}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Nodes Affected: </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{debugInfo.finalCounts.size}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Old Count: </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{debugInfo.oldMachineCount.toFixed(4)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>New Count: </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{debugInfo.newMachineCount.toFixed(4)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Ratio: </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {(debugInfo.newMachineCount / debugInfo.oldMachineCount).toFixed(4)}x
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Steps: </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{debugInfo.steps.length}</span>
              </div>
            </div>
          </div>
          
          {/* Warnings */}
          {debugInfo.warnings.length > 0 && (
            <div style={{ 
              padding: '15px', 
              background: 'var(--delete-bg)', 
              borderRadius: 'var(--radius-md)',
              marginBottom: '20px',
              border: '2px solid var(--delete-color)'
            }}>
              <h3 style={{ color: 'var(--delete-color)', fontSize: '16px', marginBottom: '10px' }}>⚠️ Warnings</h3>
              {debugInfo.warnings.map((warning, idx) => (
                <div key={idx} style={{ color: 'var(--delete-color)', fontSize: '13px', marginBottom: '5px' }}>
                  • {warning}
                </div>
              ))}
            </div>
          )}
          
          {/* Propagation Steps */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ color: 'var(--color-primary)', fontSize: '16px', marginBottom: '15px' }}>Propagation Steps</h3>
            {debugInfo.steps.map((step, idx) => (
              <div key={idx} style={{ 
                marginBottom: '10px',
                border: '2px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden'
              }}>
                {/* Step Header */}
                <div 
                  onClick={() => toggleStep(idx)}
                  style={{ 
                    padding: '12px 15px',
                    background: 'var(--bg-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-main)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ 
                      color: 'var(--color-primary)', 
                      fontWeight: 700,
                      fontSize: '14px',
                      minWidth: '60px'
                    }}>
                      Step {step.step}
                    </span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px' }}>
                      {step.nodeName}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {step.oldCount.toFixed(2)} → {step.newCount.toFixed(2)}
                    </span>
                    <span style={{ 
                      color: 'var(--color-primary)', 
                      fontSize: '18px',
                      transition: 'transform 0.2s',
                      transform: expandedSteps.has(idx) ? 'rotate(90deg)' : 'rotate(0deg)'
                    }}>
                      ▶
                    </span>
                  </div>
                </div>
                
                {/* Step Details */}
                {expandedSteps.has(idx) && (
                  <div style={{ padding: '15px', background: 'var(--bg-main)' }}>
                    <div style={{ marginBottom: '10px', fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Reason: </span>
                      <span style={{ color: 'var(--text-primary)' }}>{step.reason}</span>
                    </div>
                    
                    {/* Downstream */}
                    {step.downstream.length > 0 && (
                      <div style={{ marginBottom: '15px' }}>
                        <div style={{ 
                          color: 'var(--output-text)', 
                          fontSize: '14px', 
                          fontWeight: 600,
                          marginBottom: '8px'
                        }}>
                          ↓ Downstream Consumers ({step.downstream.length})
                        </div>
                        {step.downstream.map((ds, dsIdx) => (
                          <div key={dsIdx} style={{ 
                            marginLeft: '15px',
                            padding: '8px 10px',
                            background: ds.applied ? 'var(--output-bg)' : 'rgba(255,255,255,0.05)',
                            borderLeft: `3px solid ${ds.applied ? 'var(--output-border)' : 'var(--border-light)'}`,
                            marginBottom: '5px',
                            fontSize: '12px'
                          }}>
                            <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>
                              {ds.targetNodeName} {ds.applied ? '✓' : '✗'}
                            </div>
                            <div style={{ color: 'var(--text-secondary)' }}>
                              Product: {ds.productId}
                            </div>
                            <div style={{ color: 'var(--text-secondary)' }}>
                              Flow: {ds.oldFlow.toFixed(4)} → {ds.newFlow.toFixed(4)}
                            </div>
                            <div style={{ color: 'var(--text-secondary)' }}>
                              Machines: {ds.targetOldCount.toFixed(4)} → {ds.machinesNeeded.toFixed(4)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Upstream */}
                    {step.upstream.length > 0 && (
                      <div>
                        <div style={{ 
                          color: 'var(--input-text)', 
                          fontSize: '14px', 
                          fontWeight: 600,
                          marginBottom: '8px'
                        }}>
                          ↑ Upstream Producers ({step.upstream.length})
                        </div>
                        {step.upstream.map((us, usIdx) => (
                          <div key={usIdx} style={{ 
                            marginLeft: '15px',
                            padding: '8px 10px',
                            background: us.applied ? 'var(--input-bg)' : 'rgba(255,255,255,0.05)',
                            borderLeft: `3px solid ${us.applied ? 'var(--input-border)' : 'var(--border-light)'}`,
                            marginBottom: '5px',
                            fontSize: '12px'
                          }}>
                            <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>
                              {us.sourceNodeName} {us.applied ? '✓' : '✗'}
                            </div>
                            <div style={{ color: 'var(--text-secondary)' }}>
                              Product: {us.productId}
                            </div>
                            <div style={{ color: 'var(--text-secondary)' }}>
                              Flow: {us.oldFlow.toFixed(4)} → {us.newFlow.toFixed(4)}
                            </div>
                            <div style={{ color: 'var(--text-secondary)' }}>
                              Machines: {us.sourceOldCount.toFixed(4)} → {us.machinesNeeded.toFixed(4)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* Multi-Output Adjustments */}
          {debugInfo.multiOutputAdjustments && debugInfo.multiOutputAdjustments.length > 0 && (
            <div style={{ 
              padding: '15px', 
              background: 'var(--bg-main)', 
              borderRadius: 'var(--radius-md)',
              border: '2px solid var(--color-primary)'
            }}>
              <h3 style={{ color: 'var(--color-primary)', fontSize: '16px', marginBottom: '10px' }}>
                Multi-Output Adjustments
              </h3>
              {debugInfo.multiOutputAdjustments.map((adj, idx) => (
                <div key={idx} style={{ 
                  marginBottom: '10px',
                  padding: '10px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)'
                }}>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '8px' }}>
                    {adj.nodeName}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                    {adj.originalCount.toFixed(4)} → {adj.adjustedCount.toFixed(4)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {adj.outputRequirements.map((req, reqIdx) => (
                      <div key={reqIdx}>
                        • {req.productId}: needs {req.requiredCount.toFixed(4)} machines
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Final Counts */}
          <div style={{ 
            padding: '15px', 
            background: 'var(--bg-main)', 
            borderRadius: 'var(--radius-md)',
            marginTop: '20px',
            border: '2px solid var(--color-primary)'
          }}>
            <h3 style={{ color: 'var(--color-primary)', fontSize: '16px', marginBottom: '10px' }}>
              Final Machine Counts ({debugInfo.finalCounts.size} nodes)
            </h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
              gap: '8px',
              fontSize: '13px'
            }}>
              {Array.from(debugInfo.finalCounts.entries()).map(([nodeId, count]) => (
                <div key={nodeId} style={{ 
                  padding: '6px 10px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{nodeId}</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {count.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button 
            onClick={() => {
              console.log('Full debug info:', debugInfo);
              alert('Full debug info logged to console');
            }}
            className="btn btn-secondary"
          >
            Log to Console
          </button>
          <button onClick={onClose} className="btn btn-primary" style={{ flex: 1 }}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PropagationDebugPanel;