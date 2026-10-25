import type { GraphStore } from '../../state/graph-store';
import type { DeletableTarget } from '../renderer/spatial-picking';

export function shouldResolveDeleteAtPoint(
  graphEditing: boolean,
  altKey: boolean,
  deleteMode: boolean,
) {
  return graphEditing || altKey || deleteMode;
}

export function shouldHandleDeleteTargetBeforeCanvasAction(
  target: DeletableTarget | null,
  altKey: boolean,
  deleteMode = false,
) {
  return target !== null && (altKey || deleteMode || target.type !== 'node');
}

export function removeNodeOrGroup(
  graph: Pick<GraphStore, 'getGroup' | 'removeGroup' | 'removeNode'>,
  id: string,
) {
  if (graph.getGroup(id)) graph.removeGroup(id);
  else graph.removeNode(id);
}
