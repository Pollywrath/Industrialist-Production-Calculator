import { snapPosition } from '../domain/geometry/grid';
import type {
  FlowGroup,
  FlowPort,
  LegacyFlowEdge,
  LegacyFlowNode,
  LegacyGraphState,
  PortDirection,
  PortId,
  EdgeControlPoint,
  GraphEdge,
  GraphNode,
  GraphState,
} from '../domain/graph/types';
import {
  DEFAULT_FLOW_EDGE_SETTINGS,
  type EdgeAnimationStyle,
  type EdgeLineStyle,
  type EdgePathStyle,
  type FlowEdge,
  type FlowEdgeSettings,
  type FlowGraphState,
  type NewFlowEdge,
} from '../domain/edges/flow/model';
import {
  animationStyles as animationStyleValues,
  lineStyles as lineStyleValues,
  routingStyles as routingStyleValues,
  validateFlowEdgeSettings,
} from '../domain/edges/flow/definition';
import type {
  NewRecipeNode,
  RecipeNode as FlowNode,
  RecipeNodeData,
} from '../domain/nodes/recipe/model';
import { defaultGraphTypeRegistry, type GraphTypeRegistry } from '../domain/graph/type-registry';

export interface GraphChange {
  readonly addedNodeIds: readonly string[];
  readonly changedNodeIds: readonly string[];
  readonly removedNodeIds: readonly string[];
  readonly addedEdgeIds: readonly string[];
  readonly changedEdgeIds: readonly string[];
  readonly removedEdgeIds: readonly string[];
  readonly addedGroupIds: readonly string[];
  readonly changedGroupIds: readonly string[];
  readonly removedGroupIds: readonly string[];
  readonly routingStyleChanged: boolean;
  readonly edgeAppearanceChanged: boolean;
  readonly edgeDefaultsChanged: boolean;
}

type Listener = (change: GraphChange) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameShallowRecord(left: unknown, right: unknown): boolean {
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => {
      const leftValue = left[key];
      const rightValue = right[key];
      if (Object.is(leftValue, rightValue)) return true;
      if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
        return (
          leftValue.length === rightValue.length &&
          leftValue.every((item, index) => {
            const other = rightValue[index];
            return Object.is(item, other) || sameShallowRecord(item, other);
          })
        );
      }
      return false;
    })
  );
}

function sameSnapshotValue(left: unknown, right: unknown) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => {
        const other = right[index];
        return Object.is(item, other) || sameShallowRecord(item, other);
      })
    );
  }
  return sameShallowRecord(left, right);
}

function sameSnapshotRecord(left: unknown, right: unknown) {
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => sameSnapshotValue(left[key], right[key]))
  );
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function validateOrder(
  nodeId: string,
  direction: PortDirection,
  order: readonly PortId[],
  ports: readonly FlowPort[],
) {
  const expected = new Set(
    ports.filter((port) => port.direction === direction).map((port) => port.id),
  );
  if (
    order.length !== expected.size ||
    new Set(order).size !== order.length ||
    order.some((id) => !expected.has(id))
  ) {
    throw new Error(`Port order for ${nodeId} must list every ${direction} port once.`);
  }
}

function validateSettings(settings: FlowEdgeSettings) {
  validateFlowEdgeSettings(settings);
}

function normalizeNode(node: LegacyFlowNode | FlowNode): FlowNode {
  if (!isRecord(node)) throw new Error('Graph nodes must be objects.');
  if ('type' in node) {
    const modern = node as unknown as FlowNode;
    return { ...modern, data: modern.data === undefined ? {} : modern.data };
  }
  const legacy = node as unknown as LegacyFlowNode;
  const { heightOverride, machineName, machineCount, cycleTime, power, pollution, ...shared } =
    legacy;
  const data: RecipeNodeData = {
    ...(heightOverride === undefined ? {} : { heightOverride }),
    ...(machineName === undefined ? {} : { machineName }),
    ...(machineCount === undefined ? {} : { machineCount }),
    ...(cycleTime === undefined ? {} : { cycleTime }),
    ...(power === undefined ? {} : { power }),
    ...(pollution === undefined ? {} : { pollution }),
  };
  return { ...shared, type: 'recipe', data };
}

function normalizeEdge(edge: LegacyFlowEdge | GraphEdge, defaults: unknown): GraphEdge {
  if (!isRecord(edge)) throw new Error('Graph edges must be objects.');
  const rawType = (edge as { readonly type?: unknown }).type;
  if (rawType !== undefined && typeof rawType !== 'string') {
    throw new Error('Edge type must be a string.');
  }
  const type = (rawType ?? 'flow') as string;
  const rawSettings = 'settings' in edge ? edge.settings : undefined;
  if (
    rawSettings !== undefined &&
    (typeof rawSettings !== 'object' || rawSettings === null || Array.isArray(rawSettings))
  ) {
    throw new Error(`Edge "${edge.id}" settings must be an object.`);
  }
  const { pathStyle: legacyPathStyle, ...withoutLegacyPathStyle } = edge as LegacyFlowEdge &
    Partial<FlowEdge>;
  const settings =
    type === 'flow'
      ? {
          ...DEFAULT_FLOW_EDGE_SETTINGS,
          ...(isRecord(defaults) ? defaults : {}),
          ...(rawSettings ?? {}),
          ...(legacyPathStyle === undefined ? {} : { routingStyle: legacyPathStyle }),
        }
      : {
          ...(isRecord(defaults) ? defaults : {}),
          ...(rawSettings ?? {}),
        };
  return {
    ...withoutLegacyPathStyle,
    type,
    settings,
  } as GraphEdge;
}

