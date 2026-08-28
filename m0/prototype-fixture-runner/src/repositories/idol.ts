import type { SqliteLike } from '@/db/types';
import { withSavepointSync } from '@/db/transaction';
import type {
  ChekiType,
  CountryCode,
  CurrencyCode,
  Group,
  GroupMembership,
  GroupMembershipStatusPeriod,
  Idol,
  IdolNameHistory,
  IdolStatus,
  MemberColor,
  MembershipPeriodStatus,
  MembershipStatus,
} from '@/types/domain';
import { nowUTCISO } from '@/utils/date';
import { uuid } from '@/utils/id';
import { cachedQuery, invalidateQueries } from '@/utils/queryCache';
import { validateMembershipPeriods, validateSameGroupEpisodeOverlap } from '@/services/membershipTimeline';
import type { IdolGroupSort } from '@/services/mainListSort';
import type { PageCursor } from './cursor';

const AUDIT_INSERT = (now: string) => `schema_version, created_at, updated_at`;

export interface IdolInput {
  name: string;
  country: CountryCode;
  region?: string | null;
  birthDate?: string | null;
  memberColor?: string | null;
  status: IdolStatus;
  isFavorite?: boolean;
  notes?: string | null;
  photoMediaId?: string | null;
  xProfileUrl?: string | null;
  instagramProfileUrl?: string | null;
  tiktokProfileUrl?: string | null;
}

export interface GroupInput {
  name: string;
  country: CountryCode;
  region?: string | null;
  debutDate?: string | null;
  endDate?: string | null;
  isFavorite?: boolean;
  notes?: string | null;
  photoMediaId?: string | null;
  xProfileUrl?: string | null;
  instagramProfileUrl?: string | null;
  tiktokProfileUrl?: string | null;
}

export interface MembershipInput {
  idolId: string;
  groupId: string;
  startDate: string;
  endDate?: string | null;
  name?: string | null;
  memberColor?: string | null;
  status?: MembershipStatus;
  hiatusStartDate?: string | null;
  hiatusEndDate?: string | null;
  isMain?: boolean;
}

export interface MembershipStatusPeriodInput {
  id?: string;
  status: MembershipPeriodStatus;
  startDate: string;
  endDate: string | null;
}

export interface ChekiTypeInput {
  idolId: string;
  label: string;
  currency: CurrencyCode;
  unitPrice: number;
  isArchived?: boolean;
  isDefault?: boolean;
}

export interface IdolFilters {
  q?: string;
  status?: string; // 'all' | IdolStatus
  country?: string; // 'all' or country name
  region?: string; // 'all' or region
  group?: string; // 'all' or group name
  favoritesOnly?: boolean;
  includeArchived?: boolean;
}

export interface GroupFilters {
  q?: string;
  country?: string;
  region?: string;
}

export interface IdolPageArgs {
  filters?: IdolFilters;
  sort?: IdolGroupSort;
  limit?: number;
  cursor?: PageCursor;
}

export interface GroupPageArgs {
  filters?: GroupFilters;
  sort?: IdolGroupSort;
  limit?: number;
  cursor?: PageCursor;
}

const IDOL_COLS = `
  id, name, photo_media_id AS photoMediaId, x_profile_url AS xProfileUrl,
  instagram_profile_url AS instagramProfileUrl, tiktok_profile_url AS tiktokProfileUrl,
  country, region, birth_date AS birthDate,
  member_color AS memberColor, status, is_favorite AS isFavorite, notes,
  schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
`;

const GROUP_COLS = `
  id, name, photo_media_id AS photoMediaId, x_profile_url AS xProfileUrl,
  instagram_profile_url AS instagramProfileUrl, tiktok_profile_url AS tiktokProfileUrl,
  country, region, debut_date AS debutDate, end_date AS endDate,
  is_favorite AS isFavorite, notes,
  schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
`;

const MEMBERSHIP_COLS = `
  id, idol_id AS idolId, group_id AS groupId, start_date AS startDate, end_date AS endDate,
  name, member_color AS memberColor, status, hiatus_start_date AS hiatusStartDate,
  hiatus_end_date AS hiatusEndDate, is_main AS isMain,
  schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
`;

const MEMBERSHIP_PERIOD_COLS = `
  id, group_membership_id AS groupMembershipId, status, start_date AS startDate, end_date AS endDate,
  schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
`;

const MEMBER_COLOR_COLS = `
  id, name, hex,
  schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
`;

const CHEKI_TYPE_COLS = `
  id, idol_id AS idolId, label, currency, unit_price AS unitPrice, is_archived AS isArchived, is_default AS isDefault,
  schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
`;

