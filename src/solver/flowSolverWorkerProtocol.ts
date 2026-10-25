import type { ReactFlowEdge, ReactFlowNode } from '../types/solver';
import type { SolverPipelineResult } from './solverPipeline';

export interface FlowSolverWorkerRequest {
  readonly requestId: number;
  readonly graphVersion: number;
  readonly dataDbVersion: number;
  readonly nodes: ReactFlowNode[];
  readonly edges: ReactFlowEdge[];
  readonly globalSettings: Record<string, unknown>;
}

export type FlowSolverWorkerResponse =
  | { readonly requestId: number; readonly result: SolverPipelineResult }
  | { readonly requestId: number; readonly error: string };
