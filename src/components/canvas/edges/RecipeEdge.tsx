import { type EdgeProps, getBezierPath, BaseEdge } from '@xyflow/react';

const EDGE_STYLE = { stroke: 'var(--theme-color-edge-stroke)', strokeWidth: 2 };

export function RecipeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
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

  return <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={EDGE_STYLE} />;
}
