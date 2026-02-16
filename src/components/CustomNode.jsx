import React, { useState, memo, useCallback, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { getProduct } from '../data/dataLoader';
import { getProductName, formatPowerConsumption, formatPollution } from '../utils/variableHandler';
import { isTemperatureProduct, formatTemperature, needsTemperatureConfig, needsBoilerConfig, HEAT_SOURCES, 
  DEFAULT_STEAM_TEMPERATURE, hasTempDependentCycle, getTempDependentCycleTime, TEMP_DEPENDENT_MACHINES, 
  recipeUsesSteam, getSteamInputIndex } from '../utils/temperatureUtils';
import UnifiedSettings from './UnifiedSettings';

const RECT_HEIGHT = 44, RECT_GAP = 8, SIDE_PADDING = 10, COLUMN_GAP = 20, NODE_WIDTH = 380, BASE_INFO_HEIGHT = 120;

const smartFormat = (num) => typeof num === 'number' ? Math.round(num * 10000) / 10000 : num;

const CustomNode = memo(({ data, id }) => {
  const { recipe, machine, machineCount, displayMode, machineDisplayMode, onInputClick, onOutputClick, isTarget,
    onDrillSettingsChange, onLogicAssemblerSettingsChange, onTreeFarmSettingsChange, onIndustrialFireboxSettingsChange, 
    onTemperatureSettingsChange, onBoilerSettingsChange, onChemicalPlantSettingsChange, globalPollution, flows, isMobile, mobileActionMode, onMachineCountModeChange, zoomLevel } = data;
  
  // Determine detail level based on zoom
  const showDetails = !zoomLevel || zoomLevel >= 0.25;
  
  const [settingsModal, setSettingsModal] = useState(null);
  
  if (!recipe?.inputs || !recipe?.outputs || !machine) return null;
  
  const isMineshaftDrill = recipe.isMineshaftDrill || recipe.id === 'r_mineshaft_drill';
  const isLogicAssembler = recipe.isLogicAssembler || recipe.id === 'r_logic_assembler';
  const isTreeFarm = recipe.isTreeFarm || recipe.id === 'r_tree_farm';
  const isWasteFacility = recipe.isWasteFacility || recipe.id === 'r_underground_waste_facility';
  const isLiquidDump = recipe.isLiquidDump || recipe.id === 'r_liquid_dump';
  const isLiquidBurner = recipe.isLiquidBurner || recipe.id === 'r_liquid_burner';
  const isSpecialRecipe = isMineshaftDrill || isLogicAssembler || isTreeFarm || isWasteFacility || isLiquidDump || isLiquidBurner;
  const hasTemperatureConfig = needsTemperatureConfig(machine.id);
  const hasBoilerConfig = needsBoilerConfig(machine.id);
  const heatSource = HEAT_SOURCES[machine.id];
  const isIndustrialFirebox = machine.id === 'm_industrial_firebox' && 
  recipe.id !== 'r_industrial_firebox_07'
  const isChemicalPlant = machine.id === 'm_chemical_plant';
  
  // Check if this machine has temperature-dependent cycle time
  const isTempDependent = hasTempDependentCycle(machine.id);
  const tempDependentInfo = isTempDependent ? TEMP_DEPENDENT_MACHINES[machine.id] : null;
  
  let cycleTime = recipe.cycle_time;
  const isVariableCycleTime = cycleTime === 'Variable' || typeof cycleTime !== 'number' || cycleTime <= 0;
  
  if (isVariableCycleTime && !isSpecialRecipe) cycleTime = 'Variable';
  else if (isVariableCycleTime && isSpecialRecipe) cycleTime = 1;
  
  // Calculate temperature-dependent cycle time if applicable
  if (isTempDependent && tempDependentInfo?.type === 'steam_input' && typeof cycleTime === 'number') {
    // For steam cracking plant, only apply if recipe uses steam
    if (machine.id === 'm_steam_cracking_plant' && !recipeUsesSteam(recipe)) {
      // Don't modify cycle time
    } else {
      // Get steam input temperature
      const inputTemp = recipe.tempDependentInputTemp ?? DEFAULT_STEAM_TEMPERATURE;
      cycleTime = getTempDependentCycleTime(machine.id, inputTemp, cycleTime);
    }
  }

  const temperatureData = { outputs: [] };
  if (heatSource) {
    const isBoiler = heatSource.type === 'boiler';
    const outputsWater = recipe.outputs?.some(o => ['p_water', 'p_filtered_water', 'p_distilled_water'].includes(o.product_id));
    const outputsSteam = recipe.outputs?.some(o => ['p_steam', 'p_low_pressure_steam', 'p_high_pressure_steam'].includes(o.product_id));
    const inputsWater = recipe.inputs?.some(o => ['p_water', 'p_filtered_water', 'p_distilled_water'].includes(o.product_id));
    
    // Special case: Industrial firebox sodium carbonate recipe (r_industrial_firebox_07) - no temperature indicator
    const isSodiumCarbonateRecipe = recipe.id === 'r_industrial_firebox_07';
    
    // Industrial firebox should only show temperature if water is in inputs or outputs
    const isIndustrialFirebox = machine.id === 'm_industrial_firebox';
    const shouldShowFireboxTemp = isIndustrialFirebox && !isSodiumCarbonateRecipe && (inputsWater || outputsWater);
    
    // For non-firebox heat sources or firebox with water
    if (!isIndustrialFirebox || shouldShowFireboxTemp) {
      recipe.outputs?.forEach((output, index) => {
        if (isTemperatureProduct(output.product_id) && output.temperature != null) {
          const isWater = ['p_water', 'p_filtered_water', 'p_distilled_water'].includes(output.product_id);
          const isSteam = ['p_steam', 'p_low_pressure_steam', 'p_high_pressure_steam'].includes(output.product_id);
          
          // For boilers, only show steam temperature
          if (isBoiler) {
            if (isSteam && outputsSteam) {
              temperatureData.outputs.push({ temp: output.temperature, index });
            }
          } else {
            // For other heat sources, show all temperature products
            if ((isWater && outputsWater) || (isSteam && outputsSteam)) {
              temperatureData.outputs.push({ temp: output.temperature, index });
            }
          }
        }
      });
    }
  }

  // Memoize format functions to avoid recreating them on every render
  const formatDisplayQuantity = useCallback((quantity) => {
    if (quantity === 'Variable') return 'Variable';
    if (typeof quantity !== 'number') return String(quantity);
    if (cycleTime === 'Variable') return displayMode === 'perSecond' ? 'Variable' : String(smartFormat(quantity));
    
    let baseQuantity = displayMode === 'perSecond' ? quantity / cycleTime : quantity;
    if (machineDisplayMode === 'total') baseQuantity *= (machineCount || 0);
    return String(smartFormat(baseQuantity));
  }, [cycleTime, displayMode, machineDisplayMode, machineCount]);

  const formatDisplayCycleTime = useCallback((ct) => {
    if (ct === 'Variable' || typeof ct !== 'number') return ct;
    if (displayMode === 'perSecond') return '1s';
    if (ct >= 60) {
      const minutes = Math.floor(ct / 60);
      const seconds = ct % 60;
      return `${minutes}m ${smartFormat(seconds)}s`;
    }
    return `${smartFormat(ct)}s`;
  }, [displayMode]);
  
  const displayCycleTime = useMemo(() => formatDisplayCycleTime(cycleTime), [cycleTime, formatDisplayCycleTime]);
  
  // Apply machine count to power and pollution if in total mode
  let adjustedPowerConsumption = recipe.power_consumption;
  let displayPollution = recipe.pollution;
  
  if (machineDisplayMode === 'total' && typeof machineCount === 'number' && machineCount > 0) {
    // Scale power consumption
    if (typeof recipe.power_consumption === 'number') {
      adjustedPowerConsumption = recipe.power_consumption * machineCount;
    } else if (typeof recipe.power_consumption === 'object' && recipe.power_consumption !== null && recipe.power_consumption !== 'Variable') {
      if ('drilling' in recipe.power_consumption && 'idle' in recipe.power_consumption) {
        adjustedPowerConsumption = {
          drilling: typeof recipe.power_consumption.drilling === 'number' ? recipe.power_consumption.drilling * machineCount : recipe.power_consumption.drilling,
          idle: typeof recipe.power_consumption.idle === 'number' ? recipe.power_consumption.idle * machineCount : recipe.power_consumption.idle
        };
      } else if ('max' in recipe.power_consumption && 'average' in recipe.power_consumption) {
        adjustedPowerConsumption = {
          max: typeof recipe.power_consumption.max === 'number' ? recipe.power_consumption.max * machineCount : recipe.power_consumption.max,
          average: typeof recipe.power_consumption.average === 'number' ? recipe.power_consumption.average * machineCount : recipe.power_consumption.average
        };
      }
    }
    
    // Scale pollution
    if (typeof recipe.pollution === 'number') {
      displayPollution = recipe.pollution * machineCount;
    }
  }
  
  const powerConsumption = formatPowerConsumption(adjustedPowerConsumption);
  const hasDualPower = typeof powerConsumption === 'object' && powerConsumption !== null &&
    (('drilling' in powerConsumption && 'idle' in powerConsumption) || ('max' in powerConsumption && 'average' in powerConsumption));
  
  // Add HV suffix if power type is HV
  const powerSuffix = recipe.power_type === 'HV' ? ' HV' : '';
  
  const leftCount = recipe.inputs.length;
  const rightCount = recipe.outputs.length;
  const maxCount = Math.max(leftCount, rightCount, 1);
  const multiplier = maxCount >= 5 ? 8 : 24;
  
  const hasLeft = leftCount > 0, hasRight = rightCount > 0;
  
  // Fixed rectangle widths based on available space
  const availableWidth = NODE_WIDTH - (SIDE_PADDING * 2);
  const leftWidth = hasLeft && hasRight ? Math.floor((availableWidth - COLUMN_GAP) / 2) : (hasLeft ? availableWidth : 0);
  const rightWidth = hasLeft && hasRight ? Math.floor((availableWidth - COLUMN_GAP) / 2) : (hasRight ? availableWidth : 0);
  
  const width = NODE_WIDTH;
  
  // Calculate height based on number of rectangles
  // The io-area has 12px padding on top and bottom for the columns
  const ioColumnPadding = 24; // 12px top + 12px bottom
  const ioAreaHeight = (maxCount * RECT_HEIGHT) + ((maxCount - 1) * RECT_GAP) + ioColumnPadding;
  
  // Add bottom padding to balance the top io-column padding (12px)
  const bottomPadding = 12;
  
  const height = BASE_INFO_HEIGHT + ioAreaHeight + bottomPadding;
  const displayMachineCount = machineCount ?? 0;
  // Display up to 2 decimal places, but compute with full precision internally
  const formattedMachineCount = Number.isInteger(displayMachineCount) 
    ? displayMachineCount.toString() 
    : displayMachineCount.toFixed(2);
  const machineCountMode = data.machineCountMode || 'free';
  const machineCountStyle = machineDisplayMode === 'total' ? { color: 'var(--text-muted)', opacity: 0.5 } : {};

  return (
    <>
      <div 
        className={`custom-node ${isTarget ? 'target' : ''}`} 
        style={{ width, height }}
        onMouseDownCapture={(e) => {
          if (e.button === 1) { // Middle mouse button
            e.preventDefault();
            e.stopPropagation();
            if (data.onMiddleClick) {
              data.onMiddleClick(id);
            }
          }
        }}
      >
        {/* Info Area */}
        <div className="node-info-area">
        {temperatureData.outputs.length > 0 && (
          <div onDoubleClick={(e) => e.stopPropagation()} style={{
            position: 'absolute', top: '10px', left: '10px', background: 'var(--bg-secondary)',
            border: '2px solid var(--border-primary)', borderRadius: 'var(--radius-sm)',
            padding: '4px 8px', fontSize: '11px', fontWeight: 700, color: 'var(--output-text)', zIndex: 5
          }}>
            {temperatureData.outputs.map((item, idx) => (
              <div key={`output-${idx}`}>{formatTemperature(item.temp)}</div>
            ))}
          </div>
        )}

        {/* Show input temperature for temp-dependent machines that use steam */}
        {isTempDependent && tempDependentInfo?.type === 'steam_input' && recipeUsesSteam(recipe) && (
          <div onDoubleClick={(e) => e.stopPropagation()} style={{
            position: 'absolute', top: '10px', left: '10px', background: 'var(--bg-secondary)',
            border: '2px solid var(--input-border)', borderRadius: 'var(--radius-sm)',
            padding: '4px 8px', fontSize: '11px', fontWeight: 700, color: 'var(--input-text)', zIndex: 5
          }}>
            {formatTemperature(recipe.tempDependentInputTemp ?? DEFAULT_STEAM_TEMPERATURE)}
          </div>
        )}

        {isMineshaftDrill && (
          <button onClick={(e) => { e.stopPropagation(); setSettingsModal('drill'); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Drill">⚙️</button>
        )}
        {isLogicAssembler && (
          <button onClick={(e) => { e.stopPropagation(); setSettingsModal('assembler'); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Assembler">⚙️</button>
        )}
        {isTreeFarm && (
          <button onClick={(e) => { e.stopPropagation(); setSettingsModal('treeFarm'); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Tree Farm">⚙️</button>
        )}
        {isIndustrialFirebox && (
          <button onClick={(e) => { e.stopPropagation(); setSettingsModal('firebox'); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Firebox">⚙️</button>
        )}
        {isChemicalPlant && (
          <button onClick={(e) => { e.stopPropagation(); setSettingsModal('chemicalPlant'); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Chemical Plant">⚙️</button>
        )}
        {isWasteFacility && (
          <button onClick={(e) => { e.stopPropagation(); setSettingsModal('wasteFacility'); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Waste Facility">⚙️</button>
        )}
        {isLiquidDump && (
          <button onClick={(e) => { e.stopPropagation(); setSettingsModal('liquidDump'); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Liquid Dump Info">⚙️</button>
        )}
        {isLiquidBurner && (
          <button onClick={(e) => { e.stopPropagation(); setSettingsModal('liquidBurner'); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Liquid Burner Info">⚙️</button>
        )}
        {hasTemperatureConfig && (
          <button onClick={(e) => { e.stopPropagation(); setSettingsModal('temperature'); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Temperature">⚙️</button>
        )}
        {hasBoilerConfig && (
          <button onClick={(e) => { e.stopPropagation(); setSettingsModal('boiler'); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Boiler" style={{ right: '10px' }}>⚙️</button>
        )}

        <div className="node-recipe-name" title={recipe.name}>{recipe.name}</div>

        <div className="node-stats-row">
          <div className="node-stats" style={{ 
            gap: hasDualPower ? '1px' : '3px', 
            minHeight: '65px',
            visibility: showDetails ? 'visible' : 'hidden'
          }}>
            <div className="node-stat-row"><span className="node-stat-label">Cycle:</span> {displayCycleTime}</div>
            {hasDualPower ? (
              ('drilling' in powerConsumption) ? (
                <>
                  <div className="node-stat-row"><span className="node-stat-label">Power (Drilling):</span> {powerConsumption.drilling}{powerSuffix}</div>
                  <div className="node-stat-row"><span className="node-stat-label">Power (Idle):</span> {powerConsumption.idle}{powerSuffix}</div>
                </>
              ) : (
                <>
                  <div className="node-stat-row"><span className="node-stat-label">Power (Max):</span> {powerConsumption.max}{powerSuffix}</div>
                  <div className="node-stat-row"><span className="node-stat-label">Power (Avg):</span> {powerConsumption.average}{powerSuffix}</div>
                </>
              )
            ) : (
              <div className="node-stat-row"><span className="node-stat-label">Power:</span> {powerConsumption}{powerSuffix}</div>
            )}
            <div className="node-stat-row"><span className="node-stat-label">Pollution:</span> {formatPollution(displayPollution)}</div>
          </div>

          <div className="node-machine-info" style={{
            visibility: showDetails ? 'visible' : 'hidden'
          }}>
            <div className="node-machine-name" title={machine.name} style={{
              color: machine.tier === 1 ? 'var(--tier-1-color)' :
                     machine.tier === 2 ? 'var(--tier-2-color)' :
                     machine.tier === 3 ? 'var(--tier-3-color)' :
                     machine.tier === 4 ? 'var(--tier-4-color)' :
                     machine.tier === 5 ? 'var(--tier-5-color)' : 'var(--tier-5-color)'
            }}>{machine.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div className="node-machine-count" style={machineCountStyle}
                title={machineDisplayMode === 'total' ? "Machine count (display mode: Total)" : "Double-click node to edit"}>
                {formattedMachineCount}
              </div>
              {machineCountMode !== 'free' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onMachineCountModeChange) {
                      onMachineCountModeChange(id, machineCountMode, machineCount);
                    }
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '14px',
                    lineHeight: 1,
                    opacity: 0.8,
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                  title={machineCountMode === 'locked' 
                    ? `Locked: LP/suggestions cannot change (cap: ${data.cappedMachineCount?.toFixed(2) || machineCount.toFixed(2)})\nClick to unlock` 
                    : `Capped: LP/suggestions max ${data.cappedMachineCount?.toFixed(2) || machineCount.toFixed(2)}\nClick to lock`}
                >
                  {machineCountMode === 'locked' ? '🔒' : '📊'}
                </button>
              )}
            </div>
          </div>
        </div>
        </div>

        {/* Input/Output Area */}
        <div className="node-io-area">
          <div className="node-io-columns" style={{ 
            gridTemplateColumns: hasLeft && hasRight ? `${leftWidth}px 1fr ${rightWidth}px` : '1fr',
            padding: `0 ${SIDE_PADDING}px`
          }}>

        {/* Left Column - Inputs */}
            {hasLeft && (
              <div className="node-io-column node-io-left">
                {recipe.inputs.map((input, i) => (
                  <div key={`left-${id}-${i}-${input.product_id}`} className="node-rect-wrapper">
                    <NodeRect side="left" index={i} width={leftWidth} 
                      input={input} onClick={onInputClick} nodeId={id} formatQuantity={formatDisplayQuantity} 
                      isMobile={data.isMobile} mobileActionMode={data.mobileActionMode} />
                  </div>
                ))}
              </div>
            )}

            {/* Gap Column */}
            {hasLeft && hasRight && <div className="node-io-gap"></div>}

            {/* Right Column - Outputs */}
            {hasRight && (
              <div className="node-io-column node-io-right">
                {recipe.outputs.map((output, i) => (
                  <div key={`right-${id}-${i}-${output.product_id}`} className="node-rect-wrapper">
                    <NodeRect side="right" index={i} width={rightWidth} 
                      input={output} onClick={onOutputClick} nodeId={id} formatQuantity={formatDisplayQuantity} 
                      isMobile={data.isMobile} mobileActionMode={data.mobileActionMode} />
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Handles positioned absolutely on node edges */}
          <div className="node-handles-container">
            {recipe.inputs.map((input, i) => (
              <NodeHandle key={`handle-left-${id}-${i}`} side="left" index={i}
                onClick={onInputClick} nodeId={id} productId={input.product_id} flows={data.flows} 
                onHandleDoubleClick={data.onHandleDoubleClick} suggestions={data.suggestions} input={input} data={data}
                leftCount={leftCount} rightCount={rightCount} />
            ))}
            {recipe.outputs.map((output, i) => (
              <NodeHandle key={`handle-right-${id}-${i}`} side="right" index={i}
                onClick={onOutputClick} nodeId={id} productId={output.product_id} flows={data.flows} 
                onHandleDoubleClick={data.onHandleDoubleClick} suggestions={data.suggestions} input={output} data={data}
                leftCount={leftCount} rightCount={rightCount} />
            ))}
          </div>
          </div>
        </div>

      {settingsModal && (
        <UnifiedSettings
          recipeType={settingsModal}
          nodeId={id}
          currentSettings={
            settingsModal === 'drill' ? recipe.drillSettings :
            settingsModal === 'assembler' ? recipe.assemblerSettings :
            settingsModal === 'treeFarm' ? recipe.treeFarmSettings :
            settingsModal === 'firebox' ? recipe.fireboxSettings :
            settingsModal === 'temperature' ? recipe.temperatureSettings :
            settingsModal === 'boiler' ? recipe.temperatureSettings :
            settingsModal === 'chemicalPlant' ? recipe.chemicalPlantSettings :
            settingsModal === 'wasteFacility' ? recipe.wasteFacilitySettings :
            settingsModal === 'liquidDump' ? recipe.liquidDumpSettings :
            settingsModal === 'liquidBurner' ? recipe.liquidBurnerSettings :
            {}
          }
          recipe={recipe}
          globalPollution={globalPollution || 0}
          onSettingsChange={
            settingsModal === 'drill' ? onDrillSettingsChange :
            settingsModal === 'assembler' ? onLogicAssemblerSettingsChange :
            settingsModal === 'treeFarm' ? onTreeFarmSettingsChange :
            settingsModal === 'firebox' ? onIndustrialFireboxSettingsChange :
            settingsModal === 'temperature' ? onTemperatureSettingsChange :
            settingsModal === 'boiler' ? onBoilerSettingsChange :
            settingsModal === 'chemicalPlant' ? onChemicalPlantSettingsChange :
            settingsModal === 'wasteFacility' ? data.onWasteFacilitySettingsChange :
            settingsModal === 'liquidDump' ? data.onLiquidDumpSettingsChange :
            settingsModal === 'liquidBurner' ? data.onLiquidBurnerSettingsChange :
            () => {}
          }
          onClose={() => setSettingsModal(null)}
        />
      )}
    </>
  );
}, (prevProps, nextProps) => {
  // Fast path: check if data object reference changed
  if (prevProps.data === nextProps.data && prevProps.id === nextProps.id) return true;
  if (prevProps.id !== nextProps.id) return false;
  
  const prevData = prevProps.data;
  const nextData = nextProps.data;
  
  // Critical check: if recipe object changed, always re-render
  if (prevData.recipe !== nextData.recipe) return false;
  
  // Check other critical props with early exit
  if (prevData.machineCount !== nextData.machineCount) return false;
  if (prevData.flows !== nextData.flows) return false;
  if (prevData.suggestions !== nextData.suggestions) return false;
  if (prevData.displayMode !== nextData.displayMode) return false;
  if (prevData.machineDisplayMode !== nextData.machineDisplayMode) return false;
  if (prevData.isTarget !== nextData.isTarget) return false;
  if (prevData.zoomLevel !== nextData.zoomLevel) return false;
  if (prevData.machineCountMode !== nextData.machineCountMode) return false;
  
  return true;
});

export default CustomNode;

const NodeRect = ({ side, index, width, input, onClick, nodeId, formatQuantity, isMobile, mobileActionMode }) => {
  const isLeft = side === 'left';
  const productName = getProductName(input.product_id, getProduct, input.acceptedType);
  const displayQuantity = formatQuantity(input.quantity);
  
  // On mobile, only allow clicks in pan mode for connection management
  const shouldAllowClick = !isMobile || mobileActionMode === 'pan';
  
  return (
    <div onClick={(e) => { 
      if (onClick && shouldAllowClick) { 
        e.stopPropagation(); 
        onClick(input.product_id, nodeId, index, e); 
      } 
    }}
      title={`${displayQuantity}x ${productName}`}
      className={`node-rect ${isLeft ? 'input' : 'output'} ${onClick ? 'clickable' : ''}`}
      style={{ width: `${width}px`, height: `${RECT_HEIGHT}px`, minWidth: `${width}px` }}>
      <span className="node-rect-text">{displayQuantity}x {productName}</span>
    </div>
  );
};

const NodeHandle = ({ side, index, onClick, nodeId, productId, flows, onHandleDoubleClick, suggestions, input, data, leftCount, rightCount }) => {
  // HiGHS LP solver has 6 significant figure precision
  // Use relative tolerance: error scales with value magnitude
  const RELATIVE_EPSILON = 0.001; // 0.1% relative tolerance
  const ABSOLUTE_EPSILON = 1e-6;  // Minimum absolute tolerance for tiny values
  
  const isSignificant = (value, reference) => {
    const relativeThreshold = Math.max(Math.abs(value), Math.abs(reference)) * RELATIVE_EPSILON;
    const threshold = Math.max(relativeThreshold, ABSOLUTE_EPSILON);
    return Math.abs(value) > threshold;
  };
  
  // Get colors from CSS variables (theme)
  const cssVars = getComputedStyle(document.documentElement);
  const inputSupplied = cssVars.getPropertyValue('--handle-input-supplied').trim();
  const inputDeficient = cssVars.getPropertyValue('--handle-input-deficient').trim();
  const outputConnected = cssVars.getPropertyValue('--handle-output-connected').trim();
  const outputExcess = cssVars.getPropertyValue('--handle-output-excess').trim();
  
  // Determine handle color based on flow status
  let handleColor = side === 'left' ? inputSupplied : outputConnected;
  
  if (flows) {
    const flowData = side === 'left' 
      ? flows.inputFlows?.[index] 
      : flows.outputFlows?.[index];
    
    if (flowData) {
      const difference = side === 'left'
        ? flowData.needed - flowData.connected
        : flowData.produced - flowData.connected;
      
      // Only show as having issue if difference is significant relative to reference value
      const referenceValue = side === 'left' ? flowData.needed : flowData.produced;
      const hasIssue = isSignificant(difference, referenceValue) && difference > 0;
      
      if (hasIssue) {
        handleColor = side === 'left' ? inputDeficient : outputExcess;
      }
    }
  }
  
  // Determine shape based on product type
  const product = getProduct(productId);
  const isFluid = product?.type === 'fluid' || productId === 'p_any_fluid';
  const borderRadius = isFluid ? '50%' : '2px'; // Circle for fluids, square for items
  
  // Calculate vertical position based on index
  // The columns use align-items: center in CSS, so we need to account for vertical centering
  const maxCount = Math.max(leftCount, rightCount);
  const sideCount = side === 'left' ? leftCount : rightCount;
  
  // Calculate offset needed to center the shorter column
  const verticalOffset = ((maxCount - sideCount) * (RECT_HEIGHT + RECT_GAP)) / 2;
  
  // Handles are positioned relative to node-io-area
  // The node-io-columns has padding, and node-io-column has 12px top padding
  // Need to account for both when calculating position
  const topPosition = 12 + verticalOffset + (index * (RECT_HEIGHT + RECT_GAP)) + (RECT_HEIGHT / 2) + 11;
  
  return (
    <Handle
      type={side === 'left' ? 'target' : 'source'}
      position={side === 'left' ? Position.Left : Position.Right}
      id={`${side}-${index}`}
      style={{ 
        background: handleColor, 
        width: '12px', 
        height: '12px', 
        border: '2px solid #1a1a1a',
        borderRadius,
        cursor: 'pointer',
        position: 'absolute',
        [side === 'left' ? 'left' : 'right']: '0',
        top: `${topPosition}px`,
        transform: side === 'left' ? 'translate(-50%, -50%)' : 'translate(50%, -50%)'
      }}
      onClick={(e) => {
        if (onClick && e.ctrlKey) {
          e.stopPropagation();
          onClick(productId, nodeId, index, e);
        }
      }}
      onDoubleClick={(e) => {
        if (onHandleDoubleClick) {
          e.stopPropagation();
          onHandleDoubleClick(nodeId, side, index, productId, suggestions);
        }
      }}
    />
  );
};