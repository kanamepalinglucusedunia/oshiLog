import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateField } from '@/components/ui/DateField';
import { GroupPickerDropdown } from './GroupPickerDropdown';
import { getDb } from '@/db';
import { TYPOGRAPHY } from '@/design-system/typography';
import { CARD_STACK_GAP } from '@/design-system/theme';
import { useTheme } from '@/hooks/useTheme';
import { createIdolRepo, type MembershipStatusPeriodInput } from '@/repositories/idol';
import { resolveIdolPhotoUris } from '@/services/dashboard';
import { saveIdolAggregate } from '@/services/idolSave';
import { findAffectedEntries, listReassignmentOptions, type AffectedEntry, type ReassignmentOption } from '@/services/membershipGuard';
import {
  applyMembershipTransition,
  buildExplicitRepairPeriods,
  moveMembershipBoundary,
  validateMembershipPeriods,
} from '@/services/membershipTimeline';
import { readDataAtVersion, useUiStore } from '@/stores/uiStore';
import type { GroupMembership, Idol, MembershipStatus } from '@/types/domain';
import { formatISODateCompact, todayISO } from '@/utils/date';

interface EpisodeRow extends GroupMembership {
  groupName: string;
  periods: MembershipStatusPeriodInput[];
  chekiCount: number;
}

interface EpisodeDraft {
  id?: string;
  groupId: string | null;
  groupName: string;
  name: string;
  memberColor: string | null;
  status: MembershipStatus;
  startDate: string;
  endDate: string | null;
  hiatusStartDate: string | null;
  hiatusEndDate: string | null;
  isMain: boolean;
  periods: MembershipStatusPeriodInput[];
  originalStatus?: MembershipStatus;
}

interface PendingReassignment {
  draft: EpisodeDraft;
  entries: AffectedEntry[];
  options: Record<string, ReassignmentOption[]>;
  decisions: Record<string, string | null>;
}

