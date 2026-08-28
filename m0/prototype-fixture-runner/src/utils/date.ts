/**
 * Domain dates are ISO local-date strings (YYYY-MM-DD) to avoid timezone shifts.
 * Audit timestamps are UTC ISO strings.
 */

export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function nowUTCISO(): string {
  return new Date().toISOString();
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** Compares two ISO local-date strings lexicographically (safe because of fixed width). */
export function compareISODate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-08-08" -> "Aug 8, 2026" */
export function formatISODate(value: string): string {
  if (!isValidISODate(value)) return value;
  const [y, m, d] = value.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "2026-08-08" -> "8 Aug 2026" (day month year, no comma) */
export function formatISODateCompact(value: string): string {
  if (!isValidISODate(value)) return value;
  const [y, m, d] = value.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-08-08" -> "8 August 2026" */
export function formatISODateFull(value: string): string {
  if (!isValidISODate(value)) return value;
  const [y, m, d] = value.split('-').map(Number);
  return `${d} ${FULL_MONTHS[m - 1]} ${y}`;
}

/** "2026-08-08" -> "Aug 2026" */
export function formatISOMonth(value: string): string {
  if (!isValidISODate(value)) return value;
  const [y, m] = value.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
