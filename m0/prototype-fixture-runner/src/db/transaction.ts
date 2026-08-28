import type { SqliteLike } from './types';

let savepointCounter = 0;

/**
 * A transaction boundary that is safe both at the top level and inside an
 * existing SQLite transaction. SAVEPOINT keeps composite repository use cases
 * atomic without triggering "cannot start a transaction within a transaction".
 */
export function withSavepointSync<T>(db: SqliteLike, task: () => T): T {
  const name = `oshilog_sp_${++savepointCounter}`;
  db.execSync(`SAVEPOINT ${name}`);
  try {
    const result = task();
    db.execSync(`RELEASE SAVEPOINT ${name}`);
    return result;
  } catch (error) {
    db.execSync(`ROLLBACK TO SAVEPOINT ${name}`);
    db.execSync(`RELEASE SAVEPOINT ${name}`);
    throw error;
  }
}
