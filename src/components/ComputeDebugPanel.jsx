import React, { useState } from 'react';
import ReactDOM from 'react-dom';

const formatDebugInfoAsText = (debugInfo) => {
  if (!debugInfo) return 'No debug info available';
  
  let text = '=== COMPUTE DEBUG ===\n';
  
  // Summary
  text += `Iterations: ${debugInfo.totalIterations || 0} | Converged: ${debugInfo.converged ? 'Yes' : 'No'} | Updates: ${debugInfo.appliedUpdates?.length || 0}\n`;
  text += `Stopped: ${debugInfo.stoppedReason || 'unknown'}\n`;
  text += `Targets: ${debugInfo.targetNodeIds?.length || 0}\n\n`;
  
  // Before/After
  if (debugInfo.beforeState && debugInfo.afterState) {
    text += `BEFORE: Excess=${debugInfo.beforeState.excess.length} Deficiency=${debugInfo.beforeState.deficiency.length}\n`;
    text += `AFTER: Excess=${debugInfo.afterState.excess.length} Deficiency=${debugInfo.afterState.deficiency.length}\n\n`;
    
    if (debugInfo.beforeState.excess.length > 0 || debugInfo.afterState.excess.length > 0) {
      text += 'Excess Changes:\n';
      const beforeExcess = debugInfo.beforeState.excess.slice(0, 3);
      const afterExcess = debugInfo.afterState.excess.slice(0, 3);
      beforeExcess.forEach(item => text += `  B: ${item.product.name} ${item.excessRate.toFixed(2)}/s\n`);
      afterExcess.forEach(item => text += `  A: ${item.product.name} ${item.excessRate.toFixed(2)}/s\n`);
      if (debugInfo.beforeState.excess.length > 3 || debugInfo.afterState.excess.length > 3) {
        text += `  (+ more)\n`;
      }
      text += '\n';
    }
    
    if (debugInfo.beforeState.deficiency.length > 0 || debugInfo.afterState.deficiency.length > 0) {
      text += 'Deficiency Changes:\n';
      const beforeDef = debugInfo.beforeState.deficiency.slice(0, 3);
      const afterDef = debugInfo.afterState.deficiency.slice(0, 3);
      beforeDef.forEach(item => text += `  B: ${item.product.name} ${item.deficiencyRate.toFixed(2)}/s\n`);
      afterDef.forEach(item => text += `  A: ${item.product.name} ${item.deficiencyRate.toFixed(2)}/s\n`);
      if (debugInfo.beforeState.deficiency.length > 3 || debugInfo.afterState.deficiency.length > 3) {
        text += `  (+ more)\n`;
      }
      text += '\n';
    }
  }
  
  // Iteration summary
  const hasIterations = debugInfo.iterations && debugInfo.iterations.length > 0;
  if (hasIterations) {
    text += 'Iterations:\n';
    debugInfo.iterations.forEach(iter => {
      text += `  ${iter.iteration}: ${iter.updates.length} updates, ${iter.suggestions} suggestions\n`;
      if (iter.updates.length > 0) {
        iter.updates.slice(0, 3).forEach(u => {
          text += `    ${u.nodeName}: ${u.oldCount.toFixed(2)}→${u.newCount.toFixed(2)}\n`;
        });
        if (iter.updates.length > 3) text += `    (+ ${iter.updates.length - 3} more)\n`;
      }
    });
    text += '\n';
  }
  
  // Applied updates
  if (debugInfo.appliedUpdates && debugInfo.appliedUpdates.length > 0) {
    text += 'All Updates:\n';
    debugInfo.appliedUpdates.forEach((u, i) => {
      text += `  ${i + 1}. ${u.nodeName}: ${u.oldCount.toFixed(2)}→${u.newCount.toFixed(2)}\n`;
    });
  }
  
  return text;
};

