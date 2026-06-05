import type { CanvasNode, RecipeNodeType } from '../types/nodes';
import { isRecipeNode } from '../types/nodes';
import {
  BASE_INFO_HEIGHT,
  NODE_CSS_WIDTH,
  SNAP_GRID,
  RECT_HEIGHT,
  RECT_GAP,
  IO_COLUMN_PADDING,
  BOTTOM_PADDING,
} from '../components/shared/layoutConstants';

export const GROUP_PADDING_X = SNAP_GRID[0];
export const GROUP_PADDING_Y = SNAP_GRID[1];
export const GROUP_HEADER_HEIGHT = SNAP_GRID[1] * 2;
export const EMPTY_GROUP_WIDTH = 260;
export const EMPTY_GROUP_HEIGHT = 140;

export function getCollapsedGroupHeight(inputCount: number, outputCount: number): number {
  const maxCount = Math.max(inputCount, outputCount, 1);
  const ioAreaHeight = maxCount * RECT_HEIGHT + (maxCount - 1) * RECT_GAP + IO_COLUMN_PADDING;
  return BASE_INFO_HEIGHT + ioAreaHeight + BOTTOM_PADDING;
}

export interface GroupMemberBounds {
  id: string;
  position: { x: number; y: number };
  width: number;
  height: number;
}

export interface GroupBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  memberCount: number;
}

interface BoundsExtents {
  memberCount: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function createEmptyExtents(): BoundsExtents {
  return {
    memberCount: 0,
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
}

function addToExtents(
  extents: BoundsExtents,
  position: { x: number; y: number },
  width: number,
  height: number,
): void {
  extents.memberCount += 1;
  extents.minX = Math.min(extents.minX, position.x);
  extents.minY = Math.min(extents.minY, position.y);
  extents.maxX = Math.max(extents.maxX, position.x + width);
  extents.maxY = Math.max(extents.maxY, position.y + height);
}

function extentsToBounds(extents: BoundsExtents): GroupBounds | null {
  if (extents.memberCount === 0) return null;

  const x = Math.round((extents.minX - GROUP_PADDING_X) / SNAP_GRID[0]) * SNAP_GRID[0];
  const y =
    Math.round((extents.minY - GROUP_HEADER_HEIGHT - GROUP_PADDING_Y) / SNAP_GRID[1]) *
    SNAP_GRID[1];
  const right = extents.maxX + GROUP_PADDING_X;
  const bottom = extents.maxY + GROUP_PADDING_Y;

  return {
    x,
    y,
    width: Math.max(SNAP_GRID[0], right - x),
    height: Math.max(SNAP_GRID[1], bottom - y),
    memberCount: extents.memberCount,
  };
}

export function getRecipeMemberBounds(
  node: RecipeNodeType,
  position: { x: number; y: number } = node.position,
): GroupMemberBounds {
  return {
    id: node.id,
    position,
    width: node.width ?? NODE_CSS_WIDTH,
    height: node.height ?? BASE_INFO_HEIGHT,
  };
}

export function computeBoundsFromMembers(
  members: readonly GroupMemberBounds[],
): GroupBounds | null {
  const extents = createEmptyExtents();

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    addToExtents(extents, member.position, member.width, member.height);
  }

  return extentsToBounds(extents);
}

export function computeBoundsFromMembersWithMovedMember(
  members: readonly GroupMemberBounds[],
  movedMemberId: string,
  deltaX: number,
  deltaY: number,
): GroupBounds | null {
  const extents = createEmptyExtents();

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    const position =
      member.id === movedMemberId
        ? { x: member.position.x + deltaX, y: member.position.y + deltaY }
        : member.position;
    addToExtents(extents, position, member.width, member.height);
  }

  return extentsToBounds(extents);
}

export function computeGroupBoundsByGroupId(
  nodes: readonly CanvasNode[],
  groupIds?: ReadonlySet<string>,
): Map<string, GroupBounds> {
  const extentsByGroupId = new Map<string, BoundsExtents>();

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!isRecipeNode(node) || !node.data.groupId || node.hidden) continue;
    if (groupIds && !groupIds.has(node.data.groupId)) continue;

    let extents = extentsByGroupId.get(node.data.groupId);
    if (!extents) {
      extents = createEmptyExtents();
      extentsByGroupId.set(node.data.groupId, extents);
    }

    const memberBounds = getRecipeMemberBounds(node);
    addToExtents(extents, memberBounds.position, memberBounds.width, memberBounds.height);
  }

  const boundsByGroupId = new Map<string, GroupBounds>();
  for (const [groupId, extents] of extentsByGroupId.entries()) {
    const bounds = extentsToBounds(extents);
    if (bounds) {
      boundsByGroupId.set(groupId, bounds);
    }
  }

  return boundsByGroupId;
}
