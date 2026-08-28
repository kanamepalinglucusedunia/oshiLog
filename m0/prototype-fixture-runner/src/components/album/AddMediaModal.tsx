import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { Modal } from '@/components/ui/Modal';
import { ImageCropEditor } from '@/components/album/ImageCropEditor';
import { useTheme } from '@/hooks/useTheme';
import { getDb } from '@/db';
import { createEventRepo } from '@/repositories/event';
import { cropImageUri, importImageFromUri, importVideoFromUri, type CropTransform } from '@/services/media';
import { perspectiveOutputSize } from '@/services/perspective';

type PendingKind = 'photo' | 'video';

interface PendingFile {
  key: number;
  kind: PendingKind;
  /** Original pick; never replaced so re-cropping always reads the source. */
  uri: string;
  /** Cropped preview shown in the strip; set after Apply/Done. */
  previewUri?: string;
  width?: number;
  height?: number;
  /** Last committed crop transform (in the original image's pixel space). */
  crop?: CropTransform;
  previewed?: boolean;
}

function editedDimensions(file: PendingFile, transform: CropTransform): { width?: number; height?: number } {
  if (file.width == null || file.height == null) return {};
  const rotated = transform.rotateDegrees === 90 || transform.rotateDegrees === 270;
  const oriented = {
    width: rotated ? file.height : file.width,
    height: rotated ? file.width : file.height,
  };
  if (transform.perspective) return perspectiveOutputSize(transform.perspective, oriented.width, oriented.height);
  if (transform.crop) {
    return { width: transform.crop.width, height: transform.crop.height };
  }
  return oriented;
}

export interface AddMediaModalProps {
  visible: boolean;
  idolId: string;
  onClose: () => void;
}

/**
 * Manual photo/video upload for an idol album: an optional date plus as many
 * photos/videos as the user wants, shown as a horizontal scrollable strip.
 * Each photo can be cropped individually in the fullscreen editor; all files
 * share the chosen date (import time when left empty).
 */
