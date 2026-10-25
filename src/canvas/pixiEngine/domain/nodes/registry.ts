import { recipeNodeType } from './recipe/definition';

export const nodeTypeRegistry = {
  recipe: recipeNodeType,
} as const;

export type RegisteredNodeType = keyof typeof nodeTypeRegistry;