function validateNode(node: FlowNode, typeRegistry: GraphTypeRegistry = defaultGraphTypeRegistry) {
  if (typeof node.id !== 'string' || !node.id)
    throw new Error('Node IDs must be non-empty strings.');
  if (typeof node.type !== 'string') throw new Error(`Node "${node.id}" type must be a string.`);
  if (typeof node.label !== 'string') throw new Error(`Node "${node.id}" label must be a string.`);
  if (!Array.isArray(node.ports)) throw new Error(`Node "${node.id}" ports must be an array.`);
  if (!Array.isArray(node.inputOrder) || !Array.isArray(node.outputOrder)) {
    throw new Error(`Node "${node.id}" port orders must be arrays.`);
  }
  const definition = typeRegistry.nodes[node.type];
  if (!definition) throw new Error(`Unknown node type "${node.type}".`);
  if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
    throw new Error(`Node "${node.id}" coordinates must be finite.`);
  }
  const validateRegisteredNode: (candidate: GraphNode) => void = definition.validate;
  validateRegisteredNode(node);
  const bounds = definition.getBounds(node);
  const visual = definition.describe(node);
  const localBounds = visual?.bounds;
  const boundsAreFinite = (
    value: unknown,
  ): value is {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } =>
    isRecord(value) &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    (value.width as number) > 0 &&
    (value.height as number) > 0;
  if (
    !boundsAreFinite(bounds) ||
    !boundsAreFinite(localBounds) ||
    bounds.x !== localBounds.x ||
    bounds.y !== localBounds.y ||
    bounds.width !== localBounds.width ||
    bounds.height !== localBounds.height
  ) {
    throw new Error(
      `Node "${node.id}" type "${node.type}" must provide finite, matching local geometry bounds.`,
    );
  }
  if (
    !Array.isArray(visual.hitShapes) ||
    visual.hitShapes.some((shape) => !boundsAreFinite(shape))
  ) {
    throw new Error(`Node "${node.id}" type "${node.type}" must provide finite hit shapes.`);
  }
  const portIds = new Set<string>();
  const indexes = new Set<string>();
  for (const rawPort of node.ports) {
    if (!isRecord(rawPort)) throw new Error(`Node "${node.id}" ports must contain objects.`);
    const port = rawPort as unknown as FlowPort;
    if (typeof port.id !== 'string' || !port.id || portIds.has(port.id)) {
      throw new Error(`Node "${node.id}" has a missing or duplicate port ID.`);
    }
    if (port.label !== undefined && typeof port.label !== 'string') {
      throw new Error(`Port "${port.id}" on node "${node.id}" label must be a string.`);
    }
    if (port.direction !== 'input' && port.direction !== 'output') {
      throw new Error(`Port "${port.id}" on node "${node.id}" has an invalid direction.`);
    }
    if (!Number.isInteger(port.logicalIndex) || port.logicalIndex < 0) {
      throw new Error(
        `Port "${port.id}" on node "${node.id}" must have a non-negative integer logical index.`,
      );
    }
    if (port.kind !== undefined && port.kind !== 'item' && port.kind !== 'fluid') {
      throw new Error(`Port "${port.id}" on node "${node.id}" has an invalid kind.`);
    }
    const indexKey = `${port.direction}:${port.logicalIndex}`;
    if (indexes.has(indexKey)) {
      throw new Error(`Node "${node.id}" has duplicate ${port.direction} logical port indexes.`);
    }
    portIds.add(port.id);
    indexes.add(indexKey);
  }
  validateOrder(node.id, 'input', node.inputOrder, node.ports);
  validateOrder(node.id, 'output', node.outputOrder, node.ports);
}

function validateRoutePoints(
  edgeId: string,
  key: 'controlPoints' | 'orthogonalTurns',
  points: readonly EdgeControlPoint[] | undefined,
) {
  if (points !== undefined && !Array.isArray(points)) {
    throw new Error(`Edge "${edgeId}" ${key} must be an array.`);
  }
  const ids = new Set<string>();
  for (const point of points ?? []) {
    if (
      !isRecord(point) ||
      typeof point.id !== 'string' ||
      !point.id ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y)
    ) {
      throw new Error(`Edge "${edgeId}" ${key} require stable IDs and finite coordinates.`);
    }
    if (ids.has(point.id))
      throw new Error(`Edge "${edgeId}" has duplicate ${key} ID "${point.id}".`);
    ids.add(point.id);
  }
}

function validateEdgeReferences(
  edge: FlowEdge,
  nodes: ReadonlyMap<string, FlowNode>,
  typeRegistry: GraphTypeRegistry = defaultGraphTypeRegistry,
) {
  if (typeof edge.id !== 'string' || !edge.id)
    throw new Error('Edge IDs must be non-empty strings.');
  for (const [key, value] of Object.entries({
    sourceNodeId: edge.sourceNodeId,
    sourcePortId: edge.sourcePortId,
    targetNodeId: edge.targetNodeId,
    targetPortId: edge.targetPortId,
  })) {
    if (typeof value !== 'string' || !value)
      throw new Error(`Edge "${edge.id}" ${key} must be a non-empty string.`);
  }
  const definition = typeRegistry.edges[edge.type];
  if (!definition) throw new Error(`Unknown edge type "${edge.type}".`);
  const validateRegisteredEdge: (candidate: GraphEdge) => void = definition.validate;
  validateRegisteredEdge(edge);
  const source = nodes.get(edge.sourceNodeId);
  const target = nodes.get(edge.targetNodeId);
  if (!source)
    throw new Error(`Edge "${edge.id}" source node "${edge.sourceNodeId}" does not exist.`);
  if (!target)
    throw new Error(`Edge "${edge.id}" target node "${edge.targetNodeId}" does not exist.`);
  const sourcePort = source.ports.find((port) => port.id === edge.sourcePortId);
  const targetPort = target.ports.find((port) => port.id === edge.targetPortId);
  if (!sourcePort || sourcePort.direction !== 'output') {
    throw new Error(
      `Edge "${edge.id}" source must reference an output port on node "${source.id}".`,
    );
  }
  if (!targetPort || targetPort.direction !== 'input') {
    throw new Error(
      `Edge "${edge.id}" target must reference an input port on node "${target.id}".`,
    );
  }
  if ((sourcePort.kind ?? 'item') !== (targetPort.kind ?? 'item')) {
    throw new Error(`Edge "${edge.id}" source and target port kinds must match.`);
  }
  validateRoutePoints(edge.id, 'controlPoints', edge.controlPoints);
  validateRoutePoints(edge.id, 'orthogonalTurns', edge.orthogonalTurns);
}

function requireFinitePosition(x: number, y: number, subject: string) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`${subject} coordinates must be finite.`);
  }
}

function emptyChange(change: Partial<GraphChange> = {}): GraphChange {
  return {
    addedNodeIds: change.addedNodeIds ?? [],
    changedNodeIds: change.changedNodeIds ?? [],
    removedNodeIds: change.removedNodeIds ?? [],
    addedEdgeIds: change.addedEdgeIds ?? [],
    changedEdgeIds: change.changedEdgeIds ?? [],
    removedEdgeIds: change.removedEdgeIds ?? [],
    addedGroupIds: change.addedGroupIds ?? [],
    changedGroupIds: change.changedGroupIds ?? [],
    removedGroupIds: change.removedGroupIds ?? [],
    routingStyleChanged: change.routingStyleChanged ?? false,
    edgeAppearanceChanged: change.edgeAppearanceChanged ?? false,
    edgeDefaultsChanged: change.edgeDefaultsChanged ?? false,
  };
}

