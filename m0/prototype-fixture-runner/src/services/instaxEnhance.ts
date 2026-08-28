import { Directory, File, Paths } from 'expo-file-system';
import {
  AlphaType,
  ColorType,
  FilterMode,
  ImageFormat,
  MipmapMode,
  Skia,
  TileMode,
  type SkImage,
} from '@shopify/react-native-skia';
import { uuid } from '@/utils/id';

/** Enhance strength: 0 = off, 1 = light, 2 = strong. */
export type EnhanceIntensity = 0 | 1 | 2;

export interface EnhanceStats {
  /** Luminance percentiles (0..1) used for auto levels. */
  blackPoint: number;
  whitePoint: number;
  /** White-balance gains (relative to green). */
  redGain: number;
  blueGain: number;
}

const ENHANCE_DIR = new Directory(Paths.cache, 'oshilog-enhance');
const PREVIEW_MAX_DIM = 480;

/** Shadow lift per unit of intensity (brightness added ∝ shadow depth). */
const SHADOW_LIFT_PER_LEVEL = 0.09;
/** Glare suppression per unit of intensity (0..1 blend toward the highlight cap). */
const GLARE_PER_LEVEL = 0.5;

async function ensureDir(): Promise<void> {
  if (!ENHANCE_DIR.exists) ENHANCE_DIR.create({ intermediates: true, idempotent: true });
}

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers – testable without native Skia.
// ────────────────────────────────────────────────────────────────────────────

function percentile(values: Uint8Array | Float32Array, fraction: number): number {
  const sorted = Float32Array.from(values).sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
  return sorted[index] / 255;
}

/**
 * Analyzes a (downscaled) RGBA image: luminance p1/p99 for auto levels and
 * white-balance gains from neutral pixels.
 */
export function computeEnhanceStats(rgba: Uint8Array, width: number, height: number): EnhanceStats {
  const luma = new Float32Array(width * height);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let neutralCount = 0;
  for (let i = 0, p = 0; i < width * height; i += 1, p += 4) {
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Neutral-ish pixels: low RELATIVE saturation (captures warm/cool casts,
    // not just pure gray), mid-to-high luminance – safe white-balance samples.
    if ((max - min) / Math.max(1, max) < 0.3 && luma[i] > 70 && luma[i] < 235) {
      sumR += r;
      sumG += g;
      sumB += b;
      neutralCount += 1;
    }
  }
  const redGain = neutralCount > 0 ? (sumG / neutralCount) / Math.max(1, sumR / neutralCount) : 1;
  const blueGain = neutralCount > 0 ? (sumG / neutralCount) / Math.max(1, sumB / neutralCount) : 1;
  return {
    blackPoint: Math.min(0.45, percentile(luma, 0.01)),
    whitePoint: Math.max(0.55, percentile(luma, 0.99)),
    redGain: Math.min(1.6, Math.max(0.6, redGain)),
    blueGain: Math.min(1.6, Math.max(0.6, blueGain)),
  };
}

/** Row-major 4x5 color matrix: out = m · in + offset. */
export type ColorMatrix = [
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
];

/** Composes two 4x5 matrices (applies `outer` after `inner`). */
export function composeColorMatrices(outer: ColorMatrix, inner: ColorMatrix): ColorMatrix {
  const out = Array(20).fill(0) as number[];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      let value = 0;
      for (let k = 0; k < 4; k += 1) {
        value += outer[row * 5 + k] * inner[k * 5 + col];
      }
      out[row * 5 + col] = value + (col === 4 ? outer[row * 5 + 4] : 0);
    }
  }
  return out as ColorMatrix;
}

function scaleMatrix(scale: number, offset: number): ColorMatrix {
  return [
    scale, 0, 0, 0, offset,
    0, scale, 0, 0, offset,
    0, 0, scale, 0, offset,
    0, 0, 0, 1, 0,
  ];
}

