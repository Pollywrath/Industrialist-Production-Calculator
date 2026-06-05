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
  isMultiSelected?: boolean;
  groupId?: string;
};

export type GroupNodeData = {
  label: string;
  collapsed: boolean;
  handlesReady?: boolean;
  inputProxyHandleIds: string[];
  outputProxyHandleIds: string[];
};

export type RecipeNodeType = Node<RecipeNodeData, 'recipe'>;
export type GroupNodeType = Node<GroupNodeData, 'group'>;
export type CanvasNode = RecipeNodeType | GroupNodeType;
export type CanvasNodeData = RecipeNodeData | GroupNodeData;

export function isRecipeNode(node: Node | null | undefined): node is RecipeNodeType {
  return node?.type === 'recipe';
}

export function isGroupNode(node: Node | null | undefined): node is GroupNodeType {
  return node?.type === 'group';
}
