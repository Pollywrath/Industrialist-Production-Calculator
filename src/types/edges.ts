import { type Edge } from '@xyflow/react';

export type RecipeEdgeData = {
  sourceNodeId: string;
  sourceOutputIndex: number;
  targetNodeId: string;
  targetInputIndex: number;
  productId: string;
  quantity: number;
  temperature: number;
};

export type RecipeEdgeType = Edge<RecipeEdgeData, 'recipe'>;
