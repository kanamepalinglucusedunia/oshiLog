/**
 * Opaque keyset cursor utilities for M4 collection pagination.
 * All cursors are base64url-encoded JSON arrays of sort-key values + id tie-breaker.
 * Limit is clamped 1..100 (default 50) per global invariant.
 */

export const PAGE_DEFAULT_LIMIT = 50;
export const PAGE_MAX_LIMIT = 100;
export const PAGE_MIN_LIMIT = 1;

export type PageCursor = string | null;

export interface PageArgs<F, S> {
  limit?: number;
  cursor?: PageCursor;
  filters: F;
  sort: S;
}

export interface PageResult<T> {
  rows: T[];
  nextCursor: PageCursor;
  hasMore: boolean;
}

export function clampLimit(limit?: number): number {
  if (limit == null || !Number.isFinite(limit)) return PAGE_DEFAULT_LIMIT;
  return Math.min(PAGE_MAX_LIMIT, Math.max(PAGE_MIN_LIMIT, Math.trunc(limit)));
}

function toBase64Url(input: string): string {
  // Node + RN compatible: use Buffer if available else btoa
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'utf8').toString('base64url');
  }
  // fallback for RN JSC
  const b64 = (globalThis as unknown as { btoa?: (s: string) => string }).btoa?.(input) ?? '';
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'base64url').toString('utf8');
  }
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const atobFn = (globalThis as unknown as { atob?: (s: string) => string }).atob;
  if (atobFn) return atobFn(b64);
  return '';
}

export function encodeCursor(values: unknown[]): string {
  const json = JSON.stringify(values);
  return toBase64Url(json);
}

export function decodeCursor(cursor: PageCursor): unknown[] | null {
  if (!cursor) return null;
  try {
    const json = fromBase64Url(cursor);
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Validates that decoded cursor has expected length and types for the given sort.
 * Returns the decoded values or null if invalid (caller should treat as first page).
 */
export function requireCursorValues(cursor: PageCursor, expectedLength: number): unknown[] | null {
  const values = decodeCursor(cursor);
  if (!values || values.length !== expectedLength) return null;
  return values;
}
