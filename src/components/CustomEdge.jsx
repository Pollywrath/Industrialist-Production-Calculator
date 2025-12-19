import React from 'react';
import { getBezierPath } from '@xyflow/react';

/**
 * Custom edge renderer - creates smooth bezier curves between nodes
 * with animated dashed styling
 */
const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <path
      id={id}
      className="custom-edge"
      d={edgePath}
      fill="none"
    />
  );
};

export default CustomEdge;