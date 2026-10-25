export interface NodeTextRefreshQueue {
  enqueue(ids: Iterable<string>): void;
  clear(): void;
  process(
    update: (id: string) => void,
    timeBudgetMs: number,
    now?: () => number,
    maxItems?: number,
  ): boolean;
  hasPending(): boolean;
}

export function createNodeTextRefreshQueue(): NodeTextRefreshQueue {
  const ids: string[] = [];
  const queuedIds = new Set<string>();
  let nextIdIndex = 0;

  function resetIfEmpty() {
    if (nextIdIndex < ids.length) return;
    ids.length = 0;
    nextIdIndex = 0;
  }

  return {
    enqueue(nextIds) {
      for (const id of nextIds) {
        if (queuedIds.has(id)) continue;
        queuedIds.add(id);
        ids.push(id);
      }
    },
    clear() {
      ids.length = 0;
      queuedIds.clear();
      nextIdIndex = 0;
    },
    process(
      update,
      timeBudgetMs,
      now = () => performance.now(),
      maxItems = Number.POSITIVE_INFINITY,
    ) {
      const startedAt = now();
      let processed = 0;
      while (
        nextIdIndex < ids.length &&
        processed < maxItems &&
        (processed === 0 || now() - startedAt < timeBudgetMs)
      ) {
        const id = ids[nextIdIndex];
        nextIdIndex += 1;
        if (id === undefined) continue;
        queuedIds.delete(id);
        update(id);
        processed += 1;
      }
      resetIfEmpty();
      return queuedIds.size > 0;
    },
    hasPending() {
      return queuedIds.size > 0;
    },
  };
}
