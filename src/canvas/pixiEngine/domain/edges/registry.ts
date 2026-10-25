import { flowEdgeType } from './flow/definition';

export const edgeTypeRegistry = {
  flow: flowEdgeType,
} as const;

export type RegisteredEdgeType = keyof typeof edgeTypeRegistry;
