import { SNAP_GRID_X, SNAP_GRID_Y } from '../../geometry/grid';
import { getRecipeNodeSize } from '../recipe/geometry';
import type { FlowEdge } from '../../edges/flow/model';
import type { FlowGroup, FlowPort, PortDirection } from '../../graph/types';
import type { GraphNode } from '../../graph/types';
import type { RecipeNode as FlowNode } from '../recipe/model';

export const GROUP_HEADER_HEIGHT = 42;
export const GROUP_PADDING_X = SNAP_GRID_X;
export const GROUP_PADDING_Y = SNAP_GRID_Y;

export interface GroupBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GroupProxyPort {
  readonly proxyPortId: string;
  readonly memberNodeId: string;
  readonly memberPortId: string;
  readonly direction: PortDirection;
  readonly port: FlowPort;
}

export interface LocalNodeBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

type NodeLookup = ReadonlyMap<string, GraphNode> | ((id: string) => GraphNode | undefined);

function resolveNode(nodes: NodeLookup, id: string) {
  return typeof nodes === 'function' ? nodes(id) : nodes.get(id);
}

export function getGroupBounds(
  group: FlowGroup,
  nodes: NodeLookup,
  positions?: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
  getLocalBounds: (node: GraphNode) => LocalNodeBounds = (node) => ({
    x: 0,
    y: 0,
    ...getRecipeNodeSize(node as FlowNode),
  }),
): GroupBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let found = false;
  for (const id of group.memberNodeIds) {
    const node = resolveNode(nodes, id);
    if (!node) continue;
    const size = getLocalBounds(node);
    const position = positions?.get(id) ?? node;
    minX = Math.min(minX, position.x + size.x);
    minY = Math.min(minY, position.y + size.y);
    maxX = Math.max(maxX, position.x + size.x + size.width);
    maxY = Math.max(maxY, position.y + size.y + size.height);
    found = true;
  }
  if (!found) return null;
  const x = Math.floor((minX - GROUP_PADDING_X) / SNAP_GRID_X) * SNAP_GRID_X;
  const headerHeight = group.collapsed ? 0 : GROUP_HEADER_HEIGHT;
  const y = Math.floor((minY - GROUP_PADDING_Y - headerHeight) / SNAP_GRID_Y) * SNAP_GRID_Y;
  const right = Math.ceil((maxX + GROUP_PADDING_X) / SNAP_GRID_X) * SNAP_GRID_X;
  const bottom = Math.ceil((maxY + GROUP_PADDING_Y) / SNAP_GRID_Y) * SNAP_GRID_Y;
  return { x, y, width: right - x, height: bottom - y };
}

export function getGroupProxyPorts(
  group: FlowGroup,
  nodes: NodeLookup,
  edges: readonly FlowEdge[],
): readonly GroupProxyPort[] {
  const members = new Set(group.memberNodeIds);
  const ports: GroupProxyPort[] = [];
  const seen = new Set<string>();

  const addPort = (memberNodeId: string, memberPortId: string, direction: PortDirection) => {
    const key = `${memberNodeId}\u0000${memberPortId}`;
    if (seen.has(key)) return;
    const node = resolveNode(nodes, memberNodeId);
    const port = node?.ports.find((item) => item.id === memberPortId);
    if (!node || !port || !members.has(memberNodeId) || port.direction !== direction) return;
    seen.add(key);
    ports.push({
      proxyPortId: `proxy:${group.id}:${memberNodeId}:${memberPortId}`,
      memberNodeId,
      memberPortId,
      direction,
      port: { ...port, id: `proxy:${group.id}:${memberNodeId}:${memberPortId}`, direction },
    });
  };

  for (const memberPortId of group.inputProxyPortIds ?? []) {
    for (const memberNodeId of group.memberNodeIds) {
      addPort(memberNodeId, memberPortId, 'input');
    }
  }
  for (const memberPortId of group.outputProxyPortIds ?? []) {
    for (const memberNodeId of group.memberNodeIds) {
      addPort(memberNodeId, memberPortId, 'output');
    }
  }

  for (const edge of edges) {
    const sourceInside = members.has(edge.sourceNodeId);
    const targetInside = members.has(edge.targetNodeId);
    if (sourceInside === targetInside) continue;
    const memberNodeId = sourceInside ? edge.sourceNodeId : edge.targetNodeId;
    const memberPortId = sourceInside ? edge.sourcePortId : edge.targetPortId;
    const direction = sourceInside ? 'output' : 'input';
    addPort(memberNodeId, memberPortId, direction);
  }
  return ports;
}

export function createCollapsedGroupNode(
  group: FlowGroup,
  bounds: GroupBounds,
  proxyPorts: readonly GroupProxyPort[],
): FlowNode {
  const ports = proxyPorts.map((item) => item.port);
  const inputOrder = proxyPorts
    .filter((item) => item.direction === 'input')
    .map((item) => item.proxyPortId);
  const outputOrder = proxyPorts
    .filter((item) => item.direction === 'output')
    .map((item) => item.proxyPortId);
  return {
    id: group.id,
    type: 'recipe',
    label: group.label,
    x: bounds.x,
    y: bounds.y,
    ports,
    inputOrder,
    outputOrder,
    data: {},
  };
}
