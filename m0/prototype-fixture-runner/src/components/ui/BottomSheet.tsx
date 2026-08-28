import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Modal,
  PanResponder,
  View,
  Pressable,
  Animated,
  StyleSheet,
  Dimensions,
  TextInput,
  Platform,
  type LayoutChangeEvent,
  type KeyboardEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const KEYBOARD_INPUT_GAP = 8;
const SHEET_CLOSE_DISTANCE = 120;
const SHEET_FLING_DISTANCE = 24;
const SHEET_CLOSE_VELOCITY = 1.2;

export interface MeasuredInputLayout {
  top: number;
  height: number;
}

/**
 * Keeps a sheet anchored to the full-screen coordinate space even when the
 * Android modal window is temporarily resized for the keyboard.
 */
export function calculateSheetTop(screenHeight: number, sheetHeight: number): number {
  if (!Number.isFinite(screenHeight) || !Number.isFinite(sheetHeight) || sheetHeight <= 0) return 0;
  return Math.max(0, screenHeight - sheetHeight);
}

/** Prefer the modal's measured full height over a device-level fallback. */
export function resolveSheetViewportHeight(measuredHeight: number | null | undefined, fallbackHeight: number): number {
  if (Number.isFinite(measuredHeight) && measuredHeight && measuredHeight > 0) return measuredHeight;
  return Number.isFinite(fallbackHeight) && fallbackHeight > 0 ? fallbackHeight : 0;
}

/** Returns true when a handle drag should dismiss the sheet. */
export function shouldCloseBottomSheet(translationY: number, velocityY: number): boolean {
  if (!Number.isFinite(translationY) || !Number.isFinite(velocityY)) return false;
  return translationY >= SHEET_CLOSE_DISTANCE
    || (translationY >= SHEET_FLING_DISTANCE && velocityY >= SHEET_CLOSE_VELOCITY);
}

/**
 * Returns the smallest sheet translation that keeps the focused input above
 * the keyboard. A visible input deliberately returns zero so the sheet does
 * not jump just because the keyboard opened.
 */
export function calculateKeyboardAvoidanceOffset(
  input: MeasuredInputLayout,
  keyboardTop: number,
): number {
  if (
    !Number.isFinite(input.top)
    || !Number.isFinite(input.height)
    || input.height <= 0
    || !Number.isFinite(keyboardTop)
    || keyboardTop <= 0
  ) {
    return 0;
  }

  const inputBottom = input.top + input.height;
  if (inputBottom <= keyboardTop) return 0;

  return -(inputBottom - keyboardTop + KEYBOARD_INPUT_GAP);
}

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Height of the sheet as a fraction of screen height. Default 0.9 */
  maxHeightRatio?: number;
  /** Let the sheet hug its content until the maximum height is reached. */
  fitContent?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Slide-up bottom sheet with explicit height for nested scrolling content. */
