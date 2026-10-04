import { buildHandleId, parseHandleId } from '../utils/ids/idGenerator';

export function remapProxyHandleIds(
  handleIds: string[],
  idMap: Map<string, string>,
  recipeNodeIds: Set<string>,
  side: 'input' | 'output',
): string[] {
  let changed = false;
  const nextHandleIds: string[] = [];

  for (let i = 0; i < handleIds.length; i++) {
    const handleId = handleIds[i];
    const parsed = parseHandleId(handleId);
    const nextNodeId = parsed ? idMap.get(parsed.nodeId) : undefined;
    const nextHandleId =
      parsed && nextNodeId ? buildHandleId(nextNodeId, parsed.side, parsed.index) : handleId;
    const nextParsed = parseHandleId(nextHandleId);

    if (!nextParsed || nextParsed.side !== side || !recipeNodeIds.has(nextParsed.nodeId)) {
      changed = true;
      continue;
    }

    nextHandleIds.push(nextHandleId);
    if (parsed && nextNodeId) {
      changed = true;
    }
  }

  return changed ? nextHandleIds : handleIds;
}
