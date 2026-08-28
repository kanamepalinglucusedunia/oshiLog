import { Fragment, useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Counter } from '@/components/ui/Counter';
import { EntityNotFound } from '@/components/ui/EntityNotFound';
import { Header } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { Screen } from '@/components/ui/Screen';
import { SocialIcon, type SocialIconPlatform } from '@/components/ui/SocialIcon';
import { useTheme } from '@/hooks/useTheme';
import { getDb } from '@/db';
import { createIdolRepo } from '@/repositories/idol';
import { createAggregationService, type GroupMemberStats } from '@/services/aggregation';
import { resolveIdolPhotoUris } from '@/services/dashboard';
import { readDataAtVersion, useUiStore } from '@/stores/uiStore';
import { CURRENCIES, type CurrencyCode, type GroupMembership, type IdolStatus } from '@/types/domain';
import { formatISODateCompact, formatISODateFull } from '@/utils/date';
import { formatMoney, formatMoneyCompact } from '@/utils/money';
import { CARD_STACK_GAP } from '@/design-system/theme';

type GroupMember = GroupMembership & {
  idolName: string;
  idolStatus: IdolStatus;
  photoUri: string | null;
  stats: GroupMemberStats;
};

type SocialProfile = {
  platform: SocialIconPlatform;
  label: string;
  url: string | null;
};

function emptyMemberStats(): GroupMemberStats {
  return {
    eventCount: 0,
    chekiCount: 0,
    spendTotals: { JPY: 0, IDR: 0, MYR: 0, KRW: 0, THB: 0 },
  };
}

function getSpendingCurrencies(primaryCurrency: CurrencyCode, totals: Record<CurrencyCode, number>): CurrencyCode[] {
  const additional = (Object.keys(totals) as CurrencyCode[]).filter(
    (currency) => currency !== primaryCurrency && totals[currency] !== 0,
  );
  return [primaryCurrency, ...additional];
}

function spendingLabel(currency: CurrencyCode, totals: Record<CurrencyCode, number>, compact = false): string {
  return totals[currency] === 0 ? '—' : compact ? formatMoneyCompact(totals[currency], currency) : formatMoney(totals[currency], currency);
}

function formatCountryCode(country: string): string {
  return country.length > 1 ? `${country[0]}${country.slice(1).toLowerCase()}` : country;
}

