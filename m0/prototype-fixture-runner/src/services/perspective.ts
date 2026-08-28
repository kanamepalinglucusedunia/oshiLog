import { Directory, File, Paths } from 'expo-file-system';
import { FilterMode, ImageFormat, MipmapMode, Skia } from '@shopify/react-native-skia';
import { uuid } from '@/utils/id';
import { computeHomography, isIdentityQuad, quadToPixels, type PerspectiveQuad } from '@/utils/geometry';

const PERSPECTIVE_DIR = new Directory(Paths.cache, 'oshilog-perspective');

/** Returns the source-quad -> output-frame homography used by the canvas. */
export function perspectiveHomography(
  corners: PerspectiveQuad,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
): number[] {
  const source = quadToPixels(corners, sourceWidth, sourceHeight);
  const output = {
    tl: { x: 0, y: 0 },
    tr: { x: outputWidth, y: 0 },
    br: { x: outputWidth, y: outputHeight },
    bl: { x: 0, y: outputHeight },
  };
  return computeHomography(source, output);
}

/**
 * Output size for a perspective warp: the selected quad's own aspect ratio,
 * fitted into the source frame bounds (never upscaled). Without this the warp
 * stretches the quad onto the photo's full frame, "squashing" e.g. a landscape
 * card shot inside a portrait photo.
 */
export function perspectiveOutputSize(corners: PerspectiveQuad, width: number, height: number): { width: number; height: number } {
  const px = quadToPixels(corners, width, height);
  const sideW = (Math.hypot(px.tr.x - px.tl.x, px.tr.y - px.tl.y) + Math.hypot(px.br.x - px.bl.x, px.br.y - px.bl.y)) / 2;
  const sideH = (Math.hypot(px.bl.x - px.tl.x, px.bl.y - px.tl.y) + Math.hypot(px.br.x - px.tr.x, px.br.y - px.tr.y)) / 2;
  const aspect = Math.min(4, Math.max(0.25, sideW / Math.max(1, sideH)));
  if (aspect >= 1) {
    return { width, height: Math.max(1, Math.round(width / aspect)) };
  }
  return { width: Math.max(1, Math.round(height * aspect)), height };
}

async function ensureDir(): Promise<void> {
  if (!PERSPECTIVE_DIR.exists) PERSPECTIVE_DIR.create({ intermediates: true, idempotent: true });
}

/**
 * Warps an image so the normalized `corners` quadrilateral (defined in the
 * image's own pixel space) is mapped onto the full frame – the classic
 * perspective/skew correction found in Google Photos. Returns a new JPEG file
 * URI.
 *
 * The correction is applied through the Skia canvas transform whose matrix maps
 * the source quadrilateral into the output frame. Content that lands outside
 * the frame is clipped by the offscreen surface.
 */
export async function perspectiveWarpUri(uri: string, corners: PerspectiveQuad): Promise<string> {
  if (isIdentityQuad(corners)) {
    return uri;
  }
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) {
    throw new Error('Perspective correction failed: could not decode the image');
  }
  const width = image.width();
  const height = image.height();
  // The output frame follows the quad's own aspect ratio (fitted into the
  // source bounds), so the corrected card keeps its true proportions instead
  // of being stretched onto the full photo frame.
  const output = perspectiveOutputSize(corners, width, height);
  // The canvas transform maps image geometry to canvas geometry, so this must
  // be source quad -> output rectangle.
  const homography = perspectiveHomography(corners, width, height, output.width, output.height);
  // SkMatrix stores its nine values in row-major order. Do not transpose the
  // homography here or the shader samples a different area of the source.
  const matrix = Skia.Matrix(homography);

  const surface = Skia.Surface.MakeOffscreen(output.width, output.height);
  if (!surface) {
    throw new Error('Perspective correction failed: could not create offscreen surface');
  }
  const canvas = surface.getCanvas();
  // Transform the source image geometry directly. This avoids relying on the
  // image-shader local-matrix inverse and makes source-quad -> output mapping
  // explicit.
  canvas.concat(matrix);
  canvas.drawImageOptions(image, 0, 0, FilterMode.Linear, MipmapMode.None);
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const bytes = snapshot.encodeToBytes(ImageFormat.JPEG, 92);

  await ensureDir();
  const file = new File(PERSPECTIVE_DIR, `persp-${uuid()}.jpg`);
  await file.write(bytes);
  return file.uri;
}