export class GraphStore {
  private edgeDefaults: FlowEdgeSettings;
  private listeners = new Set<Listener>();
  private nodeById = new Map<string, FlowNode>();
  private edgeById = new Map<string, FlowEdge>();
  private edgesByNodeId = new Map<string, Set<string>>();
  private edgeIdsByConnection = new Map<string, Set<string>>();
  private groupById = new Map<string, FlowGroup>();
  private groupIdByNodeId = new Map<string, string>();
  private lastMutationDurationMs = 0;
  readonly typeRegistry: GraphTypeRegistry;

  constructor(
    initialState: GraphState<GraphNode, GraphEdge> | LegacyGraphState,
    typeRegistry: GraphTypeRegistry = defaultGraphTypeRegistry,
    previous?: GraphStore,
  ) {
    this.typeRegistry = typeRegistry;
    if (!isRecord(initialState)) throw new Error('Graph state must be an object.');
    if (!Array.isArray(initialState.nodes) || !Array.isArray(initialState.edges)) {
      throw new Error('Graph nodes and edges must be arrays.');
    }
    if (initialState.groups !== undefined && !Array.isArray(initialState.groups)) {
      throw new Error('Graph groups must be an array when provided.');
    }
    if (initialState.edgeDefaults !== undefined && !isRecord(initialState.edgeDefaults)) {
      throw new Error('Graph edge defaults must be an object when provided.');
    }
    const legacyState = initialState as LegacyGraphState;
    const modernState = initialState as FlowGraphState;
    const legacyStyle = legacyState.edges
      .map((edge) => (isRecord(edge) ? edge.pathStyle : undefined))
      .find((style): style is EdgePathStyle => style !== undefined);
    const candidateDefaults = modernState.edgeDefaults ?? {
      routingStyle:
        legacyState.routingStyle ?? legacyStyle ?? DEFAULT_FLOW_EDGE_SETTINGS.routingStyle,
      lineStyle: legacyState.edgeLineStyle ?? DEFAULT_FLOW_EDGE_SETTINGS.lineStyle,
      animationStyle: legacyState.edgeAnimationStyle ?? DEFAULT_FLOW_EDGE_SETTINGS.animationStyle,
    };
    this.edgeDefaults = { ...DEFAULT_FLOW_EDGE_SETTINGS, ...candidateDefaults };
    validateSettings(this.edgeDefaults);
    if (previous && sameSnapshotRecord(previous.edgeDefaults, this.edgeDefaults)) {
      this.edgeDefaults = previous.edgeDefaults;
    }
    const changedNodeIds = new Set<string>();
    for (const rawNode of initialState.nodes) {
      const normalizedNode = normalizeNode(rawNode);
      const previousNode = previous?.nodeById.get(normalizedNode.id);
      const node =
        previousNode && sameSnapshotRecord(previousNode, normalizedNode)
          ? previousNode
          : normalizedNode;
      if (node !== previousNode) {
        validateNode(node, this.typeRegistry);
        changedNodeIds.add(node.id);
      }
      if (this.nodeById.has(node.id)) throw new Error(`Duplicate node ID "${node.id}".`);
      this.nodeById.set(node.id, node);
      this.edgesByNodeId.set(node.id, new Set());
    }
    for (const rawEdge of initialState.edges) {
      const edgeType =
        isRecord(rawEdge) && typeof rawEdge.type === 'string' ? rawEdge.type : 'flow';
      const definition = this.typeRegistry.edges[edgeType];
      if (!definition) throw new Error(`Unknown edge type "${edgeType}".`);
      const typeDefaults = edgeType === 'flow' ? this.edgeDefaults : definition.defaults;
      const normalizedEdge = normalizeEdge(rawEdge, typeDefaults) as FlowEdge;
      const previousEdge = previous?.edgeById.get(normalizedEdge.id);
      const edge =
        previousEdge && sameSnapshotRecord(previousEdge, normalizedEdge)
          ? previousEdge
          : normalizedEdge;
      if (this.edgeById.has(edge.id)) throw new Error(`Duplicate edge ID "${edge.id}".`);
      if (this.nodeById.has(edge.id)) throw new Error(`Duplicate graph entity ID "${edge.id}".`);
      if (
        edge !== previousEdge ||
        changedNodeIds.has(edge.sourceNodeId) ||
        changedNodeIds.has(edge.targetNodeId) ||
        !this.nodeById.has(edge.sourceNodeId) ||
        !this.nodeById.has(edge.targetNodeId)
      ) {
        validateEdgeReferences(edge, this.nodeById, this.typeRegistry);
      }
      this.edgeById.set(edge.id, edge);
      this.linkEdge(edge);
    }
    for (const rawGroup of initialState.groups ?? []) {
      if (!isRecord(rawGroup)) throw new Error('Graph groups must contain objects.');
      const normalizedGroup = rawGroup as unknown as FlowGroup;
      const previousGroup = previous?.groupById.get(normalizedGroup.id);
      const group =
        previousGroup && sameSnapshotRecord(previousGroup, normalizedGroup)
          ? previousGroup
          : normalizedGroup;
      if (typeof group.id !== 'string' || !group.id)
        throw new Error('Group IDs must be non-empty strings.');
      if (typeof group.label !== 'string')
        throw new Error(`Group "${group.id}" label must be a string.`);
      if (typeof group.collapsed !== 'boolean')
        throw new Error(`Group "${group.id}" collapsed must be a boolean.`);
      if (!Array.isArray(group.memberNodeIds))
        throw new Error(`Group "${group.id}" members must be an array.`);
      if (group.memberNodeIds.some((nodeId) => typeof nodeId !== 'string' || !nodeId)) {
        throw new Error(`Group "${group.id}" member IDs must be non-empty strings.`);
      }
      for (const [field, portIds] of [
        ['inputProxyPortIds', group.inputProxyPortIds],
        ['outputProxyPortIds', group.outputProxyPortIds],
      ] as const) {
        if (portIds === undefined) continue;
        if (!Array.isArray(portIds) || portIds.some((portId) => typeof portId !== 'string')) {
          throw new Error(`Group "${group.id}" ${field} must be an array of port IDs.`);
        }
        if (new Set(portIds).size !== portIds.length) {
          throw new Error(`Group "${group.id}" ${field} must contain unique port IDs.`);
        }
      }
      if (
        this.groupById.has(group.id) ||
        this.nodeById.has(group.id) ||
        this.edgeById.has(group.id)
      ) {
        throw new Error(`Group ID "${group.id}" must be unique across groups and nodes.`);
      }
      if (new Set(group.memberNodeIds).size !== group.memberNodeIds.length) {
        throw new Error(`Group "${group.id}" must contain unique node IDs.`);
      }
      this.groupById.set(group.id, group);
      for (const nodeId of group.memberNodeIds) {
        if (!this.nodeById.has(nodeId) || this.groupIdByNodeId.has(nodeId)) {
          throw new Error(`Node "${nodeId}" is missing or already belongs to another group.`);
        }
        this.groupIdByNodeId.set(nodeId, group.id);
      }
    }
  }

