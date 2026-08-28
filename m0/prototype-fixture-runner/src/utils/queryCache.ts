import type { SqliteLike } from '@/db/types';
import { useUiStore } from '@/stores/uiStore';

/**
 * Tiny per-database in-memory query cache. Cached values live only as long as
 * the database instance they belong to, and every write path calls
 * `invalidateQueries` so reads served from cache never go stale.
 */
const stores = new WeakMap<SqliteLike, Map<string, unknown>>();
let invalidationBatchDepth = 0;
let notificationPending = false;

export function cachedQuery<T>(db: SqliteLike, key: string, fn: () => T): T {
  let store = stores.get(db);
  if (!store) {
    store = new Map();
    stores.set(db, store);
  }
  if (store.has(key)) return store.get(key) as T;
  const value = fn();
  store.set(key, value);
  return value;
}

export function invalidateQueries(db: SqliteLike): void {
  stores.get(db)?.clear();
  if (invalidationBatchDepth > 0) {
    notificationPending = true;
    return;
  }
  useUiStore.getState().bumpDataVersion();
}

export function invalidateQueriesByTag(db: SqliteLike, tags: string[]): void {
  const store = stores.get(db);
  if (!store) {
    if (invalidationBatchDepth > 0) notificationPending = true;
    else useUiStore.getState().bumpDataVersion();
    return;
  }
  for (const key of [...store.keys()]) {
    if (tags.some((tag) => key.startsWith(tag))) store.delete(key);
  }
  if (store.size === 0) {
    // if we cleared everything, bump anyway
  }
  if (invalidationBatchDepth > 0) {
    notificationPending = true;
    return;
  }
  useUiStore.getState().bumpDataVersion();
}

export function invalidateQueriesByPrefix(db: SqliteLike, prefixes: string[]): void {
  return invalidateQueriesByTag(db, prefixes);
}

/** Coalesces nested repository invalidations into one observable UI update. */
export function withQueryInvalidationBatch<T>(task: () => T): T {
  invalidationBatchDepth += 1;
  try {
    return task();
  } finally {
    invalidationBatchDepth -= 1;
    if (invalidationBatchDepth === 0 && notificationPending) {
      notificationPending = false;
      useUiStore.getState().bumpDataVersion();
    }
  }
}
