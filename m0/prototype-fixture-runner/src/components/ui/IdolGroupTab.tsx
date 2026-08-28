import { Fragment, useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '@/hooks/useTheme';
import { BLACK_SCALE } from '@/design-system/colors';
import { MOTION_ELEMENT_MS } from '@/animation/motion';

export type IdolGroupSegment = 'idol' | 'group';

export interface IdolGroupTabProps {
  value: IdolGroupSegment;
  onChange: (value: IdolGroupSegment) => void;
}

const SEGMENTS: { value: IdolGroupSegment; label: string }[] = [
  { value: 'idol', label: 'Idol' },
  { value: 'group', label: 'Group' },
];

export function IdolGroupTab({ value, onChange }: IdolGroupTabProps) {
  const theme = useTheme();
  const [containerWidth, setContainerWidth] = useState(328);
  const [progress] = useState(() => new Animated.Value(value === 'idol' ? 0 : 1));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value === 'idol' ? 0 : 1,
      duration: MOTION_ELEMENT_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [value, progress]);

  const padding = 7;
  const gap = 16;
  const segmentWidth = Math.max(0, (containerWidth - padding * 2 - gap) / 2);
  const leftX = padding;
  const rightX = padding + segmentWidth + gap;

  const indicatorX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [leftX, rightX],
  });

  return (
    <View
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      style={[
        styles.container,
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
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          {
            width: segmentWidth,
            backgroundColor: theme.color.accentSurface,
            borderColor: theme.color.accent,
            transform: [{ translateX: indicatorX }],
          },
        ]}
      />

      {SEGMENTS.map((segment, index) => {
        const selected = segment.value === value;
        return (
          <Fragment key={segment.value}>
            {index === 1 && (
              <View pointerEvents="none" style={styles.divider} />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(segment.value)}
              style={({ pressed }) => [styles.segment, pressed && !selected ? { opacity: 0.6 } : null]}
            >
              <AppText size="large" weight="regular" color={selected ? theme.color.accent : theme.color.text}>
                {segment.label}
              </AppText>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 7,
    paddingVertical: 7,
    borderRadius: 100,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 7,
    height: 26,
    borderWidth: 1,
    borderRadius: 100,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: BLACK_SCALE.B300,
  },
  segment: {
    flex: 1,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
});

