import { View, ScrollView, Platform, StatusBar as RNStatusBar, type ViewStyle, type StyleProp } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore } from '@/stores/settingsStore';

// Keep the screen coordinate space stable while the keyboard overlays it.
// ScrollView's focus handling and BottomSheet's measured offset handle inputs
// that would otherwise be covered.
export const SCREEN_KEYBOARD_AVOIDING_BEHAVIOR = undefined;

export interface ScreenProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Screen({ children, style, scroll, contentStyle, testID }: ScreenProps) {
  const theme = useTheme();
  const themeMode = useSettingsStore((s) => s.settings?.themeMode ?? 'light');
  const content = scroll ? (
    <ScrollView
      testID={testID}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      scrollsChildToFocus
      contentContainerStyle={[{ padding: theme.spacing.md, paddingBottom: 120 }, contentStyle]}
    >
      {children}
    </ScrollView>
  ) : (
    <View testID={testID} style={[{ flex: 1, padding: theme.spacing.md }, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: theme.color.background }, style]} edges={['top']}>
      <RNStatusBar barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={theme.color.background} animated />
      {content}
    </SafeAreaView>
  );
}