export function AddMediaModal({ visible, idolId, onClose }: AddMediaModalProps) {
  const theme = useTheme();
  const [date, setDate] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropFocusKey, setCropFocusKey] = useState<number | null>(null);
  const [cropSession, setCropSession] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextKey = useRef(1);

  const photoFiles = files.filter((file) => file.kind === 'photo');

  const close = () => {
    if (busy) return;
    onClose();
    setDate('');
    setFiles([]);
    setCropOpen(false);
    setError(null);
  };

  const appendFiles = (incoming: { kind: PendingKind; uri: string; width?: number; height?: number }[]) => {
    setFiles((current) => {
      const known = new Set(current.map((file) => file.uri));
      const additions = incoming
        .filter((item) => !known.has(item.uri))
        .map((item) => ({ key: nextKey.current++, ...item }));
      return additions.length > 0 ? [...current, ...additions] : current;
    });
  };

  const pickPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access is required to add photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
      exif: false,
    });
    if (result.canceled) return;
    appendFiles(result.assets.map((asset) => ({ kind: 'photo', uri: asset.uri, width: asset.width, height: asset.height })));
  };

  const pickVideos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access is required to add videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (result.canceled) return;
    appendFiles(result.assets.map((asset) => ({ kind: 'video', uri: asset.uri })));
  };

  const removeFile = (key: number) => {
    setFiles((current) => current.filter((file) => file.key !== key));
  };

  /** Renders the batch edits now so the pending thumbnails show the real result. */
  const applyCrops = async (crops: Record<number, CropTransform>) => {
    if (Object.keys(crops).length === 0) {
      setCropOpen(false);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const updates = new Map<number, { uri: string; width?: number; height?: number }>();
      for (const file of files) {
        const transform = file.kind === 'photo' ? crops[file.key] : undefined;
        if (!transform) continue;
        // Crop the ORIGINAL pick here too, so the stored preview and the
        // final import both derive from the source file in a single encode.
        const uri = await cropImageUri(file.uri, transform);
        updates.set(file.key, { uri, ...editedDimensions(file, transform) });
      }

      setFiles((current) =>
        current.map((file) => {
          const update = updates.get(file.key);
          const hasCrop = update != null || crops[file.key] != null;
          return {
            ...file,
            ...(update ? { previewUri: update.uri } : {}),
            crop: crops[file.key] ?? file.crop,
            previewed: file.previewed || hasCrop,
          };
        }),
      );
      setCropOpen(false);
    } catch {
      setError('Could not apply the crop. The original selection was kept.');
      setCropOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const updatePreview = (key: number, preview: { uri: string; width: number; height: number }, transform: CropTransform) => {
    // Keep `uri` as the original source; only the strip thumbnail switches to
    // the cropped preview so a later re-crop can start from the original.
    setFiles((current) =>
      current.map((file) => (file.key === key ? { ...file, previewUri: preview.uri, crop: transform, previewed: true } : file)),
    );
  };

  const addAll = async () => {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    const db = getDb();
    const repo = createEventRepo(db);
    const attach = (assetId: string) => repo.attachMediaToIdol(assetId, idolId);
    const failedKeys: number[] = [];
    for (const file of files) {
      try {
        if (file.kind === 'photo') {
          // `uri` is the original pick; when a crop exists the preview already
          // holds the single-encode result derived from that original.
          const uri = file.crop ? (file.previewUri ?? await cropImageUri(file.uri, file.crop)) : file.uri;
          await importImageFromUri(db, uri, 'photo', { createdAt: date || undefined, onImported: attach });
        } else {
          await importVideoFromUri(db, file.uri, { createdAt: date || undefined, onImported: attach });
        }
      } catch {
        failedKeys.push(file.key);
      }
    }
    setBusy(false);
    if (failedKeys.length > 0) {
      setError(`${failedKeys.length} item(s) failed to import and were left in the list. The rest were added.`);
      setFiles((current) => current.filter((file) => failedKeys.includes(file.key)));
    } else {
      close();
    }
  };

  return (
    <>
      <Modal visible={visible} onClose={close} title="Add Media">
        <DateField
          label="Date"
          value={date}
          onChange={setDate}
          placeholder="Unset (import time)"
          allowClear
          error={null}
        />
        <AppText size="xs" muted style={{ marginTop: 4 }}>
          Optional. Photos and videos are grouped in the album under this date.
        </AppText>

        <View style={styles.pickerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add photos"
            onPress={pickPhotos}
            disabled={busy}
            style={[styles.pickerButton, { borderColor: theme.color.accent, backgroundColor: theme.color.accentSurface }]}
          >
            <Ionicons name="images-outline" size={18} color={theme.color.accent} />
            <AppText size="small" weight="semibold" color={theme.color.accent}>Add Photos</AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add videos"
            onPress={pickVideos}
            disabled={busy}
            style={[styles.pickerButton, { borderColor: theme.color.accent, backgroundColor: theme.color.accentSurface }]}
          >
            <Ionicons name="videocam-outline" size={18} color={theme.color.accent} />
            <AppText size="small" weight="semibold" color={theme.color.accent}>Add Video</AppText>
          </Pressable>
        </View>

        {files.length === 0 ? (
          <View style={styles.emptyBox}>
            <AppText size="small" muted>No files selected yet.</AppText>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 14 }}
            contentContainerStyle={styles.thumbStrip}
          >
            {files.map((file) => (
              <View
                key={file.key}
                style={[
                   styles.thumbCard,
                   file.kind === 'photo' && (file.crop || file.previewed) && { borderColor: theme.color.accent, borderWidth: 2 },
                ]}
              >
                {file.kind === 'photo' ? (
                  <Image
                    source={{ uri: file.previewUri ?? file.uri }}
                    style={styles.thumbImage}
                    contentFit="cover"
                    accessibilityLabel="Selected media thumbnail"
                  />
                ) : (
                  <View style={[styles.thumbImage, styles.videoThumb, { backgroundColor: theme.color.surfaceMuted }]}>
                    <Ionicons name="videocam-outline" size={26} color={theme.color.textMuted} />
                  </View>
                )}

                {file.kind === 'photo' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Crop photo ${file.key}`}
                    onPress={() => {
                      setCropFocusKey(file.key);
                      setCropSession((current) => current + 1);
                      setCropOpen(true);
                    }}
                    disabled={busy}
                    style={[styles.thumbAction, styles.cropAction]}
                  >
                    <Ionicons name="crop-outline" size={16} color="#FFFFFF" />
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${file.kind}`}
                  onPress={() => removeFile(file.key)}
                  disabled={busy}
                  style={[styles.thumbAction, styles.removeAction]}
                >
                  <Ionicons name="close" size={16} color="#FFFFFF" />
                </Pressable>

                {file.kind === 'photo' && (file.crop || file.previewed) ? (
                  <View style={styles.croppedBadge}>
                    <AppText size="xs" weight="semibold" color="#FFFFFF">Cropped</AppText>
                  </View>
                ) : null}
              </View>
            ))}
          </ScrollView>
        )}

        {error ? (
          <AppText size="small" color={theme.color.danger} style={{ marginTop: 8 }}>
            {error}
          </AppText>
        ) : null}

        <Button
          label={files.length === 0 ? 'Add items' : `Add ${files.length} item${files.length === 1 ? '' : 's'}`}
          style={{ marginTop: 12 }}
          disabled={files.length === 0 || busy}
          onPress={addAll}
        />
      </Modal>

      {/* Fullscreen batch crop editor; each open remounts fresh (key=session). */}
      <ImageCropEditor
        key={cropSession}
        visible={cropOpen}
        photos={photoFiles.map((file) => ({ key: file.key, uri: file.uri, width: file.width ?? 1, height: file.height ?? 1 }))}
        initialCrops={photoFiles.reduce<Record<number, CropTransform>>((acc, file) => {
          if (file.crop) acc[file.key] = file.crop;
          return acc;
        }, {})}
        initialKey={cropFocusKey}
        onCancel={() => setCropOpen(false)}
        onDone={applyCrops}
        onPreviewUpdate={updatePreview}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pickerRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  pickerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  thumbStrip: {
    gap: 10,
    paddingVertical: 2,
  },
  thumbCard: {
    width: 96,
    height: 96,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  videoThumb: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbAction: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cropAction: {
    top: 6,
    left: 6,
  },
  removeAction: {
    top: 6,
    right: 6,
  },
  croppedBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
});
