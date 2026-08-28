import type { SqliteLike } from '@/db/types';

export interface ExplainRow {
  selectid: number;
  order: number;
  from: number;
  detail: string;
}

/**
 * Runs EXPLAIN QUERY PLAN and returns detail strings.
 * Useful for asserting SEARCH vs SCAN and TEMP B-TREE usage.
 */
export function explainQueryPlan(db: SqliteLike, sql: string, ...params: unknown[]): ExplainRow[] {
  return db.getAllSync<ExplainRow>(`EXPLAIN QUERY PLAN ${sql}`, ...params);
}

export function explainDetails(db: SqliteLike, sql: string, ...params: unknown[]): string[] {
  return explainQueryPlan(db, sql, ...params).map((r) => r.detail);
}

export function hasScan(details: string[]): boolean {
  return details.some((d) => d.includes('SCAN TABLE') && !d.includes('USING COVERING INDEX'));
}

export function hasTempBTree(details: string[]): boolean {
  return details.some((d) => d.includes('TEMP B-TREE') || d.includes('USE TEMP B-TREE'));
}
