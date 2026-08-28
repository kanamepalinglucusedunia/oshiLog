import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal as RNModal, PanResponder, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/hooks/useTheme';
import { BLACK_SCALE } from '@/design-system/colors';
import { ratioBox, resizeBoxFromCorner, type CropBox, type Corner } from '@/components/album/ImageCropEditor';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface ProfilePhotoCropEditorProps {
  visible: boolean;
  uri: string;
  width: number;
  height: number;
  /** Crop box aspect ratio (width/height) the box is locked to. */
  ratio: number;
  /** Overlay a 1:1 guide square inside the crop box (idol card preview). */
  showSquareGuide?: boolean;
  /** Normalized initial box (0..1); defaults to the largest centered ratio box. */
  initialBox?: CropBox;
  /** Disables Done while the caller imports the result. */
  busy?: boolean;
  /** Failure message shown above the Done button. */
  error?: string | null;
  onCancel: () => void;
  onDone: (box: CropBox) => void | Promise<void>;
}

/**
 * Minimal fullscreen crop editor for profile photos: the crop box is locked to
 * a fixed ratio and can be moved and corner-resized (no rotate/flip/perspective
 * or batch editing). Used by the idol/group forms where the target display
 * ratio is known in advance.
 */
export function ProfilePhotoCropEditor({
  visible,
  uri,
  width,
  height,
  ratio,
  showSquareGuide = false,
  initialBox,
  busy = false,
  error = null,
  onCancel,
  onDone,
}: ProfilePhotoCropEditorProps) {
  const theme = useTheme();
  const [container, setContainer] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<CropBox>(() => initialBox ?? ratioBox(ratio, Math.max(1, width), Math.max(1, height)));
  const boxRef = useRef(box);
  const startBoxRef = useRef<CropBox>(box);
  const layoutRef = useRef({ dispW: 1, dispH: 1, aspect: 1 });

  useEffect(() => {
    boxRef.current = box;
  }, [box]);

  useEffect(() => {
    const c = container ?? { w: 0, h: 0 };
    const scale = Math.min(c.w / Math.max(1, width), c.h / Math.max(1, height));
    layoutRef.current = {
      dispW: Math.max(1, width * scale),
      dispH: Math.max(1, height * scale),
      aspect: width / Math.max(1, height),
    };
  }, [container, width, height]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    setContainer((current) => (current && current.w === w && current.h === h ? current : { w, h }));
  };

  const fitted = useMemo(() => {
    const c = container ?? { w: 0, h: 0 };
    if (c.w === 0 || c.h === 0 || width <= 0 || height <= 0) return null;
    const scale = Math.min(c.w / width, c.h / height);
    const ow = width * scale;
    const oh = height * scale;
    return { x: (c.w - ow) / 2, y: (c.h - oh) / 2, w: ow, h: oh };
  }, [container, width, height]);

  const reset = () => {
    setBox(ratioBox(ratio, Math.max(1, width), Math.max(1, height)));
  };

  const done = () => {
    if (busy) return;
    void onDone(boxRef.current);
  };

  // PanResponders are created once; handlers only touch refs/callbacks at
  // gesture time, never during render, so the manual memo is safe to keep.
  const moveBoxResponder = useMemo(
    () =>
      // Handlers only touch refs when invoked by the gesture system, never during render.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startBoxRef.current = boxRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const { dispW, dispH } = layoutRef.current;
          const start = startBoxRef.current;
          setBox({
            ...start,
            x: clamp(start.x + gesture.dx / dispW, 0, 1 - start.w),
            y: clamp(start.y + gesture.dy / dispH, 0, 1 - start.h),
          });
        },
      }),
    [],
  );

  const cornerResponders = useMemo(() => {
    const make = (corner: Corner) =>
      // Handlers only touch refs when invoked by the gesture system, never during render.
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startBoxRef.current = boxRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const { dispW, dispH, aspect } = layoutRef.current;
          setBox(
            resizeBoxFromCorner(
              startBoxRef.current,
              corner,
              gesture.dx / dispW,
              gesture.dy / dispH,
              ratio,
              aspect,
            ),
          );
        },
      });
    // eslint-disable-next-line react-hooks/refs
    return { tl: make('tl'), tr: make('tr'), bl: make('bl'), br: make('br') };
  }, [ratio]);

  const boxPx = fitted
    ? {
        x: fitted.x + box.x * fitted.w,
        y: fitted.y + box.y * fitted.h,
        w: box.w * fitted.w,
        h: box.h * fitted.h,
      }
    : null;

  // 1:1 guide: the square the app's 1:1 card crops out of the ratio-locked
  // box (contentFit="cover" centers the crop), so the user can preview both
  // the header (ratio box) and the card (square) at once.
  const guide = showSquareGuide && boxPx ? (() => {
    const side = Math.min(boxPx.w, boxPx.h);
    if (Math.abs(boxPx.w - side) < 0.5 && Math.abs(boxPx.h - side) < 0.5) return null;
    return { x: boxPx.x + (boxPx.w - side) / 2, y: boxPx.y + (boxPx.h - side) / 2, side };
  })() : null;

  return (
    <RNModal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel crop" onPress={onCancel} hitSlop={10} style={styles.topBarAction}>
            <AppText size="body" weight="semibold" color={BLACK_SCALE.B0}>Cancel</AppText>
          </Pressable>
          <AppText size="body" weight="semibold" color={BLACK_SCALE.B0}>Adjust Photo</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Reset crop" onPress={reset} hitSlop={10} style={styles.topBarAction}>
            <AppText size="body" weight="semibold" color={BLACK_SCALE.B0}>Reset</AppText>
          </Pressable>
        </View>

        <View style={styles.previewWrap}>
          <View style={styles.preview} onLayout={onLayout} testID="profile-crop-preview">
            {fitted ? (
              <>
                <Image
                  source={{ uri }}
                  style={{ position: 'absolute', left: fitted.x, top: fitted.y, width: fitted.w, height: fitted.h }}
                  contentFit="fill"
                  accessibilityLabel="Crop preview image"
                />

                {boxPx ? (
                  <>
                    <View pointerEvents="none" style={[styles.dim, { top: 0, left: 0, right: 0, height: boxPx.y }]} />
                    <View pointerEvents="none" style={[styles.dim, { top: boxPx.y + boxPx.h, left: 0, right: 0, bottom: 0 }]} />
                    <View pointerEvents="none" style={[styles.dim, { top: boxPx.y, height: boxPx.h, left: 0, width: boxPx.x }]} />
                    <View
                      pointerEvents="none"
                      style={[styles.dim, { top: boxPx.y, height: boxPx.h, right: 0, width: (container?.w ?? 0) - boxPx.x - boxPx.w }]}
                    />

                    <View
                      {...moveBoxResponder.panHandlers}
                      style={[styles.cropArea, { left: boxPx.x, top: boxPx.y, width: boxPx.w, height: boxPx.h, borderColor: theme.color.accent }]}
                    >
                      <View pointerEvents="none" style={styles.gridV1} />
                      <View pointerEvents="none" style={styles.gridV2} />
                      <View pointerEvents="none" style={styles.gridH1} />
                      <View pointerEvents="none" style={styles.gridH2} />
                    </View>

                    {guide ? (
                      <View
                        pointerEvents="none"
                        accessibilityLabel="1:1 card preview guide"
                        style={[styles.squareGuide, { left: guide.x, top: guide.y, width: guide.side, height: guide.side, borderColor: theme.color.accent }]}
                      >
                        <AppText size="xs" color={theme.color.accent} style={styles.squareGuideLabel}>1:1</AppText>
                      </View>
                    ) : null}

                    {(['tl', 'tr', 'bl', 'br'] as Corner[]).map((corner) => {
                      const isLeft = corner.includes('l');
                      const isTop = corner.includes('t');
                      return (
                        <View
                          key={corner}
                          {...cornerResponders[corner].panHandlers}
                          accessible
                          accessibilityLabel={`Crop handle ${isTop ? 'top' : 'bottom'}-${isLeft ? 'left' : 'right'}`}
                          style={{
                            position: 'absolute',
                            left: isLeft ? boxPx.x : boxPx.x + boxPx.w - 40,
                            top: isTop ? boxPx.y : boxPx.y + boxPx.h - 40,
                            width: 40,
                            height: 40,
                          }}
                        >
                          <View
                            pointerEvents="none"
                            style={{
                              position: 'absolute',
                              width: 28,
                              height: 5,
                              borderRadius: 3,
                              borderWidth: 1.5,
                              borderColor: BLACK_SCALE.B0,
                              backgroundColor: theme.color.accent,
                              left: isLeft ? 0 : 12,
                              top: isTop ? 0 : 35,
                            }}
                          />
                          <View
                            pointerEvents="none"
                            style={{
                              position: 'absolute',
                              width: 5,
                              height: 28,
                              borderRadius: 3,
                              borderWidth: 1.5,
                              borderColor: BLACK_SCALE.B0,
                              backgroundColor: theme.color.accent,
                              left: isLeft ? 0 : 35,
                              top: isTop ? 0 : 12,
                            }}
                          />
                        </View>
                      );
                    })}
                  </>
                ) : null}
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.panel}>
          {error ? (
            <AppText size="small" color={theme.color.danger} style={{ textAlign: 'center' }}>{error}</AppText>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done cropping"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={done}
            style={[styles.applyButton, { backgroundColor: theme.color.accent, opacity: busy ? 0.7 : 1 }]}
          >
            <AppText size="body" weight="bold" color={theme.color.onAccent}>{busy ? 'Applying…' : 'Done'}</AppText>
          </Pressable>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    paddingTop: 56,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  topBarAction: {
    minWidth: 64,
    paddingVertical: 4,
  },
  previewWrap: {
    flex: 1,
    // Inset from the screen edges so the crop handles are never flush
    // against the sides (avoids the system back-gesture and makes the
    // corner handles easy to grab).
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  preview: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cropArea: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  gridV1: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '33.33%',
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  gridV2: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '66.66%',
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  gridH1: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '33.33%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  gridH2: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '66.66%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  squareGuide: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  squareGuideLabel: {
    position: 'absolute',
    top: -20,
    right: 0,
  },
  panel: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 32,
    backgroundColor: '#1C1C22',
  },
  applyButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
  },
});
