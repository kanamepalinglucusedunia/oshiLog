import { createNodeTestDb } from '@/testing/nodeSqlite';
import { useUiStore } from '@/stores/uiStore';
import { cachedQuery, invalidateQueries } from '../queryCache';

describe('query invalidation', () => {
  it('clears cached values and publishes one observable data version', () => {
    const db = createNodeTestDb();
    let executions = 0;
    const before = useUiStore.getState().dataVersion;

    expect(cachedQuery(db, 'example', () => ++executions)).toBe(1);
    expect(cachedQuery(db, 'example', () => ++executions)).toBe(1);

    invalidateQueries(db);

    expect(useUiStore.getState().dataVersion).toBe(before + 1);
    expect(cachedQuery(db, 'example', () => ++executions)).toBe(2);
  });
});