  toGraphState = <
    TNode extends GraphNode = FlowNode,
    TEdge extends GraphEdge = FlowEdge,
  >(): GraphState<TNode, TEdge, FlowEdgeSettings> => ({
    nodes: [...this.nodeById.values()] as unknown as TNode[],
    edges: [...this.edgeById.values()] as unknown as TEdge[],
    groups: [...this.groupById.values()],
    edgeDefaults: { ...this.edgeDefaults },
  });

  replaceGraph(state: GraphState<GraphNode, GraphEdge> | LegacyGraphState) {
    const next = new GraphStore(state, this.typeRegistry, this);
    const previousNodes = this.nodeById;
    const previousEdges = this.edgeById;
    const previousGroups = this.groupById;
    const previousDefaults = this.edgeDefaults;
    const addedNodeIds = [...next.nodeById.keys()].filter((id) => !previousNodes.has(id));
    const changedNodeIds = [...next.nodeById].flatMap(([id, node]) =>
      previousNodes.has(id) && previousNodes.get(id) !== node ? [id] : [],
    );
    const removedNodeIds = [...previousNodes.keys()].filter((id) => !next.nodeById.has(id));
    const addedEdgeIds = [...next.edgeById.keys()].filter((id) => !previousEdges.has(id));
    const changedEdgeIds = [...next.edgeById].flatMap(([id, edge]) =>
      previousEdges.has(id) && previousEdges.get(id) !== edge ? [id] : [],
    );
    const removedEdgeIds = [...previousEdges.keys()].filter((id) => !next.edgeById.has(id));
    const addedGroupIds = [...next.groupById.keys()].filter((id) => !previousGroups.has(id));
    const changedGroupIds = [...next.groupById].flatMap(([id, group]) =>
      previousGroups.has(id) && previousGroups.get(id) !== group ? [id] : [],
    );
    const removedGroupIds = [...previousGroups.keys()].filter((id) => !next.groupById.has(id));
    const routingStyleChanged = previousDefaults.routingStyle !== next.edgeDefaults.routingStyle;
    const edgeAppearanceChanged =
      previousDefaults.lineStyle !== next.edgeDefaults.lineStyle ||
      previousDefaults.animationStyle !== next.edgeDefaults.animationStyle;
    const edgeDefaultsChanged = !sameSnapshotRecord(previousDefaults, next.edgeDefaults);
    this.nodeById = next.nodeById;
    this.edgeById = next.edgeById;
    this.edgesByNodeId = next.edgesByNodeId;
    this.edgeIdsByConnection = next.edgeIdsByConnection;
    this.groupById = next.groupById;
    this.groupIdByNodeId = next.groupIdByNodeId;
    this.edgeDefaults = next.edgeDefaults;
    if (
      addedNodeIds.length === 0 &&
      changedNodeIds.length === 0 &&
      removedNodeIds.length === 0 &&
      addedEdgeIds.length === 0 &&
      changedEdgeIds.length === 0 &&
      removedEdgeIds.length === 0 &&
      addedGroupIds.length === 0 &&
      changedGroupIds.length === 0 &&
      removedGroupIds.length === 0 &&
      !edgeDefaultsChanged
    ) {
      return;
    }
    this.notify({
      addedNodeIds,
      changedNodeIds,
      removedNodeIds,
      addedEdgeIds,
      changedEdgeIds,
      removedEdgeIds,
      addedGroupIds,
      changedGroupIds,
      removedGroupIds,
      routingStyleChanged,
      edgeAppearanceChanged,
      edgeDefaultsChanged,
    });
  }

  getNodes = <TNode extends GraphNode = FlowNode>() =>
    this.nodeById.values() as IterableIterator<TNode>;

  getEdges = <TEdge extends GraphEdge = FlowEdge>() =>
    this.edgeById.values() as IterableIterator<TEdge>;

  getGroups = () => this.groupById.values();

  getNodeCount = () => this.nodeById.size;

  getEdgeCount = () => this.edgeById.size;

  getGroupCount = () => this.groupById.size;

  getPerformanceDiagnostics = () => ({ lastMutationDurationMs: this.lastMutationDurationMs });

  resetPerformanceDiagnostics = () => {
    this.lastMutationDurationMs = 0;
  };

  getRoutingStyle = () => this.edgeDefaults.routingStyle;

  getEdgeLineStyle = () => this.edgeDefaults.lineStyle;

  getEdgeAnimationStyle = () => this.edgeDefaults.animationStyle;

  getEdgeDefaults = () => this.edgeDefaults;

  getNode = <TNode extends GraphNode = FlowNode>(id: string) =>
    this.nodeById.get(id) as TNode | undefined;

  getEdge = <TEdge extends GraphEdge = FlowEdge>(id: string) =>
    this.edgeById.get(id) as TEdge | undefined;

  getGroup = (id: string) => this.groupById.get(id);

  getGroupForNode = (nodeId: string) => {
    const groupId = this.groupIdByNodeId.get(nodeId);
    return groupId ? this.groupById.get(groupId) : undefined;
  };

  getGroupIdForNode = (nodeId: string) => this.groupIdByNodeId.get(nodeId);

  getIncidentEdges = (nodeId: string): readonly FlowEdge[] => {
    const edgeIds = this.edgesByNodeId.get(nodeId);
    if (!edgeIds) return [];
    return [...edgeIds]
      .map((id) => this.edgeById.get(id))
      .filter((edge): edge is FlowEdge => !!edge);
  };