export function MembershipHistoryManager({
  visible,
  idolId,
  onClose,
}: {
  visible: boolean;
  idolId: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const dataVersion = useUiStore((state) => state.dataVersion);
  const bumpDataVersion = useUiStore((state) => state.bumpDataVersion);
  const [editing, setEditing] = useState<EpisodeDraft | null>(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingReassignment, setPendingReassignment] = useState<PendingReassignment | null>(null);

  const closeManager = () => {
    setEditing(null);
    setGroupPickerOpen(false);
    setError(null);
    setPendingReassignment(null);
    onClose();
  };

  const data = useMemo(() => readDataAtVersion(dataVersion, () => {
    const repo = createIdolRepo(getDb());
    const idol = repo.getIdol(idolId);
    if (!idol) return null;
    const groups = repo.listGroups();
    const periods = repo.listMembershipStatusPeriodsByIdol(idolId);
    const episodes: EpisodeRow[] = repo.listMembershipsByGroupAllWithGroupName(idolId).map((membership) => ({
      ...membership,
      periods: periods.filter((period) => period.groupMembershipId === membership.id),
      chekiCount: repo.countChekiEntriesForMembership(membership.id),
    }));
    episodes.sort((left, right) => {
      const leftCurrent = left.status === 'grad' ? 1 : 0;
      const rightCurrent = right.status === 'grad' ? 1 : 0;
      if (leftCurrent !== rightCurrent) return leftCurrent - rightCurrent;
      return (right.endDate ?? right.startDate).localeCompare(left.endDate ?? left.startDate);
    });
    return { idol, groups, episodes, chekiTypes: repo.listChekiTypes(idolId, true) };
  }), [dataVersion, idolId]);

  const groupPhotoUris = useMemo(
    () => resolveIdolPhotoUris(getDb(), data?.groups.map((group) => group.photoMediaId) ?? []),
    [data?.groups],
  );

  if (!data) return null;

  const beginEdit = (episode: EpisodeRow) => {
    setError(null);
    setEditing({
      id: episode.id,
      groupId: episode.groupId,
      groupName: episode.groupName,
      name: episode.name ?? data.idol.name,
      memberColor: episode.memberColor,
      status: episode.status,
      startDate: episode.startDate,
      endDate: episode.endDate,
      hiatusStartDate: episode.hiatusStartDate,
      hiatusEndDate: episode.hiatusEndDate,
      isMain: episode.isMain,
      periods: episode.periods.map((period) => ({
        id: period.id,
        status: period.status,
        startDate: period.startDate,
        endDate: period.endDate,
      })),
      originalStatus: episode.status,
    });
  };

  const beginAdd = () => {
    const startDate = todayISO();
    setError(null);
    setEditing({
      groupId: null,
      groupName: '',
      name: data.idol.name,
      memberColor: null,
      status: 'active',
      startDate,
      endDate: null,
      hiatusStartDate: null,
      hiatusEndDate: null,
      isMain: data.episodes.every((episode) => episode.status === 'grad'),
      periods: [{ status: 'active', startDate, endDate: null }],
    });
  };

  const changeStatus = (nextStatus: MembershipStatus) => {
    if (!editing || editing.originalStatus === 'grad' || nextStatus === editing.status) return;
    if (editing.periods.length === 0) {
      setEditing({
        ...editing,
        status: nextStatus,
        endDate: nextStatus === 'grad' ? editing.endDate : null,
        isMain: nextStatus === 'grad' ? false : editing.isMain,
      });
      return;
    }
    try {
      const transition = applyMembershipTransition({
        periods: editing.periods,
        currentStatus: editing.status,
        nextStatus,
        boundaryDate: todayISO(),
      });
      const latestHiatus = [...transition.periods].reverse().find((period) => period.status === 'hiatus');
      setEditing({
        ...editing,
        status: transition.status,
        endDate: transition.endDate,
        hiatusStartDate: latestHiatus?.startDate ?? null,
        hiatusEndDate: latestHiatus?.endDate ?? null,
        isMain: nextStatus === 'grad' ? false : editing.isMain,
        periods: transition.periods,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change membership status');
    }
  };

  const persist = (draft: EpisodeDraft, reassignments: Record<string, string | null>) => {
    if (!draft.groupId) throw new Error('Pick a Group');
    const validation = validateMembershipPeriods({
      startDate: draft.startDate,
      endDate: draft.endDate,
      status: draft.status,
      periods: draft.periods,
    });
    if (!validation.ok) throw new Error(validation.error);
    saveIdolAggregate(getDb(), {
      existingId: data.idol.id,
      core: idolCore(data.idol),
      memberships: [{
        id: draft.id,
        groupId: draft.groupId,
        startDate: draft.startDate,
        endDate: draft.endDate,
        name: draft.name || null,
        memberColor: draft.memberColor,
        status: draft.status,
        hiatusStartDate: draft.hiatusStartDate,
        hiatusEndDate: draft.hiatusEndDate,
        isMain: draft.isMain,
        periods: draft.periods,
      }],
      chekiTypes: data.chekiTypes.map((type) => ({
        id: type.id,
        label: type.label,
        currency: type.currency,
        unitPrice: type.unitPrice,
        isDefault: type.isDefault,
      })),
      reassignments,
    });
    bumpDataVersion();
    setEditing(null);
    setPendingReassignment(null);
    setError(null);
  };

  const prepareSave = () => {
    if (!editing) return;
    try {
      if (!editing.id) {
        persist(editing, {});
        return;
      }
      const entries = findAffectedEntries(getDb(), editing.id, {
        startDate: editing.startDate,
        endDate: editing.endDate,
      });
      if (entries.length === 0) {
        persist(editing, {});
        return;
      }
      const options: Record<string, ReassignmentOption[]> = {};
      const decisions: Record<string, string | null> = {};
      for (const entry of entries) {
        const candidates = listReassignmentOptions(getDb(), entry, editing.id);
        options[entry.entryId] = candidates;
        decisions[entry.entryId] = candidates.find((candidate) => candidate.groupMembershipId !== null)?.groupMembershipId ?? null;
      }
      setPendingReassignment({ draft: editing, entries, options, decisions });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save membership history');
    }
  };

  const deleteEpisode = (episode: EpisodeRow) => {
    if (episode.chekiCount > 0) return;
    try {
      saveIdolAggregate(getDb(), {
        existingId: data.idol.id,
        core: idolCore(data.idol),
        memberships: [],
        removedMembershipIds: [episode.id],
        chekiTypes: data.chekiTypes.map((type) => ({
          id: type.id,
          label: type.label,
          currency: type.currency,
          unitPrice: type.unitPrice,
          isDefault: type.isDefault,
        })),
        reassignments: {},
      });
      bumpDataVersion();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete membership');
    }
  };

  return (
    <BottomSheet visible={visible} onClose={closeManager} maxHeightRatio={0.92}>
      <View style={styles.sheet}>
        <View style={styles.titleRow}>
          <AppText weight="semibold" size="large">Manage Group History</AppText>
          {!editing ? <Button label="Add Membership" labelSize="small" onPress={beginAdd} /> : null}
        </View>
        {error ? <AppText size="small" color={theme.color.danger} accessibilityRole="alert">{error}</AppText> : null}

        {pendingReassignment ? (
          <ScrollView contentContainerStyle={styles.listContent}>
            <AppText weight="semibold" size="body">Reassign affected Cheki Entries</AppText>
            {pendingReassignment.entries.map((entry) => (
              <Card key={entry.entryId} style={styles.editorCard}>
                <AppText size="small">{entry.eventTitle} · {formatISODateCompact(entry.eventDate)}</AppText>
                {pendingReassignment.options[entry.entryId].map((option) => {
                  const selected = pendingReassignment.decisions[entry.entryId] === option.groupMembershipId;
                  return (
                    <Pressable
                      key={option.groupMembershipId ?? 'solo'}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Reassign ${entry.eventTitle} to ${option.label}`}
                      onPress={() => setPendingReassignment((current) => current ? {
                        ...current,
                        decisions: { ...current.decisions, [entry.entryId]: option.groupMembershipId },
                      } : current)}
                      style={[
                        styles.option,
                        {
                          borderWidth: theme.surface.borderWidth,
                          borderColor: selected ? theme.color.accent : theme.surface.borderColor,
                          backgroundColor: selected ? theme.color.accentSoft : theme.color.surface,
                        },
                      ]}
                    >
                      <AppText size="small">{option.label}</AppText>
                    </Pressable>
                  );
                })}
              </Card>
            ))}
            <Button label="Confirm Reassignment" onPress={() => {
              try {
                persist(pendingReassignment.draft, pendingReassignment.decisions);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Could not reassign Cheki Entries');
              }
            }} />
            <Button label="Cancel Reassignment" variant="ghost" onPress={() => setPendingReassignment(null)} />
          </ScrollView>
        ) : editing ? (
          <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
            <Card style={styles.editorCard}>
              <GroupPickerDropdown
                groups={data.groups}
                groupPhotoUris={groupPhotoUris}
                selectedGroupId={editing.groupId}
                open={groupPickerOpen}
                onToggle={() => setGroupPickerOpen((current) => !current)}
                onClose={() => setGroupPickerOpen(false)}
                onSelect={(groupId) => {
                  const groupName = data.groups.find((group) => group.id === groupId)?.name ?? '';
                  setEditing({ ...editing, groupId, groupName });
                  setGroupPickerOpen(false);
                }}
              />
              <AppText weight="semibold" size="small">Membership name</AppText>
              <TextInput
                accessibilityLabel="Membership name"
                value={editing.name}
                onChangeText={(name) => setEditing({ ...editing, name })}
                style={[
                  styles.input,
                  {
                    color: theme.color.text,
                    borderWidth: theme.surface.borderWidth,
                    borderColor: theme.surface.borderColor,
                    backgroundColor: theme.color.surface,
                  },
                  TYPOGRAPHY.regular.body,
                ]}
              />
              <View style={styles.statusRow}>
                {(['active', 'hiatus', 'grad'] as const).map((status) => (
                  <Button
                    key={status}
                    label={status === 'grad' ? 'Grad' : status === 'hiatus' ? 'Hiatus' : 'Active'}
                    variant={editing.status === status ? 'primary' : 'secondary'}
                    disabled={editing.originalStatus === 'grad' && status !== 'grad'}
                    onPress={() => changeStatus(status)}
                    style={styles.statusButton}
                    labelSize="small"
                  />
                ))}
              </View>
              <DateField
                label="Debut date"
                value={editing.startDate}
                onChange={(startDate) => {
                  const periods = editing.periods.map((period, index) => index === 0 ? { ...period, startDate } : period);
                  setEditing({ ...editing, startDate, periods });
                }}
              />
              {editing.status === 'grad' ? (
                <DateField
                  label="Grad date"
                  value={editing.endDate ?? ''}
                  onChange={(endDate) => {
                    const periods = editing.periods.map((period, index) => index === editing.periods.length - 1
                      ? { ...period, endDate: endDate || null }
                      : period);
                    setEditing({ ...editing, endDate: endDate || null, periods });
                  }}
                />
              ) : null}
              {editing.periods.length === 0 ? (
                <View style={styles.editorCard}>
                  <AppText size="small" color={theme.color.danger}>
                    This legacy membership needs explicit repair. Review its status and dates; no missing date will be invented.
                  </AppText>
                  <DateField
                    label="Legacy hiatus start date"
                    value={editing.hiatusStartDate ?? ''}
                    allowClear
                    onChange={(hiatusStartDate) => setEditing({
                      ...editing,
                      hiatusStartDate: hiatusStartDate || null,
                      hiatusEndDate: hiatusStartDate ? editing.hiatusEndDate : null,
                    })}
                  />
                  <DateField
                    label="Legacy hiatus end date"
                    value={editing.hiatusEndDate ?? ''}
                    allowClear
                    onChange={(hiatusEndDate) => setEditing({ ...editing, hiatusEndDate: hiatusEndDate || null })}
                  />
                  <Button
                    label="Repair Timeline"
                    onPress={() => {
                      try {
                        const periods = buildExplicitRepairPeriods({
                          status: editing.status,
                          startDate: editing.startDate,
                          endDate: editing.endDate,
                          hiatusStartDate: editing.hiatusStartDate,
                          hiatusEndDate: editing.hiatusEndDate,
                        });
                        setEditing({ ...editing, periods });
                        setError(null);
                      } catch (cause) {
                        setError(cause instanceof Error ? cause.message : 'Could not repair membership timeline');
                      }
                    }}
                  />
                </View>
              ) : null}
              {editing.periods.slice(1).map((period, index) => (
                <DateField
                  key={period.id ?? `${period.status}-${index}`}
                  label={`Status boundary ${index + 1}`}
                  value={period.startDate}
                  onChange={(boundaryDate) => {
                    try {
                      const periods = moveMembershipBoundary(editing.periods, index + 1, boundaryDate);
                      const latestHiatus = [...periods].reverse().find((item) => item.status === 'hiatus');
                      setEditing({
                        ...editing,
                        periods,
                        hiatusStartDate: latestHiatus?.startDate ?? null,
                        hiatusEndDate: latestHiatus?.endDate ?? null,
                      });
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : 'Invalid status boundary');
                    }
                  }}
                />
              ))}
              <Button label="Save Membership" disabled={editing.periods.length === 0} onPress={prepareSave} />
              <Button
                label="Cancel membership edit"
                accessibilityLabel="Cancel membership edit"
                variant="ghost"
                onPress={() => {
                  setEditing(null);
                  setError(null);
                }}
              />
            </Card>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent}>
            {data.episodes.length === 0 ? (
              <AppText size="small" muted>No membership history yet.</AppText>
            ) : data.episodes.map((episode) => (
              <Card key={episode.id} style={styles.episodeCard}>
                <View style={styles.episodeHeader}>
                  <View style={styles.flexOne}>
                    <AppText weight="semibold" size="body">
                      {episode.groupName}{episode.status === 'grad' ? ' (Grad)' : episode.status === 'hiatus' ? ' (Hiatus)' : ''}
                    </AppText>
                    <AppText size="small" muted>{formatISODateCompact(episode.startDate)} – {episode.endDate ? formatISODateCompact(episode.endDate) : 'Now'}</AppText>
                  </View>
                  <Button label={`Edit ${episode.groupName} membership`} labelSize="small" variant="secondary" onPress={() => beginEdit(episode)} />
                </View>
                <Button
                  label={`Delete ${episode.groupName} membership`}
                  labelSize="small"
                  variant="danger"
                  disabled={episode.chekiCount > 0}
                  onPress={() => deleteEpisode(episode)}
                />
                {episode.chekiCount > 0 ? (
                  <AppText size="xs" muted>
                    Has {episode.chekiCount} Cheki {episode.chekiCount === 1 ? 'Entry' : 'Entries'}; edit or reassign it before changing dates.
                  </AppText>
                ) : null}
              </Card>
            ))}
          </ScrollView>
        )}
      </View>
    </BottomSheet>
  );
}

function idolCore(idol: Idol) {
  return {
    name: idol.name,
    country: idol.country,
    region: idol.region,
    birthDate: idol.birthDate,
    memberColor: idol.memberColor,
    status: idol.status,
    notes: idol.notes,
    photoMediaId: idol.photoMediaId,
    xProfileUrl: idol.xProfileUrl,
    instagramProfileUrl: idol.instagramProfileUrl,
    tiktokProfileUrl: idol.tiktokProfileUrl,
    isFavorite: idol.isFavorite,
  };
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingHorizontal: 16, paddingBottom: 8, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  listContent: { gap: CARD_STACK_GAP, paddingBottom: 24 },
  episodeCard: { gap: 10 },
  editorCard: { gap: 12 },
  episodeHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flexOne: { flex: 1 },
  input: { minHeight: 40, borderRadius: 12, paddingHorizontal: 12 },
  statusRow: { flexDirection: 'row', gap: 8 },
  statusButton: { flex: 1, paddingHorizontal: 4 },
  option: { minHeight: 40, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12 },
});
