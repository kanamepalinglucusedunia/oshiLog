import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal as RNModal, PanResponder, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Svg, { Line, Polygon } from 'react-native-svg';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/hooks/useTheme';
import { BLACK_SCALE } from '@/design-system/colors';
import { cropImageUri, type CropTransform } from '@/services/media';
import { perspectiveOutputSize } from '@/services/perspective';
import type { EnhanceIntensity } from '@/services/instaxEnhance';
import { INSTAX_PRESETS, type InstaxPreset } from '@/services/instaxDetect';
import { defaultQuad, isIdentityQuad, moveQuadCorner, type PerspectiveQuad, type Point } from '@/utils/geometry';
import type { StoredInstaxPreset } from '@/types/domain';

/** Normalized crop box (0..1) relative to the displayed (post-transform) image. */
export type CropBox = { x: number; y: number; w: number; h: number };

type Corner = 'tl' | 'tr' | 'bl' | 'br';

const MIN_BOX = 0.06;

/** Magnifier loupe size (diameter, px) and zoom factor shown while dragging a perspective corner. */
const LOUPE_DIAMETER = 108;
const LOUPE_ZOOM = 2.4;

/** A photo pending batch cropping; `key` matches the parent's pending file key. */
export interface CropPhoto {
  key: number;
  uri: string;
  width: number;
  height: number;
}

/** Per-photo editor state kept while the user flips through the batch. */
type CropEditorDraft = {
  rotation: number; // quarters clockwise (0..3)
  flipped: boolean;
  ratioKey: string;
  box: CropBox;
  /** Active perspective corner handles, or null while in normal crop mode. */
  perspective: PerspectiveQuad | null;
};

