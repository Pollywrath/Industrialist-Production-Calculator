import { type Edge } from '@xyflow/react';

export interface EdgeControlPoint {
  x: number;
  y: number;
}

export type RecipeEdgeData = {
  sourceNodeId: string;
  sourceOutputIndex: number;
  targetNodeId: string;
  targetInputIndex: number;
  productId: string;
  quantity: number;
  temperature: number;
  controlPoints?: EdgeControlPoint[];
  orthogonalTurns?: EdgeControlPoint[];
};

export type RecipeEdgeType = Edge<RecipeEdgeData, 'recipe'>;
