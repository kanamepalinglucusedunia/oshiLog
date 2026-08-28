import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { TopIdolRow } from '@/services/dashboard';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Card } from './Card';
import { useTheme } from '@/hooks/useTheme';

export interface TopIdolPodiumProps {
  idols: TopIdolRow[];
  photoUris?: Map<string, string>;
  onIdolPress?: (idolId: string) => void;
}

const RANK_ORDER = [2, 1, 3] as const;

export function TopIdolPodium({ idols, photoUris, onIdolPress }: TopIdolPodiumProps) {
  const theme = useTheme();
  const byRank = new Map(idols.slice(0, 3).map((idol, index) => [index + 1, idol]));

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <AppText weight="semibold" size="large">
            Top Idol
          </AppText>
          <AppText size="small" muted>
            Ranked by Cheki
          </AppText>
        </View>
      </View>
      <View style={styles.podiumRow}>
        {RANK_ORDER.map((rank) => {
          const idol = byRank.get(rank);
          if (!idol) return <View key={rank} style={styles.emptyRank} />;
          const isWinner = rank === 1;
          const photoUri = photoUris?.get(idol.photoMediaId ?? '');
          return (
            <Pressable
              key={idol.idolId}
              testID={`top-idol-rank-${rank}`}
              accessibilityRole="button"
              accessibilityLabel={`Rank ${rank}, ${idol.idolName}, ${idol.chekiCount} Cheki`}
              onPress={() => onIdolPress?.(idol.idolId)}
              style={({ pressed }) => [styles.rankColumn, isWinner ? styles.winnerColumn : styles.sideColumn, pressed && { opacity: 0.75 }]}
            >
              <View
                style={[
                  styles.photo,
                  isWinner ? styles.winnerPhoto : styles.sidePhoto,
                  {
                    backgroundColor: theme.color.surfaceMuted,
                    borderColor: isWinner ? theme.color.accent : theme.surface.borderColor,
                    borderWidth: theme.surface.borderWidth,
                  },
                ]}
              >
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.photoImage} contentFit="cover" transition={150} recyclingKey={photoUri} />
                ) : (
                  <Icon name="user" size={isWinner ? 32 : 24} color={theme.color.accent} strokeWidth={1} />
                )}
              </View>
              <View
                style={[
                  styles.rankBadge,
                  {
                    backgroundColor: isWinner ? theme.color.accent : theme.color.accentSurface,
                    borderColor: theme.color.accent,
                    borderWidth: theme.surface.borderWidth,
                  },
                ]}
              >
                <AppText weight="bold" size="small" color={isWinner ? theme.color.onAccent : theme.color.accent}>
                  {rank}
                </AppText>
              </View>
              <AppText weight={isWinner ? 'semibold' : 'regular'} size={isWinner ? 'body' : 'small'} numberOfLines={1} align="center" style={styles.name}>
                {idol.idolName}
              </AppText>
              <AppText size="xs" color={theme.color.accent} align="center">
                {idol.chekiCount.toLocaleString()} Cheki
              </AppText>
              <View
                style={[
                  styles.pedestal,
                  {
                    height: isWinner ? 48 : rank === 2 ? 32 : 24,
                    backgroundColor: isWinner ? theme.color.accent : theme.color.accentSurface,
                    borderColor: theme.color.accent,
                    borderWidth: theme.surface.borderWidth,
                    borderBottomLeftRadius: theme.radius.sm,
                    borderBottomRightRadius: theme.radius.sm,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleWrap: {
    gap: 2,
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    minHeight: 220,
  },
  rankColumn: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 84,
    maxWidth: 112,
  },
  winnerColumn: {
    flex: 1.1,
  },
  sideColumn: {
    flex: 1,
  },
  emptyRank: {
    flex: 1,
    minWidth: 84,
  },
  photo: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 9999,
  },
  winnerPhoto: {
    width: 88,
    height: 88,
  },
  sidePhoto: {
    width: 64,
    height: 64,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  rankBadge: {
    width: 24,
    height: 24,
    marginTop: -12,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  name: {
    maxWidth: 104,
    marginTop: 6,
  },
  pedestal: {
    width: '100%',
    marginTop: 6,
  },
});
