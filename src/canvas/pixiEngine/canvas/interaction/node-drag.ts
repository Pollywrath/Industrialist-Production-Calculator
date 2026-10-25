import { Container, FederatedPointerEvent } from 'pixi.js';
import { snapPosition } from '../../domain/geometry/grid';
import type { GraphStore } from '../../state/graph-store';
import type { CanvasActionDecision, CanvasActionProposal } from './action-proposal';

interface Position {
  readonly x: number;
  readonly y: number;
}

interface ActiveDrag {
  readonly primaryNodeId: string;
  readonly pointerStart: Position;
  readonly starts: ReadonlyMap<string, Position>;
  moved: boolean;
  positions: Map<string, Position>;
  readonly groupId?: string;
}

type PreviewPosition = (id: string, position: Position | null) => void;
type MoveNodesProposal = Extract<CanvasActionProposal, { readonly type: 'move-nodes' }>;
type CommitPositions = (proposal: MoveNodesProposal) => CanvasActionDecision;
type ClickAction = (nodeId: string, groupId?: string) => void;

export function calculateDragPositions(
  starts: ReadonlyMap<string, Position>,
  dx: number,
  dy: number,
  moveAsGroup: boolean,
) {
  const groupDelta = moveAsGroup ? snapPosition({ x: dx, y: dy }) : null;
  return new Map(
    [...starts].map(([id, origin]) => [
      id,
      groupDelta
        ? { x: origin.x + groupDelta.x, y: origin.y + groupDelta.y }
        : snapPosition({ x: origin.x + dx, y: origin.y + dy }),
    ]),
  );
}

export function createNodeDragInteraction(
  graph: GraphStore,
  world: Container,
  host: HTMLElement,
  onPreviewPosition: PreviewPosition,
  onCommitPositions?: CommitPositions,
  onClick?: ClickAction,
) {
  let activeDrag: ActiveDrag | null = null;

  function start(
    nodeId: string,
    event: FederatedPointerEvent,
    selectedNodeIds: readonly string[] = [nodeId],
    groupId?: string,
  ) {
    return startAt(nodeId, world.toLocal(event.global), selectedNodeIds, groupId);
  }

  function startAt(
    nodeId: string,
    pointer: Position,
    selectedNodeIds: readonly string[] = [nodeId],
    groupId?: string,
  ) {
    if (!graph.getNode(nodeId)) return false;
    const starts = new Map<string, Position>();
    for (const id of selectedNodeIds) {
      const node = graph.getNode(id);
      if (node) starts.set(id, { x: node.x, y: node.y });
    }
    if (!starts.has(nodeId)) return false;
    activeDrag = {
      primaryNodeId: nodeId,
      pointerStart: { x: pointer.x, y: pointer.y },
      starts,
      moved: false,
      positions: new Map(),
      groupId,
    };
    host.style.cursor = 'grabbing';
    return true;
  }

  function move(event: FederatedPointerEvent) {
    if (!activeDrag) return false;
    const pointer = world.toLocal(event.global);
    const dx = pointer.x - activeDrag.pointerStart.x;
    const dy = pointer.y - activeDrag.pointerStart.y;
    const positions = calculateDragPositions(activeDrag.starts, dx, dy, !!activeDrag.groupId);
    for (const id of activeDrag.starts.keys()) {
      const position = positions.get(id);
      if (!position) continue;
      const node = graph.getNode(id);
      activeDrag.moved ||= !!node && (position.x !== node.x || position.y !== node.y);
      const previous = activeDrag.positions.get(id);
      if (previous?.x !== position.x || previous.y !== position.y) onPreviewPosition(id, position);
    }
    activeDrag.positions = positions;
    return true;
  }

  function end(event?: FederatedPointerEvent) {
    if (event && activeDrag) move(event);
    const drag = activeDrag;
    activeDrag = null;
    host.style.cursor = '';
    if (!drag) return;
    for (const id of drag.starts.keys()) onPreviewPosition(id, null);
    if (drag.moved && drag.positions.size > 0) {
      if (onCommitPositions) {
        onCommitPositions({
          type: 'move-nodes',
          positions: [...drag.positions].map(([id, position]) => ({ id, ...position })),
          ...(drag.groupId ? { groupId: drag.groupId } : {}),
        });
      } else graph.moveNodes(drag.positions);
    } else if (!drag.moved) {
      onClick?.(drag.primaryNodeId, drag.groupId);
    }
  }

  function cancel() {
    const drag = activeDrag;
    activeDrag = null;
    host.style.cursor = '';
    if (!drag) return;
    for (const id of drag.starts.keys()) onPreviewPosition(id, null);
  }

  function getActiveNodeId() {
    return activeDrag?.starts.keys().next().value ?? null;
  }

  function getActiveNodeIds() {
    return activeDrag ? [...activeDrag.starts.keys()] : [];
  }

  return { start, startAt, move, end, cancel, getActiveNodeId, getActiveNodeIds };
}
