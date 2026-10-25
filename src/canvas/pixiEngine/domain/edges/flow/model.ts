import type { EdgeControlPoint, GraphEdge } from '../../graph/types';

export type EdgePathStyle = 'straight' | 'bezier' | 'orthogonal';
export type EdgeLineStyle = 'solid' | 'dashed' | 'dotted';
export type EdgeAnimationStyle = 'none' | 'moving-dashes' | 'pulse-arrow';

export interface FlowEdgeSettings {
  readonly routingStyle: EdgePathStyle;
  readonly lineStyle: EdgeLineStyle;
  readonly animationStyle: EdgeAnimationStyle;
}

export const DEFAULT_FLOW_EDGE_SETTINGS: FlowEdgeSettings = {
  routingStyle: 'orthogonal',
  lineStyle: 'solid',
  animationStyle: 'none',
};

export interface FlowEdge extends GraphEdge<'flow', FlowEdgeSettings> {
  readonly controlPoints?: readonly EdgeControlPoint[];
  readonly orthogonalTurns?: readonly EdgeControlPoint[];
}

export interface NewFlowEdge {
  readonly id?: string;
  readonly sourceNodeId: string;
  readonly sourcePortId: string;
  readonly targetNodeId: string;
  readonly targetPortId: string;
  readonly controlPoints?: readonly EdgeControlPoint[];
  readonly orthogonalTurns?: readonly EdgeControlPoint[];
  readonly settings?: Partial<FlowEdgeSettings>;
}

export type FlowGraphState = import('../../graph/types').GraphState<
  import('../../nodes/recipe/model').RecipeNode,
  FlowEdge,
  FlowEdgeSettings
>;
