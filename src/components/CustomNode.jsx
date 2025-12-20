import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { getProduct } from '../data/dataLoader';
import { 
  getProductName, formatQuantity, formatCycleTime, 
  formatPowerConsumption, formatPollution
} from '../utils/variableHandler';
import DrillSettings from './DrillSettings';
import LogicAssemblerSettings from './LogicAssemblerSettings';

// Layout constants - used to calculate node dimensions based on input/output count
const RECT_HEIGHT = 44;
const RECT_GAP = 8;
const BOTTOM_PADDING = 20;
const SIDE_PADDING = 10;
const COLUMN_GAP = 20;
const MIN_WIDTH = 320;

const CustomNode = ({ data, id }) => {
  const { 
    recipe, machine, machineCount, displayMode, machineDisplayMode, onInputClick, onOutputClick, isTarget, 
    onDrillSettingsChange, onLogicAssemblerSettingsChange 
  } = data;
  
  const [showDrillSettings, setShowDrillSettings] = useState(false);
  const [showAssemblerSettings, setShowAssemblerSettings] = useState(false);
  
  if (!recipe || !machine || !recipe.inputs || !recipe.outputs) {
    console.error('CustomNode: Invalid data', { data, id });
    return null;
  }
  
  const isMineshaftDrill = recipe.isMineshaftDrill || recipe.id === 'r_mineshaft_drill';
  const isLogicAssembler = recipe.isLogicAssembler || recipe.id === 'r_logic_assembler';
  const isSpecialRecipe = isMineshaftDrill || isLogicAssembler;
  
  // Get cycle time - don't convert Variable to 1s unless it's a special recipe
  let cycleTime = recipe.cycle_time;
  const isVariableCycleTime = cycleTime === 'Variable' || typeof cycleTime !== 'number' || cycleTime <= 0;
  
  if (isVariableCycleTime && !isSpecialRecipe) {
    // Keep as Variable for display
    cycleTime = 'Variable';
  } else if (isVariableCycleTime && isSpecialRecipe) {
    // Special recipes can use 1 as they handle their own rates
    cycleTime = 1;
  }

  // Smart number formatting - only show decimals when needed (max 4 places)
  const smartFormat = (num) => {
    if (typeof num !== 'number') return num;
    // Round to 4 decimals and remove trailing zeros
    const rounded = Math.round(num * 10000) / 10000;
    return rounded.toString();
  };

  // Helper to format quantity based on display mode AND machine display mode
  const formatDisplayQuantity = (quantity) => {
    if (quantity === 'Variable') return 'Variable';
    if (typeof quantity !== 'number') return quantity;
    
    // If cycle time is Variable, can't convert to per-second
    if (cycleTime === 'Variable') {
      return displayMode === 'perSecond' ? 'Variable' : smartFormat(quantity);
    }
    
    let baseQuantity = quantity;
    
    // Step 1: Convert based on display mode
    if (displayMode === 'perSecond') {
      // Drill: quantities are per-second, cycle time is 1, so divide by 1 (no change)
      // Assembler: quantities are per-cycle, so divide by cycle time
      baseQuantity = quantity / cycleTime;
    } else {
      // perCycle mode
      // Drill: quantities are per-second, cycle time is 1, so multiply by 1 (no change)
      // Assembler: quantities are already per-cycle, so multiply by 1 (no change)
      baseQuantity = quantity * cycleTime / cycleTime; // This is just quantity
    }
    
    // Step 2: Multiply by machine count if in 'total' mode
    if (machineDisplayMode === 'total') {
      baseQuantity = baseQuantity * (machineCount || 0);
    }
    
    return smartFormat(baseQuantity);
  };

  // Helper to format cycle time based on display mode
  const formatDisplayCycleTime = (ct) => {
    if (ct === 'Variable') return 'Variable';
    if (typeof ct !== 'number') return ct;
    
    if (displayMode === 'perSecond') {
      return '1s';
    } else {
      if (ct >= 60) {
        const minutes = Math.floor(ct / 60);
        const seconds = ct % 60;
        return `${minutes}m ${smartFormat(seconds)}s`;
      }
      return `${smartFormat(ct)}s`;
    }
  };

  const displayCycleTime = formatDisplayCycleTime(cycleTime);
  
  const powerConsumption = formatPowerConsumption(recipe.power_consumption);
  const hasDualPower = 
    typeof powerConsumption === 'object' && 
    powerConsumption !== null && 
    (('drilling' in powerConsumption && 'idle' in powerConsumption) || 
     ('max' in powerConsumption && 'average' in powerConsumption));
  
  const leftCount = recipe.inputs.length;
  const rightCount = recipe.outputs.length;
  const maxCount = Math.max(leftCount, rightCount, 1);
  
  // Calculate top padding based on number of rectangles: 109 + multiplier * roundup(maxCount / 2)
  // Use 24 for less than 5 rectangles, 20 for more than or equal to 5
  const multiplier = maxCount >= 5 ? 20 : 24;
  const TOP_PADDING_RECTANGLES = 109 + multiplier * Math.ceil(maxCount / 2);
  
  // Calculate width needed to fit all product names and quantities
  const getMaxWidth = (items) => {
    if (!items?.length) return 80;
    return Math.max(80, ...items.map(item => {
      const name = getProductName(item.product_id, getProduct);
      const qty = formatDisplayQuantity(item.quantity);
      return qty.length * 8 + name.length * 8 + 6;
    }));
  };

  const leftWidth = leftCount > 0 ? getMaxWidth(recipe.inputs) : 0;
  const rightWidth = rightCount > 0 ? getMaxWidth(recipe.outputs) : 0;
  const hasLeft = leftCount > 0;
  const hasRight = rightCount > 0;
  
  // Calculate total width - two columns if both inputs and outputs, otherwise one
  const contentWidth = 
    hasLeft && hasRight 
      ? leftWidth + rightWidth + COLUMN_GAP + SIDE_PADDING * 2 
      : (hasLeft ? leftWidth : rightWidth) + SIDE_PADDING * 2;
  
  const width = Math.max(contentWidth, MIN_WIDTH);
  const height = TOP_PADDING_RECTANGLES + (maxCount * RECT_HEIGHT) + ((maxCount - 1) * RECT_GAP) + BOTTOM_PADDING;

  // Calculate Y positions for all input/output rectangles with centered alignment
  const getRectPositions = (count) => {
    if (count === 0) return [];
    const totalHeight = count * RECT_HEIGHT + (count - 1) * RECT_GAP;
    const availableHeight = height - TOP_PADDING_RECTANGLES - BOTTOM_PADDING;
    const offset = Math.max((availableHeight - totalHeight) / 2, 0);
    
    return Array.from({ length: count }, (_, i) => 
      TOP_PADDING_RECTANGLES + offset + i * (RECT_HEIGHT + RECT_GAP)
    );
  };

  const leftPositions = getRectPositions(leftCount);
  const rightPositions = getRectPositions(rightCount);
  
  // Convert pixel positions to percentage for ReactFlow handles
  const getHandlePositions = (positions) => 
    positions.map(p => ((p + RECT_HEIGHT / 2) / height) * 100);

  // Format machine count for display
  const displayMachineCount = machineCount ?? 0;
  const formattedMachineCount = Number.isInteger(displayMachineCount) 
    ? displayMachineCount.toString() 
    : displayMachineCount.toFixed(2);

  // Gray out machine count when in 'total' mode
  const machineCountStyle = machineDisplayMode === 'total' 
    ? { color: 'var(--text-muted)', opacity: 0.5 } 
    : {};

  return (
    <>
      <div className={`custom-node ${isTarget ? 'target' : ''}`} style={{ width, height }}>
        {/* Settings button for special machines */}
        {isMineshaftDrill && (
          <button 
            onClick={(e) => { e.stopPropagation(); setShowDrillSettings(true); }} 
            className="drill-settings-button" 
            title="Configure Drill"
          >
            ⚙️
          </button>
        )}
        {isLogicAssembler && (
          <button 
            onClick={(e) => { e.stopPropagation(); setShowAssemblerSettings(true); }} 
            className="drill-settings-button" 
            title="Configure Assembler"
          >
            ⚙️
          </button>
        )}

        {/* Recipe name */}
        <div className="node-recipe-name" title={recipe.name}>
          {recipe.name}
        </div>

        {/* Stats and machine info */}
        <div className="node-stats-row">
          <div className="node-stats">
            <div className="node-stat-row">
              <span className="node-stat-label">Cycle:</span> {displayCycleTime}
            </div>
            {hasDualPower ? (
              ('drilling' in powerConsumption) ? (
                <>
                  <div className="node-stat-row">
                    <span className="node-stat-label">Power (Drilling):</span> {powerConsumption.drilling}
                  </div>
                  <div className="node-stat-row">
                    <span className="node-stat-label">Power (Idle):</span> {powerConsumption.idle}
                  </div>
                </>
              ) : (
                <>
                  <div className="node-stat-row">
                    <span className="node-stat-label">Power (Max):</span> {powerConsumption.max}
                  </div>
                  <div className="node-stat-row">
                    <span className="node-stat-label">Power (Avg):</span> {powerConsumption.average}
                  </div>
                </>
              )
            ) : (
              <div className="node-stat-row">
                <span className="node-stat-label">Power:</span> {formatPowerConsumption(recipe.power_consumption)}
              </div>
            )}
            <div className="node-stat-row">
              <span className="node-stat-label">Pollution:</span> {formatPollution(recipe.pollution)}
            </div>
          </div>

          <div className="node-machine-info">
            <div className="node-machine-name" title={machine.name}>
              {machine.name}
            </div>
            <div 
              className="node-machine-count" 
              style={machineCountStyle}
              title={machineDisplayMode === 'total' ? "Machine count (display mode: Total)" : "Double-click node to edit"}
            >
              {formattedMachineCount}
            </div>
          </div>
        </div>

        {/* Input rectangles (left side) */}
        {leftPositions.map((pos, i) => (
          <React.Fragment key={`left-${i}`}>
            <NodeRect 
              side="left" 
              index={i} 
              position={pos} 
              width={leftWidth} 
              isOnly={!hasRight} 
              input={recipe.inputs[i]} 
              onClick={onInputClick} 
              nodeId={id}
              formatQuantity={formatDisplayQuantity}
            />
            <NodeHandle 
              side="left" 
              index={i} 
              position={getHandlePositions(leftPositions)[i]} 
            />
          </React.Fragment>
        ))}

        {/* Output rectangles (right side) */}
        {rightPositions.map((pos, i) => (
          <React.Fragment key={`right-${i}`}>
            <NodeRect 
              side="right" 
              index={i} 
              position={pos} 
              width={rightWidth} 
              isOnly={!hasLeft} 
              input={recipe.outputs[i]} 
              onClick={onOutputClick} 
              nodeId={id}
              formatQuantity={formatDisplayQuantity}
            />
            <NodeHandle 
              side="right" 
              index={i} 
              position={getHandlePositions(rightPositions)[i]} 
            />
          </React.Fragment>
        ))}
      </div>

      {/* Settings modals */}
      {showDrillSettings && (
        <DrillSettings 
          nodeId={id} 
          currentSettings={recipe.drillSettings || {}} 
          onSettingsChange={onDrillSettingsChange} 
          onClose={() => setShowDrillSettings(false)} 
        />
      )}
      {showAssemblerSettings && (
        <LogicAssemblerSettings 
          nodeId={id} 
          currentSettings={recipe.assemblerSettings || {}} 
          onSettingsChange={onLogicAssemblerSettingsChange} 
          onClose={() => setShowAssemblerSettings(false)} 
        />
      )}
    </>
  );
};

