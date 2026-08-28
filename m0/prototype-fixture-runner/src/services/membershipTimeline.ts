import type { IdolStatus, MembershipPeriodStatus, MembershipStatus } from '@/types/domain';
import { compareISODate, isValidISODate } from '@/utils/date';

export interface MembershipPeriodDraft {
  id?: string;
  status: MembershipPeriodStatus;
  startDate: string;
  endDate: string | null;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

interface TimelineInput {
  startDate: string;
  endDate: string | null;
  status: MembershipStatus;
  periods: MembershipPeriodDraft[];
}

interface TransitionInput {
  periods: MembershipPeriodDraft[];
  currentStatus: MembershipStatus;
  nextStatus: MembershipStatus;
  boundaryDate: string;
}

export interface MembershipTransitionResult {
  status: MembershipStatus;
  endDate: string | null;
  periods: MembershipPeriodDraft[];
}

interface EpisodeRange {
  id?: string;
  groupId: string;
  startDate: string;
  endDate: string | null;
}

export function createInitialMembershipPeriods(startDate: string): MembershipPeriodDraft[] {
  if (!isValidISODate(startDate)) throw new Error('Membership debut date must be a valid YYYY-MM-DD date');
  return [{ status: 'active', startDate, endDate: null }];
}

/**
 * Builds canonical periods only after a user explicitly reviews a legacy row.
 * Every boundary comes from the episode's visible date fields; no date is inferred.
 */
export function buildExplicitRepairPeriods(input: {
  status: MembershipStatus;
  startDate: string;
  endDate: string | null;
  hiatusStartDate: string | null;
  hiatusEndDate: string | null;
}): MembershipPeriodDraft[] {
  if (!isValidISODate(input.startDate)) throw new Error('Membership debut date is invalid');
  if (input.status === 'grad' && !input.endDate) throw new Error('A Grad date is required to repair this timeline');
  if (input.status !== 'grad' && input.endDate) throw new Error('Only a Grad membership may have a Grad date');
  if (input.endDate && !isValidISODate(input.endDate)) throw new Error('Membership Grad date is invalid');
  if (input.hiatusEndDate && !input.hiatusStartDate) throw new Error('Hiatus end requires a Hiatus start date');
  if (input.status === 'hiatus' && !input.hiatusStartDate) throw new Error('A Hiatus start date is required to repair this timeline');
  if (input.status === 'hiatus' && input.hiatusEndDate) throw new Error('A completed Hiatus must be repaired as Active or Grad');
  if (input.status === 'active' && input.hiatusStartDate && !input.hiatusEndDate) {
    throw new Error('Complete or clear the legacy Hiatus dates before repairing as Active');
  }

  if (input.hiatusStartDate && !isValidISODate(input.hiatusStartDate)) {
    throw new Error('Hiatus start date is invalid');
  }
  if (input.hiatusEndDate && !isValidISODate(input.hiatusEndDate)) {
    throw new Error('Hiatus end date is invalid');
  }
  if (input.endDate && compareISODate(input.endDate, input.startDate) < 0) {
    throw new Error('Grad date cannot be before the debut date');
  }
  if (input.hiatusStartDate && compareISODate(input.hiatusStartDate, input.startDate) < 0) {
    throw new Error('Hiatus start cannot be before the debut date');
  }
  if (input.hiatusStartDate && input.hiatusEndDate && compareISODate(input.hiatusEndDate, input.hiatusStartDate) < 0) {
    throw new Error('Hiatus end cannot be before the Hiatus start');
  }
  if (input.endDate && input.hiatusStartDate && compareISODate(input.hiatusStartDate, input.endDate) > 0) {
    throw new Error('Hiatus start cannot be after the Grad date');
  }
  if (input.endDate && input.hiatusEndDate && compareISODate(input.hiatusEndDate, input.endDate) > 0) {
    throw new Error('Hiatus end cannot be after the Grad date');
  }

  const periods: MembershipPeriodDraft[] = [];
  if (!input.hiatusStartDate) {
    periods.push({ status: 'active', startDate: input.startDate, endDate: input.endDate });
  } else {
    periods.push({ status: 'active', startDate: input.startDate, endDate: input.hiatusStartDate });
    periods.push({
      status: 'hiatus',
      startDate: input.hiatusStartDate,
      endDate: input.hiatusEndDate ?? input.endDate,
    });
    if (input.hiatusEndDate && (!input.endDate || compareISODate(input.hiatusEndDate, input.endDate) < 0)) {
      periods.push({ status: 'active', startDate: input.hiatusEndDate, endDate: input.endDate });
    }
  }

  const validation = validateMembershipPeriods({
    status: input.status,
    startDate: input.startDate,
    endDate: input.endDate,
    periods,
  });
  if (!validation.ok) throw new Error(validation.error ?? 'The repaired membership timeline is invalid');
  return periods;
}

export function validateCurrentMembershipStart(startDate: string, today: string): ValidationResult {
  if (!isValidISODate(startDate)) {
    return { ok: false, error: 'Current membership debut date must be a valid YYYY-MM-DD date' };
  }
  if (!isValidISODate(today)) return { ok: false, error: 'Today must be a valid YYYY-MM-DD date' };
  if (compareISODate(startDate, today) > 0) {
    return { ok: false, error: 'Current membership debut date cannot be in the future' };
  }
  return { ok: true };
}

export function validateMembershipPeriods(input: TimelineInput): ValidationResult {
  if (!isValidISODate(input.startDate)) return { ok: false, error: 'Membership debut date is invalid' };
  if (input.endDate && !isValidISODate(input.endDate)) return { ok: false, error: 'Membership Grad date is invalid' };
  if (input.periods.length === 0) return { ok: false, error: 'Membership timeline has no status periods' };
  if (input.periods[0].startDate !== input.startDate) {
    return { ok: false, error: 'The first status period must start on the membership debut date' };
  }

  for (const [index, current] of input.periods.entries()) {
    if (!isValidISODate(current.startDate)) {
      return { ok: false, error: `Status period ${index + 1} has an invalid start date` };
    }
    if (current.endDate && !isValidISODate(current.endDate)) {
      return { ok: false, error: `Status period ${index + 1} has an invalid end date` };
    }
    if (current.endDate && compareISODate(current.endDate, current.startDate) < 0) {
      return { ok: false, error: `Status period ${index + 1} ends before it starts` };
    }
    if (index < input.periods.length - 1 && !current.endDate) {
      return { ok: false, error: `Only the latest status period may be open` };
    }

    const next = input.periods[index + 1];
    if (!next) continue;
    if (current.status === next.status) {
      return { ok: false, error: `Adjacent status periods must alternate` };
    }
    if (current.endDate !== next.startDate) {
      return { ok: false, error: `Status periods ${index + 1} and ${index + 2} must share one boundary date` };
    }
  }

  const latest = input.periods[input.periods.length - 1];
  if (input.status === 'grad') {
    if (!input.endDate) return { ok: false, error: 'A Grad membership must have a Grad date' };
    if (latest.endDate !== input.endDate) {
      return { ok: false, error: 'The latest status period must end on the Grad date' };
    }
  } else {
    if (input.endDate) return { ok: false, error: 'A current membership cannot have a Grad date' };
    if (latest.endDate) return { ok: false, error: 'The latest current status period must be open' };
    if (latest.status !== input.status) {
      return { ok: false, error: 'Membership summary status must match its latest period' };
    }
  }
  return { ok: true };
}

export function applyMembershipTransition(input: TransitionInput): MembershipTransitionResult {
  if (!isValidISODate(input.boundaryDate)) throw new Error('Status boundary must be a valid YYYY-MM-DD date');
  if (input.currentStatus === 'grad') throw new Error('A Grad membership cannot be reactivated; add a new membership');
  if (input.nextStatus === input.currentStatus) throw new Error('Membership status is already selected');
  if (input.periods.length === 0) throw new Error('Membership timeline has no status periods');

  const periods = input.periods.map((item) => ({ ...item }));
  const latest = periods[periods.length - 1];
  if (latest.endDate) throw new Error('The latest current status period must be open');
  if (latest.status !== input.currentStatus) throw new Error('Membership summary status does not match its timeline');
  if (compareISODate(input.boundaryDate, latest.startDate) < 0) {
    throw new Error('Status boundary cannot be before the latest period start');
  }
  latest.endDate = input.boundaryDate;

  if (input.nextStatus === 'grad') {
    return { status: 'grad', endDate: input.boundaryDate, periods };
  }

  periods.push({ status: input.nextStatus, startDate: input.boundaryDate, endDate: null });
  return { status: input.nextStatus, endDate: null, periods };
}

export function moveMembershipBoundary(
  periods: MembershipPeriodDraft[],
  rightPeriodIndex: number,
  boundaryDate: string,
): MembershipPeriodDraft[] {
  if (!Number.isInteger(rightPeriodIndex) || rightPeriodIndex <= 0 || rightPeriodIndex >= periods.length) {
    throw new Error('A shared boundary must have a period on both sides');
  }
  if (!isValidISODate(boundaryDate)) throw new Error('Status boundary must be a valid YYYY-MM-DD date');

  const next = periods.map((item) => ({ ...item }));
  const left = next[rightPeriodIndex - 1];
  const right = next[rightPeriodIndex];
  if (compareISODate(boundaryDate, left.startDate) < 0) {
    throw new Error('Status boundary cannot be before the previous period');
  }
  if (right.endDate && compareISODate(boundaryDate, right.endDate) > 0) {
    throw new Error('Status boundary cannot be after the next period');
  }
  left.endDate = boundaryDate;
  right.startDate = boundaryDate;
  return next;
}

export function deriveGlobalIdolStatus(
  memberships: readonly Pick<{ status: MembershipStatus }, 'status'>[],
): IdolStatus {
  if (memberships.some((membership) => membership.status === 'active')) return 'active';
  if (memberships.some((membership) => membership.status === 'hiatus')) return 'hiatus';
  return 'inactive';
}

export function validateSameGroupEpisodeOverlap(input: {
  episode: EpisodeRange;
  siblings: EpisodeRange[];
}): ValidationResult {
  const episodeEnd = input.episode.endDate ?? '9999-12-31';
  for (const sibling of input.siblings) {
    if (sibling.id && sibling.id === input.episode.id) continue;
    if (sibling.groupId !== input.episode.groupId) continue;
    const siblingEnd = sibling.endDate ?? '9999-12-31';
    const overlaps = compareISODate(input.episode.startDate, siblingEnd) <= 0
      && compareISODate(sibling.startDate, episodeEnd) <= 0;
    if (overlaps) return { ok: false, error: 'Membership episodes in the same group cannot overlap' };
  }
  return { ok: true };
}
