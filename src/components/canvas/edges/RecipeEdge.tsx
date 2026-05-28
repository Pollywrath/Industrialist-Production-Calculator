import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import { type RecipeEdgeData } from '../../../types/edges';
import styles from './RecipeEdge.module.css';

const EDGE_STROKE_WIDTH = 2;
const EDGE_INTERACTION_WIDTH = 24;

export function RecipeEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
}: EdgeProps<Edge<RecipeEdgeData>>) {
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
      className={styles['edge-path']}
      style={{
        stroke: selected
          ? 'var(--theme-color-edge-selected-stroke)'
          : 'var(--theme-color-edge-stroke)',
        strokeWidth: EDGE_STROKE_WIDTH,
      }}
      interactionWidth={EDGE_INTERACTION_WIDTH}
    />
  );
}