function SocialProfileIcon({ profile, color }: { profile: SocialProfile; color: string }) {
  const icon = <SocialIcon platform={profile.platform} size={16} color={color} />;
  if (!profile.url) {
    return (
      <View
        accessible
        accessibilityLabel={`${profile.label} profile not linked`}
        style={[styles.socialIcon, { opacity: 0.32 }]}
      >
        {icon}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${profile.label} profile`}
      hitSlop={6}
      onPress={() => void Linking.openURL(profile.url!).catch(() => undefined)}
      style={styles.socialIcon}
    >
      {icon}
    </Pressable>
  );
}

function GroupMemberCard({
  member,
  former,
  primaryCurrency,
  onPress,
}: {
  member: GroupMember;
  former: boolean;
  primaryCurrency: CurrencyCode;
  onPress: () => void;
}) {
  const theme = useTheme();
  const foreground = former ? theme.color.textMuted : theme.color.text;
  const accent = former ? theme.color.textMuted : theme.color.accent;
  const statusColor = former
    ? theme.color.textMuted
    : member.status === 'hiatus' || member.idolStatus === 'hiatus'
      ? theme.color.warning
      : theme.color.success;
  const currencies = getSpendingCurrencies(primaryCurrency, member.stats.spendTotals);
  const memberPeriod = former
    ? `${formatISODateCompact(member.startDate)} - ${formatISODateCompact(member.endDate!)}`
    : `${formatISODateCompact(member.startDate)} - ${member.endDate ? formatISODateCompact(member.endDate) : 'Now'}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open member ${member.idolName}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.memberCard,
        {
          backgroundColor: former ? theme.color.surfaceMuted : theme.color.surface,
          borderColor: former ? theme.color.borderLight : theme.surface.borderColor,
          borderWidth: theme.surface.borderWidth,
          borderRadius: theme.radius.lg,
          shadowColor: theme.surface.shadowColor,
          shadowOpacity: theme.surface.shadowOpacity,
          shadowRadius: theme.surface.shadowRadius,
          shadowOffset: { width: 0, height: 2 },
          elevation: theme.surface.elevation,
        },
        pressed ? { opacity: 0.8 } : null,
      ]}
    >
      <View
        style={[
          styles.memberPhoto,
          {
            borderRadius: theme.radius.sm,
            backgroundColor: theme.color.surfaceMuted,
            borderWidth: theme.surface.borderWidth,
            borderColor: former ? theme.color.borderLight : theme.surface.borderColor,
          },
        ]}
      >
        {member.photoUri ? (
          <Image
            source={{ uri: member.photoUri }}
            style={[
              styles.memberPhotoImage,
              former ? { opacity: 0.5, tintColor: theme.color.textMuted } : null,
            ]}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <Icon name="user" size={24} color={accent} strokeWidth={1} />
        )}
      </View>

      <View style={styles.memberBody}>
        <AppText size="body" weight="regular" color={foreground} numberOfLines={1}>
          {member.idolName}
        </AppText>
        <AppText size="small" weight="light" color={foreground} numberOfLines={1}>
          {memberPeriod}
        </AppText>
        <View style={styles.memberStatsRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <View style={styles.memberStatItem}>
            <Icon name="calendar" size={11} color={accent} strokeWidth={0.7} />
            <AppText size="xs" weight="light" color={accent}>{member.stats.eventCount}</AppText>
          </View>
          <View style={[styles.miniDivider, { backgroundColor: accent }]} />
          <View style={styles.memberStatItem}>
            <Icon name="camera" size={11} color={accent} strokeWidth={1} />
            <AppText size="xs" weight="light" color={accent}>{member.stats.chekiCount}</AppText>
          </View>
          <View style={[styles.miniDivider, { backgroundColor: accent }]} />
          <View style={styles.memberSpendRow}>
            {currencies.map((currency, index) => (
              <View key={currency} style={styles.memberSpendItem}>
                {index > 0 ? <View style={[styles.miniDivider, { backgroundColor: accent }]} /> : null}
                <AppText size="xs" weight="light" color={accent} numberOfLines={1}>
                  {spendingLabel(currency, member.stats.spendTotals, true)}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      </View>

      <Icon name="chevronRight" size={20} color={foreground} strokeWidth={1} />
    </Pressable>
  );
}

function GroupMemberSection({
  title,
  members,
  former,
  primaryCurrency,
  onMemberPress,
  emptyLabel,
}: {
  title: string;
  members: GroupMember[];
  former: boolean;
  primaryCurrency: CurrencyCode;
  onMemberPress: (idolId: string) => void;
  emptyLabel?: string;
}) {
  const theme = useTheme();
  return (
    <Card style={[styles.sectionCard, { gap: theme.spacing.sm }]}>
      <AppText size="large" weight="regular">{title}</AppText>
      {members.length > 0 ? (
        <View style={styles.memberList}>
          {members.map((member) => (
            <GroupMemberCard
              key={member.id}
              member={member}
              former={former}
              primaryCurrency={primaryCurrency}
              onPress={() => onMemberPress(member.idolId)}
            />
          ))}
        </View>
      ) : (
        <AppText size="small" weight="light" muted>{emptyLabel}</AppText>
      )}
    </Card>
  );
}

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const dataVersion = useUiStore((s) => s.dataVersion);

  const group = useMemo(() => readDataAtVersion(dataVersion, () => createIdolRepo(getDb()).getGroup(id)), [id, dataVersion]);
  const groupStats = useMemo(() => readDataAtVersion(dataVersion, () => createAggregationService(getDb()).getGroupStats(id)), [id, dataVersion]);
  const memberData = useMemo(() => readDataAtVersion(dataVersion, () => {
    const db = getDb();
    const repo = createIdolRepo(db);
    const service = createAggregationService(db);
    const members = repo.listMembershipsByGroupActive(id);
    const formers = repo.listMembershipsByGroupFormers(id);
    const allMemberships = [...members, ...formers];
    const photos = resolveIdolPhotoUris(db, allMemberships.map((membership) => repo.getIdol(membership.idolId)?.photoMediaId ?? null));
    const statsByMembership = service.getGroupMemberStats(id);
    const mapMember = (membership: typeof members[number]): GroupMember => {
      const idol = repo.getIdol(membership.idolId);
      return {
        ...membership,
        idolStatus: idol?.status ?? 'active',
        photoUri: idol?.photoMediaId ? photos.get(idol.photoMediaId) ?? null : null,
        stats: statsByMembership[membership.id] ?? emptyMemberStats(),
      };
    };
    return { members: members.map(mapMember), formers: formers.map(mapMember) };
  }), [id, dataVersion]);
  const photoUri = useMemo(
    () => readDataAtVersion(dataVersion, () => (group?.photoMediaId ? resolveIdolPhotoUris(getDb(), [group.photoMediaId]).get(group.photoMediaId) ?? null : null)),
    [group, dataVersion],
  );

  if (!group) return <EntityNotFound entity="Group" onBack={() => router.replace('/(tabs)/idols')} />;

  const primaryCurrency = CURRENCIES[group.country];
  const socialProfiles: SocialProfile[] = [
    { platform: 'x', label: 'X', url: group.xProfileUrl },
    { platform: 'instagram', label: 'Instagram', url: group.instagramProfileUrl },
    { platform: 'tiktok', label: 'TikTok', url: group.tiktokProfileUrl },
  ];

  return (
    <Screen contentStyle={styles.screenContent}>
      <Header
        variant="detail"
        testID="group-detail-header"
        title="Group Details"
        titleContent={<AppText size="h3" weight="semibold" numberOfLines={1}>Group Details</AppText>}
        right={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={group.isFavorite ? 'Remove group from favorites' : 'Add group to favorites'}
              accessibilityState={{ selected: group.isFavorite }}
              hitSlop={8}
              onPress={() => createIdolRepo(getDb()).updateGroup(group.id, { isFavorite: !group.isFavorite })}
            >
              <Icon
                name="heart"
                size={24}
                color={group.isFavorite ? theme.color.accent : theme.color.text}
                fill={group.isFavorite ? theme.color.accent : 'none'}
                strokeWidth={2}
                viewBoxPadding={1}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit group"
              hitSlop={8}
              onPress={() => router.push(`/group/edit?id=${group.id}`)}
            >
              <Icon name="edit" size={24} color={theme.color.text} strokeWidth={2} viewBoxPadding={1} />
            </Pressable>
          </>
        }
      />

      <ScrollView
        testID="group-detail-content"
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        scrollsChildToFocus
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.sm,
          paddingBottom: 120,
          gap: theme.spacing.md,
        }}
      >
        <Card style={[styles.heroCard, { gap: theme.spacing.sm }]}>
          <View
            testID="group-info-photo"
            style={[
              styles.heroPhoto,
              {
                backgroundColor: theme.color.accentSurface,
                borderColor: theme.surface.borderColor,
                borderRadius: theme.radius.sm,
                borderWidth: theme.surface.borderWidth,
              },
            ]}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.heroPhotoImage} contentFit="cover" transition={150} />
            ) : (
              <Icon name="userGroup" size={36} color={theme.color.accent} strokeWidth={1} />
            )}
          </View>
          <View style={styles.heroBody}>
            <AppText size="large" weight="regular" numberOfLines={1}>{group.name}</AppText>
            <View style={[styles.heroMeta, { gap: theme.spacing.xs }]}>
              <View style={[styles.locationRow, { gap: theme.spacing.xs }]}>
                <AppText size="small" weight="regular">{formatCountryCode(group.country)}</AppText>
                {group.region ? (
                  <>
                    <View testID="group-info-location-divider" style={styles.locationDivider}>
                      <View style={[styles.locationDividerLine, { backgroundColor: theme.color.text }]} />
                    </View>
                    <AppText size="small" weight="regular" numberOfLines={1}>{group.region}</AppText>
                  </>
                ) : null}
              </View>
              <AppText testID="group-info-period" size="small" weight="regular" color={theme.color.accent} numberOfLines={1}>
                {group.debutDate ? `${formatISODateFull(group.debutDate)} - ${group.endDate ? formatISODateFull(group.endDate) : 'Now'}` : 'Active period unknown'}
              </AppText>
              <View style={[styles.socialRow, { gap: theme.spacing.sm }]}>
                {socialProfiles.map((profile) => <SocialProfileIcon key={profile.platform} profile={profile} color={theme.color.text} />)}
              </View>
            </View>
          </View>
        </Card>

        <Counter
          eventCount={groupStats.eventCount}
          chekiCount={groupStats.chekiCount}
          totals={groupStats.spendTotals}
          defaultCurrency={primaryCurrency}
          testID="group-summary"
        />

        <GroupMemberSection
          title={`Listed Member (${memberData.members.length})`}
          members={memberData.members}
          former={false}
          primaryCurrency={primaryCurrency}
          onMemberPress={(idolId) => router.push(`/idol/${idolId}`)}
          emptyLabel="No listed members yet."
        />

        {memberData.formers.length > 0 ? (
          <GroupMemberSection
            title={`Listed Former Member (${memberData.formers.length})`}
            members={memberData.formers}
            former
            primaryCurrency={primaryCurrency}
            onMemberPress={(idolId) => router.push(`/idol/${idolId}`)}
          />
        ) : null}

        {group.notes ? (
          <Card style={styles.notesCard}>
            <AppText size="large" weight="regular">Notes</AppText>
            <AppText size="body" weight="regular">{group.notes}</AppText>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    padding: 0,
    paddingBottom: 0,
  },
  scroll: {
    flex: 1,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  heroPhoto: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroPhotoImage: {
    width: '100%',
    height: '100%',
  },
  heroBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
    minWidth: 0,
  },
  heroMeta: {
    width: '100%',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationDivider: {
    width: 0,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationDividerLine: {
    width: 14,
    height: 1,
    borderRadius: 0.5,
    transform: [{ rotate: '90deg' }],
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  socialIcon: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCard: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  memberList: {
    gap: CARD_STACK_GAP,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
  },
  memberPhoto: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  memberPhotoImage: {
    width: '100%',
    height: '100%',
  },
  memberBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  memberStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 12,
    minWidth: 0,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  memberStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  memberSpendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  memberSpendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  miniDivider: {
    width: 1,
    height: 10,
    opacity: 0.5,
  },
  notesCard: {
    padding: 8,
    gap: 8,
  },
});
