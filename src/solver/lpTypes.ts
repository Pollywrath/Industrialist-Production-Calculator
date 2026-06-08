export interface LPSolverNode {
  id: string;
  currentMachineCount: number;
  isTarget: boolean;
  power: number;
  pollution: number;
  inputs: {
    productId: string;
    quantity: number;
    isSink: boolean;
  }[];
  outputs: {
    productId: string;
    quantity: number;
    hasSinkConnection: boolean;
  }[];
}

export interface LPSolverConnection {
  id: string;
  sourceNodeId: string;
  sourceOutputIndex: number;
  targetNodeId: string;
  targetInputIndex: number;
}

export interface LPSolverRequest {
  origin: string;
  nodes: LPSolverNode[];
  connections: LPSolverConnection[];
  version?: string;
}

export interface LPSolverResponse {
  feasible: boolean;
  error?: string;
  machineCounts?: Record<string, number>;
  diagnostics?: LPFailureDiagnostics;
}

export interface LPDeficientInputDiagnostic {
  nodeId: string;
  inputIndex: number;
  productId: string;
  deficiency: number;
  requiredRate: number;
  suppliedRate: number;
  upstreamNodeIds: string[];
  causeNodeIds: string[];
  causeKind: LPDeficiencyCauseKind;
  upstreamContributions: LPUpstreamContributionDiagnostic[];
}

export type LPDeficiencyCauseKind =
  | 'feedback_loop'
  | 'product_mismatch'
  | 'upstream_input_deficient'
  | 'upstream_not_producing'
  | 'upstream_output_limited'
  | 'unknown';

export interface LPUpstreamContributionDiagnostic {
  edgeId: string;
  nodeId: string;
  outputIndex: number;
  productId: string;
  productMatches: boolean;
  unitOutputRate: number;
  suppliedRate: number;
  outputRate: number;
  totalOutgoingRate: number;
  directDeficiency: number;
}

export interface LPRootCauseDiagnostic {
  nodeId: string;
  outputIndex: number | null;
  productId: string;
  kind: LPDeficiencyCauseKind;
  deficiency: number;
  requiredRate: number;
  suppliedRate: number;
  unitOutputRate: number;
  outputRate: number;
  blockedInputNodeId: string;
  blockedInputIndex: number;
  cycleNodeIds: string[];
  boundaryNodeIds: string[];
}

export interface LPFailureDiagnostics {
  deficientNodeIds: string[];
  likelyRootNodeIds: string[];
  cycleNodeIds: string[];
  cycleBoundaryNodeIds: string[];
  rootCauses: LPRootCauseDiagnostic[];
  deficientInputs: LPDeficientInputDiagnostic[];
}