/** Saturation matrix: s=0 → grayscale, s=1 → identity. */
function saturationMatrix(saturation: number): ColorMatrix {
  const lr = 0.299;
  const lg = 0.587;
  const lb = 0.114;
  const sr = (1 - saturation) * lr;
  const sg = (1 - saturation) * lg;
  const sb = (1 - saturation) * lb;
  return [
    sr + saturation, sg, sb, 0, 0,
    sr, sg + saturation, sb, 0, 0,
    sr, sg, sb + saturation, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

function channelGainMatrix(redGain: number, blueGain: number): ColorMatrix {
  return [
    redGain, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, blueGain, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Builds the color matrix for a given intensity: auto levels (black/white
 * point stretch) + white balance + saturation boost.
 */
export function buildEnhanceColorMatrix(stats: EnhanceStats, intensity: EnhanceIntensity): ColorMatrix {
  const levelRange = Math.max(0.05, stats.whitePoint - stats.blackPoint);
  const levels = scaleMatrix(1 / levelRange, -stats.blackPoint / levelRange);
  const gains = channelGainMatrix(stats.redGain, stats.blueGain);
  const saturation = saturationMatrix(1 + 0.12 * intensity);
  return composeColorMatrices(composeColorMatrices(levels, gains), saturation);
}

/**
 * SkSL shader for shadow lift + glare suppression. Applied AFTER the color
 * matrix, operating on the already corrected pixels.
 */
export const ENHANCE_SHADER = `
uniform shader image;
uniform half lift;
uniform half glare;

half4 main(float2 xy) {
  half4 c = image.eval(xy);
  half l = dot(c.rgb, half3(0.299, 0.587, 0.114));
  // Lift shadows: add brightness proportional to how dark the pixel is.
  half3 lifted = c.rgb + half3(1.0 - l) * lift;
  // Suppress glare: pull extreme highlights back toward the cap.
  half cap = 0.9;
  half3 result = l > cap ? mix(lifted, lifted * (cap / max(l, 0.001)), glare) : lifted;
  return half4(clamp(result, 0.0, 1.0), c.a);
}
`;

// ────────────────────────────────────────────────────────────────────────────
// Skia pipeline – decode → analyze → color matrix + shader → encode.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Enhances an instax-style photo (auto levels, white balance, saturation,
 * shadow lift, glare suppression), 100% offline via Skia. `preview` runs the
 * pipeline on a downscaled copy for responsive live previews; the default runs
 * at full resolution. Returns the new file URI (or the input URI untouched
 * when intensity is 0).
 */
export async function enhanceInstaxUri(
  uri: string,
  intensity: EnhanceIntensity,
  options?: { preview?: boolean },
): Promise<string> {
  if (intensity === 0) return uri;
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('Enhance failed: could not decode the image');
  const iw = image.width();
  const ih = image.height();

  let working = image;
  let outW = iw;
  let outH = ih;
  if (options?.preview) {
    const scale = Math.min(1, PREVIEW_MAX_DIM / Math.max(iw, ih));
    outW = Math.max(1, Math.round(iw * scale));
    outH = Math.max(1, Math.round(ih * scale));
    const previewSurface = Skia.Surface.MakeOffscreen(outW, outH);
    if (!previewSurface) throw new Error('Enhance failed: could not create preview surface');
    const previewCanvas = previewSurface.getCanvas();
    previewCanvas.drawImageRect(
      image,
      { x: 0, y: 0, width: iw, height: ih },
      { x: 0, y: 0, width: outW, height: outH },
      Skia.Paint(),
    );
    previewSurface.flush();
    const snapshot = previewSurface.makeImageSnapshot();
    const pixels = snapshot.readPixels(0, 0, {
      width: outW,
      height: outH,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    });
    if (!pixels) throw new Error('Enhance failed: could not read preview pixels');
    const bytes = pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
    const stats = computeEnhanceStats(bytes, outW, outH);
    working = snapshot;
    return renderEnhance(working, outW, outH, stats, intensity);
  }

  // Full resolution: analyze a downscaled copy, render at full size.
  const analyzeScale = Math.min(1, PREVIEW_MAX_DIM / Math.max(iw, ih));
  const aw = Math.max(1, Math.round(iw * analyzeScale));
  const ah = Math.max(1, Math.round(ih * analyzeScale));
  let stats: EnhanceStats;
  if (analyzeScale < 1) {
    const analyzeSurface = Skia.Surface.MakeOffscreen(aw, ah);
    if (!analyzeSurface) throw new Error('Enhance failed: could not create analyze surface');
    const analyzeCanvas = analyzeSurface.getCanvas();
    analyzeCanvas.drawImageRect(
      image,
      { x: 0, y: 0, width: iw, height: ih },
      { x: 0, y: 0, width: aw, height: ah },
      Skia.Paint(),
    );
    analyzeSurface.flush();
    const snapshot = analyzeSurface.makeImageSnapshot();
    const pixels = snapshot.readPixels(0, 0, {
      width: aw,
      height: ah,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    });
    if (!pixels) throw new Error('Enhance failed: could not read analyze pixels');
    const bytes = pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
    stats = computeEnhanceStats(bytes, aw, ah);
  } else {
    const pixels = image.readPixels(0, 0, {
      width: iw,
      height: ih,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    });
    if (!pixels) throw new Error('Enhance failed: could not read pixels');
    const bytes = pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
    stats = computeEnhanceStats(bytes, iw, ih);
  }
  return renderEnhance(image, iw, ih, stats, intensity);
}

async function renderEnhance(
  image: SkImage,
  width: number,
  height: number,
  stats: EnhanceStats,
  intensity: EnhanceIntensity,
): Promise<string> {
  const effect = Skia.RuntimeEffect.Make(ENHANCE_SHADER);
  if (!effect) throw new Error('Enhance failed: could not compile shader');
  const shader = effect.makeShaderWithChildren(
    [SHADOW_LIFT_PER_LEVEL * intensity, GLARE_PER_LEVEL * intensity],
    [image.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None)],
  );
  const colorFilter = Skia.ColorFilter.MakeMatrix(buildEnhanceColorMatrix(stats, intensity));
  const paint = Skia.Paint();
  paint.setShader(shader);
  paint.setColorFilter(colorFilter);

  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new Error('Enhance failed: could not create surface');
  const canvas = surface.getCanvas();
  canvas.drawImageRect(
    image,
    { x: 0, y: 0, width: image.width(), height: image.height() },
    { x: 0, y: 0, width, height },
    paint,
  );
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const bytes = snapshot.encodeToBytes(ImageFormat.JPEG, 92);

  await ensureDir();
  const file = new File(ENHANCE_DIR, `enhance-${uuid()}.jpg`);
  await file.write(bytes);
  return file.uri;
}
