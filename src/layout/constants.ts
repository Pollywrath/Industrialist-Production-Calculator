import {
  BASE_INFO_HEIGHT,
  BOTTOM_PADDING,
  IO_COLUMN_PADDING,
  NODE_CSS_WIDTH,
  NODE_HANDLE_SIZE,
  RECT_GAP,
  RECT_HEIGHT,
  SNAP_GRID,
} from '../constants/layoutConstants';
import { GROUP_HEADER_HEIGHT, GROUP_PADDING_X, GROUP_PADDING_Y } from '../utils/groupBounds';
import type { ResolvedLayoutOptions } from './types';

export {
  BASE_INFO_HEIGHT,
  BOTTOM_PADDING,
  IO_COLUMN_PADDING,
  NODE_CSS_WIDTH,
  NODE_HANDLE_SIZE,
  RECT_GAP,
  RECT_HEIGHT,
};

const IO_COLUMN_TOP_PAD = 17;
const HANDLE_STEP = RECT_HEIGHT + RECT_GAP;

export const GRID_X = SNAP_GRID[0];
export const GRID_Y = SNAP_GRID[1];
export const ROOT_PADDING = `[top=${GRID_Y * 4}, left=${GRID_X * 3}, bottom=${GRID_Y * 4}, right=${GRID_X * 3}]`;
export const GROUP_PADDING = `[top=${GROUP_HEADER_HEIGHT + GROUP_PADDING_Y}, left=${GROUP_PADDING_X}, bottom=${GROUP_PADDING_Y}, right=${GROUP_PADDING_X}]`;
export const MAX_PORT_ORDER_REFINEMENT_PASSES = 2;

function snapSpacing(value: number, gridSize: number): number {
  return Math.max(gridSize, Math.round(value / gridSize) * gridSize);
}

export const DEFAULT_LAYOUT_OPTIONS: ResolvedLayoutOptions = {
  elkSpacing: {
    componentComponent: snapSpacing(GRID_X * 8, GRID_X),
    nodeNode: snapSpacing(GRID_Y * 3, GRID_Y),
    edgeNode: snapSpacing(GRID_Y * 3, GRID_Y),
    edgeEdge: snapSpacing(GRID_Y * 2, GRID_Y),
    nodeNodeBetweenLayers: snapSpacing(GRID_X * 8, GRID_X),
    edgeNodeBetweenLayers: snapSpacing(GRID_X * 3, GRID_X),
    edgeEdgeBetweenLayers: snapSpacing(GRID_Y * 2, GRID_Y),
  },
  edgePriority: {
    flow: {
      direction: 1,
      shortness: 1,
      straightness: 2,
    },
    feedback: {
      direction: 0,
      shortness: 1,
      straightness: 1,
    },
    selfLoop: {
      direction: 0,
      shortness: 1,
      straightness: 0,
    },
  },
  greedySwitchActivationThreshold: 0,
  greedySwitchHierarchicalType: 'TWO_SIDED_GREEDY_SWITCH',
  layeringStrategy: 'NETWORK_SIMPLEX',
  thoroughness: 7,
  portOrderRefinementPasses: MAX_PORT_ORDER_REFINEMENT_PASSES,
};

export const createIndexOrder = (count: number): number[] =>
  Array.from({ length: count }, (_unused, index) => index);

export const snapX = (x: number): number => Math.round(x / GRID_X) * GRID_X;
export const snapY = (y: number): number => Math.round(y / GRID_Y) * GRID_Y;

export function snapToGrid(x: number, y: number): { x: number; y: number } {
  return { x: snapX(x), y: snapY(y) };
}

export function snapDimension(
  value: number | undefined,
  gridSize: number,
  fallback: number,
): number {
  const rawValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(gridSize, Math.ceil(rawValue / gridSize) * gridSize);
}

function getHandleY(
  side: 'left' | 'right',
  displayIndex: number,
  inputCount: number,
  outputCount: number,
): number {
  const maxCount = Math.max(inputCount, outputCount);
  const sideCount = side === 'left' ? inputCount : outputCount;
  const verticalOffset = ((maxCount - sideCount) * HANDLE_STEP) / 2;
  return (
    BASE_INFO_HEIGHT +
    IO_COLUMN_TOP_PAD +
    verticalOffset +
    displayIndex * HANDLE_STEP +
    RECT_HEIGHT / 2
  );
}

export function getLayoutPortY(
  side: 'input' | 'output',
  displayIndex: number,
  inputCount: number,
  outputCount: number,
): number {
  return getHandleY(side === 'input' ? 'left' : 'right', displayIndex, inputCount, outputCount);
}