/**
 * Individual input/output rectangle - clickable to open recipe selector
 */
const NodeRect = ({ side, index, position, width, isOnly, input, onClick, nodeId, formatQuantity }) => {
  const isLeft = side === 'left';
  const productName = getProductName(input.product_id, getProduct);
  const displayQuantity = formatQuantity(input.quantity);
  
  return (
    <div
      onClick={(e) => { 
        if (onClick) { 
          e.stopPropagation(); 
          onClick(input.product_id, nodeId, index); 
        } 
      }}
      title={`${displayQuantity}x ${productName}`}
      className={`node-rect ${isLeft ? 'input' : 'output'} ${onClick ? 'clickable' : ''}`}
      style={{
        left: isOnly ? '50%' : (isLeft ? `${SIDE_PADDING}px` : undefined),
        right: !isOnly && !isLeft ? `${SIDE_PADDING}px` : undefined,
        transform: isOnly ? 'translateX(-50%)' : undefined,
        top: `${position}px`,
        width: `${width}px`,
      }}
    >
      {displayQuantity}x {productName}
    </div>
  );
};

/**
 * ReactFlow handle - anchor point for edges
 */
const NodeHandle = ({ side, index, position }) => (
  <Handle
    type={side === 'left' ? 'target' : 'source'}
    position={side === 'left' ? Position.Left : Position.Right}
    id={`${side}-${index}`}
    style={{ 
      background: side === 'left' ? '#22c55e' : '#ef4444', 
      width: '12px', 
      height: '12px', 
      border: '2px solid #1a1a1a', 
      top: `${position}%` 
    }}
  />
);

export default CustomNode;