import React, { useMemo, memo } from 'react';
import { getBezierPath, getStraightPath, getSmoothStepPath } from '@xyflow/react';

const CustomEdge = ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) => {
  // Read edge settings from data prop (passed from parent)
  const edgePath = data?.edgePath || 'orthogonal';
  const edgeStyle = data?.edgeStyle || 'animated';

  const [path] = useMemo(() => {
    if (edgePath === 'straight') {
      return getStraightPath({ sourceX, sourceY, targetX, targetY });
    } else if (edgePath === 'orthogonal') {
      return getSmoothStepPath({ 
        sourceX, 
        sourceY, 
        sourcePosition,
        targetX, 
        targetY, 
        targetPosition,
        borderRadius: 8
      });
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

export default memo(CustomEdge, (prev, next) => {
  return prev.sourceX === next.sourceX &&
         prev.sourceY === next.sourceY &&
         prev.targetX === next.targetX &&
         prev.targetY === next.targetY &&
         prev.data?.edgePath === next.data?.edgePath &&
         prev.data?.edgeStyle === next.data?.edgeStyle;
});