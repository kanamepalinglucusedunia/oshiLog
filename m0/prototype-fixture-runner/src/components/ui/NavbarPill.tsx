import { useEffect, useState } from 'react';
import { Animated, Easing, View, StyleSheet, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useTheme } from '@/hooks/useTheme';
import { MOTION_ELEMENT_MS } from '@/animation/motion';
import type { IconName } from './icons';

export interface NavItem {
  routeName: string;
  label: string;
  icon: IconName;
  /** Figma renders each nav icon inside a 24x24 instance with 3px padding (≈18px content). */
  iconSize?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { routeName: 'index', label: 'Home', icon: 'home' },
  { routeName: 'idols', label: 'Idol', icon: 'star' },
  { routeName: 'events', label: 'Event', icon: 'calendar' },
  { routeName: 'venues', label: 'Venue', icon: 'buildingOffice' },
  { routeName: 'trips', label: 'Trip', icon: 'plane' },
];

export const NAVBAR_WIDTH = 326;
export const NAVBAR_PADDING = 8;

const ITEM_SIZE = 38;

export interface NavbarPillProps {
  activeRoute: string;
  onNavigate: (routeName: string) => void;
  onFabPress?: () => void;
  dialOpen?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function NavbarPill({ activeRoute, onNavigate, onFabPress, dialOpen, style }: NavbarPillProps) {
  const theme = useTheme();
  const [spin] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(spin, {
      toValue: dialOpen ? 1 : 0,
      duration: MOTION_ELEMENT_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [dialOpen, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: theme.color.surface,
          borderColor: theme.surface.borderColor,
          borderWidth: theme.surface.borderWidth,
          shadowColor: theme.surface.shadowColor,
          shadowOpacity: theme.surface.shadowOpacity,
          shadowRadius: theme.surface.shadowRadius,
          shadowOffset: { width: 0, height: 2 },
          elevation: theme.surface.elevation,
        },
        style,
      ]}
    >
      {NAV_ITEMS.map((item) => {
        const active = item.routeName === activeRoute;
        return (
          <Pressable
            key={item.routeName}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => onNavigate(item.routeName)}
            style={({ pressed }) => [
              active ? styles.itemActive : styles.item,
              {
                backgroundColor: active ? theme.color.accentSurface : 'transparent',
                borderColor: active ? theme.color.accent : 'transparent',
              },
              pressed ? { opacity: 0.7 } : null,
            ]}
          >
            <View style={styles.iconBox}>
              <Icon
                name={item.icon}
                size={item.iconSize ?? 28}
                color={active ? theme.color.accent : theme.color.text}
                strokeWidth={1}
              />
            </View>
            {active ? (
              <AppText size="large" weight="light" color={theme.color.accent} style={styles.label} numberOfLines={1}>
                {item.label}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
      <Animated.View style={[styles.fabSpin, { transform: [{ rotate }] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quick actions"
          onPress={onFabPress}
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: theme.color.accentSoft,
              borderColor: theme.surface.borderColor,
              borderWidth: theme.surface.borderWidth,
            },
            pressed ? { opacity: 0.7 } : null,
          ]}
        >
          <Icon name="plus" size={24} color={theme.color.text} strokeWidth={1} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: NAVBAR_WIDTH,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: NAVBAR_PADDING,
    borderRadius: 100,
  },
  item: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 100,
    flexShrink: 0,
  },
  itemActive: {
    minWidth: ITEM_SIZE,
    height: ITEM_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 100,
    borderWidth: 1,
    flexShrink: 1,
  },
  iconBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    lineHeight: 22,
    flexShrink: 1,
  },
  fab: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabSpin: {
    flexShrink: 0,
  },
});
