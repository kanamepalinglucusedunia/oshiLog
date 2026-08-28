import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type LayoutRectangle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '@/hooks/useTheme';
import { MOTION_ELEMENT_MS } from '@/animation/motion';

export type DetailTab = 'summary' | 'cheki' | 'album';

export interface DetailTabItem {
  key: DetailTab;
  label: string;
}

export const DETAIL_TABS: DetailTabItem[] = [
  { key: 'summary', label: 'Details' },
  { key: 'cheki', label: 'Cheki' },
  { key: 'album', label: 'Album' },
];

export const DETAIL_TAB_FALLBACKS: Record<DetailTab, { x: number; width: number }> = {
  summary: { x: 8, width: 104 },
  cheki: { x: 112, width: 104 },
  album: { x: 216, width: 104 },
};

export interface DetailIdolTabIndicatorProps {
  activeTab: DetailTab;
  onChange: (tab: DetailTab) => void;
  style?: StyleProp<ViewStyle>;
}

export function DetailIdolTabIndicator({
  activeTab,
  onChange,
  style,
}: DetailIdolTabIndicatorProps) {
  const theme = useTheme();
  const [layouts, setLayouts] = useState<Partial<Record<DetailTab, LayoutRectangle>>>({});

  const fallback = DETAIL_TAB_FALLBACKS[activeTab] ?? DETAIL_TAB_FALLBACKS.summary;
  const activeLayout = layouts[activeTab];
  const targetX = activeLayout ? activeLayout.x : fallback.x;
  const targetWidth = activeLayout ? activeLayout.width : fallback.width;

  const [translateX] = useState(() => new Animated.Value(targetX));
  const [indicatorWidth] = useState(() => new Animated.Value(targetWidth));
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!hasInitialized.current) {
      translateX.setValue(targetX);
      indicatorWidth.setValue(targetWidth);
      hasInitialized.current = true;
      return;
    }

    Animated.parallel([
      Animated.timing(translateX, {
        toValue: targetX,
        duration: MOTION_ELEMENT_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(indicatorWidth, {
        toValue: targetWidth,
        duration: MOTION_ELEMENT_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [targetX, targetWidth, translateX, indicatorWidth]);

  const handleTabLayout = (key: DetailTab, layout: LayoutRectangle) => {
    setLayouts((prev) => {
      const current = prev[key];
      if (
        current &&
        Math.abs(current.x - layout.x) < 0.5 &&
        Math.abs(current.width - layout.width) < 0.5
      ) {
        return prev;
      }
      return { ...prev, [key]: layout };
    });
  };

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.container,
        {
          backgroundColor: theme.color.surface,
          borderColor: theme.surface.borderColor,
          borderWidth: theme.surface.borderWidth,
          shadowColor: theme.surface.shadowColor,
          shadowOpacity: theme.surface.shadowOpacity,
          shadowRadius: theme.surface.shadowRadius,
          elevation: Math.max(theme.surface.elevation, 4),
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          {
            width: indicatorWidth,
            backgroundColor: theme.color.accentSurface,
            borderColor: theme.color.accent,
            transform: [{ translateX }],
          },
        ]}
      />

      {DETAIL_TABS.map((item) => {
        const selected = item.key === activeTab;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={`${item.label} tab`}
            accessibilityState={{ selected }}
            onPress={() => onChange(item.key)}
            onLayout={(event) => handleTabLayout(item.key, event.nativeEvent.layout)}
            style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}
          >
            <AppText
              weight="regular"
              size="large"
              color={selected ? theme.color.accent : theme.color.text}
              numberOfLines={1}
            >
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 328,
    maxWidth: '100%',
    height: 50,
    borderRadius: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    position: 'relative',
    shadowOffset: { width: 0, height: 2 },
  },
  indicator: {
    position: 'absolute',
    top: 7,
    height: 34,
    borderRadius: 9999,
    borderWidth: 1,
  },
  tabButton: {
    flex: 1,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    paddingHorizontal: 6,
  },
  pressed: {
    opacity: 0.72,
  },
});
