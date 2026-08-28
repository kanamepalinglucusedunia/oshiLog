import { View, StyleSheet, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from './AppText';
import { FavoriteButton } from './FavoriteButton';
import { Icon } from './Icon';
import { useTheme } from '@/hooks/useTheme';
import { DEFAULT_PRIMARY_SCALE } from '@/design-system/colors';
import { COUNTRIES, type CountryCode } from '@/types/domain';

export interface GroupCardData {
  name: string;
  country: CountryCode;
  region: string | null;
  isFavorite: boolean;
  eventCount: number;
  chekiCount: number;
  spendLabel: string | null;
}

export interface GroupCardProps {
  group: GroupCardData;
  photoUri?: string | null;
  onPress?: () => void;
  onFavoritePress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Fixed width for horizontal lists; defaults to filling the grid cell. */
  width?: number;
  /** Figma photo height is 160 in the 2-column grid. */
  photoHeight?: number;
}

export function countryName(code: CountryCode): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

/** How far the description container overlaps the photo's bottom edge. */
const PHOTO_OVERLAP = 16;
/** Gap between the photo's bottom edge and the description content. */
const CONTENT_GAP = 8;

/**
 * Matches the "Idol - Idol Card" Card Grid design: the photo (own border,
 * radius 16) at the top in front; the description panel overlaps the photo's
 * bottom by 16px with border only on the sides and bottom, and the content
 * starts 8px below the photo's bottom edge.
 */
export function GroupCard({ group, photoUri, onPress, onFavoritePress, style, width, photoHeight = 160 }: GroupCardProps) {
  const theme = useTheme();
  const origin = countryName(group.country);
  const borderWidth = theme.surface.borderWidth;

  return (
    <View
      style={[
        styles.container,
        {
          width,
          shadowColor: theme.surface.shadowColor,
          shadowOpacity: theme.surface.shadowOpacity,
          shadowRadius: theme.surface.shadowRadius,
          shadowOffset: { width: 0, height: 2 },
          elevation: theme.surface.elevation,
        },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${group.name} ${group.region ?? origin}`}
        onPress={onPress}
        style={({ pressed }) => [pressed ? { opacity: 0.8 } : null]}
      >
        <View
          style={[
            styles.photo,
            {
              height: photoHeight,
              backgroundColor: theme.color.surfaceMuted,
              borderRadius: theme.radius.lg,
              borderColor: theme.surface.borderColor,
              borderWidth,
              zIndex: 1,
            },
          ]}
        >
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoFill} contentFit="cover" transition={150} recyclingKey={photoUri} />
          ) : (
            <View style={[styles.photoFill, styles.photoPlaceholder]}>
              <Icon name="userGroup" size={40} color={theme.color.accent} strokeWidth={1} />
            </View>
          )}
        </View>

        <View
          style={[
            styles.body,
            {
              marginTop: -PHOTO_OVERLAP,
              paddingTop: PHOTO_OVERLAP + CONTENT_GAP,
              backgroundColor: theme.color.surface,
              borderColor: theme.surface.borderColor,
              borderTopWidth: 0,
              borderRightWidth: borderWidth,
              borderBottomWidth: borderWidth,
              borderLeftWidth: borderWidth,
              borderBottomLeftRadius: theme.radius.lg,
              borderBottomRightRadius: theme.radius.lg,
            },
          ]}
        >
          <View style={styles.bodyContent}>
            <AppText weight="regular" size="large" numberOfLines={1}>
              {group.name}
            </AppText>
            <View style={styles.originRow}>
              <AppText size="small" weight="light" color={theme.color.accent} numberOfLines={1}>
                {origin}
              </AppText>
              {group.region ? (
                <>
                  <View style={[styles.originDivider, { backgroundColor: theme.color.accent }]} />
                  <AppText size="small" weight="light" color={theme.color.accent} numberOfLines={1}>
                    {group.region}
                  </AppText>
                </>
              ) : null}
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statusDot, { backgroundColor: theme.color.success }]} />
            <View style={styles.statItem}>
              <Icon name="calendar" size={11} color={theme.color.text} strokeWidth={0.7} />
              <AppText size="xs" weight="light" color={theme.color.text}>
                {group.eventCount}
              </AppText>
            </View>
            <View style={styles.statItem}>
              <Icon name="camera" size={11} color={theme.color.text} strokeWidth={1} />
              <AppText size="xs" weight="light" color={theme.color.text}>
                {group.chekiCount}
              </AppText>
            </View>
            {group.spendLabel ? (
              <AppText size="xs" weight="light" style={styles.spend}>
                {group.spendLabel}
              </AppText>
            ) : null}
          </View>
        </View>
      </Pressable>

      <FavoriteButton
        variant="small"
        accessibilityLabel={group.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        isFavorite={group.isFavorite}
        onPress={onFavoritePress ?? (() => undefined)}
        style={styles.favorite}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  photo: {
    width: '100%',
    overflow: 'hidden',
  },
  photoFill: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingBottom: 6,
  },
  bodyContent: {
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  originRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  originDivider: {
    width: 1,
    height: 10,
    backgroundColor: DEFAULT_PRIMARY_SCALE.P300,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
    paddingRight: 10,
    height: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 2,
  },
  spend: {
    marginLeft: 'auto',
  },
  favorite: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 2,
  },
});
