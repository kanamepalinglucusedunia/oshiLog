import type { SqliteLike } from '@/db/types';
import type { CurrencyCode, MembershipStatus } from '@/types/domain';
import { compareISODate, isValidISODate } from '@/utils/date';
import { invalidateQueries } from '@/utils/queryCache';
import { isMembershipActiveOn } from './membership';

export interface MembershipDates {
  startDate: string;
  endDate: string | null;
}

export interface MembershipFormInput extends MembershipDates {
  status: MembershipStatus;
  hiatusStartDate: string | null;
  hiatusEndDate: string | null;
}

export interface AffectedEntry {
  entryId: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  idolId: string;
  currency: CurrencyCode;
  unitPrice: number;
  quantity: number;
}

export interface ReassignmentOption {
  groupMembershipId: string | null;
  label: string;
}

/**
 * Validates a new membership date range. startDate must be valid and
 * endDate (when set) must not be before startDate.
 */
export function validateMembershipDates(dates: MembershipDates): { ok: boolean; error?: string } {
  if (!isValidISODate(dates.startDate)) return { ok: false, error: 'Start date must be a valid YYYY-MM-DD date' };
  if (dates.endDate && !isValidISODate(dates.endDate)) {
    return { ok: false, error: 'End date must be a valid YYYY-MM-DD date' };
  }
  if (dates.endDate && compareISODate(dates.endDate, dates.startDate) < 0) {
    return { ok: false, error: 'End date must be on or after start date' };
  }
  return { ok: true };
}

/**
 * Validates a full membership form: date range, hiatus window, and that a
 * Grad membership always has an end (graduation) date.
 */
export function validateMembershipForm(input: MembershipFormInput): { ok: boolean; error?: string } {
  const base = validateMembershipDates(input);
  if (!base.ok) return base;
  if (input.status === 'grad' && !input.endDate) {
    return { ok: false, error: 'A Graduated membership must have an end date' };
  }
  if (input.hiatusEndDate && !input.hiatusStartDate) {
    return { ok: false, error: 'Hiatus end requires a Hiatus start date' };
  }
  if (input.status === 'hiatus' && !input.hiatusStartDate) {
    return { ok: false, error: 'A Hiatus membership must have a Hiatus start date' };
  }
  if (input.status === 'hiatus' && input.hiatusEndDate) {
    return { ok: false, error: 'A completed Hiatus must return the membership to Active' };
  }
  if (input.status !== 'hiatus' && input.hiatusStartDate && !input.hiatusEndDate) {
    return { ok: false, error: 'An open Hiatus must use the Hiatus membership status' };
  }
  if (input.hiatusStartDate && !isValidISODate(input.hiatusStartDate)) {
    return { ok: false, error: 'Hiatus start must be a valid YYYY-MM-DD date' };
  }
  if (input.hiatusEndDate && !isValidISODate(input.hiatusEndDate)) {
    return { ok: false, error: 'Hiatus end must be a valid YYYY-MM-DD date' };
  }
  if (input.hiatusStartDate && input.hiatusEndDate && compareISODate(input.hiatusEndDate, input.hiatusStartDate) < 0) {
    return { ok: false, error: 'Hiatus end must be on or after hiatus start' };
  }
  if (input.hiatusStartDate && compareISODate(input.hiatusStartDate, input.startDate) < 0) {
    return { ok: false, error: 'Hiatus must start within the membership period' };
  }
  if (input.hiatusEndDate && input.endDate && compareISODate(input.hiatusEndDate, input.endDate) > 0) {
    return { ok: false, error: 'Hiatus must end within the membership period' };
  }
  return { ok: true };
}

/**
 * Finds completed Cheki Entries whose event date would fall OUTSIDE the new
 * membership period. These must be handled before the change is saved.
 */
export function findAffectedEntries(db: SqliteLike, membershipId: string, newDates: MembershipDates): AffectedEntry[] {
  return db
    .getAllSync<AffectedEntry>(
      `SELECT ce.id AS entryId, e.id AS eventId, e.title AS eventTitle, e.event_date AS eventDate,
        ce.idol_id AS idolId, ce.currency, ce.unit_price AS unitPrice, ce.quantity
       FROM cheki_entry ce
       JOIN event e ON e.id = ce.event_id
       WHERE ce.group_membership_id = ? AND ce.deleted_at IS NULL AND e.deleted_at IS NULL`,
      membershipId,
    )
    .filter((entry) => !isMembershipActiveOn({ startDate: newDates.startDate, endDate: newDates.endDate }, entry.eventDate));
}

/**
 * Lists alternative picker options for an affected entry: the idol's other
 * memberships active on the entry's event date, plus a Solo option.
 */
export function listReassignmentOptions(db: SqliteLike, entry: AffectedEntry, excludeMembershipId: string): ReassignmentOption[] {
  const memberships = db.getAllSync<{ id: string; start_date: string; end_date: string | null; group_name: string | null }>(
    `SELECT gm.id, gm.start_date, gm.end_date, g.name AS group_name
     FROM group_membership gm
     LEFT JOIN groups g ON g.id = gm.group_id
     WHERE gm.idol_id = ? AND gm.deleted_at IS NULL AND gm.id != ?`,
    entry.idolId,
    excludeMembershipId,
  );
  const options: ReassignmentOption[] = [];
  for (const m of memberships) {
    if (isMembershipActiveOn({ startDate: m.start_date, endDate: m.end_date }, entry.eventDate)) {
      options.push({ groupMembershipId: m.id, label: m.group_name ?? 'Group' });
    }
  }
  options.push({ groupMembershipId: null, label: 'Solo' });
  return options;
}

/**
 * Applies the membership change and reassigns every affected entry to its
 * chosen option inside a transaction. A choice of `null` converts the entry
 * to Solo.
 */
export function applyMembershipChange(
  db: SqliteLike,
  membershipId: string,
  input: MembershipFormInput & { name?: string | null; memberColor?: string | null; isMain?: boolean },
  reassignments: Record<string, string | null>,
): void {
  const now = new Date().toISOString();
  db.withTransactionSync(() => {
    if (input.isMain) {
      db.runSync(
        `UPDATE group_membership SET is_main = 0, updated_at = ?
         WHERE idol_id = (SELECT idol_id FROM group_membership WHERE id = ?)
           AND id != ? AND is_main = 1 AND deleted_at IS NULL
           AND start_date <= COALESCE(?, '9999-12-31')
           AND ? <= COALESCE(end_date, '9999-12-31')`,
        now,
        membershipId,
        membershipId,
        input.endDate,
        input.startDate,
      );
    }
    db.runSync(
      `UPDATE group_membership SET start_date = ?, end_date = ?, status = ?, hiatus_start_date = ?,
        hiatus_end_date = ?, name = ?, member_color = ?, is_main = ?, updated_at = ?
       WHERE id = ?`,
      input.startDate,
      input.endDate,
      input.status,
      input.hiatusStartDate,
      input.hiatusEndDate,
      input.name ?? null,
      input.memberColor ?? null,
      input.isMain ? 1 : 0,
      now,
      membershipId,
    );
    for (const [entryId, newMembershipId] of Object.entries(reassignments)) {
      db.runSync(
        `UPDATE cheki_entry SET group_membership_id = ?, updated_at = ? WHERE id = ?`,
        newMembershipId,
        now,
        entryId,
      );
    }
  });
  invalidateQueries(db);
}
