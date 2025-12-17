import React from 'react';
import { Handle, Position } from '@xyflow/react';

// Layout constants
const RECT_HEIGHT = 44;
const RECT_GAP = 8;
const TOP_PADDING = 60;
const BOTTOM_PADDING = 20;
const SIDE_PADDING = 10;
const COLUMN_GAP = 16;
const RECT_MIN_WIDTH = 70;
const RECT_MAX_WIDTH = 140;
const MIN_BOX_WIDTH = 180;

const CustomNode = ({ data, id }) => {
  const leftHandles = data.leftHandles || 0;
  const rightHandles = data.rightHandles || 0;
  const maxHandles = Math.max(leftHandles, rightHandles, 1);
  
  // Calculate dimensions
  const height = TOP_PADDING + (maxHandles * RECT_HEIGHT) + ((maxHandles - 1) * RECT_GAP) + BOTTOM_PADDING;
  const titleWidth = (data.label?.length || 5) * 8 + 60;
  const hasLeft = leftHandles > 0;
  const hasRight = rightHandles > 0;
  
  const width = hasLeft && hasRight
    ? Math.max(titleWidth, RECT_MIN_WIDTH * 2 + COLUMN_GAP + SIDE_PADDING * 2, MIN_BOX_WIDTH)
    : Math.max(titleWidth, RECT_MIN_WIDTH + SIDE_PADDING * 2, MIN_BOX_WIDTH);

  // Generate vertical positions for rectangles (centered)
  const getRectPositions = (count) => {
    if (count === 0) return [];
    const totalHeight = count * RECT_HEIGHT + (count - 1) * RECT_GAP;
    const availableHeight = height - TOP_PADDING - BOTTOM_PADDING;
    const offset = (availableHeight - totalHeight) / 2;
    return Array.from({ length: count }, (_, i) => TOP_PADDING + offset + i * (RECT_HEIGHT + RECT_GAP));
  };

  const leftPositions = getRectPositions(leftHandles);
  const rightPositions = getRectPositions(rightHandles);
  
  // Handle positions aligned with rectangle centers
  const getHandlePositions = (positions) => positions.map(p => ((p + RECT_HEIGHT / 2) / height) * 100);
  
  const leftHandlePos = getHandlePositions(leftPositions);
  const rightHandlePos = getHandlePositions(rightPositions);

  const rectMaxWidth = hasLeft && hasRight
    ? Math.min((width - SIDE_PADDING * 2 - COLUMN_GAP) / 2, RECT_MAX_WIDTH)
    : Math.min(width - SIDE_PADDING * 2, RECT_MAX_WIDTH);

  return (
    <div
      style={{
        padding: '15px 20px',
        borderRadius: '12px',
        background: '#1a1a1a',
        border: '2px solid #d4a637',
        color: '#f5d56a',
        width: `${width}px`,
        height: `${height}px`,
        fontWeight: '500',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
        position: 'relative',
      }}
    >
      {/* Title */}
      <div style={{
        textAlign: 'center',
        marginBottom: '20px',
        paddingBottom: '10px',
        fontSize: '16px',
        fontWeight: '600',
        borderBottom: '1px solid #d4a63755',
      }}>
        {data.label}
      </div>

      {/* Left rectangles and handles */}
      {leftPositions.map((pos, i) => (
        <React.Fragment key={`left-${i}`}>
          <NodeRect side="left" index={i} position={pos} maxWidth={rectMaxWidth} isOnly={!hasRight} />
          <NodeHandle side="left" index={i} position={leftHandlePos[i]} />
        </React.Fragment>
      ))}

      {/* Right rectangles and handles */}
      {rightPositions.map((pos, i) => (
        <React.Fragment key={`right-${i}`}>
          <NodeRect side="right" index={i} position={pos} maxWidth={rectMaxWidth} isOnly={!hasLeft} />
          <NodeHandle side="right" index={i} position={rightHandlePos[i]} />
        </React.Fragment>
      ))}
    </div>
  );
};

// Rectangle component
const NodeRect = ({ side, index, position, maxWidth, isOnly }) => {
  const isLeft = side === 'left';
  const colors = {
    left: { bg: '#1a3a2a', border: '#22c55e', text: '#86efac' },
    right: { bg: '#3a1a1a', border: '#ef4444', text: '#fca5a5' },
  };
  const color = colors[side];

  return (
    <div
      style={{
        position: 'absolute',
        left: isOnly ? '50%' : (isLeft ? `${SIDE_PADDING}px` : undefined),
        right: !isOnly && !isLeft ? `${SIDE_PADDING}px` : undefined,
        transform: isOnly ? 'translateX(-50%)' : undefined,
        top: `${position}px`,
        minWidth: `${RECT_MIN_WIDTH}px`,
        maxWidth: `${maxWidth}px`,
        background: color.bg,
        border: `2px solid ${color.border}`,
        borderRadius: '6px',
        padding: '10px 8px',
        color: color.text,
        fontSize: '13px',
        textAlign: 'center',
        fontWeight: '500',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {isLeft ? 'Left' : 'Right'} {index + 1}
    </div>
  );
};

// Handle component
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