import { type Node } from '@xyflow/react';

export type HandleRef = {
  side: 'input' | 'output';
  index: number;
};

export type RecipeNodeData = {
  recipeId: string;
  machineCount: number;
  inputOrder?: number[];
  outputOrder?: number[];
  settings?: Record<string, unknown>;
  isTarget?: boolean;
};

export type RecipeNodeType = Node<RecipeNodeData, 'recipe'>;
