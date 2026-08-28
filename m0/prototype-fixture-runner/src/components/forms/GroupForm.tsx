import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Card } from '@/components/ui/Card';
import { DateField } from '@/components/ui/DateField';
import { Field } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore } from '@/stores/settingsStore';
import { getDb } from '@/db';
import { createIdolRepo } from '@/repositories/idol';
import { createEventRepo } from '@/repositories/event';
import {
  cropImageUri,
  deleteStagedFile,
  importImageFromUri,
  stageSourceImage,
} from '@/services/media';
import { resolveIdolPhotoUris } from '@/services/dashboard';
import { CountryRegionFields } from '@/components/forms/CountryRegionFields';
import { ProfilePhotoSourceSheet } from '@/components/forms/ProfilePhotoSourceSheet';
import { ProfilePhotoCropEditor } from '@/components/forms/ProfilePhotoCropEditor';
import { SocialAvatarPicker, type SocialAvatarImportResult } from '@/components/forms/SocialAvatarPicker';
import { SocialProfileFields } from '@/components/forms/SocialProfileFields';
import { CARD_STACK_GAP } from '@/design-system/theme';
import { normalizeSocialProfileInput, SocialProfileValidationError } from '@/services/socialProfile';
import { cropTransformFromDraft, ratioBox, type CropBox } from '@/components/album/ImageCropEditor';
import { BLACK_SCALE, GREEN_SCALE, YELLOW_SCALE } from '@/design-system/colors';
import { todayISO } from '@/utils/date';
import { type CountryCode, type SocialPlatform } from '@/types/domain';

/** Group profile photos are displayed square (1:1). */
const PHOTO_RATIO = 1;

/** Original image a crop can be (re)applied to during the form session. */
interface CropSource {
  sourceUri: string;
  width: number;
  height: number;
  box: CropBox;
}

/** Seeds the re-crop source from an existing photo asset (edit mode). */
function cropSourceFromInitial(mediaId: string | null, ratio: number): CropSource | null {
  if (!mediaId) return null;
  const asset = createEventRepo(getDb()).getMediaAsset(mediaId);
  if (!asset?.localPath || !asset.width || !asset.height) return null;
  return { sourceUri: asset.localPath, width: asset.width, height: asset.height, box: ratioBox(ratio, asset.width, asset.height) };
}

const socialProfileField = (platform: SocialPlatform) => z.string().trim().superRefine((value, context) => {
  try {
    normalizeSocialProfileInput(platform, value);
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof SocialProfileValidationError ? error.message : 'Enter a valid social profile.',
    });
  }
});

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  country: z.string().min(1, 'Pick a country'),
  region: z.string().trim().optional(),
  debutDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  xProfileUrl: socialProfileField('x'),
  instagramProfileUrl: socialProfileField('instagram'),
  tiktokProfileUrl: socialProfileField('tiktok'),
});

export type GroupFormValues = z.infer<typeof schema>;

export interface GroupFormProps {
  initial?: {
    id: string;
    name: string;
    country: CountryCode;
    region: string | null;
    debutDate: string | null;
    endDate: string | null;
    notes: string | null;
    photoMediaId: string | null;
    xProfileUrl?: string | null;
    instagramProfileUrl?: string | null;
    tiktokProfileUrl?: string | null;
  };
  submitLabel?: string;
  /** Hide the inline action when a parent supplies a sticky footer action. */
  showSubmitButton?: boolean;
  /** Increment to request submission from an external sticky action. */
  submitRequest?: number;
  onSubmit?: (values: GroupFormValues, photoMediaId: string | null) => void;
}

