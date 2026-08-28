import { Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { useTheme } from '@/hooks/useTheme';
import { useRouter } from 'expo-router';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  titleContent?: React.ReactNode;
  onBack?: (() => void) | false;
  right?: React.ReactNode;
  variant?: 'default' | 'detail';
  testID?: string;
}

export function Header({
  title,
  subtitle,
  titleContent,
  onBack,
  right,
  variant = 'default',
  testID,
}: HeaderProps) {
  const theme = useTheme();
  const router = useRouter();
  const isDetail = variant === 'detail';

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        { paddingHorizontal: theme.spacing.md },
        isDetail && styles.detailContainer,
      ]}
    >
      {onBack !== false ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack ?? (() => router.back())}
          hitSlop={12}
          style={[styles.backButton, isDetail && styles.detailBackButton]}
        >
          <Ionicons name="arrow-back" size={24} color={theme.color.text} />
        </Pressable>
      ) : null}
      <View style={styles.titleWrap}>
        {titleContent ?? (
          <AppText weight={isDetail ? 'semibold' : 'bold'} size="h3" numberOfLines={1}>
            {title}
          </AppText>
        )}
        {subtitle ? (
          <AppText size="small" muted numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 56,
    gap: 8,
  },
  detailContainer: {
    height: 46,
    minHeight: 0,
    paddingVertical: 8,
  },
  backButton: {
    padding: 4,
  },
  detailBackButton: {
    width: 24,
    height: 24,
    padding: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
