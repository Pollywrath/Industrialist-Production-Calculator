import type { Node, Edge } from '@xyflow/react';
import type { RecipeNodeData } from './nodes';

export interface HandleFlowStatus {
  rate: number;
  connected: number;
  hasDeficiency: boolean;
  hasExcess: boolean;
}

export interface NodeFlowResult {
  inputFlows: HandleFlowStatus[];
  outputFlows: HandleFlowStatus[];
}
export type FlowResults = Map<string, NodeFlowResult>;

export interface SolverPort {
  type: 'output' | 'input';
  nodeId: string;
  index: number;
  rate: number;
}

export interface SolverConnection {
  id: string;
  sourceNodeId: string;
  sourceOutputIndex: number;
  sourceRate: number;
  targetNodeId: string;
  targetInputIndex: number;
  targetRate: number;
}

export interface SolverProductData {
  producers: SolverPort[];
  consumers: SolverPort[];
  connections: SolverConnection[];
}

export interface SolverGraph {
  nodes: Record<
    string,
    {
      inputs: { productId: string; rate: number }[];
      outputs: { productId: string; rate: number }[];
    }
  >;
  products: Record<string, SolverProductData>;
}

export interface FlowEdge {
  to: number;
  cap: number;
  flow: number;
  rev: number;
  connIndex: number;
}

export interface FlowNetwork {
  adj: number[][];
  edges: FlowEdge[];
  nodeCount: number;
  SOURCE: number;
  SINK: number;
}

export type ReactFlowNode = Node<RecipeNodeData>;
export type ReactFlowEdge = Edge;
