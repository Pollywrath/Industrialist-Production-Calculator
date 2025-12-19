import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { getProduct } from '../data/dataLoader';
import { getProductName, formatQuantity, formatCycleTime, formatPowerConsumption } from '../utils/variableHandler';
import DrillSettings from './DrillSettings';
import LogicAssemblerSettings from './LogicAssemblerSettings';

const RECT_HEIGHT = 44;
const RECT_GAP = 8;
const TOP_PADDING_NORMAL = 165;
const TOP_PADDING_DUAL_POWER = 180; // Extra space for dual power display
const BOTTOM_PADDING = 20;
const SIDE_PADDING = 10;
const COLUMN_GAP = 20;
const MIN_WIDTH = 320;

const CustomNode = ({ data, id }) => {
  const { recipe, machine, onInputClick, onOutputClick, isTarget, onDrillSettingsChange, onLogicAssemblerSettingsChange } = data;
  const [showDrillSettings, setShowDrillSettings] = useState(false);
  const [showAssemblerSettings, setShowAssemblerSettings] = useState(false);
  
  if (!recipe || !machine || !recipe.inputs || !recipe.outputs) {
    console.error('CustomNode: Invalid data', { data, id });
    return null;
  }
  
  const isMineshaftDrill = recipe.isMineshaftDrill || recipe.id === 'r_mineshaft_drill';
  const isLogicAssembler = recipe.isLogicAssembler || recipe.id === 'r_logic_assembler';
  
  // Format power consumption (handle single value, drilling/idle object for drill, or max/average object for assembler)
  const powerConsumption = formatPowerConsumption(recipe.power_consumption);
  const hasDualPower = typeof powerConsumption === 'object' && powerConsumption !== null && 
    (('drilling' in powerConsumption && 'idle' in powerConsumption) || 
     ('max' in powerConsumption && 'average' in powerConsumption));
  
  // Use appropriate top padding based on power display
  const TOP_PADDING = hasDualPower ? TOP_PADDING_DUAL_POWER : TOP_PADDING_NORMAL;
  
  const leftCount = recipe.inputs.length;
  const rightCount = recipe.outputs.length;
  const maxCount = Math.max(leftCount, rightCount, 1);
  
  // Calculate dimensions
  const estimateTextWidth = (text) => text.length * 8 + 6;
  
  const getMaxWidth = (items) => {
    if (!items?.length) return 80;
    return Math.max(80, ...items.map(item => {
      const name = getProductName(item.product_id, getProduct);
      const qty = formatQuantity(item.quantity);
      return estimateTextWidth(`${qty}x ${name}`);
    }));
  };

  const leftWidth = leftCount > 0 ? getMaxWidth(recipe.inputs) : 0;
  const rightWidth = rightCount > 0 ? getMaxWidth(recipe.outputs) : 0;
  
  const hasLeft = leftCount > 0;
  const hasRight = rightCount > 0;
  const contentWidth = hasLeft && hasRight 
    ? leftWidth + rightWidth + COLUMN_GAP + SIDE_PADDING * 2
    : (hasLeft ? leftWidth : rightWidth) + SIDE_PADDING * 2;
  
  const width = Math.max(contentWidth, MIN_WIDTH);
  const height = TOP_PADDING + (maxCount * RECT_HEIGHT) + ((maxCount - 1) * RECT_GAP) + BOTTOM_PADDING;

  // Generate positions
  const getRectPositions = (count) => {
    if (count === 0) return [];
    const totalHeight = count * RECT_HEIGHT + (count - 1) * RECT_GAP;
    const availableHeight = height - TOP_PADDING - BOTTOM_PADDING;
    const offset = Math.max((availableHeight - totalHeight) / 2, 0);
    return Array.from({ length: count }, (_, i) => 
      TOP_PADDING + offset + i * (RECT_HEIGHT + RECT_GAP)
    );
  };

  const leftPositions = getRectPositions(leftCount);
  const rightPositions = getRectPositions(rightCount);
  const getHandlePositions = (positions) => 
    positions.map(p => ((p + RECT_HEIGHT / 2) / height) * 100);

  const handleDrillSettingsClick = (e) => {
    e.stopPropagation();
    setShowDrillSettings(true);
  };

  const handleAssemblerSettingsClick = (e) => {
    e.stopPropagation();
    setShowAssemblerSettings(true);
  };

  const handleDrillSettingsChange = (nodeId, settings, inputs, outputs) => {
    if (onDrillSettingsChange) {
      onDrillSettingsChange(nodeId, settings, inputs, outputs);
    }
  };

  const handleLogicAssemblerSettingsChange = (nodeId, settings, inputs, outputs) => {
    if (onLogicAssemblerSettingsChange) {
      onLogicAssemblerSettingsChange(nodeId, settings, inputs, outputs);
    }
  };

  return (
    <>
      <div className={`custom-node ${isTarget ? 'target' : ''}`} style={{ width, height }}>
        {/* Settings button for mineshaft drill */}
        {isMineshaftDrill && (
          <button
            onClick={handleDrillSettingsClick}
            className="drill-settings-button"
            title="Configure Drill Settings"
          >
            ⚙️
          </button>
        )}

        {/* Settings button for logic assembler */}
        {isLogicAssembler && (
          <button
            onClick={handleAssemblerSettingsClick}
            className="drill-settings-button"
            title="Configure Logic Assembler Settings"
          >
            ⚙️
          </button>
        )}

        <div className="node-recipe-name" title={recipe.name}>
          {recipe.name}
        </div>

        <div className="node-stats-row">
          <div className="node-stats">
            <div className="node-stat-row">
              <span className="node-stat-label">Cycle:</span> {formatCycleTime(recipe.cycle_time)}
            </div>
            {hasDualPower ? (
              <>
                {('drilling' in powerConsumption && 'idle' in powerConsumption) ? (
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
                )}
              </>
            ) : (
              <div className="node-stat-row">
                <span className="node-stat-label">Power:</span> {powerConsumption}
              </div>
            )}
            <div className="node-stat-row">
              <span className="node-stat-label">Pollution:</span> {typeof recipe.pollution === 'number' ? `${recipe.pollution}%/hr` : recipe.pollution}
            </div>
          </div>

          <div className="node-machine-info">
            <div className="node-machine-name" title={machine.name}>
              {machine.name}
            </div>
            <div className="node-machine-count">0</div>
          </div>
        </div>

        {/* Inputs */}
        {leftPositions.map((pos, i) => {
          const input = recipe.inputs[i];
          if (!input) return null;
          return (
            <React.Fragment key={`left-${i}`}>
              <NodeRect 
                side="left" 
                index={i} 
                position={pos} 
                width={leftWidth}
                isOnly={!hasRight}
                productId={input.product_id}
                quantity={input.quantity}
                onClick={onInputClick}
                nodeId={id}
              />
              <NodeHandle side="left" index={i} position={getHandlePositions(leftPositions)[i]} />
            </React.Fragment>
          );
        })}

        {/* Outputs */}
        {rightPositions.map((pos, i) => {
          const output = recipe.outputs[i];
          if (!output) return null;
          return (
            <React.Fragment key={`right-${i}`}>
              <NodeRect 
                side="right" 
                index={i} 
                position={pos} 
                width={rightWidth}
                isOnly={!hasLeft}
                productId={output.product_id}
                quantity={output.quantity}
                onClick={onOutputClick}
                nodeId={id}
              />
              <NodeHandle side="right" index={i} position={getHandlePositions(rightPositions)[i]} />
            </React.Fragment>
          );
        })}
      </div>

      {/* Drill Settings Modal */}
      {showDrillSettings && (
        <DrillSettings
          nodeId={id}
          currentSettings={recipe.drillSettings || {}}
          onSettingsChange={handleDrillSettingsChange}
          onClose={() => setShowDrillSettings(false)}
        />
      )}

      {/* Logic Assembler Settings Modal */}
      {showAssemblerSettings && (
        <LogicAssemblerSettings
          nodeId={id}
          currentSettings={recipe.assemblerSettings || {}}
          onSettingsChange={handleLogicAssemblerSettingsChange}
          onClose={() => setShowAssemblerSettings(false)}
        />
      )}
    </>
  );
};

