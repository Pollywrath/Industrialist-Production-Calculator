import type { FlowPort, PortId } from '../../graph/types';
import type { RecipeNode as FlowNode } from './model';

export const NODE_WIDTH = 380;
export const NODE_BORDER_WIDTH = 2;
export const NODE_INNER_WIDTH = NODE_WIDTH - NODE_BORDER_WIDTH * 2;
export const NODE_HANDLE_SIZE = 12;
export const NODE_INFO_SIDE_PADDING = 20;
export const NODE_HEADER_DIVIDER_INSET = NODE_BORDER_WIDTH + NODE_INFO_SIDE_PADDING;

export const BASE_INFO_HEIGHT = 117;
export const RECT_HEIGHT = 44;
export const RECT_GAP = 8;
export const IO_COLUMN_PADDING = 34;
export const BOTTOM_PADDING = 13;

export const SIDE_PADDING = 10;
export const COLUMN_GAP = 20;

export const IO_COLUMN_TOP_PAD = 17;
export const PORT_ROW_HEIGHT = RECT_HEIGHT;
export const PORT_ROW_GAP = RECT_GAP;
export const PORT_ROW_STEP = PORT_ROW_HEIGHT + PORT_ROW_GAP;
export const PORT_HANDLE_SIZE = NODE_HANDLE_SIZE;
export const PORT_ROW_BORDER_WIDTH = 2;
export const PORT_ROW_RADIUS = 6;

export interface NodeSize {
  readonly width: number;
  readonly height: number;
}

export interface PortPosition {
  readonly x: number;
  readonly y: number;
  readonly direction: FlowPort['direction'];
  readonly displayIndex: number;
}

export interface PortColumnLayout {
  readonly x: number;
  readonly width: number;
}

export interface PortRowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface NodePortLayout {
  readonly count: Readonly<Record<FlowPort['direction'], number>>;
  readonly portById: ReadonlyMap<PortId, FlowPort>;
  readonly positionById: ReadonlyMap<PortId, PortPosition>;
  readonly columnByDirection: Readonly<Record<FlowPort['direction'], PortColumnLayout>>;
  readonly orderedByDirection: Readonly<Record<FlowPort['direction'], readonly FlowPort[]>>;
}

const portLayouts = new WeakMap<FlowNode, NodePortLayout>();

function getPortLayout(node: FlowNode): NodePortLayout {
  const cached = portLayouts.get(node);
  if (cached) return cached;

  const portById = new Map(node.ports.map((port) => [port.id, port]));
  const inputCount = node.ports.reduce(
    (count, port) => count + Number(port.direction === 'input'),
    0,
  );
  const outputCount = node.ports.length - inputCount;
  const count = { input: inputCount, output: outputCount };
  const x = NODE_BORDER_WIDTH + SIDE_PADDING;
  const availableWidth = NODE_INNER_WIDTH - SIDE_PADDING * 2;
  const columnByDirection: Record<FlowPort['direction'], PortColumnLayout> =
    inputCount === 0 || outputCount === 0
      ? { input: { x, width: availableWidth }, output: { x, width: availableWidth } }
      : {
          input: { x, width: (availableWidth - COLUMN_GAP) / 2 },
          output: {
            x: x + (availableWidth - COLUMN_GAP) / 2 + COLUMN_GAP,
            width: (availableWidth - COLUMN_GAP) / 2,
          },
        };
  const maxCount = Math.max(inputCount, outputCount);
  const positionById = new Map<PortId, PortPosition>();
  const orderedByDirection = { input: [] as FlowPort[], output: [] as FlowPort[] };
  for (const direction of ['input', 'output'] as const) {
    const order = direction === 'input' ? node.inputOrder : node.outputOrder;
    const sideCount = count[direction];
    const verticalOffset = ((maxCount - sideCount) * PORT_ROW_STEP) / 2;
    for (let displayIndex = 0; displayIndex < order.length; displayIndex++) {
      const portId = order[displayIndex];
      const port = portById.get(portId);
      if (!port || port.direction !== direction) continue;
      orderedByDirection[direction].push(port);
      positionById.set(portId, {
        x: direction === 'input' ? 0 : NODE_WIDTH,
        y:
          BASE_INFO_HEIGHT +
          IO_COLUMN_TOP_PAD +
          verticalOffset +
          displayIndex * PORT_ROW_STEP +
          PORT_ROW_HEIGHT / 2,
        direction,
        displayIndex,
      });
    }
  }
  const layout: NodePortLayout = {
    count,
    portById,
    positionById,
    columnByDirection,
    orderedByDirection,
  };
  portLayouts.set(node, layout);
  return layout;
}

export function getPortCount(node: FlowNode, direction: FlowPort['direction']) {
  return getPortLayout(node).count[direction];
}

export function getPortColumnLayout(
  node: FlowNode,
  direction: FlowPort['direction'],
): PortColumnLayout {
  return getPortLayout(node).columnByDirection[direction];
}

export function getPortRowBounds(node: FlowNode, portId: PortId): PortRowBounds | null {
  const port = getPortLayout(node).portById.get(portId);
  const anchor = getPortPosition(node, portId);
  if (!port || !anchor) return null;
  const column = getPortColumnLayout(node, port.direction);
  return {
    x: column.x,
    y: anchor.y - PORT_ROW_HEIGHT / 2,
    width: column.width,
    height: PORT_ROW_HEIGHT,
  };
}

export function getRecipeNodeSize(node: FlowNode): NodeSize {
  if (node.data.heightOverride !== undefined) {
    return { width: NODE_WIDTH, height: node.data.heightOverride };
  }

  const inputCount = getPortCount(node, 'input');
  const outputCount = getPortCount(node, 'output');
  return getRecipeNodeSizeForPortCounts(inputCount, outputCount);
}

export function getRecipeNodeSizeForPortCounts(inputCount: number, outputCount: number): NodeSize {
  const rowCount = Math.max(inputCount, outputCount, 1);

  return { width: NODE_WIDTH, height: 156 + PORT_ROW_STEP * rowCount };
}

export function getPortPosition(node: FlowNode, portId: PortId): PortPosition | null {
  return getPortLayout(node).positionById.get(portId) ?? null;
}

export function getWorldPortPosition(node: FlowNode, portId: PortId) {
  const position = getPortPosition(node, portId);
  return position ? { x: node.x + position.x, y: node.y + position.y } : null;
}

export function getOrderedPorts(
  node: FlowNode,
  direction: FlowPort['direction'],
): readonly FlowPort[] {
  return getPortLayout(node).orderedByDirection[direction];
}