  createEdgePoint(x: number, y: number): EdgeControlPoint {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error('Edge point coordinates must be finite.');
    }
    return { id: createId('edge-point'), x, y };
  }

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  addNode(input: NewRecipeNode) {
    const id = input.id ?? createId('node');
    if (this.nodeById.has(id) || this.groupById.has(id) || this.edgeById.has(id)) {
      throw new Error(`Node "${id}" already exists.`);
    }
    requireFinitePosition(input.x, input.y, `Node "${id}"`);
    if (
      input.data?.heightOverride !== undefined &&
      (!Number.isFinite(input.data.heightOverride) || input.data.heightOverride <= 0)
    ) {
      throw new Error(`Node "${id}" height override must be finite and positive.`);
    }
    const ports: FlowPort[] = input.ports
      ? input.ports.map((port) => ({ ...port, id: port.id ?? createId('port') }))
      : [
          { id: createId('port'), direction: 'input', logicalIndex: 0, label: 'Input 1' },
          { id: createId('port'), direction: 'output', logicalIndex: 0, label: 'Output 1' },
        ];
    const inputOrder =
      input.inputOrder ?? ports.filter((port) => port.direction === 'input').map((port) => port.id);
    const outputOrder =
      input.outputOrder ??
      ports.filter((port) => port.direction === 'output').map((port) => port.id);

    validateOrder(id, 'input', inputOrder, ports);
    validateOrder(id, 'output', outputOrder, ports);

    const position = snapPosition({ x: input.x, y: input.y });
    const node: FlowNode = {
      id,
      type: 'recipe',
      label: input.label ?? 'New node',
      x: position.x,
      y: position.y,
      ports,
      inputOrder: [...inputOrder],
      outputOrder: [...outputOrder],
      data: { ...(input.data ?? {}) },
    };
    validateNode(node);
    this.nodeById.set(id, node);
    this.edgesByNodeId.set(id, new Set());
    this.notify({ addedNodeIds: [id] });
    return node.id;
  }

  addGraphNode<TNode extends GraphNode>(input: TNode): string {
    if (!input || typeof input !== 'object') throw new Error('Node must be an object.');
    if (
      this.nodeById.has(input.id) ||
      this.groupById.has(input.id) ||
      this.edgeById.has(input.id)
    ) {
      throw new Error(`Node "${input.id}" already exists.`);
    }
    requireFinitePosition(input.x, input.y, `Node "${input.id}"`);
    const node = input as unknown as FlowNode;
    validateNode(node, this.typeRegistry);
    this.nodeById.set(node.id, node);
    this.edgesByNodeId.set(node.id, new Set());
    this.notify({ addedNodeIds: [node.id] });
    return node.id;
  }

  updateGraphNode<TNode extends GraphNode = GraphNode>(id: string, update: (node: TNode) => TNode) {
    const current = this.nodeById.get(id);
    if (!current) return false;
    const next = update(current as unknown as TNode);
    if (!next || next.id !== id) throw new Error('A node update must preserve the node ID.');
    validateNode(next as unknown as FlowNode, this.typeRegistry);
    const candidateNodes = new Map(this.nodeById);
    candidateNodes.set(id, next as unknown as FlowNode);
    for (const edge of this.getIncidentEdges(id))
      validateEdgeReferences(edge, candidateNodes, this.typeRegistry);
    this.replaceNode(next as unknown as FlowNode);
    return true;
  }

  moveNode(id: string, x: number, y: number) {
    requireFinitePosition(x, y, `Node "${id}"`);
    const node = this.nodeById.get(id);
    if (!node) return;

    const position = snapPosition({ x, y });
    if (node.x === position.x && node.y === position.y) return;
    this.replaceNode({ ...node, x: position.x, y: position.y });
  }

  moveNodes(positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>) {
    const mutationStartedAt = performance.now();
    const nextNodes = new Map<string, FlowNode>();
    const movementByNodeId = new Map<string, { readonly x: number; readonly y: number }>();
    for (const [id, target] of positions) {
      requireFinitePosition(target.x, target.y, `Node "${id}"`);
      const node = this.nodeById.get(id);
      if (!node) continue;
      const position = snapPosition(target);
      if (node.x !== position.x || node.y !== position.y) {
        nextNodes.set(id, { ...node, x: position.x, y: position.y });
        movementByNodeId.set(id, { x: position.x - node.x, y: position.y - node.y });
      }
    }
    if (nextNodes.size === 0) return;

    const nextEdges = new Map<string, FlowEdge>();
    const candidateEdges = new Map<string, FlowEdge>();
    for (const nodeId of nextNodes.keys()) {
      for (const edge of this.getIncidentEdges(nodeId)) candidateEdges.set(edge.id, edge);
    }
    for (const edge of candidateEdges.values()) {
      const sourceMovement = movementByNodeId.get(edge.sourceNodeId);
      const targetMovement = movementByNodeId.get(edge.targetNodeId);
      if (
        !sourceMovement ||
        !targetMovement ||
        sourceMovement.x !== targetMovement.x ||
        sourceMovement.y !== targetMovement.y
      )
        continue;

      const { x: dx, y: dy } = sourceMovement;
      const controlPoints = edge.controlPoints?.map((point) => ({
        ...point,
        x: point.x + dx,
        y: point.y + dy,
      }));
      const orthogonalTurns = edge.orthogonalTurns?.map((point) => ({
        ...point,
        x: point.x + dx,
        y: point.y + dy,
      }));
      if (!(controlPoints?.length || orthogonalTurns?.length)) continue;
      nextEdges.set(edge.id, {
        ...edge,
        ...(controlPoints ? { controlPoints } : {}),
        ...(orthogonalTurns ? { orthogonalTurns } : {}),
      });
    }

    const changedNodeIds = [...nextNodes.keys()];
    const changedEdgeIds = [...nextEdges.keys()];
    for (const [id, node] of nextNodes) this.nodeById.set(id, node);
    for (const [id, edge] of nextEdges) this.edgeById.set(id, edge);
    this.lastMutationDurationMs = performance.now() - mutationStartedAt;
    this.notify({ changedNodeIds, changedEdgeIds });
  }

  createGroup(nodeIds: readonly string[]) {
    const memberNodeIds = [...new Set(nodeIds)].filter(
      (id) => this.nodeById.has(id) && !this.groupIdByNodeId.has(id),
    );
    if (memberNodeIds.length < 2) return null;
    let labelIndex = 1;
    const usedLabels = new Set([...this.groupById.values()].map((group) => group.label));
    while (usedLabels.has(`Group ${labelIndex}`)) labelIndex++;
    let id = createId('group');
    while (this.groupById.has(id) || this.nodeById.has(id) || this.edgeById.has(id))
      id = createId('group');
    const group: FlowGroup = {
      id,
      label: `Group ${labelIndex}`,
      memberNodeIds,
      collapsed: false,
    };
    this.groupById.set(id, group);
    for (const nodeId of memberNodeIds) this.groupIdByNodeId.set(nodeId, id);
    this.notify({ addedGroupIds: [id] });
    return id;
  }

  setGroupCollapsed(id: string, collapsed: boolean) {
    const group = this.groupById.get(id);
    if (!group || group.collapsed === collapsed) return;
    const nextGroup = { ...group, collapsed };
    this.groupById.set(id, nextGroup);
    this.notify({ changedGroupIds: [id] });
  }

  removeGroup(id: string) {
    const group = this.groupById.get(id);
    if (!group) return;
    if (!group.collapsed) {
      this.removeGroupRecord(id);
      return;
    }
    const members = new Set(group.memberNodeIds);
    const removedEdgeIds = new Set<string>();
    for (const nodeId of members) {
      for (const edge of this.getIncidentEdges(nodeId)) removedEdgeIds.add(edge.id);
    }
    const removedNodeIds = [...members].filter((nodeId) => this.nodeById.has(nodeId));
    for (const edgeId of removedEdgeIds) {
      const edge = this.edgeById.get(edgeId);
      if (edge) this.unlinkEdge(edge);
    }
    for (const nodeId of removedNodeIds) {
      this.nodeById.delete(nodeId);
      this.edgesByNodeId.delete(nodeId);
      this.groupIdByNodeId.delete(nodeId);
    }
    this.removeGroupRecordFromMaps(id);
    this.notify({
      removedNodeIds,
      removedEdgeIds: [...removedEdgeIds],
      removedGroupIds: [id],
    });
  }

  connectPorts(
    first: { readonly nodeId: string; readonly portId: string },
    second: { readonly nodeId: string; readonly portId: string },
  ): {
    readonly status: 'created' | 'existing' | 'invalid';
    readonly edgeId?: string;
    readonly reason?: string;
  } {
    const firstNode = this.nodeById.get(first.nodeId);
    const secondNode = this.nodeById.get(second.nodeId);
    const firstPort = firstNode?.ports.find((port) => port.id === first.portId);
    const secondPort = secondNode?.ports.find((port) => port.id === second.portId);
    if (!firstNode || !secondNode || !firstPort || !secondPort) {
      return { status: 'invalid', reason: 'A connection endpoint no longer exists.' };
    }
    if (firstPort.direction === secondPort.direction) {
      return { status: 'invalid', reason: 'Connect an input port to an output port.' };
    }
    if ((firstPort.kind ?? 'item') !== (secondPort.kind ?? 'item')) {
      return { status: 'invalid', reason: 'Port kinds must match.' };
    }
    const source = firstPort.direction === 'output' ? first : second;
    const target = firstPort.direction === 'input' ? first : second;
    const before = this.edgeIdsByConnection
      .get(
        this.getConnectionKey({
          sourceNodeId: source.nodeId,
          sourcePortId: source.portId,
          targetNodeId: target.nodeId,
          targetPortId: target.portId,
        }),
      )
      ?.values()
      .next().value as string | undefined;
    const edgeId = this.addEdge({
      sourceNodeId: source.nodeId,
      sourcePortId: source.portId,
      targetNodeId: target.nodeId,
      targetPortId: target.portId,
    });
    return before === undefined ? { status: 'created', edgeId } : { status: 'existing', edgeId };
  }

  setNodeLabel(id: string, label: string) {
    const node = this.nodeById.get(id);
    if (!node || node.label === label) return;
    this.replaceNode({ ...node, label });
  }

  setPortOrder(id: string, direction: PortDirection, order: readonly PortId[]) {
    const node = this.nodeById.get(id);
    if (!node) return;
    validateOrder(id, direction, order, node.ports);
    const key = direction === 'input' ? 'inputOrder' : 'outputOrder';
    const current = node[key];
    if (
      current.length === order.length &&
      current.every((portId, index) => portId === order[index])
    ) {
      return;
    }
    this.replaceNode({ ...node, [key]: [...order] });
  }

  addEdge(input: NewFlowEdge) {
    const source = this.nodeById.get(input.sourceNodeId);
    const target = this.nodeById.get(input.targetNodeId);
    if (!source)
      throw new Error(`Cannot add edge: source node "${input.sourceNodeId}" does not exist.`);
    if (!target)
      throw new Error(`Cannot add edge: target node "${input.targetNodeId}" does not exist.`);
    if (
      !source.ports.some((port) => port.id === input.sourcePortId && port.direction === 'output')
    ) {
      throw new Error(
        `Cannot add edge: output port "${input.sourcePortId}" does not exist on the source node.`,
      );
    }
    if (
      !target.ports.some((port) => port.id === input.targetPortId && port.direction === 'input')
    ) {
      throw new Error(
        `Cannot add edge: input port "${input.targetPortId}" does not exist on the target node.`,
      );
    }
    const sourcePort = source.ports.find((port) => port.id === input.sourcePortId)!;
    const targetPort = target.ports.find((port) => port.id === input.targetPortId)!;
    if ((sourcePort.kind ?? 'item') !== (targetPort.kind ?? 'item')) {
      throw new Error('Cannot add edge: source and target port kinds must match.');
    }

    const id = input.id ?? createId('edge');
    if (this.edgeById.has(id) || this.nodeById.has(id) || this.groupById.has(id)) {
      throw new Error(`Edge "${id}" already exists.`);
    }
    validateRoutePoints(id, 'controlPoints', input.controlPoints);
    validateRoutePoints(id, 'orthogonalTurns', input.orthogonalTurns);

    const connectionKey = this.getConnectionKey(input);
    const existingConnection = this.edgeIdsByConnection.get(connectionKey)?.values().next().value;
    if (existingConnection !== undefined) return existingConnection;

    const edge: FlowEdge = {
      id,
      type: 'flow',
      sourceNodeId: input.sourceNodeId,
      sourcePortId: input.sourcePortId,
      targetNodeId: input.targetNodeId,
      targetPortId: input.targetPortId,
      settings: { ...this.edgeDefaults, ...(input.settings ?? {}) },
      ...(input.controlPoints === undefined
        ? {}
        : {
            controlPoints: input.controlPoints.map((point) => ({
              ...point,
              ...snapPosition(point),
            })),
          }),
      ...(input.orthogonalTurns === undefined
        ? {}
        : { orthogonalTurns: [...input.orthogonalTurns] }),
    };
    this.linkEdge(edge);
    this.notify({ addedEdgeIds: [edge.id] });
    return edge.id;
  }

  addGraphEdge<TEdge extends GraphEdge>(
    input: Omit<TEdge, 'id' | 'settings'> & {
      readonly id?: string;
      readonly settings?: TEdge['settings'];
    },
  ): string {
    if (!input || typeof input !== 'object') throw new Error('Edge must be an object.');
    const definition = this.typeRegistry.edges[input.type];
    if (!definition) throw new Error(`Unknown edge type "${input.type}".`);
    const id = input.id || createId('edge');
    if (this.edgeById.has(id) || this.nodeById.has(id) || this.groupById.has(id)) {
      throw new Error(`Edge "${id}" already exists.`);
    }
    const source = this.nodeById.get(input.sourceNodeId);
    const target = this.nodeById.get(input.targetNodeId);
    if (!source || !target)
      throw new Error(`Cannot add edge "${id}": both endpoint nodes must exist.`);
    const sourcePort = source.ports.find(
      (port) => port.id === input.sourcePortId && port.direction === 'output',
    );
    const targetPort = target.ports.find(
      (port) => port.id === input.targetPortId && port.direction === 'input',
    );
    if (!sourcePort || !targetPort)
      throw new Error(
        `Cannot add edge "${id}": endpoint ports are missing or have the wrong direction.`,
      );
    if ((sourcePort.kind ?? 'item') !== (targetPort.kind ?? 'item'))
      throw new Error(`Cannot add edge "${id}": endpoint port kinds must match.`);
    const defaults = input.type === 'flow' ? this.edgeDefaults : definition.defaults;
    const settings =
      isRecord(defaults) && isRecord(input.settings)
        ? { ...defaults, ...input.settings }
        : (input.settings ?? defaults ?? {});
    const edge = { ...input, id, settings } as unknown as FlowEdge;
    validateEdgeReferences(edge, this.nodeById, this.typeRegistry);
    const existing = this.edgeIdsByConnection.get(this.getConnectionKey(edge))?.values().next()
      .value as string | undefined;
    if (existing !== undefined) return existing;
    this.linkEdge(edge);
    this.notify({ addedEdgeIds: [id] });
    return id;
  }

  updateGraphEdge<TEdge extends GraphEdge = GraphEdge>(id: string, update: (edge: TEdge) => TEdge) {
    const current = this.edgeById.get(id);
    if (!current) return false;
    const next = update(current as unknown as TEdge);
    if (!next || next.id !== id) throw new Error('An edge update must preserve the edge ID.');
    validateEdgeReferences(next as unknown as FlowEdge, this.nodeById, this.typeRegistry);
    const duplicate = this.edgeIdsByConnection.get(
      this.getConnectionKey(next as unknown as FlowEdge),
    );
    if ([...(duplicate ?? [])].some((candidateId) => candidateId !== id)) {
      throw new Error('That connection already exists.');
    }
    this.replaceEdge(next as unknown as FlowEdge);
    return true;
  }

  reconnectEdgeEndpoint(
    edgeId: string,
    side: 'source' | 'target',
    endpoint: { readonly nodeId: string; readonly portId: string },
  ): { readonly status: 'reconnected' | 'unchanged' | 'invalid'; readonly reason?: string } {
    const edge = this.edgeById.get(edgeId);
    const node = this.nodeById.get(endpoint.nodeId);
    const port = node?.ports.find((item) => item.id === endpoint.portId);
    if (!edge || !node || !port)
      return { status: 'invalid', reason: 'A connection endpoint no longer exists.' };
    const expectedDirection = side === 'source' ? 'output' : 'input';
    if (port.direction !== expectedDirection) {
      return {
        status: 'invalid',
        reason: `The ${side} endpoint must use an ${expectedDirection} port.`,
      };
    }
    const oppositeNodeId = side === 'source' ? edge.targetNodeId : edge.sourceNodeId;
    const oppositePortId = side === 'source' ? edge.targetPortId : edge.sourcePortId;
    const oppositePort = this.nodeById
      .get(oppositeNodeId)
      ?.ports.find((item) => item.id === oppositePortId);
    if (!oppositePort || (oppositePort.kind ?? 'item') !== (port.kind ?? 'item')) {
      return { status: 'invalid', reason: 'Port kinds must match.' };
    }
    const nodeKey = side === 'source' ? 'sourceNodeId' : 'targetNodeId';
    const portKey = side === 'source' ? 'sourcePortId' : 'targetPortId';
    if (edge[nodeKey] === endpoint.nodeId && edge[portKey] === endpoint.portId)
      return { status: 'unchanged' };
    const candidate = { ...edge, [nodeKey]: endpoint.nodeId, [portKey]: endpoint.portId };
    const duplicateIds = this.edgeIdsByConnection.get(this.getConnectionKey(candidate));
    if ([...(duplicateIds ?? [])].some((id) => id !== edgeId)) {
      return { status: 'invalid', reason: 'That connection already exists.' };
    }
    this.unlinkEdge(edge);
    this.linkEdge(candidate);
    this.notify({ changedEdgeIds: [edgeId] });
    return { status: 'reconnected' };
  }

  setRoutingStyle(pathStyle: EdgePathStyle) {
    if (!routingStyleValues.includes(pathStyle))
      throw new Error(`Unknown routing style "${pathStyle}".`);
    if (this.edgeDefaults.routingStyle === pathStyle) return;
    this.edgeDefaults = { ...this.edgeDefaults, routingStyle: pathStyle };
    this.notify({ routingStyleChanged: true, edgeDefaultsChanged: true });
  }

  setEdgeLineStyle(style: EdgeLineStyle) {
    if (!lineStyleValues.includes(style)) throw new Error(`Unknown edge line style "${style}".`);
    if (this.edgeDefaults.lineStyle === style) return;
    this.edgeDefaults = { ...this.edgeDefaults, lineStyle: style };
    this.notify({ edgeAppearanceChanged: true, edgeDefaultsChanged: true });
  }

  setEdgeAnimationStyle(style: EdgeAnimationStyle) {
    if (!animationStyleValues.includes(style))
      throw new Error(`Unknown edge animation style "${style}".`);
    if (this.edgeDefaults.animationStyle === style) return;
    this.edgeDefaults = { ...this.edgeDefaults, animationStyle: style };
    this.notify({ edgeAppearanceChanged: true, edgeDefaultsChanged: true });
  }

  setEdgeSettings(id: string, settings: Partial<FlowEdgeSettings>) {
    const edge = this.edgeById.get(id);
    if (!edge) return;
    const next = { ...edge.settings, ...settings };
    validateSettings(next);
    if (
      next.routingStyle === edge.settings.routingStyle &&
      next.lineStyle === edge.settings.lineStyle &&
      next.animationStyle === edge.settings.animationStyle
    )
      return;
    this.replaceEdge({ ...edge, settings: next });
  }

  setAllEdgeSettings(settings: Partial<FlowEdgeSettings>) {
    const changed: string[] = [];
    for (const [id, edge] of this.edgeById) {
      const next = { ...edge.settings, ...settings };
      validateSettings(next);
      if (
        next.routingStyle === edge.settings.routingStyle &&
        next.lineStyle === edge.settings.lineStyle &&
        next.animationStyle === edge.settings.animationStyle
      )
        continue;
      this.edgeById.set(id, { ...edge, settings: next });
      changed.push(id);
    }
    if (changed.length > 0)
      this.notify({
        changedEdgeIds: changed,
        routingStyleChanged: true,
        edgeAppearanceChanged: true,
      });
  }

  setEdgeRoutePoints(
    id: string,
    key: 'controlPoints' | 'orthogonalTurns',
    points: readonly EdgeControlPoint[],
  ) {
    const edge = this.edgeById.get(id);
    if (!edge) return;
    const storedPoints =
      key === 'controlPoints'
        ? points.map((point) => ({ ...point, ...snapPosition(point) }))
        : [...points];
    const pointIds = new Set<string>();
    for (const point of storedPoints) {
      if (!point.id || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new Error('Edge route points require stable IDs and finite coordinates.');
      }
      if (pointIds.has(point.id)) throw new Error(`Duplicate edge point ID "${point.id}".`);
      pointIds.add(point.id);
    }
    const current = edge[key] ?? [];
    if (
      current.length === storedPoints.length &&
      current.every((point, index) => {
        const next = storedPoints[index];
        return point.id === next.id && point.x === next.x && point.y === next.y;
      })
    )
      return;

    let updatedEdge: FlowEdge;
    if (storedPoints.length > 0) {
      updatedEdge = { ...edge, [key]: storedPoints };
    } else {
      updatedEdge = Object.fromEntries(
        Object.entries(edge).filter(([property]) => property !== key),
      ) as unknown as FlowEdge;
    }
    this.replaceEdge(updatedEdge);
  }

  removeNode(id: string) {
    const node = this.nodeById.get(id);
    if (!node) return;
    const incidentEdges = this.getIncidentEdges(id);
    const removedEdgeIds = incidentEdges.map((edge) => edge.id);
    const group = this.getGroupForNode(id);
    for (const edge of incidentEdges) this.unlinkEdge(edge);
    this.nodeById.delete(id);
    this.edgesByNodeId.delete(id);
    this.groupIdByNodeId.delete(id);

    const changedGroupIds: string[] = [];
    const removedGroupIds: string[] = [];
    if (group) {
      const memberNodeIds = group.memberNodeIds.filter((nodeId) => nodeId !== id);
      if (memberNodeIds.length === 0) {
        this.removeGroupRecordFromMaps(group.id);
        removedGroupIds.push(group.id);
      } else {
        this.groupById.set(group.id, { ...group, memberNodeIds });
        changedGroupIds.push(group.id);
      }
    }
    this.notify({ removedNodeIds: [id], removedEdgeIds, changedGroupIds, removedGroupIds });
  }

  removeEdge(id: string) {
    const edge = this.edgeById.get(id);
    if (!edge) return;
    this.unlinkEdge(edge);
    this.notify({ removedEdgeIds: [id] });
  }

  private replaceNode(node: FlowNode) {
    this.nodeById.set(node.id, node);
    this.notify({ changedNodeIds: [node.id] });
  }

  private replaceEdge(edge: FlowEdge) {
    const previous = this.edgeById.get(edge.id);
    if (previous && this.getConnectionKey(previous) !== this.getConnectionKey(edge)) {
      this.unlinkEdge(previous);
      this.linkEdge(edge);
    } else {
      this.edgeById.set(edge.id, edge);
    }
    this.notify({ changedEdgeIds: [edge.id] });
  }

  private linkEdge(edge: FlowEdge) {
    this.edgeById.set(edge.id, edge);
    this.edgesByNodeId.get(edge.sourceNodeId)?.add(edge.id);
    this.edgesByNodeId.get(edge.targetNodeId)?.add(edge.id);
    const connectionKey = this.getConnectionKey(edge);
    let edgeIds = this.edgeIdsByConnection.get(connectionKey);
    if (!edgeIds) this.edgeIdsByConnection.set(connectionKey, (edgeIds = new Set()));
    edgeIds.add(edge.id);
  }

  private removeGroupRecord(id: string) {
    if (!this.groupById.has(id)) return;
    this.removeGroupRecordFromMaps(id);
    this.notify({ removedGroupIds: [id] });
  }

  private removeGroupRecordFromMaps(id: string) {
    const group = this.groupById.get(id);
    if (!group) return;
    this.groupById.delete(id);
    for (const nodeId of group.memberNodeIds) {
      if (this.groupIdByNodeId.get(nodeId) === id) this.groupIdByNodeId.delete(nodeId);
    }
  }

  private unlinkEdge(edge: FlowEdge) {
    this.edgeById.delete(edge.id);
    this.edgesByNodeId.get(edge.sourceNodeId)?.delete(edge.id);
    this.edgesByNodeId.get(edge.targetNodeId)?.delete(edge.id);
    const connectionKey = this.getConnectionKey(edge);
    const edgeIds = this.edgeIdsByConnection.get(connectionKey);
    edgeIds?.delete(edge.id);
    if (edgeIds?.size === 0) this.edgeIdsByConnection.delete(connectionKey);
  }

  private getConnectionKey(
    edge: Pick<FlowEdge, 'sourceNodeId' | 'sourcePortId' | 'targetNodeId' | 'targetPortId'>,
  ) {
    return JSON.stringify([
      edge.sourceNodeId,
      edge.sourcePortId,
      edge.targetNodeId,
      edge.targetPortId,
    ]);
  }

  private notify(rawChange: Partial<GraphChange>) {
    this.emit(emptyChange(rawChange));
  }

  private emit(change: GraphChange) {
    for (const listener of this.listeners) listener(change);
  }
}