export function GroupForm({
  initial,
  submitLabel = 'Save Group',
  showSubmitButton = true,
  submitRequest = 0,
  onSubmit,
}: GroupFormProps) {
  const theme = useTheme();
  const countries = useSettingsStore((s) => s.countries);
  const activeCountries = useMemo(() => countries.filter((c) => c.isActive).map((c) => c.country), [countries]);
  const [photoMediaId, setPhotoMediaId] = useState<string | null>(initial?.photoMediaId ?? null);
  const [photoSourceVisible, setPhotoSourceVisible] = useState(false);
  const [socialPickerVisible, setSocialPickerVisible] = useState(false);
  const [picking, setPicking] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [groupStatus, setGroupStatus] = useState<'active' | 'hiatus' | 'inactive'>(() => {
    if (initial?.endDate) return 'inactive';
    return 'active';
  });

  const pendingPhotoAssetRef = useRef<string | null>(null);
  const photoUri = useMemo(
    () => (photoMediaId ? resolveIdolPhotoUris(getDb(), [photoMediaId]).get(photoMediaId) ?? null : null),
    [photoMediaId],
  );

  // Re-crop source: the original image (staged pick or downloaded avatar) plus
  // the last applied crop box, so re-cropping never re-encodes an edited file.
  const [cropSource, setCropSource] = useState<CropSource | null>(() => cropSourceFromInitial(initial?.photoMediaId ?? null, PHOTO_RATIO));
  const cropSourceRef = useRef<CropSource | null>(cropSource);
  const [cropVisible, setCropVisible] = useState(false);
  const [cropSession, setCropSession] = useState(0);
  const [cropError, setCropError] = useState<string | null>(null);

  const setCropSourceBoth = useCallback((next: CropSource | null) => {
    const previous = cropSourceRef.current;
    if (previous && previous.sourceUri !== next?.sourceUri) deleteStagedFile(previous.sourceUri);
    cropSourceRef.current = next;
    setCropSource(next);
  }, []);

  useEffect(() => () => {
    if (cropSourceRef.current) deleteStagedFile(cropSourceRef.current.sourceUri);
  }, []);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<GroupFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '',
      country: initial?.country ?? activeCountries[0] ?? 'JP',
      region: initial?.region ?? '',
      debutDate: initial?.debutDate ?? '',
      endDate: initial?.endDate ?? '',
      notes: initial?.notes ?? '',
      xProfileUrl: initial?.xProfileUrl ?? '',
      instagramProfileUrl: initial?.instagramProfileUrl ?? '',
      tiktokProfileUrl: initial?.tiktokProfileUrl ?? '',
    },
  });

  const submit = useCallback(() => {
    void handleSubmit((values) => {
      try {
        onSubmit?.({
          ...values,
          endDate: groupStatus === 'active' ? '' : values.endDate,
          xProfileUrl: normalizeSocialProfileInput('x', values.xProfileUrl)?.profileUrl ?? '',
          instagramProfileUrl: normalizeSocialProfileInput('instagram', values.instagramProfileUrl)?.profileUrl ?? '',
          tiktokProfileUrl: normalizeSocialProfileInput('tiktok', values.tiktokProfileUrl)?.profileUrl ?? '',
        }, photoMediaId);
        pendingPhotoAssetRef.current = null;
        setCropSourceBoth(null);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Could not save the group.');
      }
    })();
  }, [handleSubmit, onSubmit, photoMediaId, setCropSourceBoth, groupStatus]);

  const handledSubmitRequest = useRef(0);
  useEffect(() => {
    if (submitRequest <= handledSubmitRequest.current) return;
    handledSubmitRequest.current = submitRequest;
    submit();
  }, [submit, submitRequest]);

  const watchedCountry = useWatch({ control, name: 'country' });
  const watchedRegion = useWatch({ control, name: 'region' });
  const watchedEndDate = useWatch({ control, name: 'endDate' });
  const watchedXProfileUrl = useWatch({ control, name: 'xProfileUrl' });
  const watchedInstagramProfileUrl = useWatch({ control, name: 'instagramProfileUrl' });
  const watchedTiktokProfileUrl = useWatch({ control, name: 'tiktokProfileUrl' });

  useEffect(() => () => {
    if (pendingPhotoAssetRef.current) createEventRepo(getDb()).detachMedia(pendingPhotoAssetRef.current);
  }, []);

  useEffect(() => {
    if (activeCountries.length > 0 && !activeCountries.includes(watchedCountry as CountryCode)) {
      setValue('country', activeCountries[0]);
    }
  }, [activeCountries, watchedCountry, setValue]);

  const applyImportedPhoto = (assetId: string, newlyCreated: boolean) => {
    if (pendingPhotoAssetRef.current && pendingPhotoAssetRef.current !== assetId) {
      createEventRepo(getDb()).detachMedia(pendingPhotoAssetRef.current);
    }
    pendingPhotoAssetRef.current = newlyCreated ? assetId : null;
    setPhotoMediaId(assetId);
  };

  const pickLocalPhoto = async () => {
    setPicking(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 1,
        exif: false,
      });
      if (result.canceled || result.assets.length === 0) return;
      const asset = result.assets[0];
      const sourceUri = await stageSourceImage(asset.uri);
      const width = asset.width || 1;
      const height = asset.height || 1;
      setCropError(null);
      setCropSourceBoth({ sourceUri, width, height, box: ratioBox(PHOTO_RATIO, width, height) });
      setCropSession((current) => current + 1);
      setCropVisible(true);
    } finally {
      setPicking(false);
    }
  };

  /** Crops the staged source and imports the result as the group photo. */
  const applyCropDone = async (box: CropBox) => {
    const source = cropSourceRef.current;
    if (!source) return;
    setPicking(true);
    setCropError(null);
    try {
      const transform = cropTransformFromDraft({ rotation: 0, flipped: false, box }, source.width, source.height);
      const uri = Object.keys(transform).length > 0 ? await cropImageUri(source.sourceUri, transform) : source.sourceUri;
      let newlyCreatedAssetId: string | null = null;
      const imported = await importImageFromUri(getDb(), uri, 'photo', {
        onImported: (assetId, result) => {
          if (!result.deduplicated) newlyCreatedAssetId = assetId;
        },
      });
      applyImportedPhoto(imported.assetId, imported.assetId === newlyCreatedAssetId);
      setCropSourceBoth({ ...source, box });
      setCropVisible(false);
    } catch {
      setCropError('Could not apply the crop. Please try again or cancel.');
    } finally {
      setPicking(false);
    }
  };

  const applySocialPhoto = (result: SocialAvatarImportResult) => {
    const fieldByPlatform: Record<SocialPlatform, 'xProfileUrl' | 'instagramProfileUrl' | 'tiktokProfileUrl'> = {
      x: 'xProfileUrl',
      instagram: 'instagramProfileUrl',
      tiktok: 'tiktokProfileUrl',
    };
    setValue(fieldByPlatform[result.platform], result.profileUrl, { shouldValidate: true });
    applyImportedPhoto(result.mediaAssetId, result.newlyCreated);
    if (result.sourceUri && result.sourceWidth && result.sourceHeight) {
      setCropSourceBoth({
        sourceUri: result.sourceUri,
        width: result.sourceWidth,
        height: result.sourceHeight,
        box: ratioBox(PHOTO_RATIO, result.sourceWidth, result.sourceHeight),
      });
    } else {
      setCropSourceBoth(null);
    }
  };

  const handleStatusSelect = (status: 'active' | 'hiatus' | 'inactive') => {
    setGroupStatus(status);
    if (status === 'active') {
      setValue('endDate', '');
    } else if (status === 'inactive' && !watchedEndDate) {
      setValue('endDate', todayISO());
    }
  };

  return (
    <>
      {/* ── Photo Picker Card (Matching Figma node 35:2377 / 9:5520) ── */}
      <View style={styles.photoCenterRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pick Group Photo"
          accessibilityState={{ disabled: picking }}
          disabled={picking}
          onPress={() => setPhotoSourceVisible(true)}
          style={[
            styles.photoCard,
            {
              backgroundColor: theme.color.surface,
              borderColor: theme.color.accent,
              borderWidth: theme.surface.borderWidth,
            },
          ]}
        >
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoCardImage} contentFit="cover" transition={150} />
          ) : (
            <View style={styles.photoPickerContent}>
              <Icon name="cameraPlus" size={30} color={theme.color.accent} strokeWidth={1} />
              <AppText size="small" style={{ color: theme.color.accent, fontSize: 12, fontFamily: 'Nunito-Regular', textAlign: 'center' }}>
                {picking ? 'Importing…' : 'Pick Photo'}
              </AppText>
            </View>
          )}
          {photoMediaId && cropSource ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Crop photo again"
              onPress={() => {
                setCropError(null);
                setCropSession((current) => current + 1);
                setCropVisible(true);
              }}
              hitSlop={6}
              style={styles.photoCropButton}
            >
              <Ionicons name="crop" size={14} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </Pressable>
      </View>

      {/* ── Basic Info Card (Matching Figma node 9:5521) ── */}
      <Card style={styles.sectionCard}>
        <AppText weight="semibold" size="large">
          Basic Info
        </AppText>

        {/* Group Name */}
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Field
              icon="star"
              label="Group Name"
              placeholder="Group Name"
              accessibilityLabel="Group Name"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.name?.message ?? null}
            />
          )}
        />

        {/* Country & Region Fields */}
        <CountryRegionFields
          country={watchedCountry as CountryCode}
          region={watchedRegion ?? ''}
          countryLabel="Country"
          regionLabel="Region"
          labelWeight="regular"
          onCountryChange={(c) => setValue('country', c)}
          onRegionChange={(r) => setValue('region', r)}
          layout="row"
        />
      </Card>

      {/* ── Status Info Card (Matching IdolForm) ── */}
      <Card style={styles.sectionCard}>
        <AppText weight="semibold" size="large">
          Status Info
        </AppText>

        {/* Status Array Pills */}
        <View style={styles.statusArrayRow}>
          {/* Active Pill */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Status Active"
            accessibilityState={{ selected: groupStatus === 'active' }}
            onPress={() => handleStatusSelect('active')}
            style={[
              styles.statusPil,
              groupStatus === 'active'
                ? { backgroundColor: GREEN_SCALE.G200, borderColor: BLACK_SCALE.B900 }
                : { backgroundColor: 'rgba(77, 182, 101, 0.25)', borderColor: 'rgba(0, 0, 0, 0.3)' },
            ]}
          >
            <AppText
              size="body"
              weight="regular"
              color={groupStatus === 'active' ? BLACK_SCALE.B900 : 'rgba(0, 0, 0, 0.5)'}
            >
              Active
            </AppText>
          </Pressable>

          {/* Hiatus Pill */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Status Hiatus"
            accessibilityState={{ selected: groupStatus === 'hiatus' }}
            onPress={() => handleStatusSelect('hiatus')}
            style={[
              styles.statusPil,
              groupStatus === 'hiatus'
                ? { backgroundColor: YELLOW_SCALE.Y200, borderColor: BLACK_SCALE.B900 }
                : { backgroundColor: 'rgba(255, 204, 49, 0.5)', borderColor: 'rgba(0, 0, 0, 0.5)' },
            ]}
          >
            <AppText
              size="body"
              weight="regular"
              color={groupStatus === 'hiatus' ? BLACK_SCALE.B900 : 'rgba(0, 0, 0, 0.5)'}
            >
              Hiatus
            </AppText>
          </Pressable>

          {/* Inactive Pill */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Status Inactive"
            accessibilityState={{ selected: groupStatus === 'inactive' }}
            onPress={() => handleStatusSelect('inactive')}
            style={[
              styles.statusPil,
              groupStatus === 'inactive'
                ? { backgroundColor: BLACK_SCALE.B50, borderColor: BLACK_SCALE.B900 }
                : { backgroundColor: 'rgba(191, 191, 191, 0.5)', borderColor: 'rgba(0, 0, 0, 0.5)' },
            ]}
          >
            <AppText
              size="body"
              weight="regular"
              color={groupStatus === 'inactive' ? BLACK_SCALE.B900 : 'rgba(0, 0, 0, 0.5)'}
            >
              Inactive
            </AppText>
          </Pressable>
        </View>

        {/* Status-dependent Date Fields (Matching IdolForm) */}
        {groupStatus === 'active' || groupStatus === 'hiatus' ? (
          <View style={{ width: '100%' }}>
            <Controller
              control={control}
              name="debutDate"
              render={({ field }) => (
                <DateField
                  label="Debut date"
                  variant="regular"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Pick debut date"
                  allowClear
                />
              )}
            />
          </View>
        ) : null}

        {groupStatus === 'inactive' ? (
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Controller
                control={control}
                name="debutDate"
                render={({ field }) => (
                  <DateField
                    label="Debut date"
                    variant="regular"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    placeholder="Pick debut date"
                    allowClear
                  />
                )}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Controller
                control={control}
                name="endDate"
                render={({ field }) => (
                  <DateField
                    label="Inactive date"
                    variant="regular"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    placeholder="Pick inactive date"
                    allowClear
                  />
                )}
              />
            </View>
          </View>
        ) : null}
      </Card>

      {/* ── Social Media Card (Foldable, default closed, positioned at the very bottom) ── */}
      <SocialProfileFields
        style={{ marginTop: CARD_STACK_GAP }}
        defaultCollapsed
        values={{
          x: watchedXProfileUrl ?? '',
          instagram: watchedInstagramProfileUrl ?? '',
          tiktok: watchedTiktokProfileUrl ?? '',
        }}
        errors={{
          x: errors.xProfileUrl?.message,
          instagram: errors.instagramProfileUrl?.message,
          tiktok: errors.tiktokProfileUrl?.message,
        }}
        onChange={(platform, value) => {
          const fieldByPlatform = {
            x: 'xProfileUrl',
            instagram: 'instagramProfileUrl',
            tiktok: 'tiktokProfileUrl',
          } as const;
          setValue(fieldByPlatform[platform], value, { shouldValidate: false });
        }}
      />

      {formError ? <AppText size="small" color={theme.color.danger} style={{ marginTop: 8, textAlign: 'center' }}>{formError}</AppText> : null}
      {showSubmitButton ? (
        <Button
          label={submitLabel}
          onPress={submit}
          style={styles.saveButton}
        />
      ) : null}

      <ProfilePhotoSourceSheet
        visible={photoSourceVisible}
        onClose={() => setPhotoSourceVisible(false)}
        onLocal={() => {
          setPhotoSourceVisible(false);
          void pickLocalPhoto();
        }}
        onSocial={() => {
          setPhotoSourceVisible(false);
          setSocialPickerVisible(true);
        }}
      />
      <SocialAvatarPicker
        visible={socialPickerVisible}
        onClose={() => setSocialPickerVisible(false)}
        keepStagingSource
        existingProfileUrls={{
          x: watchedXProfileUrl,
          instagram: watchedInstagramProfileUrl,
          tiktok: watchedTiktokProfileUrl,
        }}
        onComplete={(result) => {
          applySocialPhoto(result);
          setSocialPickerVisible(false);
        }}
      />
      <ProfilePhotoCropEditor
        key={cropSession}
        visible={cropVisible}
        uri={cropSource?.sourceUri ?? ''}
        width={cropSource?.width ?? 1}
        height={cropSource?.height ?? 1}
        initialBox={cropSource?.box}
        ratio={PHOTO_RATIO}
        onCancel={() => setCropVisible(false)}
        onDone={(box) => {
          void applyCropDone(box);
        }}
        error={cropError}
      />
    </>
  );
}

export function createOrUpdateGroup(values: GroupFormValues, photoMediaId: string | null, existingId?: string) {
  const repo = createIdolRepo(getDb());
  const input = {
    name: values.name,
    country: values.country as CountryCode,
    region: values.region || null,
    debutDate: values.debutDate || null,
    endDate: values.endDate || null,
    notes: values.notes || null,
    photoMediaId,
    xProfileUrl: normalizeSocialProfileInput('x', values.xProfileUrl)?.profileUrl ?? null,
    instagramProfileUrl: normalizeSocialProfileInput('instagram', values.instagramProfileUrl)?.profileUrl ?? null,
    tiktokProfileUrl: normalizeSocialProfileInput('tiktok', values.tiktokProfileUrl)?.profileUrl ?? null,
  };
  return existingId ? repo.updateGroup(existingId, input) : repo.createGroup({ ...input, isFavorite: false });
}

const styles = StyleSheet.create({
  photoCenterRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  photoCard: {
    width: 200,
    height: 200,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  photoCardImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  photoPickerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  photoCropButton: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionCard: {
    padding: 16,
    gap: 8,
    marginTop: CARD_STACK_GAP,
  },
  statusArrayRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  statusPil: {
    flex: 1,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  saveButton: {
    marginTop: 16,
    height: 40,
    borderRadius: 16,
  },
  sheetScroll: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 8,
  },
});

export interface GroupFormBottomSheetProps extends GroupFormProps {
  visible: boolean;
  onClose: () => void;
}

export function GroupFormBottomSheet({ visible, onClose, submitLabel = 'Save Group', ...formProps }: GroupFormBottomSheetProps) {
  const [submitRequest, setSubmitRequest] = useState(0);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      maxHeightRatio={0.9}
      footer={(
        <Button
          label={submitLabel}
          onPress={() => setSubmitRequest((current) => current + 1)}
          style={{ height: 40, borderRadius: 16 }}
        />
      )}
    >
      <ScrollView keyboardShouldPersistTaps="handled" scrollsChildToFocus contentContainerStyle={styles.sheetScroll}>
        <GroupForm
          {...formProps}
          submitLabel={submitLabel}
          showSubmitButton={false}
          submitRequest={submitRequest}
          onSubmit={(values, photoMediaId) => {
            formProps.onSubmit?.(values, photoMediaId);
            onClose();
          }}
        />
      </ScrollView>
    </BottomSheet>
  );
}
