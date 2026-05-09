import { type EdgeProps, getBezierPath, BaseEdge } from '@xyflow/react';

export default function RecipeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{ ...style, stroke: 'var(--theme-color-edge-stroke)', strokeWidth: 2 }}
    />
  );
}
