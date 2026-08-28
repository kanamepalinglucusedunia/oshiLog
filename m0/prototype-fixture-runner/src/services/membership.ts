import type { GroupMembership } from '@/types/domain';
import { compareISODate } from '@/utils/date';

/**
 * A membership is active on a date when:
 *   startDate <= eventDate  AND  (endDate is empty OR eventDate <= endDate)
 */
export function isMembershipActiveOn(membership: Pick<GroupMembership, 'startDate' | 'endDate'>, date: string): boolean {
  if (compareISODate(membership.startDate, date) > 0) return false;
  if (membership.endDate && compareISODate(date, membership.endDate) > 0) return false;
  return true;
}

export interface MembershipPickerOption {
  key: string;
  idolId: string;
  groupMembershipId: string | null;
  groupId: string | null;
  groupName: string | null;
  label: string;
}

export interface PickerOptionInput {
  idolId: string;
  idolName: string;
  memberships: (Pick<GroupMembership, 'id' | 'groupId' | 'startDate' | 'endDate'> & { name?: string | null; groupName?: string | null })[];
}

export interface MembershipDisplayLike {
  id?: string;
  name: string | null;
  startDate: string;
  endDate: string | null;
  isMain: boolean;
  groupName?: string | null;
  memberColor?: string | null;
  status?: GroupMembership['status'];
}

/**
 * Ladder pick over memberships active on a date:
 *   0 active → null
 *   1 active → that membership
 *   2+ active → the Main membership, or null when none is flagged Main.
 */
export function pickDisplayMembership(memberships: MembershipDisplayLike[], date: string): MembershipDisplayLike | null {
  const active = memberships.filter((m) => m.status !== 'grad' && isMembershipActiveOn(m, date));
  if (active.length === 0) return null;
  if (active.length === 1) return active[0];
  return active.find((m) => m.isMain) ?? null;
}

/**
 * Resolves the idol's display name on a date using the ladder:
 *   no membership picked → global idol name (Solo identity)
 *   one picked           → that membership's per-group name
 */
export function resolveIdolDisplayName(
  idolName: string,
  memberships: (Pick<GroupMembership, 'id' | 'startDate' | 'endDate' | 'name' | 'isMain'>)[],
  date: string,
): string {
  const picked = pickDisplayMembership(memberships, date);
  return picked?.name || idolName;
}

/**
 * Builds Cheki Entry picker options for one idol on a date.
 * - One option per membership active on that date, labeled with the
 *   membership's per-group name (falling back to the global idol name).
 * - If the idol has no active membership, a single "Solo" option is returned.
 * - An idol active in two groups appears twice with different group labels.
 */
export function buildMembershipPickerOptions(input: PickerOptionInput, date: string): MembershipPickerOption[] {
  const active = input.memberships.filter((m) => isMembershipActiveOn(m, date));
  if (active.length === 0) {
    return [
      {
        key: `solo-${input.idolId}`,
        idolId: input.idolId,
        groupMembershipId: null,
        groupId: null,
        groupName: null,
        label: `${input.idolName} (Solo)`,
      },
    ];
  }
  return active.map((m) => {
    const displayName = m.name || input.idolName;
    return {
      key: `m-${m.id}`,
      idolId: input.idolId,
      groupMembershipId: m.id,
      groupId: m.groupId,
      groupName: m.groupName ?? null,
      label: m.groupName ? `${displayName} · ${m.groupName}` : displayName,
    };
  });
}
