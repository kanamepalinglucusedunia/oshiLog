import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useTheme } from '@/hooks/useTheme';
import { getDb } from '@/db';
import { importImageFromUri, stageSourceImage } from '@/services/media';
import {
  SocialAvatarError,
  fetchSocialAvatarPreview,
  type SocialAvatarPreview,
} from '@/services/socialAvatar';
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_CONFIG,
  usernameFromProfileUrl,
} from '@/services/socialProfile';
import type { SocialPlatform } from '@/types/domain';

export interface SocialAvatarImportResult {
  platform: SocialPlatform;
  profileUrl: string;
  mediaAssetId: string;
  newlyCreated: boolean;
  /**
   * Session-owned staging copy of the avatar (present when the caller set
   * `keepStagingSource`) so the form can re-crop from the original download.
   */
  sourceUri?: string | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
}

export interface SocialAvatarPickerProps {
  visible: boolean;
  onClose: () => void;
  onComplete: (result: SocialAvatarImportResult) => void;
  existingProfileUrls?: Partial<Record<SocialPlatform, string | null>>;
  /** Restrict the flow to already-linked canonical profiles for manual refresh. */
  linkedProfilesOnly?: boolean;
  /**
   * Keep the downloaded avatar available after import by returning a staged
   * copy in the result, enabling the caller to re-crop it later. The picker's
   * own staging file is still disposed as usual.
   */
  keepStagingSource?: boolean;
}

