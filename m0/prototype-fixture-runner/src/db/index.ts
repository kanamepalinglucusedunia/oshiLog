import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { migrate } from './schema';
import type { SqliteLike } from './types';

let dbInstance: SqliteLike | null = null;
let nativeDb: SQLiteDatabase | null = null;

export function getDb(): SqliteLike {
  if (!dbInstance) {
    const db = openDatabaseSync('oshilog.db');
    migrate(db);
    dbInstance = db;
    nativeDb = db;
  }
  return dbInstance;
}

export function closeDb(): void {
  try {
    nativeDb?.closeSync();
  } catch {
    // Connection may already be closed.
  }
  nativeDb = null;
  dbInstance = null;
}
