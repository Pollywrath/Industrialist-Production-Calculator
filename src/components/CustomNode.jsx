import React, { useState, memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { getProduct } from '../data/dataLoader';
import { getProductName, formatPowerConsumption, formatPollution } from '../utils/variableHandler';
import { isTemperatureProduct, formatTemperature, needsTemperatureConfig, needsBoilerConfig, HEAT_SOURCES, DEFAULT_STEAM_TEMPERATURE } from '../utils/temperatureHandler';
import { hasTempDependentCycle, getTempDependentCycleTime, TEMP_DEPENDENT_MACHINES, recipeUsesSteam, getSteamInputIndex } from '../utils/temperatureDependentCycles';
import DrillSettings from './DrillSettings';
import LogicAssemblerSettings from './LogicAssemblerSettings';
import TreeFarmSettings from './TreeFarmSettings';
import IndustrialFireboxSettings from './IndustrialFireboxSettings';
import TemperatureSettings from './TemperatureSettings';
import BoilerSettings from './BoilerSettings';
import ChemicalPlantSettings from './ChemicalPlantSettings';
import UndergroundWasteFacilitySettings from './UndergroundWasteFacilitySettings';
import LiquidDumpSettings from './LiquidDumpSettings';
import LiquidBurnerSettings from './LiquidBurnerSettings';

const RECT_HEIGHT = 44, RECT_GAP = 8, BOTTOM_PADDING = 20, SIDE_PADDING = 10, COLUMN_GAP = 20, MIN_WIDTH = 320;

const smartFormat = (num) => typeof num === 'number' ? Math.round(num * 10000) / 10000 : num;

// Function to estimate text width and calculate lines needed
const calculateTextLines = (text, availableWidth, fontSize = 16) => {
  // Character width multiplier for accurate estimation
  const avgCharWidth = fontSize * 0.61;
  const estimatedTextWidth = text.length * avgCharWidth;
  const lines = Math.ceil(estimatedTextWidth / availableWidth);
  return lines;
};

const CustomNode = memo(({ data, id }) => {
  const { recipe, machine, machineCount, displayMode, machineDisplayMode, onInputClick, onOutputClick, isTarget,
    onDrillSettingsChange, onLogicAssemblerSettingsChange, onTreeFarmSettingsChange, onIndustrialFireboxSettingsChange, 
    onTemperatureSettingsChange, onBoilerSettingsChange, onChemicalPlantSettingsChange, globalPollution, flows } = data;
  
  const [showDrillSettings, setShowDrillSettings] = useState(false);
  const [showAssemblerSettings, setShowAssemblerSettings] = useState(false);
  const [showTreeFarmSettings, setShowTreeFarmSettings] = useState(false);
  const [showFireboxSettings, setShowFireboxSettings] = useState(false);
  const [showTemperatureSettings, setShowTemperatureSettings] = useState(false);
  const [showBoilerSettings, setShowBoilerSettings] = useState(false);
  const [showChemicalPlantSettings, setShowChemicalPlantSettings] = useState(false);
  const [showWasteFacilitySettings, setShowWasteFacilitySettings] = useState(false);
  const [showLiquidDumpSettings, setShowLiquidDumpSettings] = useState(false);
  const [showLiquidBurnerSettings, setShowLiquidBurnerSettings] = useState(false);
  
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

  const formatDisplayQuantity = (quantity) => {
    if (quantity === 'Variable') return 'Variable';
    if (typeof quantity !== 'number') return String(quantity);
    if (cycleTime === 'Variable') return displayMode === 'perSecond' ? 'Variable' : String(smartFormat(quantity));
    
    let baseQuantity = displayMode === 'perSecond' ? quantity / cycleTime : quantity;
    if (machineDisplayMode === 'total') baseQuantity *= (machineCount || 0);
    return String(smartFormat(baseQuantity));
  };

  const formatDisplayCycleTime = (ct) => {
    if (ct === 'Variable' || typeof ct !== 'number') return ct;
    if (displayMode === 'perSecond') return '1s';
    if (ct >= 60) {
      const minutes = Math.floor(ct / 60);
      const seconds = ct % 60;
      return `${minutes}m ${smartFormat(seconds)}s`;
    }
    return `${smartFormat(ct)}s`;
  };

  const displayCycleTime = formatDisplayCycleTime(cycleTime);
  
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
  
  const leftCount = recipe.inputs.length;
  const rightCount = recipe.outputs.length;
  const maxCount = Math.max(leftCount, rightCount, 1);
  const multiplier = maxCount >= 5 ? 8 : 24;
  
  const getMaxWidth = (items) => !items?.length ? 80 : Math.max(80, ...items.map(item => {
    const name = getProductName(item.product_id, getProduct);
    const qty = formatDisplayQuantity(item.quantity);
    // Increased multiplier from 8 to 10 for better width, and added base padding
    return qty.length * 10 + name.length * 10 + 20;
  }));

  const leftWidth = leftCount > 0 ? getMaxWidth(recipe.inputs) : 0;
  const rightWidth = rightCount > 0 ? getMaxWidth(recipe.outputs) : 0;
  const hasLeft = leftCount > 0, hasRight = rightCount > 0;
  
  const contentWidth = hasLeft && hasRight ? leftWidth + rightWidth + COLUMN_GAP + SIDE_PADDING * 2 : (hasLeft ? leftWidth : rightWidth) + SIDE_PADDING * 2;
  const width = Math.max(contentWidth, MIN_WIDTH);
  
  // Calculate recipe name lines for dynamic padding
  const recipeNamePaddingLeft = 30;
  const recipeNamePaddingRight = 30;
  const availableWidthForName = width - recipeNamePaddingLeft - recipeNamePaddingRight;
  const recipeNameFontSize = 14; // This should match the CSS font-size for .node-recipe-name
  const recipeNameLines = calculateTextLines(recipe.name, availableWidthForName, recipeNameFontSize);
  
  // Add extra padding for wrapped lines (each additional line needs ~22px)
  const extraPaddingForName = recipeNameLines > 1 ? (recipeNameLines - 1) * 22 : 0;
  
  const TOP_PADDING_RECTANGLES = 109 + multiplier * Math.ceil(maxCount / 2) + extraPaddingForName;
  
  const height = TOP_PADDING_RECTANGLES + (maxCount * RECT_HEIGHT) + ((maxCount - 1) * RECT_GAP) + BOTTOM_PADDING;

  const getRectPositions = (count) => {
    if (count === 0) return [];
    const totalHeight = count * RECT_HEIGHT + (count - 1) * RECT_GAP;
    const availableHeight = height - TOP_PADDING_RECTANGLES - BOTTOM_PADDING;
    const offset = Math.max((availableHeight - totalHeight) / 2, 0);
    return Array.from({ length: count }, (_, i) => TOP_PADDING_RECTANGLES + offset + i * (RECT_HEIGHT + RECT_GAP));
  };

  const leftPositions = getRectPositions(leftCount);
  const rightPositions = getRectPositions(rightCount);
  const getHandlePositions = (positions) => positions.map(p => ((p + RECT_HEIGHT / 2) / height) * 100);

  const displayMachineCount = machineCount ?? 0;
  // Display up to 2 decimal places, but compute with full precision internally
  const formattedMachineCount = Number.isInteger(displayMachineCount) 
    ? displayMachineCount.toString() 
    : displayMachineCount.toFixed(2);
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

        {/* Show input temperature for temp-dependent machines */}
        {isTempDependent && tempDependentInfo?.type === 'steam_input' && (
          <div onDoubleClick={(e) => e.stopPropagation()} style={{
            position: 'absolute', top: '10px', left: '10px', background: 'var(--bg-secondary)',
            border: '2px solid var(--input-border)', borderRadius: 'var(--radius-sm)',
            padding: '4px 8px', fontSize: '11px', fontWeight: 700, color: 'var(--input-text)', zIndex: 5
          }}>
            {formatTemperature(recipe.tempDependentInputTemp ?? DEFAULT_STEAM_TEMPERATURE)}
          </div>
        )}

        {isMineshaftDrill && (
          <button onClick={(e) => { e.stopPropagation(); setShowDrillSettings(true); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Drill">⚙️</button>
        )}
        {isLogicAssembler && (
          <button onClick={(e) => { e.stopPropagation(); setShowAssemblerSettings(true); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Assembler">⚙️</button>
        )}
        {isTreeFarm && (
          <button onClick={(e) => { e.stopPropagation(); setShowTreeFarmSettings(true); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Tree Farm">🌲</button>
        )}
        {isIndustrialFirebox && (
          <button onClick={(e) => { e.stopPropagation(); setShowFireboxSettings(true); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Firebox">🔥</button>
        )}
        {isChemicalPlant && (
          <button onClick={(e) => { e.stopPropagation(); setShowChemicalPlantSettings(true); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Chemical Plant">⚗️</button>
        )}
        {isWasteFacility && (
          <button onClick={(e) => { e.stopPropagation(); setShowWasteFacilitySettings(true); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Waste Facility">🗑️</button>
        )}
        {isLiquidDump && (
          <button onClick={(e) => { e.stopPropagation(); setShowLiquidDumpSettings(true); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Liquid Dump Info">💧</button>
        )}
        {isLiquidBurner && (
          <button onClick={(e) => { e.stopPropagation(); setShowLiquidBurnerSettings(true); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Liquid Burner Info">🔥</button>
        )}
        {hasTemperatureConfig && (
          <button onClick={(e) => { e.stopPropagation(); setShowTemperatureSettings(true); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Temperature">🌡️</button>
        )}
        {hasBoilerConfig && (
          <button onClick={(e) => { e.stopPropagation(); setShowBoilerSettings(true); }} 
            onDoubleClick={(e) => e.stopPropagation()}
            className="drill-settings-button" title="Configure Boiler" style={{ right: '10px' }}>🔧</button>
        )}

        <div className="node-recipe-name" title={recipe.name} style={{ 
          paddingLeft: '30px',
          paddingRight: '30px'
        }}>{recipe.name}</div>

        <div className="node-stats-row">
          <div className="node-stats">
            <div className="node-stat-row"><span className="node-stat-label">Cycle:</span> {displayCycleTime}</div>
            {hasDualPower ? (
              ('drilling' in powerConsumption) ? (
                <>
                  <div className="node-stat-row"><span className="node-stat-label">Power (Drilling):</span> {powerConsumption.drilling}</div>
                  <div className="node-stat-row"><span className="node-stat-label">Power (Idle):</span> {powerConsumption.idle}</div>
                </>
              ) : (
                <>
                  <div className="node-stat-row"><span className="node-stat-label">Power (Max):</span> {powerConsumption.max}</div>
                  <div className="node-stat-row"><span className="node-stat-label">Power (Avg):</span> {powerConsumption.average}</div>
                </>
              )
            ) : (
              <div className="node-stat-row"><span className="node-stat-label">Power:</span> {powerConsumption}</div>
            )}
            <div className="node-stat-row"><span className="node-stat-label">Pollution:</span> {formatPollution(displayPollution)}</div>
          </div>

          <div className="node-machine-info">
            <div className="node-machine-name" title={machine.name}>{machine.name}</div>
            <div className="node-machine-count" style={machineCountStyle}
              title={machineDisplayMode === 'total' ? "Machine count (display mode: Total)" : "Double-click node to edit"}>
              {formattedMachineCount}
            </div>
          </div>
        </div>

        {leftPositions.map((pos, i) => (
          <React.Fragment key={`left-${i}`}>
            <NodeRect side="left" index={i} position={pos} width={leftWidth} isOnly={!hasRight} 
              input={recipe.inputs[i]} onClick={onInputClick} nodeId={id} formatQuantity={formatDisplayQuantity} />
            <NodeHandle side="left" index={i} position={getHandlePositions(leftPositions)[i]} 
              onClick={onInputClick} nodeId={id} productId={recipe.inputs[i].product_id} flows={data.flows} 
              onHandleDoubleClick={data.onHandleDoubleClick} suggestions={data.suggestions} input={recipe.inputs[i]} />
          </React.Fragment>
        ))}

        {rightPositions.map((pos, i) => (
          <React.Fragment key={`right-${i}`}>
            <NodeRect side="right" index={i} position={pos} width={rightWidth} isOnly={!hasLeft} 
              input={recipe.outputs[i]} onClick={onOutputClick} nodeId={id} formatQuantity={formatDisplayQuantity} />
            <NodeHandle side="right" index={i} position={getHandlePositions(rightPositions)[i]} 
              onClick={onOutputClick} nodeId={id} productId={recipe.outputs[i].product_id} flows={data.flows} 
              onHandleDoubleClick={data.onHandleDoubleClick} suggestions={data.suggestions} input={recipe.outputs[i]} />
          </React.Fragment>
        ))}
      </div>

      {showDrillSettings && (
        <DrillSettings nodeId={id} currentSettings={recipe.drillSettings || {}} 
          onSettingsChange={onDrillSettingsChange} onClose={() => setShowDrillSettings(false)} />
      )}
      {showAssemblerSettings && (
        <LogicAssemblerSettings nodeId={id} currentSettings={recipe.assemblerSettings || {}} 
          onSettingsChange={onLogicAssemblerSettingsChange} onClose={() => setShowAssemblerSettings(false)} />
      )}
      {showTemperatureSettings && (
        <TemperatureSettings nodeId={id} machineId={machine.id} currentSettings={recipe.temperatureSettings || {}} 
          recipe={recipe} onSettingsChange={onTemperatureSettingsChange} onClose={() => setShowTemperatureSettings(false)} />
      )}
      {showBoilerSettings && (
        <BoilerSettings nodeId={id} currentSettings={recipe.temperatureSettings || {}} 
          onSettingsChange={onBoilerSettingsChange} onClose={() => setShowBoilerSettings(false)} />
      )}
      {showTreeFarmSettings && (
        <TreeFarmSettings nodeId={id} currentSettings={recipe.treeFarmSettings || {}} 
          globalPollution={globalPollution || 0} onSettingsChange={onTreeFarmSettingsChange} 
          onClose={() => setShowTreeFarmSettings(false)} />
      )}
      {showFireboxSettings && (
        <IndustrialFireboxSettings nodeId={id} currentSettings={recipe.fireboxSettings || {}} 
          recipe={recipe} onSettingsChange={onIndustrialFireboxSettingsChange} 
          onClose={() => setShowFireboxSettings(false)} />
      )}
      {showChemicalPlantSettings && (
        <ChemicalPlantSettings nodeId={id} currentSettings={recipe.chemicalPlantSettings || {}} 
          recipe={recipe} onSettingsChange={onChemicalPlantSettingsChange} 
          onClose={() => setShowChemicalPlantSettings(false)} />
      )}
      {showWasteFacilitySettings && (
        <UndergroundWasteFacilitySettings nodeId={id} currentSettings={recipe.wasteFacilitySettings || {}} 
          onSettingsChange={data.onWasteFacilitySettingsChange} 
          onClose={() => setShowWasteFacilitySettings(false)} />
      )}
      {showLiquidDumpSettings && (
        <LiquidDumpSettings nodeId={id} currentSettings={recipe.liquidDumpSettings || {}} recipe={recipe} 
          onSettingsChange={data.onLiquidDumpSettingsChange}
          onClose={() => setShowLiquidDumpSettings(false)} />
      )}
      {showLiquidBurnerSettings && (
        <LiquidBurnerSettings nodeId={id} currentSettings={recipe.liquidBurnerSettings || {}} recipe={recipe} 
          onSettingsChange={data.onLiquidBurnerSettingsChange}
          onClose={() => setShowLiquidBurnerSettings(false)} />
      )}
    </>
  );
}, (prevProps, nextProps) => {
  // Fast path - check IDs first
  if (prevProps.id !== nextProps.id) return false;
  
  const prevData = prevProps.data;
  const nextData = nextProps.data;
  
  // Check primitive values
  if (
    prevData.machineCount !== nextData.machineCount ||
    prevData.displayMode !== nextData.displayMode ||
    prevData.machineDisplayMode !== nextData.machineDisplayMode ||
    prevData.isTarget !== nextData.isTarget ||
    prevData.globalPollution !== nextData.globalPollution
  ) {
    return false;
  }
  
  // Check object references
  if (prevData.recipe !== nextData.recipe) return false;
  if (prevData.flows !== nextData.flows) return false;
  if (prevData.suggestions !== nextData.suggestions) return false;
  
  return true;
});

export default CustomNode;

const NodeRect = ({ side, index, position, width, isOnly, input, onClick, nodeId, formatQuantity }) => {
  const isLeft = side === 'left';
  const productName = getProductName(input.product_id, getProduct, input.acceptedType);
  const displayQuantity = formatQuantity(input.quantity);
  
  return (
    <div onClick={(e) => { if (onClick) { e.stopPropagation(); onClick(input.product_id, nodeId, index, e); } }}
      title={`${displayQuantity}x ${productName}`}
      className={`node-rect ${isLeft ? 'input' : 'output'} ${onClick ? 'clickable' : ''}`}
      style={{
        left: isOnly ? '50%' : (isLeft ? `${SIDE_PADDING}px` : undefined),
        right: !isOnly && !isLeft ? `${SIDE_PADDING}px` : undefined,
        transform: isOnly ? 'translateX(-50%)' : undefined,
        top: `${position}px`,
        width: `${width}px`,
      }}>
      {displayQuantity}x {productName}
    </div>
  );
};

const NodeHandle = ({ side, index, position, onClick, nodeId, productId, flows, onHandleDoubleClick, suggestions, input }) => {
  // Use relaxed epsilon to handle floating-point precision from LP solver
  const EPSILON = 1e-6;
  
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
      
      // Only show as having issue if difference is truly > epsilon (not floating point error)
      const hasIssue = Math.abs(difference) > EPSILON && difference > 0;
      
      if (hasIssue) {
        handleColor = side === 'left' ? inputDeficient : outputExcess;
      }
    }
  }
  
  // Determine shape based on product type
  const product = getProduct(productId);
  const isFluid = product?.type === 'fluid' || productId === 'p_any_fluid';
  const borderRadius = isFluid ? '50%' : '2px'; // Circle for fluids, square for items
  
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
        top: `${position}%`,
        borderRadius
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