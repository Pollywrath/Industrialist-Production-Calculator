import React from 'react';
import { TIPS } from './ComputeModal';

const HelpModal = ({ onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '800px', maxHeight: '85vh' }}>
        <h2 className="modal-title">Help & Controls</h2>
        
        <div className="modal-content" style={{ maxHeight: 'calc(85vh - 120px)', overflowY: 'auto', paddingRight: '10px' }}>
          
          {/* Controls Section */}
          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ color: 'var(--color-primary)', fontSize: '18px', fontWeight: 700, marginBottom: '15px', borderBottom: '2px solid var(--border-divider)', paddingBottom: '8px' }}>
              Controls
            </h3>
            
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600, marginBottom: '10px' }}>Basic</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '15px' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Add Recipe:</span> Click "+ Select Recipe"
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Pan:</span> Left-drag on canvas
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Zoom:</span> Mouse wheel
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Connect:</span> Drag from output (right) to input (left)
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-divider)', margin: '15px 0' }}></div>

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600, marginBottom: '10px' }}>Node Actions</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '15px' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Edit Count:</span> Double-click node
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Lock/Cap Count:</span> Click 🔓/🔒/📊 icon on node
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Auto-Balance:</span> Double-click handle
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Set Target:</span> Shift+Click node
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Delete:</span> Ctrl+Alt+Click node
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Duplicate:</span> Middle-click node, left-click to place
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Configure:</span> Click ⚙️ on special recipes
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-divider)', margin: '15px 0' }}></div>

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600, marginBottom: '10px' }}>Connection Actions</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '15px' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Delete:</span> Ctrl+Click input/output rectangle
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Auto-Connect:</span> Click input/output rectangle
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border-divider)', margin: '15px 0' }}></div>

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600, marginBottom: '10px' }}>Display</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '15px' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Per Second/Cycle:</span> Toggle in extended panel
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Total/Per Machine:</span> Toggle in extended panel
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Pause Pollution:</span> ▶/❚❚ button
                </div>
              </div>
            </div>
          </div>

          {/* Node Anatomy Section */}
          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ color: 'var(--color-primary)', fontSize: '18px', fontWeight: 700, marginBottom: '15px', borderBottom: '2px solid var(--border-divider)', paddingBottom: '8px' }}>
              Understanding Nodes
            </h3>
            
            <div style={{ marginBottom: '20px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '15px' }}>
                A <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>node</span> represents a recipe box on the canvas. Each node shows inputs (left), outputs (right), and production statistics.
              </p>

              {/* Visual Diagram */}
              <div style={{ 
                background: 'var(--bg-main)', 
                border: '2px solid var(--border-divider)', 
                borderRadius: 'var(--radius-md)', 
                padding: '30px 20px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '30px', flexWrap: 'wrap' }}>
                  {/* Simple Node Representation */}
                  <div style={{ 
                    width: '320px', 
                    minHeight: '200px',
                    background: 'var(--bg-secondary)', 
                    border: '3px solid var(--border-primary)', 
                    borderRadius: 'var(--radius-md)',
                    padding: '15px',
                    position: 'relative'
                  }}>
                    {/* Recipe Name */}
                    <div style={{ 
                      color: 'var(--text-primary)', 
                      fontSize: '14px', 
                      fontWeight: 600, 
                      textAlign: 'center',
                      marginBottom: '10px'
                    }}>
                      Makes Iron Ingot
                    </div>

                    {/* Stats Row */}
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      marginBottom: '50px', 
                      paddingBottom: '10px',
                      borderBottom: '1px solid var(--border-divider)',
                      fontSize: '11px' 
                    }}>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        <div>Cycle: 4s</div>
                        <div>Power: 150kW</div>
                        <div>Pollution: 0%/hr</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: 'var(--tier-1-color)', fontWeight: 600 }}>Ingot Molder</div>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '18px' }}>5.0</div>
                      </div>
                    </div>

                    {/* Input Side */}
                    <div style={{ position: 'absolute', left: '-12px', top: '140px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <div style={{ 
                            width: '12px', 
                            height: '12px', 
                            background: 'var(--handle-input-deficient)', 
                            border: '2px solid #1a1a1a',
                            borderRadius: '50%'
                          }}></div>
                          <div style={{ 
                            background: 'var(--input-bg)', 
                            border: '2px solid var(--input-border)', 
                            color: 'var(--input-text)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '6px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap'
                          }}>
                            4x Liquid Iron
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Output Side */}
                    <div style={{ position: 'absolute', right: '-12px', top: '140px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <div style={{ 
                            background: 'var(--output-bg)', 
                            border: '2px solid var(--output-border)', 
                            color: 'var(--output-text)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '6px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap'
                          }}>
                            2x Iron Ingot
                          </div>
                          <div style={{ 
                            width: '12px', 
                            height: '12px', 
                            background: 'var(--handle-output-excess)', 
                            border: '2px solid #1a1a1a',
                            borderRadius: '2px'
                          }}></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Legend */}
                  <div style={{ minWidth: '250px' }}>
                    <div style={{ marginBottom: '15px' }}>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>Node Components:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                        <div style={{ color: 'var(--text-secondary)' }}>• Recipe name at top</div>
                        <div style={{ color: 'var(--text-secondary)' }}>• Production stats (cycle, power, pollution)</div>
                        <div style={{ color: 'var(--text-secondary)' }}>• Machine name and count</div>
                        <div style={{ color: 'var(--text-secondary)' }}>• Input rectangles (left, green)</div>
                        <div style={{ color: 'var(--text-secondary)' }}>• Output rectangles (right, red)</div>
                        <div style={{ color: 'var(--text-secondary)' }}>• Handles for connections</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Handle States */}
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>Handle States</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '180px' }}>
                      <div style={{ 
                        width: '14px', 
                        height: '14px', 
                        background: 'var(--handle-input-supplied)', 
                        border: '2px solid #1a1a1a',
                        borderRadius: '2px'
                      }}></div>
                      <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>Input Supplied:</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Input is fully connected to outputs (square for items)</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '180px' }}>
                      <div style={{ 
                        width: '14px', 
                        height: '14px', 
                        background: 'var(--handle-input-deficient)', 
                        border: '2px solid #1a1a1a',
                        borderRadius: '2px'
                      }}></div>
                      <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>Input Deficient:</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Input needs more supply (not enough connected)</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '180px' }}>
                      <div style={{ 
                        width: '14px', 
                        height: '14px', 
                        background: 'var(--handle-output-connected)', 
                        border: '2px solid #1a1a1a',
                        borderRadius: '50%'
                      }}></div>
                      <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>Output Connected:</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Output is fully consumed by inputs (circle for fluids)</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '180px' }}>
                      <div style={{ 
                        width: '14px', 
                        height: '14px', 
                        background: 'var(--handle-output-excess)', 
                        border: '2px solid #1a1a1a',
                        borderRadius: '50%'
                      }}></div>
                      <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>Output Excess:</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Output has excess production (not fully consumed)</span>
                  </div>

                  <div style={{ 
                    marginTop: '8px', 
                    padding: '10px', 
                    background: 'rgba(212, 166, 55, 0.1)', 
                    border: '1px solid var(--border-divider)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    color: 'var(--text-secondary)'
                  }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Note:</strong> Handle shapes indicate product type - squares for items, circles for fluids
                  </div>
                </div>
              </div>

              {/* Special Node Features */}
              <div style={{ marginTop: '25px' }}>
                <h4 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>Special Node Features</h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', paddingLeft: '15px' }}>
                  {/* Temperature Indicator */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <div style={{ 
                        background: 'var(--bg-secondary)',
                        border: '2px solid var(--border-primary)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--output-text)'
                      }}>
                        450°C
                      </div>
                      <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>Temperature Indicator</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px', paddingLeft: '15px' }}>
                      Appears on nodes with heat sources (boilers, heaters) or temperature-dependent recipes. Shows output temperature for heat sources (red border) or input temperature for temperature-dependent machines (green border). Connect heat sources to boilers and boilers to temperature-dependent recipes to change their values.
                    </div>
                  </div>

                  {/* Settings Button */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <div style={{ 
                        fontSize: '18px',
                        lineHeight: 1
                      }}>
                        ⚙️
                      </div>
                      <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>Settings Button</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px', paddingLeft: '15px' }}>
                      Appears on special recipe nodes. Click to configure:
                      <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px' }}>
                        <li><strong>Mineshaft Drill:</strong> Drill head, consumables, depth, machine oil</li>
                        <li><strong>Logic Assembler:</strong> Microchip stages, tick delays, machine oil</li>
                        <li><strong>Tree Farm:</strong> Trees, harvesters, sprinklers, output hoppers</li>
                        <li><strong>Industrial Firebox:</strong> Fuel type selection</li>
                        <li><strong>Chemical Plant:</strong> Speed and efficiency factors</li>
                        <li><strong>Temperature Machines:</strong> Output temperature settings</li>
                        <li><strong>Boilers:</strong> Heat loss and coolant temperature</li>
                        <li><strong>Underground Waste Facility:</strong> Input product types</li>
                        <li><strong>Liquid Dump/Burner:</strong> View pollution calculations</li>
                      </ul>
                    </div>
                  </div>

                  {/* Target Indicator */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <div style={{ 
                        width: '24px',
                        height: '24px',
                        border: '3px solid var(--color-primary)',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 700,
                        color: 'var(--color-primary)',
                        boxShadow: '0 0 8px var(--color-primary)'
                      }}>
                        T
                      </div>
                      <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>Target Node</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '12px', paddingLeft: '15px' }}>
                      Nodes marked as targets (Shift+Click) show a glowing border. Use "View Targets" to manage production goals or "Compute Machines" to optimize machine counts across all targets.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Capabilities Section */}
          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ color: 'var(--color-primary)', fontSize: '18px', fontWeight: 700, marginBottom: '15px', borderBottom: '2px solid var(--border-divider)', paddingBottom: '8px' }}>
              Capabilities
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '15px' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: 'var(--stat-positive)', fontSize: '16px', lineHeight: '20px' }}>✓</span>
                <span><span style={{ fontWeight: 600 }}>Automatic Ratio Calculation:</span> Determines optimal production ratios for most recipes</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: 'var(--stat-positive)', fontSize: '16px', lineHeight: '20px' }}>✓</span>
                <span><span style={{ fontWeight: 600 }}>Temperature System:</span> Full support for heat sources, boilers, and temperature-dependent recipes</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: 'var(--stat-positive)', fontSize: '16px', lineHeight: '20px' }}>✓</span>
                <span><span style={{ fontWeight: 600 }}>Special Recipes:</span> Mineshaft Drill, Logic Assembler, Tree Farm, Industrial Firebox, Chemical Plant, Underground Waste Facility, Liquid Dump/Burner</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: 'var(--stat-positive)', fontSize: '16px', lineHeight: '20px' }}>✓</span>
                <span><span style={{ fontWeight: 600 }}>LP Solver:</span> Set production targets and compute optimal machine counts across the entire production line</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: 'var(--stat-positive)', fontSize: '16px', lineHeight: '20px' }}>✓</span>
                <span><span style={{ fontWeight: 600 }}>Flow Analysis:</span> Real-time detection of excess production and deficiencies with visual indicators</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: 'var(--stat-positive)', fontSize: '16px', lineHeight: '20px' }}>✓</span>
                <span><span style={{ fontWeight: 600 }}>Pollution Tracking:</span> Global pollution simulation with real-time updates affecting tree farms and air separation units</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: 'var(--stat-positive)', fontSize: '16px', lineHeight: '20px' }}>✓</span>
                <span><span style={{ fontWeight: 600 }}>Data Management:</span> Import/export custom products, machines, recipes, and complete canvas layouts</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: 'var(--stat-positive)', fontSize: '16px', lineHeight: '20px' }}>✓</span>
                <span><span style={{ fontWeight: 600 }}>Theme Customization:</span> Full theme editor with color schemes, edge styles, and visual preferences</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: 'var(--stat-positive)', fontSize: '16px', lineHeight: '20px' }}>✓</span>
                <span><span style={{ fontWeight: 600 }}>Auto-Save:</span> Canvas state automatically persists to browser storage</span>
              </div>
            </div>
          </div>

          {/* Current Limitations Section */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ color: '#fca5a5', fontSize: '18px', fontWeight: 700, marginBottom: '15px', borderBottom: '2px solid var(--border-divider)', paddingBottom: '8px' }}>
              Current Limitations
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '15px' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: '#fca5a5', fontSize: '16px', lineHeight: '20px' }}>✗</span>
                <span><span style={{ fontWeight: 600 }}>Power Production:</span> Cannot calculate power generation from generators or power plants</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: '#fca5a5', fontSize: '16px', lineHeight: '20px' }}>✗</span>
                <span><span style={{ fontWeight: 600 }}>CPP Setups:</span> Coal Power Plant configurations not yet supported</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: '#fca5a5', fontSize: '16px', lineHeight: '20px' }}>✗</span>
                <span><span style={{ fontWeight: 600 }}>NPP Setups:</span> Nuclear Power Plant configurations not yet supported</span>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: '#fca5a5', fontSize: '16px', lineHeight: '20px' }}>✗</span>
                <span><span style={{ fontWeight: 600 }}>Some Variable Recipes:</span> A few recipes still have variable quantities that cannot be auto-calculated</span>
              </div>
            </div>
          </div>

          {/* Tips Section */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ color: 'var(--color-primary)', fontSize: '18px', fontWeight: 700, marginBottom: '15px', borderBottom: '2px solid var(--border-divider)', paddingBottom: '8px' }}>
              Tips
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '15px' }}>
              {TIPS.map((tip, i) => (
                <div key={i} style={{ color: 'var(--text-secondary)', fontSize: '14px', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <span style={{ color: 'var(--color-primary)', fontSize: '16px', lineHeight: '20px' }}>💡</span>
                  <span>{tip.replace(/^Tip: /, '')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Contact & Links Section */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ color: 'var(--color-primary)', fontSize: '18px', fontWeight: 700, marginBottom: '15px', borderBottom: '2px solid var(--border-divider)', paddingBottom: '8px' }}>
              Contact & Links
            </h3>
            
            <div style={{ paddingLeft: '15px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '15px' }}>
                Found a bug? Have suggestions? Want to contribute?
              </p>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 20px', fontSize: '14px' }}>
                <div>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Discord: </span>
                  <a 
                    href="https://discord.com/users/pollywrath4961" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: 'var(--color-primary)', textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                  >
                    pollywrath4961
                  </a>
                </div>

                <div>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Reddit: </span>
                  <a 
                    href="https://www.reddit.com/user/Pollywrath5" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: 'var(--color-primary)', textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                  >
                    u/Pollywrath5
                  </a>
                </div>

                <div>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Roblox: </span>
                  <a 
                    href="https://www.roblox.com/users/profile?username=Pollywrath5" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: 'var(--color-primary)', textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                  >
                    Pollywrath5
                  </a>
                </div>

                <div>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>GitHub: </span>
                  <a 
                    href="https://github.com/Pollywrath/Industrialist-Production-Calculator" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: 'var(--color-primary)', textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
                  >
                    Source Code
                  </a>
                </div>
              </div>
            </div>
          </div>

        </div>

        <button onClick={onClose} className="btn btn-secondary" style={{ marginTop: '20px' }}>Close</button>
      </div>
    </div>
  );
};

export default HelpModal;