export function SocialAvatarPicker({
  visible,
  onClose,
  onComplete,
  existingProfileUrls = {},
  linkedProfilesOnly = false,
  keepStagingSource = false,
}: SocialAvatarPickerProps) {
  const theme = useTheme();
  const [platform, setPlatform] = useState<SocialPlatform>('x');
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<SocialAvatarPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<SocialAvatarPreview | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const availablePlatforms = linkedProfilesOnly
    ? SOCIAL_PLATFORMS.filter((item) => usernameFromProfileUrl(item, existingProfileUrls[item] ?? null))
    : SOCIAL_PLATFORMS;
  const activePlatform = availablePlatforms.includes(platform) ? platform : (availablePlatforms[0] ?? platform);
  const activeValue = linkedProfilesOnly
    ? usernameFromProfileUrl(activePlatform, existingProfileUrls[activePlatform] ?? null) ?? ''
    : value;

  const disposePreview = () => {
    previewRef.current?.dispose();
    previewRef.current = null;
    setPreview(null);
  };

  const close = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    disposePreview();
    setConfirming(false);
    setLoading(false);
    setError(null);
    onClose();
  };

  useEffect(() => () => {
    requestRef.current?.abort();
    previewRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!visible) {
      requestRef.current?.abort();
      requestRef.current = null;
      previewRef.current?.dispose();
      previewRef.current = null;
    }
  }, [visible]);

  const choosePlatform = (next: SocialPlatform) => {
    requestRef.current?.abort();
    disposePreview();
    setConfirming(false);
    setError(null);
    setPlatform(next);
    setValue(usernameFromProfileUrl(next, existingProfileUrls[next] ?? null) ?? '');
  };

  const requestPreview = async () => {
    requestRef.current?.abort();
    disposePreview();
    setConfirming(false);
    setError(null);
    setLoading(true);
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const next = await fetchSocialAvatarPreview({ platform: activePlatform, value: activeValue, signal: controller.signal });
      previewRef.current = next;
      setPreview(next);
    } catch (requestError) {
      if (requestError instanceof SocialAvatarError && requestError.code === 'cancelled') return;
      setError(requestError instanceof Error ? requestError.message : 'Could not preview this profile photo.');
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setLoading(false);
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const imported = await importImageFromUri(getDb(), preview.stagingUri, 'photo');
      // Copy the avatar into a session-owned staging file BEFORE disposing the
      // picker's preview, so the form can re-crop from the original download.
      let sessionSource: { uri: string; width: number; height: number } | null = null;
      if (keepStagingSource && imported.width && imported.height) {
        sessionSource = { uri: await stageSourceImage(preview.stagingUri), width: imported.width, height: imported.height };
      }
      onComplete({
        platform: preview.profile.platform,
        profileUrl: preview.profile.profileUrl,
        mediaAssetId: imported.assetId,
        newlyCreated: !imported.deduplicated,
        sourceUri: sessionSource?.uri ?? null,
        sourceWidth: sessionSource?.width ?? null,
        sourceHeight: sessionSource?.height ?? null,
      });
      close();
    } catch {
      setError('Could not copy this profile photo. Try another account or upload from your device.');
      setConfirming(false);
    } finally {
      preview.dispose();
      previewRef.current = null;
      setPreview(null);
      setLoading(false);
    }
  };

  const oldUsername = preview
    ? usernameFromProfileUrl(preview.profile.platform, existingProfileUrls[preview.profile.platform] ?? null)
    : null;
  const replacement = !!oldUsername && oldUsername !== preview?.profile.username;

  return (
    <Modal
      visible={visible}
      onClose={close}
      title={linkedProfilesOnly ? 'Refresh profile photo' : 'Import profile photo'}
    >
      <View style={{ gap: theme.spacing.md }}>
        <AppText size="small" muted>
          {linkedProfilesOnly
            ? 'Choose a linked profile. The saved photo changes only after preview and confirmation.'
            : 'Enter an exact username or public profile URL. No search or autocomplete is performed.'}
        </AppText>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {availablePlatforms.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${SOCIAL_PLATFORM_CONFIG[item].label}`}
              accessibilityState={{ selected: activePlatform === item }}
              onPress={() => choosePlatform(item)}
              style={({ pressed }) => ({
                minHeight: 44,
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.md,
                borderWidth: theme.surface.borderWidth,
                borderColor: activePlatform === item ? theme.color.accent : theme.surface.borderColor,
                backgroundColor: activePlatform === item ? theme.color.accentSoft : theme.color.surface,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <AppText size="small" weight="semibold">{SOCIAL_PLATFORM_CONFIG[item].label}</AppText>
            </Pressable>
          ))}
        </View>

        <Field
          accessibilityLabel="Social profile"
          label={`${SOCIAL_PLATFORM_CONFIG[activePlatform].label} username or profile URL`}
          value={activeValue}
          onChangeText={setValue}
          placeholder="@username or profile URL"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={!linkedProfilesOnly}
          error={error}
        />
        <Button
          label="Preview profile photo"
          onPress={() => void requestPreview()}
          loading={loading && !confirming}
          disabled={!activeValue.trim() || loading}
        />

        {preview ? (
          <Card accent>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Select ${SOCIAL_PLATFORM_CONFIG[preview.profile.platform].label} profile ${preview.profile.username}`}
              onPress={() => setConfirming(true)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, minHeight: 72, opacity: pressed ? 0.75 : 1 })}
            >
              <Image source={{ uri: preview.stagingUri }} style={{ width: 64, height: 64, borderRadius: 32 }} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <AppText weight="bold">@{preview.profile.username}</AppText>
                <AppText size="small" muted>{SOCIAL_PLATFORM_CONFIG[preview.profile.platform].label}</AppText>
                <AppText size="xs" muted numberOfLines={1}>{preview.profile.profileUrl}</AppText>
              </View>
            </Pressable>
          </Card>
        ) : null}

        {confirming && preview ? (
          <Card>
            <AppText weight="bold">Use this profile photo?</AppText>
            <AppText size="small" style={{ marginTop: theme.spacing.xs }}>
              {linkedProfilesOnly
                ? `The refreshed photo will be copied to oshiLog from @${preview.profile.username}. Saved social links and the name will not change.`
                : replacement
                ? `This replaces @${oldUsername} with @${preview.profile.username}. The photo will be copied to oshiLog and the profile field will be updated.`
                : `The photo will be copied to oshiLog and the ${SOCIAL_PLATFORM_CONFIG[preview.profile.platform].label} profile field will be filled with ${preview.profile.profileUrl}.`}
            </AppText>
            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
              <Button label="Confirm social photo import" onPress={() => void confirmImport()} loading={loading} />
              <Button label="Cancel social photo import" variant="ghost" onPress={() => setConfirming(false)} disabled={loading} />
            </View>
          </Card>
        ) : null}

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Avatars provided by Unavatar"
          onPress={() => void Linking.openURL('https://unavatar.io')}
          style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
        >
          <AppText size="xs" color={theme.color.accent}>Avatars provided by Unavatar</AppText>
        </Pressable>
      </View>
    </Modal>
  );
}