const NodeRect = ({ side, index, position, width, isOnly, productId, quantity, onClick, nodeId }) => {
  const isLeft = side === 'left';
  const productName = getProductName(productId, getProduct);
  const displayQuantity = formatQuantity(quantity);
  
  const handleClick = (e) => {
    if (onClick) {
      e.stopPropagation();
      onClick(productId, nodeId, index);
    }
  };

  const style = {
    left: isOnly ? '50%' : (isLeft ? `${SIDE_PADDING}px` : undefined),
    right: !isOnly && !isLeft ? `${SIDE_PADDING}px` : undefined,
    transform: isOnly ? 'translateX(-50%)' : undefined,
    top: `${position}px`,
    width: `${width}px`,
  };

  return (
    <div
      onClick={handleClick}
      title={`${displayQuantity}x ${productName}`}
      className={`node-rect ${isLeft ? 'input' : 'output'} ${onClick ? 'clickable' : ''}`}
      style={style}
    >
      {displayQuantity}x {productName}
    </div>
  );
};

const NodeHandle = ({ side, index, position }) => {
  const isLeft = side === 'left';
  return (
    <Handle
      type={isLeft ? 'target' : 'source'}
      position={isLeft ? Position.Left : Position.Right}
      id={`${side}-${index}`}
      style={{
        background: isLeft ? '#22c55e' : '#ef4444',
        width: '12px',
        height: '12px',
        border: '2px solid #1a1a1a',
        top: `${position}%`,
      }}
    />
  );
};

export default CustomNode;