const initialGraph: FlowGraphState = {
  nodes: [
    {
      id: 'start',
      type: 'recipe',
      label: 'Start',
      x: -120,
      y: -368,
      ports: [{ id: 'start-output', direction: 'output', logicalIndex: 0, label: 'Output 1' }],
      inputOrder: [],
      outputOrder: ['start-output'],
      data: {},
    },
    {
      id: 'process',
      type: 'recipe',
      label: 'Process',
      x: -120,
      y: -104,
      ports: [
        { id: 'process-input', direction: 'input', logicalIndex: 0, label: 'Input 1' },
        { id: 'process-output', direction: 'output', logicalIndex: 0, label: 'Output 1' },
      ],
      inputOrder: ['process-input'],
      outputOrder: ['process-output'],
      data: {},
    },
    {
      id: 'finish',
      type: 'recipe',
      label: 'Finish',
      x: -120,
      y: 160,
      ports: [{ id: 'finish-input', direction: 'input', logicalIndex: 0, label: 'Input 1' }],
      inputOrder: ['finish-input'],
      outputOrder: [],
      data: {},
    },
  ],
  edges: [
    {
      id: 'start-process',
      type: 'flow',
      sourceNodeId: 'start',
      sourcePortId: 'start-output',
      targetNodeId: 'process',
      targetPortId: 'process-input',
      settings: { ...DEFAULT_FLOW_EDGE_SETTINGS },
    },
    {
      id: 'process-finish',
      type: 'flow',
      sourceNodeId: 'process',
      sourcePortId: 'process-output',
      targetNodeId: 'finish',
      targetPortId: 'finish-input',
      settings: { ...DEFAULT_FLOW_EDGE_SETTINGS },
    },
  ],
};

export const graphStore = new GraphStore(initialGraph);
