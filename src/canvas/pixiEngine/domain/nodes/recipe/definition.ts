import type { RecipeNode, RecipeNodeData } from './model';

export const RECIPE_NODE_TYPE = 'recipe' as const;

export function validateRecipeNodeData(nodeId: string, data: RecipeNodeData) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`Node "${nodeId}" recipe data must be an object.`);
  }
  if (
    data.heightOverride !== undefined &&
    (!Number.isFinite(data.heightOverride) || data.heightOverride <= 0)
  ) {
    throw new Error(`Node "${nodeId}" height override must be finite and positive.`);
  }
  if (
    data.machineCount !== undefined &&
    typeof data.machineCount !== 'number' &&
    typeof data.machineCount !== 'string'
  ) {
    throw new Error(`Node "${nodeId}" machine count must be a number or string.`);
  }
  if (typeof data.machineCount === 'number' && !Number.isFinite(data.machineCount)) {
    throw new Error(`Node "${nodeId}" machine count must be finite.`);
  }
  for (const key of [
    'machineName',
    'cycleTime',
    'power',
    'pollution',
    'machineTierColor',
  ] as const) {
    if (data[key] !== undefined && typeof data[key] !== 'string') {
      throw new Error(`Node "${nodeId}" ${key} must be a string.`);
    }
  }
  if (data.isTarget !== undefined && typeof data.isTarget !== 'boolean') {
    throw new Error(`Node "${nodeId}" target state must be a boolean.`);
  }
}

export interface RecipeNodeTypeDefinition {
  readonly type: typeof RECIPE_NODE_TYPE;
  validate(node: RecipeNode): void;
}

export const recipeNodeType: RecipeNodeTypeDefinition = {
  type: RECIPE_NODE_TYPE,
  validate(node) {
    validateRecipeNodeData(node.id, node.data);
  },
};
