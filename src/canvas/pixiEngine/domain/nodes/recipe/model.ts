import type { GraphNode, NewPort } from '../../graph/types';

export interface RecipeNodeData {
  readonly heightOverride?: number;
  readonly machineName?: string;
  readonly machineCount?: number | string;
  readonly cycleTime?: string;
  readonly power?: string;
  readonly pollution?: string;
  readonly machineTierColor?: string;
  readonly isTarget?: boolean;
  readonly temperature?: string;
}

export type RecipeNode = GraphNode<'recipe', RecipeNodeData>;

export interface NewRecipeNode {
  readonly id?: string;
  readonly label?: string;
  readonly x: number;
  readonly y: number;
  readonly ports?: readonly NewPort[];
  readonly inputOrder?: readonly string[];
  readonly outputOrder?: readonly string[];
  readonly data?: RecipeNodeData;
}