const ComputeDebugPanel = ({ debugInfo, onClose }) => {
  const [expandedTargets, setExpandedTargets] = useState(new Set([0]));
  
  if (!debugInfo) {
    return ReactDOM.createPortal(
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '600px' }}>
          <h2 className="modal-title">Compute Machines Debug</h2>
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No compute data available. Press "Compute Machines" to see debug info.
          </div>
          <button onClick={onClose} className="btn btn-primary">Close</button>
        </div>
      </div>,
      document.body
    );
  }
  
  const hasIterations = debugInfo.iterations && debugInfo.iterations.length > 0;
  
  const toggleTarget = (targetIndex) => {
    const newExpanded = new Set(expandedTargets);
    if (newExpanded.has(targetIndex)) {
      newExpanded.delete(targetIndex);
    } else {
      newExpanded.add(targetIndex);
    }
    setExpandedTargets(newExpanded);
  };
  
  const totalApplied = debugInfo.appliedUpdates.length;
  
  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '900px', maxHeight: '90vh' }}>
        <h2 className="modal-title">Compute Machines Debug</h2>
        
        <div className="modal-content" style={{ maxHeight: '70vh' }}>
          {/* Before/After Comparison */}
          {debugInfo.beforeState && debugInfo.afterState && (
            <div style={{ 
              padding: '15px', 
              background: 'var(--bg-main)', 
              borderRadius: 'var(--radius-md)',
              marginBottom: '20px',
              border: '2px solid var(--border-primary)'
            }}>
              <h3 style={{ color: 'var(--color-primary)', fontSize: '16px', marginBottom: '10px' }}>Before vs After</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Before</div>
                  <div style={{ fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--output-text)' }}>Excess: {debugInfo.beforeState.excess.length}</span>
                  </div>
                  <div style={{ fontSize: '13px' }}>
                    <span style={{ color: 'var(--input-text)' }}>Deficiency: {debugInfo.beforeState.deficiency.length}</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>After</div>
                  <div style={{ fontSize: '13px', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--output-text)' }}>Excess: {debugInfo.afterState.excess.length}</span>
                  </div>
                  <div style={{ fontSize: '13px' }}>
                    <span style={{ color: 'var(--input-text)' }}>Deficiency: {debugInfo.afterState.deficiency.length}</span>
                  </div>
                </div>
              </div>
              
              {(debugInfo.beforeState.excess.length > 0 || debugInfo.afterState.excess.length > 0) && (
                <div style={{ marginTop: '15px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--output-text)' }}>
                    Excess Products
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      {debugInfo.beforeState.excess.slice(0, 5).map((item, idx) => (
                        <div key={idx} style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                          {item.product.name}: {item.excessRate.toFixed(2)}/s
                        </div>
                      ))}
                      {debugInfo.beforeState.excess.length > 5 && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          +{debugInfo.beforeState.excess.length - 5} more
                        </div>
                      )}
                    </div>
                    <div>
                      {debugInfo.afterState.excess.slice(0, 5).map((item, idx) => (
                        <div key={idx} style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                          {item.product.name}: {item.excessRate.toFixed(2)}/s
                        </div>
                      ))}
                      {debugInfo.afterState.excess.length > 5 && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          +{debugInfo.afterState.excess.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {(debugInfo.beforeState.deficiency.length > 0 || debugInfo.afterState.deficiency.length > 0) && (
                <div style={{ marginTop: '15px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--input-text)' }}>
                    Deficient Products
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      {debugInfo.beforeState.deficiency.slice(0, 5).map((item, idx) => (
                        <div key={idx} style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                          {item.product.name}: {item.deficiencyRate.toFixed(2)}/s
                        </div>
                      ))}
                      {debugInfo.beforeState.deficiency.length > 5 && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          +{debugInfo.beforeState.deficiency.length - 5} more
                        </div>
                      )}
                    </div>
                    <div>
                      {debugInfo.afterState.deficiency.slice(0, 5).map((item, idx) => (
                        <div key={idx} style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                          {item.product.name}: {item.deficiencyRate.toFixed(2)}/s
                        </div>
                      ))}
                      {debugInfo.afterState.deficiency.length > 5 && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          +{debugInfo.afterState.deficiency.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          
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
                <span style={{ color: 'var(--text-secondary)' }}>Iterations: </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{debugInfo.totalIterations || 0}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Converged: </span>
                <span style={{ color: debugInfo.converged ? 'var(--stat-positive)' : 'var(--stat-negative)', fontWeight: 600 }}>
                  {debugInfo.converged ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Applied Updates: </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{debugInfo.appliedUpdates?.length || 0}</span>
              </div>
            </div>
          </div>
          
          {/* Iteration Details */}
          {hasIterations && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ color: 'var(--color-primary)', fontSize: '16px', marginBottom: '15px' }}>Iteration Details</h3>
              {debugInfo.iterations.map((iter, idx) => (
                <div key={idx} style={{ 
                  marginBottom: '10px',
                  border: '2px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden'
                }}>
                  <div style={{ 
                    padding: '12px 15px',
                    background: 'var(--bg-secondary)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ 
                        color: 'var(--color-primary)', 
                        fontWeight: 700,
                        fontSize: '14px'
                      }}>
                        Iteration {iter.iteration}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {iter.updates.length} update{iter.updates.length !== 1 ? 's' : ''}, {iter.suggestions} suggestion{iter.suggestions !== 1 ? 's' : ''}
                    </div>
                  </div>
                  
                  {iter.updates.length > 0 && (
                    <div style={{ padding: '15px', background: 'var(--bg-main)' }}>
                      {iter.updates.map((update, uIdx) => (
                        <div key={uIdx} style={{ 
                          marginBottom: '8px',
                          padding: '10px',
                          background: 'var(--bg-secondary)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '12px'
                        }}>
                          <div style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>
                            {update.nodeName}
                          </div>
                          <div style={{ color: 'var(--text-secondary)' }}>
                            {update.oldCount.toFixed(4)} → {update.newCount.toFixed(4)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Final Summary - only show if old format */}
          {!hasIterations && debugInfo.targetRecipes && (
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ color: 'var(--color-primary)', fontSize: '16px', marginBottom: '15px' }}>Target Processing Order</h3>
            {debugInfo.targetRecipes.map((target, idx) => (
              <div key={idx} style={{ 
                marginBottom: '10px',
                border: '2px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden'
              }}>
                {/* Target Header */}
                <div 
                  onClick={() => toggleTarget(idx)}
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
                      minWidth: '80px'
                    }}>
                      Target #{target.index + 1}
                    </span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px' }}>
                      {target.nodeName}
                    </span>
                    {target.skipped && (
                      <span style={{ 
                        color: 'var(--delete-color)', 
                        fontSize: '12px',
                        fontStyle: 'italic'
                      }}>
                        (Skipped)
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {target.appliedSuggestions.length} suggestion{target.appliedSuggestions.length !== 1 ? 's' : ''}
                    </span>
                    <span style={{ 
                      color: 'var(--color-primary)', 
                      fontSize: '18px',
                      transition: 'transform 0.2s',
                      transform: expandedTargets.has(idx) ? 'rotate(90deg)' : 'rotate(0deg)'
                    }}>
                      ▶
                    </span>
                  </div>
                </div>
                
                {/* Target Details */}
                {expandedTargets.has(idx) && (
                  <div style={{ padding: '15px', background: 'var(--bg-main)' }}>
                    {target.skipped ? (
                      <div style={{ 
                        color: 'var(--delete-color)', 
                        fontSize: '13px',
                        padding: '10px',
                        background: 'var(--delete-bg)',
                        borderRadius: 'var(--radius-sm)'
                      }}>
                        {target.skipReason}
                      </div>
                    ) : (
                      <>
                        {/* Upstream Nodes */}
                        <div style={{ marginBottom: '15px' }}>
                          <div style={{ 
                            color: 'var(--text-primary)', 
                            fontSize: '14px', 
                            fontWeight: 600,
                            marginBottom: '8px'
                          }}>
                            Upstream Nodes Found: {target.upstreamNodes.length}
                          </div>
                          {target.upstreamNodes.length > 0 ? (
                            <div style={{ 
                              display: 'grid', 
                              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                              gap: '6px',
                              fontSize: '12px'
                            }}>
                              {target.upstreamNodes.map((node, nIdx) => (
                                <div key={nIdx} style={{ 
                                  padding: '4px 8px',
                                  background: 'var(--bg-secondary)',
                                  borderRadius: 'var(--radius-sm)',
                                  color: 'var(--text-secondary)'
                                }}>
                                  {node.nodeName}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
                              No upstream nodes (direct resource inputs)
                            </div>
                          )}
                        </div>
                        
                        {/* Applied Suggestions */}
                        <div>
                          <div style={{ 
                            color: 'var(--color-primary)', 
                            fontSize: '14px', 
                            fontWeight: 600,
                            marginBottom: '8px'
                          }}>
                            Applied Suggestions: {target.appliedSuggestions.length}
                          </div>
                          {target.appliedSuggestions.length > 0 ? (
                            target.appliedSuggestions.map((sugg, sIdx) => (
                              <div key={sIdx} style={{ 
                                marginBottom: '8px',
                                padding: '10px',
                                background: sugg.adjustmentType === 'increase' ? 'var(--input-bg)' : 'var(--output-bg)',
                                borderLeft: `3px solid ${sugg.adjustmentType === 'increase' ? 'var(--input-border)' : 'var(--output-border)'}`,
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '12px'
                              }}>
                                <div style={{ 
                                  color: 'var(--text-primary)', 
                                  fontWeight: 600, 
                                  marginBottom: '6px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}>
                                  <span>{sugg.nodeName}</span>
                                  <span style={{ 
                                    color: sugg.adjustmentType === 'increase' ? 'var(--input-text)' : 'var(--output-text)',
                                    fontSize: '11px',
                                    fontWeight: 500
                                  }}>
                                    {sugg.adjustmentType.toUpperCase()}
                                  </span>
                                </div>
                                <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                  Product: {sugg.productId} ({sugg.handleType} #{sugg.handleIndex})
                                </div>
                                <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                  Reason: {sugg.reason.replace(/_/g, ' ')}
                                </div>
                                <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                                  Machines: {sugg.oldCount.toFixed(4)} → {sugg.newCount.toFixed(4)}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
                              No suggestions applied (network already balanced or no suggestions available)
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          )}
          
          {/* Skipped Nodes */}
          {!hasIterations && debugInfo.skippedNodes && debugInfo.skippedNodes.length > 0 && (
            <div style={{ 
              padding: '15px', 
              background: 'var(--bg-main)', 
              borderRadius: 'var(--radius-md)',
              marginBottom: '20px',
              border: '2px solid var(--border-light)'
            }}>
              <h3 style={{ color: 'var(--text-secondary)', fontSize: '16px', marginBottom: '10px' }}>
                Skipped Nodes ({debugInfo.skippedNodes.length})
              </h3>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {debugInfo.skippedNodes.map((node, idx) => (
                  <div key={idx} style={{ marginBottom: '4px' }}>
                    • {node.nodeName} - {node.reason}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Final Summary */}
          <div style={{ 
            padding: '15px', 
            background: 'var(--bg-main)', 
            borderRadius: 'var(--radius-md)',
            border: '2px solid var(--color-primary)'
          }}>
            <h3 style={{ color: 'var(--color-primary)', fontSize: '16px', marginBottom: '10px' }}>
              All Applied Updates ({debugInfo.appliedUpdates.length})
            </h3>
            {debugInfo.appliedUpdates.length > 0 ? (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
                gap: '8px',
                fontSize: '13px'
              }}>
                {debugInfo.appliedUpdates.map((update, idx) => (
                  <div key={idx} style={{ 
                    padding: '8px 10px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{update.nodeName}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {update.oldCount.toFixed(2)} → {update.newCount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '10px' }}>
                No updates applied. Network may already be balanced.
              </div>
            )}
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          <button 
            onClick={() => {
              const text = formatDebugInfoAsText(debugInfo);
              navigator.clipboard.writeText(text).then(() => {
                alert('Debug info copied to clipboard!');
              }).catch(() => {
                // Fallback: show in a text area for manual copy
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                alert('Debug info copied to clipboard!');
              });
            }}
            className="btn btn-secondary"
          >
            Copy Debug Info
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

export default ComputeDebugPanel;