export function BottomSheet({
  visible,
  onClose,
  children,
  footer,
  maxHeightRatio = 0.9,
  fitContent = false,
  style,
}: BottomSheetProps) {
  const theme = useTheme();
  const maxSheetHeight = SCREEN_HEIGHT * maxHeightRatio;
  const [sheetHeight, setSheetHeight] = useState(maxSheetHeight);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [translateY] = useState(() => new Animated.Value(maxSheetHeight));
  const [keyboardOffset] = useState(() => new Animated.Value(0));
  const [dragOffset] = useState(() => new Animated.Value(0));
  const sheetViewportHeight = resolveSheetViewportHeight(viewportHeight, SCREEN_HEIGHT);

  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      dragOffset.stopAnimation();
      dragOffset.setValue(0);
      translateY.setValue(sheetHeight);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
        speed: 18,
      }).start();
    } else {
      dragOffset.stopAnimation();
      dragOffset.setValue(0);
      Animated.timing(translateY, {
        toValue: sheetHeight,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [dragOffset, visible, translateY, sheetHeight]);

  useEffect(() => {
    let active = true;
    const resetKeyboardOffset = () => {
      if (!active) return;
      keyboardOffset.stopAnimation();
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }).start();
    };

    if (!visible) {
      keyboardOffset.setValue(0);
      return undefined;
    }

    const handleKeyboardChange = (event: KeyboardEvent) => {
      const focusedInput = TextInput.State.currentlyFocusedInput();
      if (!focusedInput || typeof focusedInput.measureInWindow !== 'function') {
        resetKeyboardOffset();
        return;
      }

      focusedInput.measureInWindow((_left, top, _width, height) => {
        if (!active) return;
        const nextOffset = calculateKeyboardAvoidanceOffset(
          { top, height },
          event.endCoordinates.screenY,
        );

        keyboardOffset.stopAnimation();
        Animated.timing(keyboardOffset, {
          toValue: nextOffset,
          duration: event.duration > 0 ? event.duration : 200,
          useNativeDriver: true,
        }).start();
      });
    };

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardChange);
    const hideSubscription = Keyboard.addListener(hideEvent, resetKeyboardOffset);

    return () => {
      active = false;
      showSubscription.remove();
      hideSubscription.remove();
      keyboardOffset.stopAnimation();
      keyboardOffset.setValue(0);
    };
  }, [keyboardOffset, visible]);

  const handleLayout = (event: { nativeEvent: { layout: { height: number } } }) => {
    if (!fitContent) return;
    const nextHeight = Math.min(event.nativeEvent.layout.height, maxSheetHeight);
    if (nextHeight <= 0 || nextHeight === sheetHeight) return;
    setSheetHeight(nextHeight);
    if (!visible) translateY.setValue(nextHeight);
  };

  const handleBackdropLayout = useCallback((event: LayoutChangeEvent) => {
    const measuredHeight = event.nativeEvent.layout.height;
    if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) return;
    setViewportHeight((current) => current === null ? measuredHeight : Math.max(current, measuredHeight));
  }, []);

  const handleClose = useCallback(() => {
    dragOffset.stopAnimation();
    dragOffset.setValue(0);
    Keyboard.dismiss();
    onClose();
  }, [dragOffset, onClose]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_event, gestureState) => Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
    onPanResponderGrant: () => {
      Keyboard.dismiss();
      dragOffset.stopAnimation();
    },
    onPanResponderMove: (_event, gestureState) => {
      dragOffset.setValue(Math.max(0, gestureState.dy));
    },
    onPanResponderRelease: (_event, gestureState) => {
      if (shouldCloseBottomSheet(gestureState.dy, gestureState.vy)) {
        Animated.timing(dragOffset, {
          toValue: sheetHeight,
          duration: 180,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) handleClose();
        });
        return;
      }
      Animated.spring(dragOffset, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
        speed: 18,
      }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(dragOffset, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
        speed: 18,
      }).start();
    },
  }), [dragOffset, handleClose, sheetHeight]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onLayout={handleBackdropLayout} onPress={handleClose}>
        <Pressable
          style={[styles.sheetWrapper, { top: calculateSheetTop(sheetViewportHeight, sheetHeight) }]}
          onPress={() => undefined}
        >
          <Animated.View
            onLayout={handleLayout}
            style={[
              styles.sheet,
              fitContent ? { maxHeight: maxSheetHeight } : { height: maxSheetHeight },
              { transform: [{ translateY }, { translateY: keyboardOffset }, { translateY: dragOffset }] },
              {
                backgroundColor: theme.color.background,
                borderTopLeftRadius: theme.radius.md,
                borderTopRightRadius: theme.radius.md,
              },
              style,
            ]}
          >
            <View
              testID="bottom-sheet-drag-handle"
              accessibilityRole="adjustable"
              accessibilityLabel="Bottom sheet drag handle"
              style={styles.handleRow}
              {...panResponder.panHandlers}
            >
              <View style={[styles.handle, { backgroundColor: theme.color.textMuted }]} />
            </View>
            <View style={styles.content}>{children}</View>
            {footer ? (
              <View testID="bottom-sheet-footer" style={[styles.footer, { backgroundColor: theme.color.background }]}>
                {footer}
              </View>
            ) : null}
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: '100%',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
    minHeight: 32,
  },
  handle: {
    width: 150,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#BFBFBF',
  },
  content: {
    flex: 1,
    flexShrink: 1,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
});