const NAME_HISTORY_COLS = `
  id, idol_id AS idolId, group_membership_id AS groupMembershipId, name, effective_at AS effectiveAt,
  schema_version AS schemaVersion, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
`;

const GM_BASE = `
  gm.id, gm.idol_id AS idolId, gm.group_id AS groupId, gm.start_date AS startDate, gm.end_date AS endDate,
  gm.name, gm.member_color AS memberColor, gm.status, gm.hiatus_start_date AS hiatusStartDate,
  gm.hiatus_end_date AS hiatusEndDate, gm.is_main AS isMain,
  gm.schema_version AS schemaVersion, gm.created_at AS createdAt, gm.updated_at AS updatedAt, gm.deleted_at AS deletedAt
`;

const mapMembership = <T extends GroupMembership>(r: T): T => ({ ...r, isMain: !!r.isMain });

function demoteOverlappingMainMemberships(
  db: SqliteLike,
  idolId: string,
  exceptId: string,
  startDate: string,
  endDate: string | null,
  now: string,
): void {
  db.runSync(
    `UPDATE group_membership SET is_main = 0, updated_at = ?
     WHERE idol_id = ? AND id != ? AND is_main = 1 AND deleted_at IS NULL
       AND start_date <= COALESCE(?, '9999-12-31')
       AND ? <= COALESCE(end_date, '9999-12-31')`,
    now,
    idolId,
    exceptId,
    endDate,
    startDate,
  );
}

