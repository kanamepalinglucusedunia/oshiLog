import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTabPagerStore } from '@/stores/tabPagerStore';
import { MOTION_SCREEN_MS } from '@/animation/motion';

/** Swipe order across main tabs. Group is a sub-tab inside the Idol tab. */
export const TAB_SWIPE_ORDER = ['/', '/idols', '/events', '/venues', '/trips'] as const;

/** Drag past 40% of the screen width (or a fast flick) counts as a tab switch. */
const SNAP_RATIO = 0.4;
/** Flick velocity threshold in px/ms (PanResponder reports px per millisecond). */
const SNAP_VELOCITY = 0.6;
/** Scale at zero opacity, interpolated to 1 when fully visible (Smart Animate style). */
const SCALE_HIDDEN = 0.96;

export interface SwipeableTabProps {
  /** Fixed slot index of this screen in the swipe order. */
  index: number;
  onNavigate: (targetIndex: number) => void;
  /** Sub-tab callbacks: called directly without moving the pager (e.g. Idol/Group). */
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  children: ReactNode;
}

/**
 * Wraps a tab screen as a pager page. Pages stay mounted; switching tabs plays
 * a Smart-Animate-style crossfade: the focused page eases in (opacity 0→1,
 * scale 0.96→1) while the rest sit at opacity 0 — 240ms ease-in-out, never a
 * slide. A horizontal swipe past the threshold (or a fast flick) commits the
 * switch; the page never follows the finger.
 *
 * Uses plain RN Animated + PanResponder: reliable under React Compiler,
 * unlike Reanimated shared-value effects or gesture-handler callbacks.
 */
export function SwipeableTab({ index, onNavigate, onSwipeLeft, onSwipeRight, children }: SwipeableTabProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const focusedIndex = useTabPagerStore((s) => s.focusedIndex);
  const focused = index === focusedIndex;

  // Start at the resting opacity for the focused page, hidden otherwise.
  // The effect animates every focus change; starting at 1 when focused means
  // the page is never stuck invisible if an animation is interrupted.
  const [progress] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: focused ? 1 : 0,
      duration: MOTION_SCREEN_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [focused, progress]);

  const animatedStyle = {
    opacity: progress,
    transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [SCALE_HIDDEN, 1] }) }],
  };

  const canGoNext = index < TAB_SWIPE_ORDER.length - 1;
  const canGoPrev = index > 0;

  const handleNavigate = useCallback(
    (targetIndex: number) => {
      onNavigate?.(targetIndex);
      const targetRoute = TAB_SWIPE_ORDER[targetIndex];
      if (targetRoute) {
        router.navigate(targetRoute as Parameters<typeof router.navigate>[0]);
      }
    },
    [onNavigate, router],
  );

  const commitSwipe = useCallback(
    (goPrev: boolean) => {
      if (goPrev) {
        if (onSwipeRight) onSwipeRight();
        else handleNavigate(index - 1);
      } else {
        if (onSwipeLeft) onSwipeLeft();
        else handleNavigate(index + 1);
      }
    },
    [index, handleNavigate, onSwipeLeft, onSwipeRight],
  );

  const panResponder = useMemo(() => {
    if (!focused) return null;
    return PanResponder.create({
      // Only claim horizontal swipes; leave vertical scroll to FlatList/ScrollView.
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderRelease: (_event, gesture) => {
        const shouldGoNext = gesture.dx < -width * SNAP_RATIO || (gesture.dx < 0 && gesture.vx < -SNAP_VELOCITY);
        const shouldGoPrev = gesture.dx > width * SNAP_RATIO || (gesture.dx > 0 && gesture.vx > SNAP_VELOCITY);
        if (shouldGoNext && canGoNext) commitSwipe(false);
        else if (shouldGoPrev && canGoPrev) commitSwipe(true);
      },
    });
  }, [focused, width, canGoNext, canGoPrev, commitSwipe]);

  return (
    <View style={styles.page} {...(panResponder?.panHandlers ?? {})}>
      <Animated.View style={[styles.page, animatedStyle]}>{children}</Animated.View>
    </View>
  );
}

const styles = {
  page: { flex: 1 },
};
