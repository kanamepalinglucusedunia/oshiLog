/**
 * Minimal synchronous SQLite interface used by repositories and services.
 * expo-sqlite's SQLiteDatabase is structurally compatible; tests provide a
 * Node-backed implementation (node:sqlite) so integration tests run on a real
 * SQLite engine.
 */
export interface SqliteLike {
  execSync(source: string): void;
  runSync(source: string, ...params: unknown[]): void;
  getFirstSync<T>(source: string, ...params: unknown[]): T | null;
  getAllSync<T>(source: string, ...params: unknown[]): T[];
  withTransactionSync(task: () => void): void;
}
