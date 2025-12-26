import React, { useMemo } from 'react';
import { getBezierPath, getStraightPath } from '@xyflow/react';

const getOrthogonalPath = (sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition) => {
  // Prioritize horizontal movement over vertical in all cases
  const horizontalGap = 40; // Minimum horizontal spacing from source/target
  const verticalOffset = 20; // Offset for vertical segments when needed
  
  // Determine if we're going right-to-left or left-to-right
  const goingRight = targetX > sourceX;
  
  if (goingRight) {
    // Source on left, target on right - prioritize horizontal
    // Move horizontally to midpoint, then vertical, then complete horizontal
    const midX = (sourceX + targetX) / 2;
    const path = `M ${sourceX},${sourceY} L ${midX},${sourceY} L ${midX},${targetY} L ${targetX},${targetY}`;
    return [path, midX, (sourceY + targetY) / 2];
  } else {
    // Source on right, target on left - need to wrap around with U-turns on both ends
    const sourceExtend = sourceX + horizontalGap;
    const targetExtend = targetX - horizontalGap;
    
    // Use a common middle Y coordinate to ensure horizontal segment is truly horizontal
    const midY = (sourceY + targetY) / 2 + (((sourceY + targetY) / 2) < 300 ? verticalOffset : -verticalOffset);
    
    // Path with proper orthogonal segments (no diagonals):
    // 1. Horizontal from source
    // 2. Vertical to middle Y
    // 3. Horizontal across at middle Y (truly horizontal)
    // 4. Vertical to target Y
    // 5. Horizontal to target
    const path = `M ${sourceX},${sourceY} L ${sourceExtend},${sourceY} L ${sourceExtend},${midY} L ${targetExtend},${midY} L ${targetExtend},${targetY} L ${targetX},${targetY}`;
    return [path, (sourceExtend + targetExtend) / 2, midY];
  }
};

const CustomEdge = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) => {
  // Read edge settings from data prop (passed from parent)
  const edgePath = data?.edgePath || 'bezier';
  const edgeStyle = data?.edgeStyle || 'animated';

  const [path] = useMemo(() => {
    if (edgePath === 'straight') {
      return getStraightPath({ sourceX, sourceY, targetX, targetY });
    } else if (edgePath === 'orthogonal') {
      return getOrthogonalPath(sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition);
    } else {
      return getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    }
  }, [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, edgePath]);

  const className = edgeStyle === 'animated' 
    ? 'custom-edge custom-edge-animated' 
    : edgeStyle === 'dashed'
    ? 'custom-edge custom-edge-dashed'
    : 'custom-edge custom-edge-solid';

  return <path id={id} className={className} d={path} fill="none" />;
};

export default CustomEdge;