export function createIdolRepo(db: SqliteLike) {
  const mapIdol = (r: Idol): Idol => ({ ...r, isFavorite: !!r.isFavorite });
  const mapGroup = (r: Group): Group => ({ ...r, isFavorite: !!r.isFavorite });
  const mapChekiType = (r: ChekiType): ChekiType => ({ ...r, isArchived: !!r.isArchived, isDefault: !!r.isDefault });

  function hasMembershipPeriodTable(): boolean {
    return !!db.getFirstSync<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'group_membership_status_period'`,
    );
  }

  function buildInitialStatusPeriods(
    input: MembershipInput,
    status: MembershipStatus,
  ): MembershipStatusPeriodInput[] {
    const hiatusStartDate = input.hiatusStartDate ?? null;
    const hiatusEndDate = input.hiatusEndDate ?? null;
    if (!!hiatusEndDate && !hiatusStartDate) throw new Error('Hiatus end requires a Hiatus start date');
    if (status === 'hiatus' && !hiatusStartDate) throw new Error('A Hiatus membership requires a Hiatus start date');

    if (!hiatusStartDate) {
      return [{ status: 'active', startDate: input.startDate, endDate: status === 'grad' ? input.endDate ?? null : null }];
    }

    const periods: MembershipStatusPeriodInput[] = [
      { status: 'active', startDate: input.startDate, endDate: hiatusStartDate },
    ];
    if (!hiatusEndDate) {
      periods.push({ status: 'hiatus', startDate: hiatusStartDate, endDate: status === 'grad' ? input.endDate ?? null : null });
      return periods;
    }

    periods.push({ status: 'hiatus', startDate: hiatusStartDate, endDate: hiatusEndDate });
    if (!input.endDate || hiatusEndDate < input.endDate) {
      periods.push({ status: 'active', startDate: hiatusEndDate, endDate: status === 'grad' ? input.endDate ?? null : null });
    }
    return periods;
  }

  function insertMembershipStatusPeriods(
    membershipId: string,
    periods: MembershipStatusPeriodInput[],
    now: string,
  ): void {
    for (const item of periods) {
      db.runSync(
        `INSERT INTO group_membership_status_period (
          id, group_membership_id, status, start_date, end_date,
          schema_version, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
        item.id ?? uuid(),
        membershipId,
        item.status,
        item.startDate,
        item.endDate,
        now,
        now,
      );
    }
  }

  function recordNameHistory(idolId: string, groupMembershipId: string | null, name: string, effectiveAt: string, now: string): void {
    db.runSync(
      `INSERT INTO idol_name_history (id, idol_id, group_membership_id, name, effective_at,
        schema_version, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      uuid(),
      idolId,
      groupMembershipId,
      name.trim(),
      effectiveAt,
      now,
      now,
    );
  }

  function listIdolNameHistory(idolId: string): IdolNameHistory[] {
    return db.getAllSync<IdolNameHistory>(
      `SELECT ${NAME_HISTORY_COLS} FROM idol_name_history
       WHERE idol_id = ? AND deleted_at IS NULL ORDER BY effective_at DESC, created_at DESC`,
      idolId,
    );
  }

  // --- Idol ---

  function listIdols(includeArchived = false): Idol[] {
    return cachedQuery(db, `idol:list:${includeArchived ? 1 : 0}`, () => {
      const rows = db.getAllSync<Idol>(`
        SELECT ${IDOL_COLS} FROM idol
        WHERE deleted_at IS NULL AND (? = 1 OR status != 'inactive')
        ORDER BY is_favorite DESC, name COLLATE NOCASE
      `, includeArchived ? 1 : 0);
      return rows.map(mapIdol);
    });
  }

  function getIdol(id: string): Idol | null {
    const row = db.getFirstSync<Idol>(`SELECT ${IDOL_COLS} FROM idol WHERE id = ? AND deleted_at IS NULL`, id);
    return row ? mapIdol(row) : null;
  }

  function createIdol(input: IdolInput): Idol {
    const now = nowUTCISO();
    const id = uuid();
    withSavepointSync(db, () => {
      db.runSync(
        `INSERT INTO idol (id, name, photo_media_id, x_profile_url, instagram_profile_url, tiktok_profile_url,
          country, region, birth_date, member_color, status, is_favorite, notes, ${AUDIT_INSERT(now)}, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
        id,
        input.name,
        input.photoMediaId ?? null,
        input.xProfileUrl ?? null,
        input.instagramProfileUrl ?? null,
        input.tiktokProfileUrl ?? null,
        input.country,
        input.region ?? null,
        input.birthDate ?? null,
        input.memberColor ?? null,
        input.status,
        input.isFavorite ? 1 : 0,
        input.notes ?? null,
        now,
        now,
      );
      recordNameHistory(id, null, input.name, now, now);
    });
    invalidateQueries(db);
    return getIdol(id)!;
  }

  function updateIdol(id: string, input: Partial<IdolInput>): Idol {
    const current = getIdol(id);
    if (!current) throw new Error(`Idol not found: ${id}`);
    const now = nowUTCISO();
    withSavepointSync(db, () => {
      db.runSync(
        `UPDATE idol SET name = ?, photo_media_id = ?, x_profile_url = ?, instagram_profile_url = ?,
          tiktok_profile_url = ?, country = ?, region = ?, birth_date = ?, member_color = ?, status = ?,
          is_favorite = ?, notes = ?, updated_at = ? WHERE id = ?`,
        input.name ?? current.name,
        input.photoMediaId !== undefined ? input.photoMediaId : current.photoMediaId,
        input.xProfileUrl !== undefined ? input.xProfileUrl : current.xProfileUrl,
        input.instagramProfileUrl !== undefined ? input.instagramProfileUrl : current.instagramProfileUrl,
        input.tiktokProfileUrl !== undefined ? input.tiktokProfileUrl : current.tiktokProfileUrl,
        input.country ?? current.country,
        input.region !== undefined ? input.region : current.region,
        input.birthDate !== undefined ? input.birthDate : current.birthDate,
        input.memberColor !== undefined ? input.memberColor : current.memberColor,
        input.status ?? current.status,
        input.isFavorite !== undefined ? (input.isFavorite ? 1 : 0) : current.isFavorite ? 1 : 0,
        input.notes !== undefined ? input.notes : current.notes,
        now,
        id,
      );
      if (input.name !== undefined && input.name.trim() !== current.name) {
        recordNameHistory(id, null, input.name, now, now);
      }
    });
    invalidateQueries(db);
    return getIdol(id)!;
  }

  function deleteIdol(id: string): void {
    const now = nowUTCISO();
    withSavepointSync(db, () => {
      db.runSync(`UPDATE group_membership SET deleted_at = ?, updated_at = ? WHERE idol_id = ? AND deleted_at IS NULL`, now, now, id);
      db.runSync(`UPDATE cheki_type SET deleted_at = ?, updated_at = ? WHERE idol_id = ? AND deleted_at IS NULL`, now, now, id);
      db.runSync(`UPDATE idol_name_history SET deleted_at = ?, updated_at = ? WHERE idol_id = ? AND deleted_at IS NULL`, now, now, id);
      db.runSync(`UPDATE idol SET deleted_at = ?, updated_at = ? WHERE id = ?`, now, now, id);
    });
    invalidateQueries(db);
  }

  // --- Group ---

  function listGroups(): Group[] {
    return cachedQuery(db, 'group:list', () => {
      const rows = db.getAllSync<Group>(`SELECT ${GROUP_COLS} FROM groups WHERE deleted_at IS NULL ORDER BY is_favorite DESC, name COLLATE NOCASE`);
      return rows.map(mapGroup);
    });
  }

  function getGroup(id: string): Group | null {
    const row = db.getFirstSync<Group>(`SELECT ${GROUP_COLS} FROM groups WHERE id = ? AND deleted_at IS NULL`, id);
    return row ? mapGroup(row) : null;
  }

  function createGroup(input: GroupInput): Group {
    const now = nowUTCISO();
    const id = uuid();
    db.runSync(
      `INSERT INTO groups (id, name, photo_media_id, x_profile_url, instagram_profile_url, tiktok_profile_url,
        country, region, debut_date, end_date, is_favorite, notes, ${AUDIT_INSERT(now)}, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
      id,
      input.name,
      input.photoMediaId ?? null,
      input.xProfileUrl ?? null,
      input.instagramProfileUrl ?? null,
      input.tiktokProfileUrl ?? null,
      input.country,
      input.region ?? null,
      input.debutDate ?? null,
      input.endDate ?? null,
      input.isFavorite ? 1 : 0,
      input.notes ?? null,
      now,
      now,
    );
    invalidateQueries(db);
    return getGroup(id)!;
  }

  function updateGroup(id: string, input: Partial<GroupInput>): Group {
    const current = getGroup(id);
    if (!current) throw new Error(`Group not found: ${id}`);
    const now = nowUTCISO();
    db.runSync(
      `UPDATE groups SET name = ?, photo_media_id = ?, x_profile_url = ?, instagram_profile_url = ?,
        tiktok_profile_url = ?, country = ?, region = ?, debut_date = ?, end_date = ?, is_favorite = ?,
        notes = ?, updated_at = ? WHERE id = ?`,
      input.name ?? current.name,
      input.photoMediaId !== undefined ? input.photoMediaId : current.photoMediaId,
      input.xProfileUrl !== undefined ? input.xProfileUrl : current.xProfileUrl,
      input.instagramProfileUrl !== undefined ? input.instagramProfileUrl : current.instagramProfileUrl,
      input.tiktokProfileUrl !== undefined ? input.tiktokProfileUrl : current.tiktokProfileUrl,
      input.country ?? current.country,
      input.region !== undefined ? input.region : current.region,
      input.debutDate !== undefined ? input.debutDate : current.debutDate,
      input.endDate !== undefined ? input.endDate : current.endDate,
      input.isFavorite !== undefined ? (input.isFavorite ? 1 : 0) : current.isFavorite ? 1 : 0,
      input.notes !== undefined ? input.notes : current.notes,
      now,
      id,
    );
    invalidateQueries(db);
    return getGroup(id)!;
  }

  function deleteGroup(id: string): void {
    db.runSync(`UPDATE groups SET deleted_at = ?, updated_at = ? WHERE id = ?`, nowUTCISO(), nowUTCISO(), id);
    invalidateQueries(db);
  }

  // --- Membership ---

  function listMembershipsByGroup(groupId: string): GroupMembership[] {
    const rows = db.getAllSync<GroupMembership>(
      `SELECT ${MEMBERSHIP_COLS} FROM group_membership WHERE group_id = ? AND deleted_at IS NULL ORDER BY start_date`,
      groupId,
    );
    return rows.map(mapMembership);
  }

  function listMembershipsByGroupJoined(groupId: string): (GroupMembership & { idolName: string; idolStatus: string; idolCountry: string })[] {
    return db.getAllSync<GroupMembership & { idolName: string; idolStatus: string; idolCountry: string }>(
      `SELECT ${GM_BASE},
        COALESCE(gm.name, i.name) AS idolName, i.status AS idolStatus, i.country AS idolCountry
       FROM group_membership gm JOIN idol i ON i.id = gm.idol_id
       WHERE gm.group_id = ? AND gm.deleted_at IS NULL ORDER BY gm.start_date`,
      groupId,
    ).map(mapMembership);
  }

  function listMembershipsByGroupFormers(groupId: string): (GroupMembership & { idolName: string })[] {
    return db.getAllSync<GroupMembership & { idolName: string }>(
      `SELECT ${GM_BASE}, COALESCE(gm.name, i.name) AS idolName
       FROM group_membership gm JOIN idol i ON i.id = gm.idol_id
       WHERE gm.group_id = ? AND gm.deleted_at IS NULL AND gm.status = 'grad'
       ORDER BY gm.end_date DESC`,
      groupId,
    ).map(mapMembership);
  }

  function listMembershipsByGroupActive(groupId: string): (GroupMembership & { idolName: string })[] {
    const today = new Date().toISOString().slice(0, 10);
    return db.getAllSync<GroupMembership & { idolName: string }>(
      `SELECT ${GM_BASE}, COALESCE(gm.name, i.name) AS idolName
       FROM group_membership gm JOIN idol i ON i.id = gm.idol_id
       WHERE gm.group_id = ? AND gm.deleted_at IS NULL
         AND gm.status IN ('active', 'hiatus') AND gm.start_date <= ?
       ORDER BY gm.start_date ASC, gm.created_at ASC`,
      groupId,
      today,
    ).map(mapMembership);
  }

  function listMembershipsByGroupAll(groupId: string): (GroupMembership & { idolName: string })[] {
    return db.getAllSync<GroupMembership & { idolName: string }>(
      `SELECT ${GM_BASE}, COALESCE(gm.name, i.name) AS idolName
       FROM group_membership gm JOIN idol i ON i.id = gm.idol_id
       WHERE gm.group_id = ? AND gm.deleted_at IS NULL ORDER BY i.name COLLATE NOCASE`,
      groupId,
    ).map(mapMembership);
  }

  function listMembershipsByGroupAllWithGroupName(idolId: string): (GroupMembership & { groupName: string })[] {
    return db.getAllSync<GroupMembership & { groupName: string }>(
      `SELECT ${GM_BASE}, g.name AS groupName
       FROM group_membership gm JOIN groups g ON g.id = gm.group_id
       WHERE gm.idol_id = ? AND gm.deleted_at IS NULL ORDER BY gm.start_date`,
      idolId,
    ).map(mapMembership);
  }

  function listCurrentMembershipsWithGroupName(idolId: string): (GroupMembership & { groupName: string })[] {
    return db.getAllSync<GroupMembership & { groupName: string }>(
      `SELECT ${GM_BASE}, g.name AS groupName
       FROM group_membership gm JOIN groups g ON g.id = gm.group_id
       WHERE gm.idol_id = ? AND gm.deleted_at IS NULL AND gm.status IN ('active', 'hiatus')
       ORDER BY gm.is_main DESC, gm.start_date ASC, gm.created_at ASC`,
      idolId,
    ).map(mapMembership);
  }

  function listMembershipsByGroupAllWithGroupNameAsc(idolId: string): (GroupMembership & { groupName: string })[] {
    return db.getAllSync<GroupMembership & { groupName: string }>(
      `SELECT ${GM_BASE}, g.name AS groupName
       FROM group_membership gm JOIN groups g ON g.id = gm.group_id
       WHERE gm.idol_id = ? AND gm.deleted_at IS NULL ORDER BY g.name COLLATE NOCASE`,
      idolId,
    ).map(mapMembership);
  }

  /**
   * All non-deleted memberships with their group names in a single query.
   * Used by the Event form to build per-date picker options without querying
   * once per idol.
   */
  function listAllMembershipsWithGroupName(): (GroupMembership & { groupName: string })[] {
    return cachedQuery(db, 'membership:all', () =>
      db.getAllSync<GroupMembership & { groupName: string }>(
        `SELECT ${GM_BASE}, g.name AS groupName
         FROM group_membership gm JOIN groups g ON g.id = gm.group_id
         WHERE gm.deleted_at IS NULL ORDER BY gm.start_date`,
      ).map(mapMembership),
    );
  }

  function getMembership(id: string): GroupMembership | null {
    const row = db.getFirstSync<GroupMembership>(`SELECT ${MEMBERSHIP_COLS} FROM group_membership WHERE id = ? AND deleted_at IS NULL`, id);
    return row ? mapMembership(row) : null;
  }

  function listMembershipStatusPeriods(membershipId: string): GroupMembershipStatusPeriod[] {
    if (!hasMembershipPeriodTable()) return [];
    return db.getAllSync<GroupMembershipStatusPeriod>(
      `SELECT ${MEMBERSHIP_PERIOD_COLS}
       FROM group_membership_status_period
       WHERE group_membership_id = ? AND deleted_at IS NULL
       ORDER BY start_date ASC, created_at ASC`,
      membershipId,
    );
  }

  function listMembershipStatusPeriodsByIdol(idolId: string): GroupMembershipStatusPeriod[] {
    if (!hasMembershipPeriodTable()) return [];
    return db.getAllSync<GroupMembershipStatusPeriod>(
      `SELECT period.id, period.group_membership_id AS groupMembershipId, period.status,
        period.start_date AS startDate, period.end_date AS endDate,
        period.schema_version AS schemaVersion, period.created_at AS createdAt,
        period.updated_at AS updatedAt, period.deleted_at AS deletedAt
       FROM group_membership_status_period period
       JOIN group_membership gm ON gm.id = period.group_membership_id
       WHERE gm.idol_id = ? AND gm.deleted_at IS NULL AND period.deleted_at IS NULL
       ORDER BY period.group_membership_id, period.start_date ASC, period.created_at ASC`,
      idolId,
    );
  }

  function replaceMembershipStatusPeriods(
    membershipId: string,
    periods: MembershipStatusPeriodInput[],
  ): GroupMembershipStatusPeriod[] {
    const membership = getMembership(membershipId);
    if (!membership) throw new Error(`Membership not found: ${membershipId}`);
    const validation = validateMembershipPeriods({
      startDate: membership.startDate,
      endDate: membership.endDate,
      status: membership.status,
      periods,
    });
    if (!validation.ok) throw new Error(validation.error ?? 'Invalid membership timeline');

    const now = nowUTCISO();
    withSavepointSync(db, () => {
      const existingPeriods = listMembershipStatusPeriods(membershipId);
      const submittedExistingIds = new Set(periods.flatMap((item) => item.id ? [item.id] : []));
      for (const existing of existingPeriods) {
        if (!submittedExistingIds.has(existing.id)) {
          db.runSync(
            `UPDATE group_membership_status_period SET deleted_at = ?, updated_at = ? WHERE id = ?`,
            now,
            now,
            existing.id,
          );
        }
      }
      for (const item of periods) {
        if (item.id) {
          const existing = db.getFirstSync<{ id: string }>(
            `SELECT id FROM group_membership_status_period WHERE id = ? AND group_membership_id = ?`,
            item.id,
            membershipId,
          );
          if (!existing) throw new Error(`Membership status period not found: ${item.id}`);
          db.runSync(
            `UPDATE group_membership_status_period
             SET status = ?, start_date = ?, end_date = ?, updated_at = ?, deleted_at = NULL
             WHERE id = ? AND group_membership_id = ?`,
            item.status,
            item.startDate,
            item.endDate,
            now,
            item.id,
            membershipId,
          );
        } else {
          const id = uuid();
          insertMembershipStatusPeriods(membershipId, [{ ...item, id }], now);
        }
      }
    });
    invalidateQueries(db);
    return listMembershipStatusPeriods(membershipId);
  }

  function createMembership(input: MembershipInput): GroupMembership {
    const now = nowUTCISO();
    const id = uuid();
    const requestedStatus = input.status ?? 'active';
    const status: MembershipStatus = input.endDate
      ? 'grad'
      : requestedStatus === 'hiatus' && input.hiatusEndDate
        ? 'active'
        : requestedStatus;
    const periods = hasMembershipPeriodTable() ? buildInitialStatusPeriods(input, status) : [];
    const overlap = validateSameGroupEpisodeOverlap({
      episode: {
        id,
        groupId: input.groupId,
        startDate: input.startDate,
        endDate: status === 'grad' ? input.endDate ?? null : null,
      },
      siblings: listMembershipsByGroupAllWithGroupName(input.idolId),
    });
    if (!overlap.ok) throw new Error(overlap.error);
    if (periods.length > 0) {
      const validation = validateMembershipPeriods({
        startDate: input.startDate,
        endDate: status === 'grad' ? input.endDate ?? null : null,
        status,
        periods,
      });
      if (!validation.ok) throw new Error(validation.error ?? 'Invalid membership timeline');
    }
    withSavepointSync(db, () => {
      if (input.isMain) {
        demoteOverlappingMainMemberships(db, input.idolId, id, input.startDate, input.endDate ?? null, now);
      }
      db.runSync(
        `INSERT INTO group_membership (id, idol_id, group_id, start_date, end_date, name, member_color, status,
          hiatus_start_date, hiatus_end_date, is_main, ${AUDIT_INSERT(now)}, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
        id,
        input.idolId,
        input.groupId,
        input.startDate,
        status === 'grad' ? input.endDate ?? null : null,
        input.name ?? null,
        input.memberColor ?? null,
        status,
        input.hiatusStartDate ?? null,
        input.hiatusEndDate ?? null,
        input.isMain ? 1 : 0,
        now,
        now,
      );
      if (input.name?.trim()) {
        recordNameHistory(input.idolId, id, input.name, `${input.startDate}T00:00:00.000Z`, now);
      }
      if (periods.length > 0) insertMembershipStatusPeriods(id, periods, now);
    });
    invalidateQueries(db);
    return getMembership(id)!;
  }

  function updateMembership(id: string, input: Partial<MembershipInput>): GroupMembership {
    const current = getMembership(id);
    if (!current) throw new Error(`Membership not found: ${id}`);
    if (current.status === 'grad' && (
      (input.status !== undefined && input.status !== 'grad')
      || input.endDate === null
    )) {
      throw new Error('A Grad membership cannot be reactivated; add a new membership');
    }
    const now = nowUTCISO();
    const idolId = input.idolId ?? current.idolId;
    const groupId = input.groupId ?? current.groupId;
    const startDate = input.startDate ?? current.startDate;
    const endDate = input.endDate !== undefined ? input.endDate : current.endDate;
    const isMain = input.isMain !== undefined ? input.isMain : current.isMain;
    const overlap = validateSameGroupEpisodeOverlap({
      episode: { id, groupId, startDate, endDate },
      siblings: listMembershipsByGroupAllWithGroupName(idolId),
    });
    if (!overlap.ok) throw new Error(overlap.error);
    withSavepointSync(db, () => {
      if (isMain) demoteOverlappingMainMemberships(db, idolId, id, startDate, endDate, now);
      db.runSync(
        `UPDATE group_membership SET idol_id = ?, group_id = ?, start_date = ?, end_date = ?, name = ?,
          member_color = ?, status = ?, hiatus_start_date = ?, hiatus_end_date = ?, is_main = ?, updated_at = ?
         WHERE id = ?`,
        idolId,
        groupId,
        startDate,
        endDate,
        input.name !== undefined ? input.name : current.name,
        input.memberColor !== undefined ? input.memberColor : current.memberColor,
        input.status ?? current.status,
        input.hiatusStartDate !== undefined ? input.hiatusStartDate : current.hiatusStartDate,
        input.hiatusEndDate !== undefined ? input.hiatusEndDate : current.hiatusEndDate,
        isMain ? 1 : 0,
        now,
        id,
      );
      if (input.name !== undefined && input.name?.trim() && input.name.trim() !== current.name) {
        recordNameHistory(idolId, id, input.name, now, now);
      }
    });
    invalidateQueries(db);
    return getMembership(id)!;
  }

  function deleteMembership(id: string): void {
    const references = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM cheki_entry WHERE group_membership_id = ? AND deleted_at IS NULL`,
      id,
    )?.count ?? 0;
    if (references > 0) throw new Error('Membership cannot be deleted because it has Cheki Entries');
    const now = nowUTCISO();
    withSavepointSync(db, () => {
      db.runSync(`UPDATE group_membership SET is_main = 0, deleted_at = ?, updated_at = ? WHERE id = ?`, now, now, id);
      if (hasMembershipPeriodTable()) {
        db.runSync(
          `UPDATE group_membership_status_period SET deleted_at = ?, updated_at = ?
           WHERE group_membership_id = ? AND deleted_at IS NULL`,
          now,
          now,
          id,
        );
      }
    });
    invalidateQueries(db);
  }

  function countChekiEntriesForMembership(id: string): number {
    return db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM cheki_entry WHERE group_membership_id = ? AND deleted_at IS NULL`,
      id,
    )?.count ?? 0;
  }

  // --- Member Color ---

  function listMemberColors(): MemberColor[] {
    return db.getAllSync<MemberColor>(
      `SELECT ${MEMBER_COLOR_COLS} FROM member_color WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE`,
    );
  }

  function getMemberColor(id: string): MemberColor | null {
    const row = db.getFirstSync<MemberColor>(`SELECT ${MEMBER_COLOR_COLS} FROM member_color WHERE id = ? AND deleted_at IS NULL`, id);
    return row ?? null;
  }

  function findMemberColor(name: string): MemberColor | null {
    const row = db.getFirstSync<MemberColor>(
      `SELECT ${MEMBER_COLOR_COLS} FROM member_color WHERE name = ? COLLATE NOCASE AND deleted_at IS NULL`,
      name,
    );
    return row ?? null;
  }

  function createMemberColor(input: { name: string; hex: string }): MemberColor {
    const existing = findMemberColor(input.name);
    if (existing) return existing;
    const now = nowUTCISO();
    const id = uuid();
    db.runSync(
      `INSERT INTO member_color (id, name, hex, schema_version, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, 1, ?, ?, NULL)`,
      id,
      input.name.trim(),
      input.hex,
      now,
      now,
    );
    invalidateQueries(db);
    return getMemberColor(id)!;
  }

  function deleteMemberColor(id: string): void {
    db.runSync(`UPDATE member_color SET deleted_at = ?, updated_at = ? WHERE id = ?`, nowUTCISO(), nowUTCISO(), id);
    invalidateQueries(db);
  }

  // --- ChekiType ---

  function listChekiTypes(idolId: string, includeArchived = true): ChekiType[] {
    return cachedQuery(db, `chekiType:list:${idolId}:${includeArchived ? 1 : 0}`, () => {
      const rows = db.getAllSync<ChekiType>(
        `SELECT ${CHEKI_TYPE_COLS} FROM cheki_type WHERE idol_id = ? AND deleted_at IS NULL AND (? = 1 OR is_archived = 0) ORDER BY is_default DESC, label COLLATE NOCASE`,
        idolId,
        includeArchived ? 1 : 0,
      );
      return rows.map(mapChekiType);
    });
  }

  /**
   * All non-archived cheki types in a single query, for the Event form's
   * per-entry label lookup without a DB call during render.
   */
  function listAllChekiTypes(): ChekiType[] {
    return cachedQuery(db, 'chekiType:all', () => {
      const rows = db.getAllSync<ChekiType>(
        `SELECT ${CHEKI_TYPE_COLS} FROM cheki_type WHERE deleted_at IS NULL ORDER BY is_default DESC, label COLLATE NOCASE`,
      );
      return rows.map(mapChekiType);
    });
  }

  function getChekiType(id: string): ChekiType | null {
    const row = db.getFirstSync<ChekiType>(`SELECT ${CHEKI_TYPE_COLS} FROM cheki_type WHERE id = ? AND deleted_at IS NULL`, id);
    return row ? mapChekiType(row) : null;
  }

  function createChekiType(input: ChekiTypeInput): ChekiType {
    if (input.isArchived && input.isDefault) throw new Error('An archived Cheki type cannot be the default.');
    let id = '';
    withSavepointSync(db, () => {
      if (input.isDefault) clearDefaultForIdol(input.idolId);
      const now = nowUTCISO();
      id = uuid();
      db.runSync(
        `INSERT INTO cheki_type (id, idol_id, label, currency, unit_price, is_archived, is_default, ${AUDIT_INSERT(now)}, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
        id,
        input.idolId,
        input.label,
        input.currency,
        input.unitPrice,
        input.isArchived ? 1 : 0,
        input.isDefault ? 1 : 0,
        now,
        now,
      );
    });
    invalidateQueries(db);
    return getChekiType(id)!;
  }

  function clearDefaultForIdol(idolId: string, exceptId?: string): void {
    const now = nowUTCISO();
    db.runSync(
      `UPDATE cheki_type
       SET is_default = 0, updated_at = ?
       WHERE idol_id = ? AND deleted_at IS NULL AND is_default = 1 AND (? IS NULL OR id != ?)`,
      now,
      idolId,
      exceptId ?? null,
      exceptId ?? null,
    );
  }

  function updateChekiType(id: string, input: { label?: string; isArchived?: boolean; isDefault?: boolean }): ChekiType {
    const current = getChekiType(id);
    if (!current) throw new Error(`ChekiType not found: ${id}`);
    const now = nowUTCISO();
    const isArchived = input.isArchived !== undefined ? input.isArchived : current.isArchived;
    const isDefault = isArchived ? false : input.isDefault !== undefined ? input.isDefault : current.isDefault;
    withSavepointSync(db, () => {
      if (isDefault) clearDefaultForIdol(current.idolId, id);
      db.runSync(
        `UPDATE cheki_type SET label = ?, is_archived = ?, is_default = ?, updated_at = ? WHERE id = ?`,
        input.label ?? current.label,
        isArchived ? 1 : 0,
        isDefault ? 1 : 0,
        now,
        id,
      );
    });
    invalidateQueries(db);
    return getChekiType(id)!;
  }

  function setDefaultChekiType(id: string): ChekiType {
    const current = getChekiType(id);
    if (!current) throw new Error(`ChekiType not found: ${id}`);
    if (current.isArchived) throw new Error('An archived Cheki type cannot be the default.');
    const now = nowUTCISO();
    withSavepointSync(db, () => {
      clearDefaultForIdol(current.idolId, id);
      db.runSync(`UPDATE cheki_type SET is_default = 1, updated_at = ? WHERE id = ?`, now, id);
    });
    invalidateQueries(db);
    return getChekiType(id)!;
  }

  function deleteChekiType(id: string): void {
    const now = nowUTCISO();
    db.runSync(`UPDATE cheki_type SET is_default = 0, deleted_at = ?, updated_at = ? WHERE id = ?`, now, now, id);
    invalidateQueries(db);
  }

  return {
    listIdols,
    getIdol,
    createIdol,
    updateIdol,
    listIdolNameHistory,
    deleteIdol,
    listGroups,
    getGroup,
    createGroup,
    updateGroup,
    deleteGroup,
    listMembershipsByGroup,
    listMembershipsByGroupJoined,
    listMembershipsByGroupFormers,
    listMembershipsByGroupActive,
    listMembershipsByGroupAll,
    listMembershipsByGroupAllWithGroupName,
    listCurrentMembershipsWithGroupName,
    listMembershipsByGroupAllWithGroupNameAsc,
    listAllMembershipsWithGroupName,
    getMembership,
    listMembershipStatusPeriods,
    listMembershipStatusPeriodsByIdol,
    replaceMembershipStatusPeriods,
    createMembership,
    updateMembership,
    deleteMembership,
    countChekiEntriesForMembership,
    listMemberColors,
    getMemberColor,
    findMemberColor,
    createMemberColor,
    deleteMemberColor,
    listChekiTypes,
    listAllChekiTypes,
    getChekiType,
    createChekiType,
    updateChekiType,
    setDefaultChekiType,
    deleteChekiType,
  };
}

export type IdolRepo = ReturnType<typeof createIdolRepo>;
