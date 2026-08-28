import { useState } from 'react';
import {
  Alert,
  Modal as RNModal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { Icon } from '@/components/ui/Icon';
import { BLACK_SCALE, withAlpha } from '@/design-system/colors';
import { useTheme } from '@/hooks/useTheme';
import type { AlbumMediaRow } from '@/repositories/event';
import { saveMediaToGallery, shareMediaToApps } from '@/services/mediaActions';
import { formatISODateFull } from '@/utils/date';

export interface MediaViewerProps {
  asset: AlbumMediaRow;
  onClose: () => void;
}

export function getAlbumMediaChipLabels(
  asset: Pick<AlbumMediaRow, 'kind' | 'instaxPreset' | 'idolNameSnapshot' | 'groupNameSnapshot'>,
): string[] {
  const labels = [asset.kind === 'cheki' ? 'Cheki' : asset.kind === 'video' ? 'Video' : 'Photo'];
  if (asset.kind === 'cheki' && asset.instaxPreset) {
    labels.push(asset.instaxPreset.charAt(0).toUpperCase() + asset.instaxPreset.slice(1));
  }
  labels.push(asset.groupNameSnapshot?.trim() || 'Solo');
  if (asset.idolNameSnapshot?.trim()) labels.push(asset.idolNameSnapshot.trim());
  return labels;
}

export function MediaViewer({ asset, onClose }: MediaViewerProps) {
  if (asset.kind === 'video') {
    return <VideoMediaViewer asset={asset} onClose={onClose} />;
  }

  const ratio = asset.width && asset.height ? asset.width / asset.height : 1;
  return (
    <MediaViewerShell asset={asset} onClose={onClose}>
      <Image
        testID="media-viewer-media"
        source={{ uri: asset.localPath ?? undefined }}
        style={[styles.image, { aspectRatio: ratio }]}
        contentFit="contain"
      />
    </MediaViewerShell>
  );
}

function VideoMediaViewer({ asset, onClose }: MediaViewerProps) {
  const player = useVideoPlayer(asset.localPath ?? '', (currentPlayer) => {
    currentPlayer.loop = true;
  });
  const ratio = asset.width && asset.height ? asset.width / asset.height : 16 / 9;

  return (
    <MediaViewerShell asset={asset} onClose={onClose}>
      <VideoView
        testID="media-viewer-media"
        player={player}
        style={[styles.video, { aspectRatio: ratio }]}
        contentFit="contain"
        nativeControls
      />
    </MediaViewerShell>
  );
}

function MediaViewerShell({ asset, onClose, children }: MediaViewerProps & { children: React.ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [shareVisible, setShareVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const chips = getAlbumMediaChipLabels(asset);
  const date = formatISODateFull(asset.createdAt.slice(0, 10));
  const mimeType = asset.mimeType ?? (asset.kind === 'video' ? 'video/mp4' : 'image/jpeg');

  const handleSave = async () => {
    setShareVisible(false);
    if (!asset.localPath) {
      Alert.alert('Missing media', 'The original file is not available on this device.');
      return;
    }
    setBusy(true);
    try {
      await saveMediaToGallery(asset.localPath);
      Alert.alert('Saved', 'The media was saved to your gallery.');
    } catch {
      Alert.alert('Could not save media', 'Allow gallery access and try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    setShareVisible(false);
    if (!asset.localPath) {
      Alert.alert('Missing media', 'The original file is not available on this device.');
      return;
    }
    setBusy(true);
    try {
      await shareMediaToApps(asset.localPath, mimeType);
    } catch {
      Alert.alert('Could not share media', 'Sharing is not available on this device.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <RNModal
        visible
        animationType="fade"
        onRequestClose={onClose}
        presentationStyle="fullScreen"
        statusBarTranslucent
      >
        <View style={[styles.viewer, { backgroundColor: theme.color.background }]}>
          <StatusBar
            barStyle={theme.color.text === BLACK_SCALE.B0 ? 'light-content' : 'dark-content'}
            backgroundColor={theme.color.background}
          />
          <View
            style={[
              styles.header,
              {
                paddingTop: insets.top,
                height: insets.top + HEADER_HEIGHT,
                backgroundColor: theme.color.background,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back from media viewer"
              onPress={onClose}
              style={styles.headerButton}
              hitSlop={8}
            >
              <Icon name="back" size={22} color={theme.color.text} strokeWidth={1.25} />
            </Pressable>
            <AppText weight="semibold" size="body" numberOfLines={1} style={styles.headerTitle}>
              {date}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share media"
              onPress={() => setShareVisible(true)}
              disabled={busy}
              style={[styles.headerButton, busy && styles.disabled]}
              hitSlop={8}
            >
              <Ionicons name="share-outline" size={23} color={theme.color.text} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.viewerContent}
          >
            <View style={styles.mediaFrame}>{children}</View>
            <View style={styles.metadata}>
              {chips.map((label) => <Chip key={label} label={label} />)}
            </View>
          </ScrollView>
        </View>
      </RNModal>

      <ShareMediaSheet
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        onSave={handleSave}
        onShare={handleShare}
        bottomInset={insets.bottom}
      />
    </>
  );
}

function ShareMediaSheet({
  visible,
  onClose,
  onSave,
  onShare,
  bottomInset,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  onShare: () => void;
  bottomInset: number;
}) {
  const theme = useTheme();
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.shareSheet,
            {
              paddingBottom: Math.max(bottomInset, theme.spacing.md),
              backgroundColor: theme.color.surface,
              borderColor: theme.surface.borderColor,
              borderWidth: theme.surface.borderWidth,
              shadowColor: theme.surface.shadowColor,
              shadowOpacity: theme.surface.shadowOpacity,
              shadowRadius: theme.surface.shadowRadius,
              elevation: theme.surface.elevation,
            },
          ]}
        >
          <View style={styles.sheetHeader}>
            <AppText weight="bold" size="large">Share media</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Close share options" onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={theme.color.textMuted} />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save to gallery"
            onPress={onSave}
            style={({ pressed }) => [styles.shareOption, pressed && styles.pressed]}
          >
            <View style={[styles.shareIcon, { backgroundColor: theme.color.accentSurface }]}>
              <Ionicons name="download-outline" size={22} color={theme.color.accent} />
            </View>
            <View style={styles.shareOptionText}>
              <AppText weight="semibold" size="body">Save to gallery</AppText>
              <AppText size="small" muted>Keep a copy in your device gallery</AppText>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share to other apps"
            onPress={onShare}
            style={({ pressed }) => [styles.shareOption, pressed && styles.pressed]}
          >
            <View style={[styles.shareIcon, { backgroundColor: theme.color.accentSurface }]}>
              <Ionicons name="share-social-outline" size={22} color={theme.color.accent} />
            </View>
            <View style={styles.shareOptionText}>
              <AppText weight="semibold" size="body">Share to other apps</AppText>
              <AppText size="small" muted>Open social media and other apps</AppText>
            </View>
          </Pressable>
        </View>
      </View>
    </RNModal>
  );
}

const HEADER_HEIGHT = 56;

const styles = StyleSheet.create({
  viewer: { flex: 1 },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  viewerContent: {
    paddingBottom: 24,
  },
  mediaFrame: {
    width: '100%',
    alignItems: 'center',
  },
  image: {
    width: '100%',
  },
  video: {
    width: '100%',
  },
  metadata: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: withAlpha(BLACK_SCALE.B900, 0.45),
  },
  shareSheet: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  shareOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 8,
  },
  shareIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareOptionText: {
    flex: 1,
    gap: 2,
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
});
