import { withSavepointSync } from '@/db/transaction';
import type { SqliteLike } from '@/db/types';
import {
  createIdolRepo,
  type ChekiTypeInput,
  type IdolInput,
  type MembershipInput,
  type MembershipStatusPeriodInput,
} from '@/repositories/idol';
import type { GroupMembership } from '@/types/domain';
import { todayISO } from '@/utils/date';
import { invalidateQueries, withQueryInvalidationBatch } from '@/utils/queryCache';
import { findAffectedEntries, validateMembershipForm } from './membershipGuard';
import {
  applyMembershipTransition,
  deriveGlobalIdolStatus,
  validateCurrentMembershipStart,
} from './membershipTimeline';

export interface IdolAggregateMembership extends Omit<MembershipInput, 'idolId'> {
  id?: string;
  periods?: MembershipStatusPeriodInput[];
}

export interface IdolAggregateChekiType extends Omit<ChekiTypeInput, 'idolId' | 'isArchived'> {
  id?: string;
}

export interface SaveIdolAggregateInput {
  existingId?: string;
  core: IdolInput;
  memberships: IdolAggregateMembership[];
  /** Membership episodes explicitly removed by the current-only editor. Omitted history is preserved. */
  removedMembershipIds?: string[];
  chekiTypes: IdolAggregateChekiType[];
  /** Explicit entry-id → replacement membership, or null to keep the entry Solo. */
  reassignments: Record<string, string | null>;
}

function resolveUpdatedPeriods(
  current: GroupMembership,
  persisted: MembershipStatusPeriodInput[],
  input: IdolAggregateMembership,
): MembershipStatusPeriodInput[] {
  if (input.periods) return input.periods;
  if (persisted.length === 0) throw new Error('Membership history needs repair before its status can be changed');

  const nextStatus = input.status ?? current.status;
  if (nextStatus !== current.status) {
    const boundaryDate = nextStatus === 'hiatus'
      ? input.hiatusStartDate
      : nextStatus === 'active'
        ? input.hiatusEndDate
        : input.endDate;
    if (!boundaryDate) throw new Error(`A ${nextStatus === 'grad' ? 'Grad' : 'status'} date is required`);
    return applyMembershipTransition({
      periods: persisted,
      currentStatus: current.status,
      nextStatus,
      boundaryDate,
    }).periods;
  }

  const periods = persisted.map((period) => ({ ...period }));
  if (input.startDate !== current.startDate) periods[0].startDate = input.startDate;
  if (nextStatus === 'grad' && input.endDate !== undefined) {
    periods[periods.length - 1].endDate = input.endDate ?? null;
  }
  return periods;
}

export function saveIdolAggregate(db: SqliteLike, input: SaveIdolAggregateInput): string {
  const repo = createIdolRepo(db);
  let idolId = input.existingId ?? '';

  return withQueryInvalidationBatch(() => {
    withSavepointSync(db, () => {
      const currentChekiTypeIds = new Set(input.chekiTypes.flatMap((type) => type.id ? [type.id] : []));

      const guardedEntries = new Map<string, { membershipId: string; target: string | null }>();
      for (const membership of input.memberships) {
        const validation = validateMembershipForm({
          startDate: membership.startDate,
          endDate: membership.endDate ?? null,
          status: membership.status ?? 'active',
          hiatusStartDate: membership.hiatusStartDate ?? null,
          hiatusEndDate: membership.hiatusEndDate ?? null,
        });
        if (!validation.ok) throw new Error(validation.error ?? 'Invalid membership');
        if ((membership.status ?? 'active') !== 'grad') {
          const debutValidation = validateCurrentMembershipStart(membership.startDate, todayISO());
          if (!debutValidation.ok) throw new Error(debutValidation.error);
        }

        if (membership.id) {
          const current = repo.getMembership(membership.id);
          if (!current) throw new Error(`Membership not found: ${membership.id}`);
          const datesChanged = current.startDate !== membership.startDate || current.endDate !== (membership.endDate ?? null);
          if (datesChanged) {
            for (const entry of findAffectedEntries(db, membership.id, {
              startDate: membership.startDate,
              endDate: membership.endDate ?? null,
            })) {
              if (!Object.prototype.hasOwnProperty.call(input.reassignments, entry.entryId)) {
                throw new Error(`A reassignment decision is required for Cheki Entry ${entry.entryId}`);
              }
              guardedEntries.set(entry.entryId, { membershipId: membership.id, target: input.reassignments[entry.entryId] });
            }
          }
        }
      }

      const idol = input.existingId
        ? repo.updateIdol(input.existingId, input.core)
        : repo.createIdol(input.core);
      idolId = idol.id;

      for (const membership of input.memberships) {
        const { periods: submittedPeriods, ...membershipFields } = membership;
        const payload: MembershipInput = { ...membershipFields, idolId };
        if (membership.id) {
          const current = repo.getMembership(membership.id);
          if (!current || current.idolId !== idolId) throw new Error(`Membership not found: ${membership.id}`);
          const periods = resolveUpdatedPeriods(
            current,
            repo.listMembershipStatusPeriods(membership.id),
            { ...membership, periods: submittedPeriods },
          );
          const nextStatus = membership.status ?? current.status;
          repo.updateMembership(membership.id, {
            ...payload,
            endDate: nextStatus === 'grad' ? membership.endDate ?? current.endDate : null,
            isMain: nextStatus === 'grad' ? false : membership.isMain,
          });
          repo.replaceMembershipStatusPeriods(membership.id, periods);
        } else {
          const created = repo.createMembership(payload);
          if (submittedPeriods) repo.replaceMembershipStatusPeriods(created.id, submittedPeriods);
        }
      }

      for (const membershipId of input.removedMembershipIds ?? []) {
        const membership = repo.getMembership(membershipId);
        if (!membership || membership.idolId !== idolId) throw new Error(`Membership not found: ${membershipId}`);
        repo.deleteMembership(membershipId);
      }

      const currentMemberships = repo.listCurrentMembershipsWithGroupName(idolId);
      if (currentMemberships.length === 1 && !currentMemberships[0].isMain) {
        repo.updateMembership(currentMemberships[0].id, { isMain: true });
        currentMemberships[0].isMain = true;
      }
      if (currentMemberships.length > 1 && currentMemberships.filter((membership) => membership.isMain).length !== 1) {
        throw new Error('Exactly one current membership must be marked as Main');
      }
      repo.updateIdol(idolId, { status: deriveGlobalIdolStatus(currentMemberships) });

      for (const [index, type] of input.chekiTypes.entries()) {
        const isDefault = input.existingId ? type.isDefault : index === 0;
        if (type.id) repo.updateChekiType(type.id, { label: type.label, isDefault });
        else currentChekiTypeIds.add(repo.createChekiType({ ...type, idolId, isDefault }).id);
      }
      for (const existing of repo.listChekiTypes(idolId, true)) {
        if (!currentChekiTypeIds.has(existing.id)) repo.deleteChekiType(existing.id);
      }

      const now = new Date().toISOString();
      for (const [entryId, decision] of guardedEntries) {
        if (decision.target) {
          const target = repo.getMembership(decision.target);
          if (!target || target.idolId !== idolId) {
            throw new Error(`Invalid reassignment target for Cheki Entry ${entryId}`);
          }
        }
        db.runSync(
          `UPDATE cheki_entry SET group_membership_id = ?, updated_at = ?
           WHERE id = ? AND group_membership_id = ? AND deleted_at IS NULL`,
          decision.target,
          now,
          entryId,
          decision.membershipId,
        );
      }
    });

    invalidateQueries(db);
    return idolId;
  });
}
