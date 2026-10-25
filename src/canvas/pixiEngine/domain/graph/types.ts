export type NodeId = string;
export type PortId = string;
export type EdgeId = string;
export type EdgePointId = string;
export type GroupId = string;

export type PortDirection = 'input' | 'output';
export type PortKind = 'item' | 'fluid';

export interface FlowPort {
  readonly id: PortId;
  readonly direction: PortDirection;
  readonly kind?: PortKind;
  readonly logicalIndex: number;
  readonly label?: string;
  readonly summary?: string;
  readonly linkId?: string;
  readonly status?: 'deficient' | 'excess';
}

export interface GraphNode<TType extends string = string, TData = unknown> {
  readonly id: NodeId;
  readonly type: TType;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly ports: readonly FlowPort[];
  readonly inputOrder: readonly PortId[];
  readonly outputOrder: readonly PortId[];
  readonly data: TData;
}

export interface GraphEdge<TType extends string = string, TSettings = unknown> {
  readonly id: EdgeId;
  readonly type: TType;
  readonly sourceNodeId: NodeId;
  readonly sourcePortId: PortId;
  readonly targetNodeId: NodeId;
  readonly targetPortId: PortId;
  readonly settings: TSettings;
}

export interface EdgeControlPoint {
  readonly id: EdgePointId;
  readonly x: number;
  readonly y: number;
}

export interface FlowGroup {
  readonly id: GroupId;
  readonly label: string;
  readonly memberNodeIds: readonly NodeId[];
  readonly collapsed: boolean;
  readonly inputProxyPortIds?: readonly PortId[];
  readonly outputProxyPortIds?: readonly PortId[];
}

export interface GraphState<
  TNode extends GraphNode = GraphNode,
  TEdge extends GraphEdge = GraphEdge,
  TEdgeDefaults = unknown,
> {
  readonly nodes: readonly TNode[];
  readonly edges: readonly TEdge[];
  readonly groups?: readonly FlowGroup[];
  readonly edgeDefaults?: TEdgeDefaults;
}

export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export type NewPort = Omit<FlowPort, 'id'> & { readonly id?: PortId };

export interface LegacyFlowNode {
  readonly id: NodeId;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly ports: readonly FlowPort[];
  readonly inputOrder: readonly PortId[];
  readonly outputOrder: readonly PortId[];
  readonly heightOverride?: number;
  readonly machineName?: string;
  readonly machineCount?: number | string;
  readonly cycleTime?: string;
  readonly power?: string;
  readonly pollution?: string;
}

export interface LegacyFlowEdge {
  readonly id: EdgeId;
  readonly sourceNodeId: NodeId;
  readonly sourcePortId: PortId;
  readonly targetNodeId: NodeId;
  readonly targetPortId: PortId;
  readonly controlPoints?: readonly EdgeControlPoint[];
  readonly orthogonalTurns?: readonly EdgeControlPoint[];
  readonly pathStyle?: 'straight' | 'bezier' | 'orthogonal';
}

export interface LegacyGraphState {
  readonly nodes: readonly LegacyFlowNode[];
  readonly edges: readonly LegacyFlowEdge[];
  readonly groups?: readonly FlowGroup[];
  readonly routingStyle?: 'straight' | 'bezier' | 'orthogonal';
  readonly edgeLineStyle?: 'solid' | 'dashed' | 'dotted';
  readonly edgeAnimationStyle?: 'none' | 'moving-dashes' | 'pulse-arrow';
}
