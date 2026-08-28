import { DatabaseSync } from 'node:sqlite';
import type { SqliteLike } from '@/db/types';
import { migrate } from '@/db/schema';

type SqlInput = string | number | bigint | null | Uint8Array;

function normalizeParams(params: unknown[]): SqlInput[] {
  const flat = params.length === 1 && Array.isArray(params[0]) ? (params[0] as unknown[]) : params;
  return flat as SqlInput[];
}

/**
 * SqliteLike implementation backed by Node's built-in SQLite (real SQLite engine),
 * used for integration tests in Jest.
 */
export function createNodeSqlite(): SqliteLike {
  const db = new DatabaseSync(':memory:');

  return {
    execSync: (source) => {
      db.exec(source);
    },
    runSync: (source, ...params) => {
      db.prepare(source).run(...normalizeParams(params));
    },
    getFirstSync: <T>(source: string, ...params: unknown[]) => {
      const row = db.prepare(source).get(...normalizeParams(params));
      return (row ?? null) as T | null;
    },
    getAllSync: <T>(source: string, ...params: unknown[]) => {
      return db.prepare(source).all(...normalizeParams(params)) as unknown as T[];
    },
    withTransactionSync: (task) => {
      db.exec('BEGIN');
      try {
        task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

export function createNodeTestDb(): SqliteLike {
  const db = createNodeSqlite();
  migrate(db);
  return db;
}
