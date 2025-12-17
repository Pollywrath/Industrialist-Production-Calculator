import React from 'react';
import { getBezierPath } from '@xyflow/react';

const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
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
    <>
      <defs>
        <style>{`@keyframes dash { to { stroke-dashoffset: -24; } }`}</style>
      </defs>
      <path
        id={id}
        style={{
          ...style,
          stroke: '#d4a637',
          strokeWidth: 2,
          strokeDasharray: '8 4',
          animation: 'dash 1.5s linear infinite',
        }}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
      />
    </>
  );
};

export default CustomEdge;