const RATIOS: { key: string; label: string; ratio: number | null }[] = [
  { key: 'free', label: 'Free', ratio: null },
  { key: '1:1', label: '1:1', ratio: 1 },
  { key: '4:3', label: '4:3', ratio: 4 / 3 },
  { key: '3:4', label: '3:4', ratio: 3 / 4 },
  { key: '16:9', label: '16:9', ratio: 16 / 9 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fullBox(): CropBox {
  return { x: 0, y: 0, w: 1, h: 1 };
}

function defaultDraft(): CropEditorDraft {
  return { rotation: 0, flipped: false, ratioKey: 'free', box: fullBox(), perspective: null };
}

/** Point at fraction `t` along a segment from `a` to `b`. */
function edgePoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Largest centered box with the given pixel ratio. Normalized space is not
 * square for non-square images, so the image dimensions must be factored in:
 * (w * imgW) / (h * imgH) === ratio.
 */
export function ratioBox(ratio: number, imgW: number, imgH: number): CropBox {
  const aspect = imgW / Math.max(1, imgH);
  const k = ratio / aspect;
  let w: number;
  let h: number;
  if (k >= 1) {
    w = 1;
    h = 1 / k;
  } else {
    h = 1;
    w = k;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** Fits a ratio-locked box anchored on one corner toward the dragged corner. */
function boxFromAnchor(anchor: { x: number; y: number }, pointer: { x: number; y: number }, ratio: number, aspect: number): CropBox {
  const dirX = pointer.x >= anchor.x ? 1 : -1;
  const dirY = pointer.y >= anchor.y ? 1 : -1;
  const wBound = dirX > 0 ? 1 - anchor.x : anchor.x;
  const hBound = dirY > 0 ? 1 - anchor.y : anchor.y;
  let w = clamp(Math.abs(pointer.x - anchor.x), MIN_BOX, wBound);
  let h = (w * aspect) / ratio;
  if (h > hBound) {
    h = hBound;
    w = Math.min(wBound, (h * ratio) / aspect);
  }
  const x = dirX > 0 ? anchor.x : anchor.x - w;
  const y = dirY > 0 ? anchor.y : anchor.y - h;
  return { x, y, w, h };
}

export type { Corner };

/**
 * Resizes `start` by dragging one corner by (dx, dy) display-normalized
 * deltas. The corner opposite the dragged one stays fixed; for a locked ratio
 * the box is re-derived with `aspect` (image pixel aspect) so the pixel ratio
 * holds. Exported as a test seam.
 */
export function resizeBoxFromCorner(
  start: CropBox,
  corner: Corner,
  dx: number,
  dy: number,
  ratio: number | null,
  aspect: number,
): CropBox {
  const anchorX = corner.includes('l') ? start.x + start.w : start.x;
  const anchorY = corner.includes('t') ? start.y + start.h : start.y;
  const startX = corner.includes('l') ? start.x : start.x + start.w;
  const startY = corner.includes('t') ? start.y : start.y + start.h;
  const targetX = startX + dx;
  const targetY = startY + dy;
  if (ratio != null) {
    return boxFromAnchor({ x: anchorX, y: anchorY }, { x: targetX, y: targetY }, ratio, aspect);
  }
  const x = clamp(Math.min(targetX, anchorX), 0, 1);
  const y = clamp(Math.min(targetY, anchorY), 0, 1);
  const w = clamp(Math.abs(targetX - anchorX), MIN_BOX, 1 - x);
  const h = clamp(Math.abs(targetY - anchorY), MIN_BOX, 1 - y);
  return { x, y, w, h };
}

/**
 * Converts a draft (rotation/flip/box/perspective) into the final transform in
 * the image's pixel space after flip + rotation. Returns an empty object for
 * the identity (no crop, no rotation, no flip). Perspective and box crop are
 * mutually exclusive – perspective wins when present.
 */
export function cropTransformFromDraft(
  d: { rotation: number; flipped: boolean; box: CropBox; perspective?: PerspectiveQuad | null },
  width: number,
  height: number,
): CropTransform {
  const finalW = d.rotation % 2 === 1 ? height : width;
  const finalH = d.rotation % 2 === 1 ? width : height;
  const b = d.box;
  const originX = clamp(Math.round(b.x * finalW), 0, Math.max(0, finalW - 1));
  const originY = clamp(Math.round(b.y * finalH), 0, Math.max(0, finalH - 1));
  const crop = {
    originX,
    originY,
    width: clamp(Math.round(b.w * finalW), 1, Math.max(1, finalW - originX)),
    height: clamp(Math.round(b.h * finalH), 1, Math.max(1, finalH - originY)),
  };
  const isFullFrame = b.x <= 0.001 && b.y <= 0.001 && b.w >= 0.999 && b.h >= 0.999;
  const base = {
    ...(d.rotation > 0 ? { rotateDegrees: (d.rotation * 90) as 90 | 180 | 270 } : {}),
    ...(d.flipped ? { flipped: true } : {}),
  };
  if (d.perspective != null && !isIdentityQuad(d.perspective)) {
    return { ...base, perspective: d.perspective };
  }
  return { ...base, ...(!isFullFrame ? { crop } : {}) };
}

/**
 * Restores an editor draft from a previously committed transform so re-opening
 * the editor shows the same crop border over the ORIGINAL image. Transforms
 * store pixels in the final oriented space (rotation/flip applied), while the
 * box is normalized to that same space, so each dimension is divided back by
 * the oriented size. The ratio chip is best-effort rebuilt from the pixel
 * aspect when it matches one of the presets.
 */
export function draftFromTransform(transform: CropTransform, width: number, height: number): CropEditorDraft {
  const rotation = (transform.rotateDegrees ?? 0) / 90;
  const flipped = transform.flipped ?? false;
  const swapped = rotation % 2 === 1;
  const finalW = swapped ? height : width;
  const finalH = swapped ? width : height;
  let box = fullBox();
  let ratioKey = 'free';
  if (transform.crop) {
    const c = transform.crop;
    box = {
      x: clamp(c.originX / Math.max(1, finalW), 0, 1),
      y: clamp(c.originY / Math.max(1, finalH), 0, 1),
      w: clamp(c.width / Math.max(1, finalW), 0, 1),
      h: clamp(c.height / Math.max(1, finalH), 0, 1),
    };
    const aspect = c.width / Math.max(1, c.height);
    const matched = RATIOS.find((option) => option.ratio != null && Math.abs(option.ratio - aspect) < 0.01);
    if (matched) ratioKey = matched.key;
  }
  const perspective = transform.perspective ? { ...transform.perspective } : null;
  // A perspective re-open keeps its quad; the ratio chips do not apply there.
  return { rotation, flipped, ratioKey, box, perspective };
}

/**
 * Composes a follow-up edit (applied to the output of an earlier transform)
 * into a single transform in the ORIGINAL image's pixel space. This lets a
 * re-crop always read from the original file instead of re-encoding the
 * previous crop. Box-crop chains are exact: the follow-up rect is offset by
 * the earlier crop's origin. Rotation/flip/perspective in the follow-up are
 * returned unchanged, so the caller falls back to re-cropping the preview in
 * that rare case.
 */
export function composeTransforms(applied: CropTransform, extra: CropTransform): CropTransform {
  if (applied.perspective || extra.perspective || extra.rotateDegrees || extra.flipped || !extra.crop) {
    return extra;
  }
  const base = {
    ...(applied.rotateDegrees ? { rotateDegrees: applied.rotateDegrees } : {}),
    ...(applied.flipped ? { flipped: true } : {}),
  };
  return {
    ...base,
    crop: {
      originX: (applied.crop?.originX ?? 0) + extra.crop.originX,
      originY: (applied.crop?.originY ?? 0) + extra.crop.originY,
      width: extra.crop.width,
      height: extra.crop.height,
    },
  };
}

export interface ImageCropEditorProps {
  visible: boolean;
  /** All selected photos; the user flips between them via the bottom strip. */
  photos: CropPhoto[];
  /** Photo to show first when the screen opens. */
  initialKey?: number | null;
  onCancel: () => void;
  /**
   * All non-identity crops, keyed by photo key, plus an optional per-photo
   * enhance strength (0 = off) applied after cropping by the caller.
   */
  onDone: (
    crops: Record<number, CropTransform>,
    enhances?: Record<number, EnhanceIntensity>,
    instaxPresets?: Record<number, StoredInstaxPreset>,
  ) => void | Promise<void>;
  /**
   * Commits the active photo preview while keeping this editor open. The third
   * argument is the transform that produced the preview, expressed in the
   * ORIGINAL image's pixel space — callers store it so a later re-crop can open
   * the same photo again with its border restored.
   */
  onPreviewUpdate?: (key: number, preview: CropPhoto, transform: CropTransform) => void | Promise<void>;
  /**
   * Previously committed crops per photo key (used to restore the crop border
   * when the editor is reopened over the original images). The editor is
   * remounted per open session, so this seeds the initial drafts.
   */
  initialCrops?: Record<number, CropTransform>;
  /** When provided, an "Auto" button detects the subject (e.g. instax card) and fills the perspective quad. */
  onAutoDetect?: (uri: string, preset: InstaxPreset) => Promise<PerspectiveQuad | null>;
  /** When provided, an "Enhance" control (off/light/strong) is shown and drives live previews. */
  onEnhancePreview?: (uri: string, intensity: EnhanceIntensity) => Promise<string>;
}

function editedDimensions(photo: CropPhoto, transform: CropTransform): { width: number; height: number } {
  const rotated = transform.rotateDegrees === 90 || transform.rotateDegrees === 270;
  const oriented = {
    width: rotated ? photo.height : photo.width,
    height: rotated ? photo.width : photo.height,
  };
  if (transform.perspective) return perspectiveOutputSize(transform.perspective, oriented.width, oriented.height);
  if (transform.crop) return { width: transform.crop.width, height: transform.crop.height };
  return oriented;
}

/**
 * Layout rects for the perspective magnifier loupe: a scaled copy of the whole
 * oriented preview, absolutely positioned so the dragged corner `p` stays at
 * the loupe center. Exported as a test seam.
 */
export function loupeLayout(
  fitted: { dispX: number; dispY: number; dispW: number; dispH: number; drawW: number; drawH: number },
  p: { x: number; y: number },
  zoom: number,
  loupeDiameter = LOUPE_DIAMETER,
): {
  left: number;
  top: number;
  width: number;
  height: number;
  imageLeft: number;
  imageTop: number;
  imageWidth: number;
  imageHeight: number;
} {
  const loupeCenter = loupeDiameter / 2;
  return {
    // These offsets are local to the loupe. The dragged corner is placed at
    // the loupe center, not at its original preview coordinates.
    left: loupeCenter - (p.x - fitted.dispX) * zoom,
    top: loupeCenter - (p.y - fitted.dispY) * zoom,
    width: fitted.dispW * zoom,
    height: fitted.dispH * zoom,
    imageLeft: ((fitted.dispW - fitted.drawW) * zoom) / 2,
    imageTop: ((fitted.dispH - fitted.drawH) * zoom) / 2,
    imageWidth: fitted.drawW * zoom,
    imageHeight: fitted.drawH * zoom,
  };
}

/**
 * Position for the magnifier loupe. Its screen position is fixed by the
 * handle's side (Google Photos style): right-side corners use the preview's
 * upper-left, left-side corners use its upper-right. Only the image content
 * inside the loupe follows the dragged corner.
 */
export function loupePlacement(
  cornerName: keyof PerspectiveQuad,
  diameter: number,
  container: { w: number; h: number },
  topInset = 24,
): { left: number; top: number } {
  const leftSide = cornerName === 'tl' || cornerName === 'bl';
  return {
    // Fixed placement prevents the loupe from jumping or being covered by
    // the finger while the image content beneath it follows the handle.
    left: leftSide ? Math.max(0, container.w - diameter) : 0,
    top: clamp(topInset, 0, Math.max(0, container.h - diameter)),
  };
}

/**
 * Fullscreen batch crop + perspective editor. Each photo keeps its own draft
 * (box, ratio, rotation, flip, perspective corners); a horizontal strip at the
 * bottom lets the user switch and edit every selected photo in a single
 * screen, then Done applies all edits.
 */
export function ImageCropEditor({ visible, photos, initialKey, initialCrops, onCancel, onDone, onPreviewUpdate, onAutoDetect, onEnhancePreview }: ImageCropEditorProps) {
  const theme = useTheme();
  const [container, setContainer] = useState<{ w: number; h: number } | null>(null);
  const [drafts, setDrafts] = useState<Record<number, CropEditorDraft>>(() => {
    // The editor is remounted per open session (the parent keys it), so this
    // seeds the previous round's crops over the ORIGINAL images: the same
    // border the user last applied.
    const seeded: Record<number, CropEditorDraft> = {};
    for (const photo of photos) {
      const transform = initialCrops?.[photo.key];
      seeded[photo.key] = transform ? draftFromTransform(transform, photo.width, photo.height) : defaultDraft();
    }
    return seeded;
  });
  // Remounted per open session (the parent keys the component), so this starts
  // fresh with the photo the user tapped.
  const [activeKey, setActiveKey] = useState<number | null>(() => initialKey ?? photos[0]?.key ?? null);
  /** Perspective corner being dragged (drives the magnifier loupe). */
  const [dragCorner, setDragCorner] = useState<keyof PerspectiveQuad | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [workingPhotos, setWorkingPhotos] = useState<Record<number, CropPhoto>>(() =>
    Object.fromEntries(photos.map((photo) => [photo.key, photo])),
  );
  /** Per-photo enhance strength (0 = off) for the final import pipeline. */
  const [enhanceLevels, setEnhanceLevels] = useState<Record<number, EnhanceIntensity>>({});
  /** Instax size preset per photo; Auto is persisted as the default Mini preset. */
  const [autoPresets, setAutoPresets] = useState<Record<number, InstaxPreset>>({});
  const [autoDetecting, setAutoDetecting] = useState(false);
  /**
   * Transforms already committed via the preview for each photo. A follow-up
   * edit after a preview lives in the preview's coordinate space; these are
   * composed back into the original image's pixel space so cropping always
   * reads from the original file.
   */
  const appliedTransforms = useRef<Record<number, CropTransform>>({});

  const activePhoto = (activeKey != null ? workingPhotos[activeKey] : undefined) ?? photos.find((photo) => photo.key === activeKey) ?? photos[0] ?? null;
  const width = activePhoto?.width ?? 1;
  const height = activePhoto?.height ?? 1;
  const draft = activeKey != null ? (drafts[activeKey] ?? defaultDraft()) : defaultDraft();
  const selection = RATIOS.find((option) => option.key === draft.ratioKey) ?? RATIOS[0];
  const activeIndex = photos.findIndex((photo) => photo.key === activePhoto?.key);
  const isPerspectiveMode = draft.perspective != null;
  const activeEnhance = activeKey != null ? (enhanceLevels[activeKey] ?? 0) : 0;
  const activePreset = activeKey != null ? (autoPresets[activeKey] ?? 'mini') : 'mini';

  /**
   * Live enhance preview: when the active photo's level changes, asks the
   * caller for a downscaled enhanced copy (debounced) and swaps it into the
   * working photo used for the preview. Level 0 restores the original in the
   * press handler (event scope), so no synchronous setState happens here.
   */
  useEffect(() => {
    if (!onEnhancePreview || activeKey == null) return;
    const original = photos.find((photo) => photo.key === activeKey);
    if (!original) return;
    const level = enhanceLevels[activeKey] ?? 0;
    if (level === 0) return;
    const handle = setTimeout(() => {
      onEnhancePreview(original.uri, level)
        .then((enhanced) => {
          setWorkingPhotos((current) => {
            const currentPhoto = current[activeKey] ?? original;
            return { ...current, [activeKey]: { ...currentPhoto, uri: enhanced } };
          });
        })
        .catch(() => {
          // Keep the previous preview; enhance is non-fatal.
        });
    }, 150);
    return () => clearTimeout(handle);
  }, [activeKey, enhanceLevels, onEnhancePreview, photos]);

  /** Sets the active photo's enhance level; Off restores the original URI. */
  const setEnhanceForActive = (level: EnhanceIntensity) => {
    if (activeKey == null) return;
    setEnhanceLevels((current) => ({ ...current, [activeKey]: level }));
    if (level === 0) {
      const original = photos.find((photo) => photo.key === activeKey);
      if (original) {
        setWorkingPhotos((current) => {
          const photo = current[activeKey];
          return photo && photo.uri !== original.uri ? { ...current, [activeKey]: { ...photo, uri: original.uri } } : current;
        });
      }
    }
  };

  const setAutoPresetForActive = (preset: InstaxPreset) => {
    if (activeKey == null) return;
    setAutoPresets((current) => ({ ...current, [activeKey]: preset }));
  };

  // The editor can mount with no photos yet (the parent renders it hidden with
  // an empty list). Callers remount with a fresh key when photos arrive, so no
  // effect-driven state sync is needed here.

  // Refs give the (stable) PanResponders access to up-to-date state without
  // recreating them on every interaction. They are written in effects, never
  // during render.
  const draftRef = useRef(draft);
  const startBoxRef = useRef<CropBox>(draft.box);
  const startQuadRef = useRef<PerspectiveQuad>(draft.perspective ?? defaultQuad());
  const activeKeyRef = useRef<number | null>(activeKey);
  const layoutRef = useRef({
    container: { w: 0, h: 0 },
    width,
    height,
    rotation: draft.rotation,
    flipped: draft.flipped,
    ratio: null as number | null,
    dispW: 0,
    dispH: 0,
    aspect: 1,
  });

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    activeKeyRef.current = activeKey;
  }, [activeKey]);

  useEffect(() => {
    const containerSize = container ?? { w: 0, h: 0 };
    const fitScale = Math.min(containerSize.w / Math.max(1, width), containerSize.h / Math.max(1, height));
    const orientedW = width * fitScale;
    const orientedH = height * fitScale;
    const swappedGrid = draft.rotation % 2 === 1;
    const finalW = swappedGrid ? height : width;
    const finalH = swappedGrid ? width : height;
    layoutRef.current = {
      container: containerSize,
      width,
      height,
      rotation: draft.rotation,
      flipped: draft.flipped,
      ratio: selection.ratio,
      dispW: swappedGrid ? orientedH : orientedW,
      dispH: swappedGrid ? orientedW : orientedH,
      aspect: finalW / Math.max(1, finalH),
    };
  }, [container, width, height, draft.rotation, draft.flipped, selection]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    setContainer((current) => (current && current.w === w && current.h === h ? current : { w, h }));
  };

  /** Patches the draft of the currently active photo. */
  const patchActive = useCallback((patch: Partial<CropEditorDraft>) => {
    const key = activeKeyRef.current;
    if (key == null) return;
    setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? defaultDraft()), ...patch } }));
  }, []);

  const setActiveDraft = (next: CropEditorDraft) => {
    const key = activeKeyRef.current;
    if (key == null) return;
    setDrafts((prev) => ({ ...prev, [key]: next }));
  };

  /** Ratio box for the given rotation (dims swap on 90°/270°). */
  const ratioBoxFor = (ratio: number, rot: number): CropBox => {
    const finalW = rot % 2 === 1 ? height : width;
    const finalH = rot % 2 === 1 ? width : height;
    return ratioBox(ratio, finalW, finalH);
  };

  const selectRatio = (key: string) => {
    const option = RATIOS.find((item) => item.key === key);
    patchActive({
      ratioKey: key,
      ...(option?.ratio != null ? { box: ratioBoxFor(option.ratio, draft.rotation) } : {}),
    });
  };

  const selectMode = (mode: 'crop' | 'perspective') => {
    patchActive({ perspective: mode === 'perspective' ? defaultQuad() : null });
  };

  const resetActive = () => {
    if (isPerspectiveMode) {
      patchActive({ perspective: defaultQuad() });
    } else {
      setActiveDraft(defaultDraft());
    }
  };

  const rotateActive = () => {
    const nextRotation = (draft.rotation + 1) % 4;
    // The perspective corner handles live in the oriented space, so a rotation
    // invalidates them – reset them back to the full frame.
    patchActive({
      rotation: nextRotation,
      box: selection.ratio != null ? ratioBoxFor(selection.ratio, nextRotation) : fullBox(),
      ...(isPerspectiveMode ? { perspective: defaultQuad() } : {}),
    });
  };

  const flipActive = () => {
    patchActive({
      flipped: !draft.flipped,
      box: selection.ratio != null ? ratioBoxFor(selection.ratio, draft.rotation) : fullBox(),
      ...(isPerspectiveMode ? { perspective: defaultQuad() } : {}),
    });
  };

  // Displayed (post-flip/rotation) fitted rect within the preview container.
  const fitted = useMemo(() => {
    const c = container ?? { w: 0, h: 0 };
    if (c.w === 0 || c.h === 0 || width <= 0 || height <= 0) return null;
    const scale = Math.min(c.w / width, c.h / height);
    const ow = width * scale;
    const oh = height * scale;
    const ox = (c.w - ow) / 2;
    const oy = (c.h - oh) / 2;
    const swapped = draft.rotation % 2 === 1;
    return {
      dispX: swapped ? (c.w - oh) / 2 : ox,
      dispY: swapped ? (c.h - ow) / 2 : oy,
      dispW: swapped ? oh : ow,
      dispH: swapped ? ow : oh,
      drawX: ox,
      drawY: oy,
      drawW: ow,
      drawH: oh,
    };
  }, [container, width, height, draft.rotation]);

  // PanResponders are created once; handlers only touch refs/callbacks at
  // gesture time, never during render, so the manual memo is safe to keep.
  // eslint-disable-next-line
  const moveBoxResponder = useMemo(
    () =>
      // Handlers only touch refs when invoked by the gesture system, never during render.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startBoxRef.current = draftRef.current.box;
        },
        onPanResponderMove: (_event, gesture) => {
          const { dispW, dispH } = layoutRef.current;
          const start = startBoxRef.current;
          const dx = gesture.dx / Math.max(1, dispW);
          const dy = gesture.dy / Math.max(1, dispH);
          patchActive({
            box: {
              ...start,
              x: clamp(start.x + dx, 0, 1 - start.w),
              y: clamp(start.y + dy, 0, 1 - start.h),
            },
          });
        },
      }),
    [patchActive],
  );

  const cornerResponders = useMemo(() => {
    const make = (corner: Corner) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startBoxRef.current = draftRef.current.box;
        },
        onPanResponderMove: (_event, gesture) => {
          const { dispW, dispH, ratio, aspect } = layoutRef.current;
          patchActive({
            box: resizeBoxFromCorner(
              startBoxRef.current,
              corner,
              gesture.dx / Math.max(1, dispW),
              gesture.dy / Math.max(1, dispH),
              ratio,
              aspect,
            ),
          });
        },
      });
    // eslint-disable-next-line react-hooks/refs
    return { tl: make('tl'), tr: make('tr'), bl: make('bl'), br: make('br') };
  }, [patchActive]);

  const quadResponders = useMemo(() => {
    const make = (corner: keyof PerspectiveQuad) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startQuadRef.current = draftRef.current.perspective ?? defaultQuad();
          setDragCorner(corner);
        },
        onPanResponderMove: (_event, gesture) => {
          const { dispW, dispH } = layoutRef.current;
          patchActive({
            perspective: moveQuadCorner(
              startQuadRef.current,
              corner,
              gesture.dx / Math.max(1, dispW),
              gesture.dy / Math.max(1, dispH),
            ),
          });
        },
        onPanResponderRelease: () => setDragCorner(null),
        onPanResponderTerminate: () => setDragCorner(null),
      });
    // eslint-disable-next-line react-hooks/refs
    return { tl: make('tl'), tr: make('tr'), br: make('br'), bl: make('bl') };
  }, [patchActive]);

  /** Runs the (optional) auto-detector and fills the perspective quad on success. */
  const autoDetect = async () => {
    if (!onAutoDetect || !activePhoto || applying || autoDetecting) return;
    const sourceUri = photos.find((photo) => photo.key === activePhoto.key)?.uri ?? activePhoto.uri;
    setAutoDetecting(true);
    setApplyError(null);
    try {
      const quad = await onAutoDetect(sourceUri, activePreset);
      if (quad) {
        patchActive({ perspective: quad });
      } else {
        setApplyError(`No ${activePreset === 'auto' ? 'instax card' : `${activePreset} instax card`} detected. Adjust the perspective corners manually.`);
      }
    } catch {
      setApplyError('Could not detect the instax card.');
    } finally {
      setAutoDetecting(false);
    }
  };

  const done = async () => {
    if (applying) return;
    const crops: Record<number, CropTransform> = {};
    for (const photo of photos) {
      const workingPhoto = workingPhotos[photo.key] ?? photo;
      const photoDraft = drafts[photo.key] ?? defaultDraft();
      let transform = cropTransformFromDraft(photoDraft, workingPhoto.width, workingPhoto.height);
      const applied = appliedTransforms.current[photo.key];
      if (applied && Object.keys(transform).length > 0) {
        // The draft was made on the preview image. Fold it back into the
        // original image's pixel space when possible; otherwise fall back to
        // the already-committed transform so the caller never crops the
        // original file with a mismatched coordinate space.
        const composed = composeTransforms(applied, transform);
        transform = composed !== transform ? composed : applied;
      }
      if (Object.keys(transform).length > 0) crops[photo.key] = transform;
    }
    const instaxPresets = onAutoDetect
      ? Object.fromEntries(photos.map((photo) => {
        const preset = autoPresets[photo.key] ?? 'mini';
        return [photo.key, preset === 'auto' ? 'mini' : preset];
      })) as Record<number, StoredInstaxPreset>
      : undefined;
    setApplying(true);
    try {
      const hasEnhances = Object.values(enhanceLevels).some((level) => level > 0);
      if (instaxPresets) {
        await onDone(crops, hasEnhances ? enhanceLevels : undefined, instaxPresets);
      } else if (hasEnhances) {
        await onDone(crops, enhanceLevels);
      } else {
        await onDone(crops);
      }
    } finally {
      setApplying(false);
    }
  };

  const applyPreview = async () => {
    if (applying || activePhoto == null) return;
    // The crop comes from the ORIGINAL pick whenever it can be expressed in the
    // original's pixel space, so repeated crops never re-encode previous edits.
    const original = photos.find((photo) => photo.key === activePhoto.key) ?? activePhoto;
    const rawTransform = cropTransformFromDraft(draft, activePhoto.width, activePhoto.height);
    if (Object.keys(rawTransform).length === 0) return;

    const applied = appliedTransforms.current[activePhoto.key];
    let transform = rawTransform;
    let source = original;
    let commitTransform: CropTransform = rawTransform;
    if (applied) {
      const composed = composeTransforms(applied, rawTransform);
      if (composed !== rawTransform && Object.keys(composed).length > 0) {
        // Box-chain: fold into the original file (single encode, no loss).
        transform = composed;
        commitTransform = composed;
      } else {
        // The follow-up rotates/flips/warps the preview and cannot be folded
        // into a single original-space crop. Keep the committed transform as
        // the earlier one and crop the preview image so the in-session preview
        // stays visually correct without ever mis-cropping the original file.
        transform = rawTransform;
        source = activePhoto;
        commitTransform = applied;
      }
    }

    setApplying(true);
    setApplyError(null);
    try {
      const uri = await cropImageUri(source.uri, transform);
      const preview = { ...source, uri, ...editedDimensions(source, transform) };
      setWorkingPhotos((current) => ({ ...current, [activePhoto.key]: preview }));
      setDrafts((current) => ({ ...current, [activePhoto.key]: defaultDraft() }));
      // Record the committed transform whenever it is expressed in the original
      // image's pixel space (the first apply or a successfully folded chain);
      // the bail case keeps the earlier transform so nothing is mis-scoped.
      if (source === original) appliedTransforms.current[activePhoto.key] = commitTransform;
      setDragCorner(null);
      await onPreviewUpdate?.(activePhoto.key, preview, commitTransform);
    } catch {
      setApplyError('Could not update the preview. The current edit was kept.');
    } finally {
      setApplying(false);
    }
  };

  const boxPx = fitted
    ? {
        x: fitted.dispX + draft.box.x * fitted.dispW,
        y: fitted.dispY + draft.box.y * fitted.dispH,
        w: draft.box.w * fitted.dispW,
        h: draft.box.h * fitted.dispH,
      }
    : null;
  const hasActiveChanges = Object.keys(cropTransformFromDraft(draft, width, height)).length > 0;

  // Perspective corner positions + rule-of-thirds grid, in container coords.
  const quadShape = useMemo(() => {
    if (!fitted || !draft.perspective) return null;
    const q = draft.perspective;
    const toDisplay = (p: Point): Point => ({ x: fitted.dispX + p.x * fitted.dispW, y: fitted.dispY + p.y * fitted.dispH });
    const tl = toDisplay(q.tl);
    const tr = toDisplay(q.tr);
    const br = toDisplay(q.br);
    const bl = toDisplay(q.bl);
    const grid = [
      { a: edgePoint(tl, tr, 1 / 3), b: edgePoint(bl, br, 1 / 3) },
      { a: edgePoint(tl, tr, 2 / 3), b: edgePoint(bl, br, 2 / 3) },
      { a: edgePoint(tl, bl, 1 / 3), b: edgePoint(tr, br, 1 / 3) },
      { a: edgePoint(tl, bl, 2 / 3), b: edgePoint(tr, br, 2 / 3) },
    ];
    return { tl, tr, br, bl, grid };
  }, [fitted, draft.perspective]);

  return (
    <RNModal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel crop" onPress={onCancel} hitSlop={10} style={styles.topBarAction}>
            <AppText size="body" weight="semibold" color={BLACK_SCALE.B0}>Cancel</AppText>
          </Pressable>
          <AppText size="body" weight="semibold" color={BLACK_SCALE.B0}>
            {photos.length > 1 ? `Photo ${activeIndex + 1} of ${photos.length}` : 'Adjust Photo'}
          </AppText>
          <Pressable accessibilityRole="button" accessibilityLabel="Reset crop" onPress={resetActive} hitSlop={10} style={styles.topBarAction}>
            <AppText size="body" weight="semibold" color={BLACK_SCALE.B0}>Reset</AppText>
          </Pressable>
        </View>

        <View style={styles.previewWrap}>
          <View style={styles.preview} onLayout={onLayout} testID="crop-preview">
          {fitted ? (
            <>
              <Image
                source={{ uri: activePhoto?.uri ?? '' }}
                style={{
                  position: 'absolute',
                  left: fitted.drawX,
                  top: fitted.drawY,
                  width: fitted.drawW,
                  height: fitted.drawH,
                  transform: [{ scaleX: draft.flipped ? -1 : 1 }, { rotate: `${draft.rotation * 90}deg` }],
                }}
                contentFit="fill"
                accessibilityLabel="Crop preview image"
              />

              {isPerspectiveMode && quadShape ? (
                <>
                  <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                    <Polygon
                      points={`${quadShape.tl.x},${quadShape.tl.y} ${quadShape.tr.x},${quadShape.tr.y} ${quadShape.br.x},${quadShape.br.y} ${quadShape.bl.x},${quadShape.bl.y}`}
                      fill="none"
                      stroke={theme.color.accent}
                      strokeWidth={2}
                    />
                    {quadShape.grid.map((line, index) => (
                      <Line
                        key={index}
                        x1={line.a.x}
                        y1={line.a.y}
                        x2={line.b.x}
                        y2={line.b.y}
                        stroke={theme.color.accent}
                        strokeWidth={1}
                        strokeOpacity={0.55}
                      />
                    ))}
                  </Svg>
                  {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => {
                    const pt = quadShape[corner];
                    return (
                      <View
                        key={corner}
                        {...quadResponders[corner].panHandlers}
                        accessible
                        accessibilityLabel={`Perspective handle ${corner === 'tl' ? 'top-left' : corner === 'tr' ? 'top-right' : corner === 'bl' ? 'bottom-left' : 'bottom-right'}`}
                        style={[styles.handle, { borderColor: theme.color.accent, backgroundColor: BLACK_SCALE.B0, left: pt.x - 10, top: pt.y - 10 }]}
                      />
                    );
                  })}
                  {dragCorner ? (() => {
                    const corner = quadShape[dragCorner];
                    const layout = loupeLayout(fitted, corner, LOUPE_ZOOM, LOUPE_DIAMETER);
                    const placement = loupePlacement(dragCorner, LOUPE_DIAMETER, { w: container?.w ?? 0, h: container?.h ?? 0 });
                    return (
                      <View
                        pointerEvents="none"
                        accessibilityLabel="Perspective magnifier"
                        style={[styles.loupe, { left: placement.left, top: placement.top, borderColor: theme.color.accent }]}
                      >
                        {/* Scaled copy of the whole oriented preview, anchored so the dragged corner stays centered. */}
                        <View style={{ position: 'absolute', left: layout.left, top: layout.top, width: layout.width, height: layout.height }}>
                          <Image
                            source={{ uri: activePhoto?.uri ?? '' }}
                            style={{
                              position: 'absolute',
                              left: layout.imageLeft,
                              top: layout.imageTop,
                              width: layout.imageWidth,
                              height: layout.imageHeight,
                              transform: [{ scaleX: draft.flipped ? -1 : 1 }, { rotate: `${draft.rotation * 90}deg` }],
                            }}
                            contentFit="fill"
                          />
                        </View>
                        {/* Crosshair marking the exact corner, at the loupe center. */}
                        <View style={[styles.loupeHairH, { top: LOUPE_DIAMETER / 2 - 0.5 }]} />
                        <View style={[styles.loupeHairV, { left: LOUPE_DIAMETER / 2 - 0.5 }]} />
                        <View style={[styles.loupeDot, { top: LOUPE_DIAMETER / 2 - 4, left: LOUPE_DIAMETER / 2 - 4, backgroundColor: theme.color.accent }]} />
                      </View>
                    );
                  })() : null}
                </>
              ) : null}

              {!isPerspectiveMode && boxPx ? (
                <>
                  <View pointerEvents="none" style={[styles.dim, { top: 0, left: 0, right: 0, height: boxPx.y }]} />
                  <View pointerEvents="none" style={[styles.dim, { top: boxPx.y + boxPx.h, left: 0, right: 0, bottom: 0 }]} />
                  <View pointerEvents="none" style={[styles.dim, { top: boxPx.y, height: boxPx.h, left: 0, width: boxPx.x }]} />
                  <View
                    pointerEvents="none"
                    style={[styles.dim, { top: boxPx.y, height: boxPx.h, right: 0, width: container!.w - boxPx.x - boxPx.w }]}
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
                  {(['tl', 'tr', 'bl', 'br'] as Corner[]).map((corner) => {
                    // Corner bracket: a 40x40 touch target whose inner corner
                    // sits exactly on the crop-box corner, with two accent arms
                    // extending inward along the box edges (Google Photos style).
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

        {/* Batch strip: switch between the selected photos, each keeping its draft. */}
        {photos.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.stripScroll}
            contentContainerStyle={styles.strip}
          >
            {photos.map((photo) => {
              const isActive = photo.key === activePhoto?.key;
              const workingPhoto = workingPhotos[photo.key] ?? photo;
              const isEdited = workingPhoto.uri !== photo.uri || Object.keys(cropTransformFromDraft(drafts[photo.key] ?? defaultDraft(), workingPhoto.width, workingPhoto.height)).length > 0;
              return (
                <Pressable
                  key={photo.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Crop strip photo ${photo.key}`}
                  accessibilityState={{ selected: isActive }}
                  onPress={() => setActiveKey(photo.key)}
                  style={[styles.stripItem, isActive && { borderColor: theme.color.accent, borderWidth: 2 }]}
                >
                  <Image source={{ uri: workingPhoto.uri }} style={styles.stripThumb} contentFit="cover" />
                  {isEdited ? (
                    <View style={[styles.stripCropped, { backgroundColor: theme.color.accent }]}>
                      <Ionicons name="checkmark" size={12} color={theme.color.onAccent} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.panel}>
          <View style={styles.modeRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Switch to crop mode"
              accessibilityState={{ selected: !isPerspectiveMode }}
              onPress={() => selectMode('crop')}
              style={[styles.modeButton, !isPerspectiveMode && { backgroundColor: theme.color.accent }]}
            >
              <AppText size="body" weight="semibold" color={!isPerspectiveMode ? theme.color.onAccent : BLACK_SCALE.B0}>
                Crop
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Switch to perspective mode"
              accessibilityState={{ selected: isPerspectiveMode }}
              onPress={() => selectMode('perspective')}
              style={[styles.modeButton, isPerspectiveMode && { backgroundColor: theme.color.accent }]}
            >
              <AppText size="body" weight="semibold" color={isPerspectiveMode ? theme.color.onAccent : BLACK_SCALE.B0}>
                Perspective
              </AppText>
            </Pressable>
          </View>

          {!isPerspectiveMode ? (
            <View style={styles.ratioRow}>
              {RATIOS.map((option) => {
                const selected = draft.ratioKey === option.key;
                return (
                  <Pressable
                    key={option.key}
                    accessibilityRole="button"
                    accessibilityLabel={`Crop ratio ${option.label}`}
                    accessibilityState={{ selected }}
                    onPress={() => selectRatio(option.key)}
                    style={[styles.ratioChip, selected ? { backgroundColor: theme.color.accent } : styles.ratioChipIdle]}
                  >
                    <AppText size="small" weight={selected ? 'bold' : 'regular'} color={selected ? theme.color.onAccent : BLACK_SCALE.B0}>
                      {option.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {onAutoDetect ? (
            <View style={styles.enhanceRow}>
              <AppText size="small" weight="semibold" color={BLACK_SCALE.B0}>Card size</AppText>
              {INSTAX_PRESETS.map((preset) => {
                const selected = activePreset === preset.key;
                return (
                  <Pressable
                    key={preset.key}
                    accessibilityRole="button"
                    accessibilityLabel={`Card size ${preset.label}`}
                    accessibilityState={{ selected }}
                    onPress={() => setAutoPresetForActive(preset.key)}
                    style={[styles.enhanceChip, selected ? { backgroundColor: theme.color.accent } : styles.ratioChipIdle]}
                  >
                    <AppText size="small" weight={selected ? 'bold' : 'regular'} color={selected ? theme.color.onAccent : BLACK_SCALE.B0}>
                      {preset.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {onEnhancePreview ? (
            <View style={styles.enhanceRow}>
              <AppText size="small" weight="semibold" color={BLACK_SCALE.B0}>Enhance</AppText>
              {([0, 1, 2] as const).map((level) => {
                const labels = ['Off', 'Light', 'Strong'] as const;
                const selected = activeEnhance === level;
                return (
                  <Pressable
                    key={level}
                    accessibilityRole="button"
                    accessibilityLabel={`Enhance ${labels[level]}`}
                    accessibilityState={{ selected }}
                    onPress={() => setEnhanceForActive(level)}
                    style={[styles.enhanceChip, selected ? { backgroundColor: theme.color.accent } : styles.ratioChipIdle]}
                  >
                    <AppText size="small" weight={selected ? 'bold' : 'regular'} color={selected ? theme.color.onAccent : BLACK_SCALE.B0}>
                      {labels[level]}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.controlRow}>
            {onAutoDetect ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Auto-detect instax card"
                accessibilityState={{ disabled: autoDetecting || applying }}
                disabled={autoDetecting || applying}
                onPress={() => void autoDetect()}
                style={styles.controlButton}
              >
                <Ionicons name="sparkles" size={22} color={autoDetecting ? theme.color.textMuted : BLACK_SCALE.B0} />
                <AppText size="xs" color={BLACK_SCALE.B0}>{autoDetecting ? '…' : 'Auto'}</AppText>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Rotate image" onPress={rotateActive} style={styles.controlButton}>
              <Ionicons testID="rotate-icon" name="refresh-outline" size={24} color={BLACK_SCALE.B0} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Flip image" onPress={flipActive} style={styles.controlButton}>
              <Ionicons testID="flip-icon" name="swap-horizontal-outline" size={24} color={BLACK_SCALE.B0} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apply"
              accessibilityState={{ disabled: applying || !hasActiveChanges }}
              disabled={applying || !hasActiveChanges}
              onPress={applyPreview}
              testID="apply-crop-preview"
              style={[styles.previewApplyButton, { backgroundColor: hasActiveChanges ? theme.color.accent : theme.color.surfaceMuted, opacity: applying ? 0.7 : 1 }]}
            >
              <Ionicons testID="apply-crop-preview-icon" name="checkmark" size={22} color={hasActiveChanges ? theme.color.onAccent : theme.color.textMuted} />
            </Pressable>
          </View>

          {applyError ? (
            <AppText size="small" color={theme.color.danger}>{applyError}</AppText>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done cropping"
            onPress={done}
            disabled={applying}
            testID="apply-crop"
            style={[styles.applyButton, { backgroundColor: theme.color.accent, opacity: applying ? 0.7 : 1 }]}
          >
            <AppText size="body" weight="bold" color={theme.color.onAccent}>{applying ? 'Applying...' : 'Done'}</AppText>
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
    // Inset from the screen edges so the crop/perspective handles are never
    // flush against the sides (avoids triggering the system back-gesture and
    // makes the corner handles easy to grab).
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
  handle: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  loupe: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    overflow: 'hidden',
    borderWidth: 2,
    backgroundColor: '#000000',
  },
  loupeHairH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  loupeHairV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  loupeDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FFFFFF',
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
  stripScroll: {
    flexGrow: 0,
    backgroundColor: '#1C1C22',
  },
  strip: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stripItem: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  stripThumb: {
    width: '100%',
    height: '100%',
  },
  stripCropped: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  panel: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 32,
    gap: 14,
    backgroundColor: '#1C1C22',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  ratioRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ratioChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  ratioChipIdle: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  enhanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  enhanceChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    minWidth: 52,
    alignItems: 'center',
  },
  controlButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  previewApplyButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  applyButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
  },
});
