import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, TextInput } from 'react-native';
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
import { Chip } from '@/components/ui/Chip';
import { DateField } from '@/components/ui/DateField';
import { Dropdown } from '@/components/ui/Dropdown';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';

import { BLACK_SCALE, DEFAULT_PRIMARY_SCALE, GREEN_SCALE, YELLOW_SCALE } from '@/design-system/colors';

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
import { saveIdolAggregate } from '@/services/idolSave';
import { resolveIdolPhotoUris } from '@/services/dashboard';
import { CountryRegionFields } from '@/components/forms/CountryRegionFields';
import { GroupPickerDropdown } from '@/components/forms/GroupPickerDropdown';
import { ProfilePhotoSourceSheet } from '@/components/forms/ProfilePhotoSourceSheet';
import { ProfilePhotoCropEditor } from '@/components/forms/ProfilePhotoCropEditor';
import { SocialAvatarPicker, type SocialAvatarImportResult } from '@/components/forms/SocialAvatarPicker';
import { SocialProfileFields } from '@/components/forms/SocialProfileFields';
import { normalizeSocialProfileInput, SocialProfileValidationError } from '@/services/socialProfile';
import { cropTransformFromDraft, ratioBox, type CropBox } from '@/components/album/ImageCropEditor';
import { todayISO } from '@/utils/date';
import { pickDisplayMembership } from '@/services/membership';
import {
  validateMembershipForm,
  findAffectedEntries,
  listReassignmentOptions,
  type AffectedEntry,
  type ReassignmentOption,
} from '@/services/membershipGuard';
import {
  CURRENCIES,
  CURRENCY_BY_CODE,
  COUNTRIES,
  type CountryCode,
  type CurrencyCode,
  type IdolStatus,
  type MembershipStatus,
  type MemberColor,
  type SocialPlatform,
} from '@/types/domain';

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
  birthDate: z.string().trim().optional(),
  memberColor: z.string().trim().optional(),
  status: z.enum(['active', 'hiatus', 'inactive']),
  notes: z.string().trim().optional(),
  xProfileUrl: socialProfileField('x'),
  instagramProfileUrl: socialProfileField('instagram'),
  tiktokProfileUrl: socialProfileField('tiktok'),
});

type FormValues = z.infer<typeof schema>;

export interface MembershipFormData {
  id?: string;
  groupId: string | null;
  name: string;
  memberColor: string;
  status: MembershipStatus;
  startDate: string;
  endDate: string;
  hiatusStartDate: string;
  hiatusEndDate: string;
  isMain: boolean;
}

export interface MembershipFormSeed {
  id: string;
  groupId: string;
  name: string | null;
  memberColor: string | null;
  status: MembershipStatus;
  startDate: string;
  endDate: string | null;
  hiatusStartDate: string | null;
  hiatusEndDate: string | null;
  isMain: boolean;
}

export interface ChekiTypeFormData {
  id?: string;
  label: string;
  currency: CurrencyCode;
  unitPrice: number;
  isDefault?: boolean;
}

export interface IdolFormProps {
  initial?: {
    id: string;
    name: string;
    country: CountryCode;
    region: string | null;
    birthDate: string | null;
    memberColor: string | null;
    status: IdolStatus;
    notes: string | null;
    photoMediaId: string | null;
    xProfileUrl?: string | null;
    instagramProfileUrl?: string | null;
    tiktokProfileUrl?: string | null;
  };
  initialMemberships?: MembershipFormSeed[];
  initialChekiTypes?: ChekiTypeFormData[];
  submitLabel?: string;
  /** Hide the inline action when a parent supplies a sticky footer action. */
  showSubmitButton?: boolean;
  /** Increment to request submission from an external sticky action. */
  submitRequest?: number;
  /** Called only after the core, memberships, reassignment, and prices commit. */
  onSaved?: (idolId?: string) => void;
  dangerAction?: {
    label: string;
    description: string;
    onPress: () => void;
  };
}

const emptyMembership = (): MembershipFormData => ({
  groupId: null,
  name: '',
  memberColor: '',
  status: 'active',
  startDate: '',
  endDate: '',
  hiatusStartDate: '',
  hiatusEndDate: '',
  isMain: false,
});

/**
 * Idol profile photos are displayed 4:3 (landscape) in the detail header and
 * 1:1 on cards, so the crop box locks to 4:3 with a 1:1 guide overlay.
 */
const PHOTO_RATIO = 4 / 3;

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

/** Current is terminal-state based: Grad leaves Edit Idol immediately after save. */
function isCurrentMembership(draft: MembershipFormData): boolean {
  return draft.status !== 'grad';
}

function effectiveMembershipStatus(draft: MembershipFormData): MembershipStatus {
  if (draft.status === 'hiatus' && draft.hiatusEndDate) return 'active';
  return draft.status;
}

/**
 * Resolves the stored per-group name:
 * - Former memberships keep their (editable) historical name.
 * - The current membership — when it is Main or the only active one — follows
 *   the idol's global name automatically.
 * - A non-Main membership during an overlap keeps its stored name.
 */
function resolveMembershipName(draft: MembershipFormData, idolName: string, drafts: MembershipFormData[]): string | null {
  if (!isCurrentMembership(draft)) return draft.name || null;
  const soleActive = drafts.filter(isCurrentMembership).length === 1;
  if (draft.isMain || soleActive) return idolName;
  return draft.name || null;
}

/**
 * Global status is based on all submitted current memberships. Active wins
 * over Hiatus; no current group membership is Inactive (there is no Active Solo).
 */
function deriveIdolStatus(drafts: MembershipFormData[]): IdolStatus {
  const current = drafts.filter((draft) => draft.groupId !== null && effectiveMembershipStatus(draft) !== 'grad');
  if (current.length === 0) return 'inactive';
  return current.some((draft) => effectiveMembershipStatus(draft) === 'active') ? 'active' : 'hiatus';
}

/**
 * Global solo member color follows the picked (Main/sole) current membership's
 * color hex; falls back to the previously stored value.
 */
function deriveIdolColor(drafts: MembershipFormData[], colorById: Map<string, MemberColor>, fallback: string): string {
  const picked = pickDisplayMembership(drafts.filter((draft) => draft.groupId !== null && draft.status !== 'grad'), todayISO());
  const color = picked?.memberColor ? colorById.get(picked.memberColor) : null;
  return color?.hex ?? fallback;
}

export function IdolForm({
  initial,
  initialMemberships = [],
  initialChekiTypes,
  submitLabel = 'Save Idol',
  showSubmitButton = true,
  submitRequest = 0,
  onSaved,
  dangerAction,
}: IdolFormProps) {
  const theme = useTheme();
  const countries = useSettingsStore((s) => s.countries);
  const activeCountries = useMemo(() => countries.filter((c) => c.isActive).map((c) => c.country), [countries]);
  const [photoMediaId, setPhotoMediaId] = useState<string | null>(initial?.photoMediaId ?? null);
  const [picking, setPicking] = useState(false);
  const [photoSourceVisible, setPhotoSourceVisible] = useState(false);
  const [socialPickerVisible, setSocialPickerVisible] = useState(false);
  const [cropSource, setCropSource] = useState<CropSource | null>(() => cropSourceFromInitial(initial?.photoMediaId ?? null, PHOTO_RATIO));
  const cropSourceRef = useRef<CropSource | null>(cropSource);
  const [cropVisible, setCropVisible] = useState(false);
  const [cropSession, setCropSession] = useState(0);
  const [cropError, setCropError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<MembershipFormData[]>(() => {
    if (initialMemberships && initialMemberships.length > 0) {
      const seeded = initialMemberships.map((m) => ({
        id: m.id,
        groupId: m.groupId,
        name: m.name ?? '',
        memberColor: m.memberColor ?? '',
        status: m.status,
        startDate: m.startDate,
        endDate: m.endDate ?? '',
        hiatusStartDate: m.hiatusStartDate ?? '',
        hiatusEndDate: m.hiatusEndDate ?? '',
        isMain: m.isMain,
      }));
      if (seeded.length === 1) seeded[0].isMain = true;
      return seeded;
    }
    return initial?.id ? [] : [emptyMembership()];
  });
  const [removedMembershipIds, setRemovedMembershipIds] = useState<string[]>([]);
  const [chekiTypes, setChekiTypes] = useState<ChekiTypeFormData[]>(() => {
    if (initialChekiTypes && initialChekiTypes.length > 0) return initialChekiTypes;
    if (initial?.id) {
      const loaded = createIdolRepo(getDb()).listChekiTypes(initial.id, false);
      if (loaded.length > 0) {
        return loaded.map((ct) => ({
          id: ct.id,
          label: ct.label,
          currency: ct.currency,
          unitPrice: ct.unitPrice,
          isDefault: ct.isDefault,
        }));
      }
    }
    return [];
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [colorModalFor, setColorModalFor] = useState<number | null>(null);
  const [openGroupMembershipIndex, setOpenGroupMembershipIndex] = useState<number | null>(null);
  const [colors, setColors] = useState<MemberColor[]>(() => createIdolRepo(getDb()).listMemberColors());
  const colorById = useMemo(() => new Map(colors.map((c) => [c.id, c])), [colors]);

  // Membership-guard state (PRD 5.3): pending save while entries are reassigned.
  const [guardAffected, setGuardAffected] = useState<AffectedEntry[]>([]);
  const [guardReassignments, setGuardReassignments] = useState<Record<string, string | null>>({});
  const [guardOptions, setGuardOptions] = useState<Record<string, ReassignmentOption[]>>({});
  const [guardContinuation, setGuardContinuation] = useState<((reassignments: Record<string, string | null>) => void) | null>(null);
  const pendingPhotoAssetRef = useRef<string | null>(null);

  const photoUri = useMemo(
    () => (photoMediaId ? resolveIdolPhotoUris(getDb(), [photoMediaId]).get(photoMediaId) ?? null : null),
    [photoMediaId],
  );

  useEffect(() => () => {
    if (pendingPhotoAssetRef.current) createEventRepo(getDb()).detachMedia(pendingPhotoAssetRef.current);
  }, []);

  const setCropSourceBoth = useCallback((next: CropSource | null) => {
    const previous = cropSourceRef.current;
    // Only release the previous staging file when the source actually changes:
    // re-cropping stores a new box over the SAME sourceUri, which must survive
    // so the user can crop again.
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
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '',
      country: initial?.country ?? activeCountries[0] ?? 'JP',
      region: initial?.region ?? '',
      birthDate: initial?.birthDate ?? '',
      memberColor: initial?.memberColor ?? '',
      status: initial?.status ?? 'active',
      notes: initial?.notes ?? '',
      xProfileUrl: initial?.xProfileUrl ?? '',
      instagramProfileUrl: initial?.instagramProfileUrl ?? '',
      tiktokProfileUrl: initial?.tiktokProfileUrl ?? '',
    },
  });

  const watchedCountry = useWatch({ control, name: 'country' });
  const watchedRegion = useWatch({ control, name: 'region' });
  const watchedName = useWatch({ control, name: 'name' });
  const watchedXProfileUrl = useWatch({ control, name: 'xProfileUrl' });
  const watchedInstagramProfileUrl = useWatch({ control, name: 'instagramProfileUrl' });
  const watchedTiktokProfileUrl = useWatch({ control, name: 'tiktokProfileUrl' });

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

  /** Crops the staged source and imports the result as the idol photo. */
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
      // Keep the editor open so the user can retry or cancel.
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

  const patchMembership = (index: number, patch: Partial<MembershipFormData>) => {
    setMemberships((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  const setMainOnly = (index: number) => {
    setMemberships((prev) => prev.map((m, i) => ({ ...m, isMain: i === index })));
  };

  const validateMemberships = useCallback((): string | null => {
    const filled = memberships.filter((m) => m.groupId !== null);
    if (memberships.length > 1 && filled.length < memberships.length) {
      return 'Pick a group for every membership';
    }
    const nextCurrent = filled.filter((membership) => effectiveMembershipStatus(membership) !== 'grad');
    if (nextCurrent.length > 1 && nextCurrent.filter((membership) => membership.isMain).length !== 1) {
      return 'Exactly one current membership must be marked as Main';
    }
    for (const m of filled) {
      const check = validateMembershipForm({
        startDate: m.startDate || todayISO(),
        endDate: m.endDate || null,
        status: effectiveMembershipStatus(m),
        hiatusStartDate: m.hiatusStartDate || null,
        hiatusEndDate: m.hiatusEndDate || null,
      });
      if (!check.ok) return check.error ?? 'Invalid membership';
    }
    return null;
  }, [memberships]);

  const persistAggregate = useCallback(
    (values: FormValues, reassignments: Record<string, string | null>) => {
      const filled = memberships.filter((m) => m.groupId !== null);
      const savedIdolId = saveIdolAggregate(getDb(), {
        existingId: initial?.id,
        core: {
          name: values.name,
          country: values.country as CountryCode,
          region: values.region || null,
          birthDate: values.birthDate || null,
          memberColor: values.memberColor || null,
          status: values.status,
          notes: values.notes || null,
          photoMediaId,
          xProfileUrl: normalizeSocialProfileInput('x', values.xProfileUrl)?.profileUrl ?? null,
          instagramProfileUrl: normalizeSocialProfileInput('instagram', values.instagramProfileUrl)?.profileUrl ?? null,
          tiktokProfileUrl: normalizeSocialProfileInput('tiktok', values.tiktokProfileUrl)?.profileUrl ?? null,
          isFavorite: initial ? undefined : false,
        },
        memberships: filled.map((draft) => ({
          id: draft.id,
          groupId: draft.groupId!,
          startDate: draft.startDate || todayISO(),
          endDate: draft.endDate || null,
          name: resolveMembershipName(draft, values.name, memberships),
          memberColor: draft.memberColor || null,
          status: effectiveMembershipStatus(draft),
          hiatusStartDate: draft.hiatusStartDate || null,
          hiatusEndDate: draft.hiatusEndDate || null,
          isMain: draft.isMain,
        })),
        chekiTypes,
        removedMembershipIds,
        reassignments,
      });
      pendingPhotoAssetRef.current = null;
      setCropSourceBoth(null);
      onSaved?.(savedIdolId);
    },
    [chekiTypes, initial, memberships, onSaved, photoMediaId, removedMembershipIds, setCropSourceBoth],
  );

  const prepareGuardOrPersist = useCallback(
    (values: FormValues) => {
      const allEntries: AffectedEntry[] = [];
      const options: Record<string, ReassignmentOption[]> = {};
      const defaults: Record<string, string | null> = {};
      for (const draft of memberships) {
        if (!draft.id) continue;
        const seed = initialMemberships.find((membership) => membership.id === draft.id);
        const datesChanged = !!seed && (seed.startDate !== draft.startDate || (seed.endDate ?? '') !== draft.endDate);
        if (!datesChanged) continue;
        const affected = findAffectedEntries(getDb(), draft.id, {
          startDate: draft.startDate,
          endDate: draft.endDate || null,
        });
        for (const entry of affected) {
          const candidates = listReassignmentOptions(getDb(), entry, draft.id);
          options[entry.entryId] = candidates;
          defaults[entry.entryId] = candidates.find((option) => option.groupMembershipId !== null)?.groupMembershipId ?? null;
        }
        allEntries.push(...affected);
      }
      if (allEntries.length === 0) {
        persistAggregate(values, {});
        return;
      }
      setGuardOptions(options);
      setGuardReassignments(defaults);
      setGuardAffected(allEntries);
      setGuardContinuation(() => (reassignments: Record<string, string | null>) => persistAggregate(values, reassignments));
    },
    [initialMemberships, memberships, persistAggregate],
  );

  const submitValues = useCallback(
    (values: FormValues) => {
      setFormError(null);
      try {
        const error = validateMemberships();
        if (error) {
          setFormError(error);
          return;
        }
        const derived: FormValues = {
          ...values,
          status: deriveIdolStatus(memberships),
          memberColor: deriveIdolColor(memberships, colorById, values.memberColor ?? ''),
        };
        prepareGuardOrPersist(derived);
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
      }
    },
    [colorById, memberships, prepareGuardOrPersist, validateMemberships],
  );

  const save = useCallback(() => {
    void handleSubmit(submitValues)();
  }, [handleSubmit, submitValues]);

  const handledSubmitRequest = useRef(0);
  useEffect(() => {
    if (submitRequest <= handledSubmitRequest.current) return;
    handledSubmitRequest.current = submitRequest;
    save();
  }, [save, submitRequest]);

  const confirmGuard = () => {
    try {
      guardContinuation?.(guardReassignments);
      setGuardAffected([]);
      setGuardOptions({});
      setGuardReassignments({});
      setGuardContinuation(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    }
  };

  const cancelGuard = () => {
    setGuardAffected([]);
    setGuardOptions({});
    setGuardReassignments({});
    setGuardContinuation(null);
  };

  const availableCurrencies = useMemo(() => {
    const currencyCountries = activeCountries.length > 0 ? activeCountries : COUNTRIES.map((country) => country.code);
    return [...new Set(currencyCountries.map((country) => CURRENCIES[country]))];
  }, [activeCountries]);
  const selectedCountryCurrency = CURRENCIES[watchedCountry as CountryCode];
  const defaultCurrencyForCountry = availableCurrencies.includes(selectedCountryCurrency)
    ? selectedCountryCurrency
    : availableCurrencies[0] ?? 'JPY';

  const addChekiTypeRow = () => {
    setChekiTypes((prev) => [
      ...prev,
      { label: '2 Shot', currency: defaultCurrencyForCountry, unitPrice: 2000 },
    ]);
  };

  return (
    <>
      <ScrollView
        testID="idol-form-scroll"
        keyboardShouldPersistTaps="handled"
        scrollsChildToFocus
        nestedScrollEnabled
        scrollEnabled={openGroupMembershipIndex === null}
        contentContainerStyle={[styles.scrollContent, { backgroundColor: theme.color.background }]}
      >

        {/* ── Photo Picker Card (Matching Figma node 9:3951) ── */}
        <View style={styles.photoCenterRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pick Photo"
            onPress={() => setPhotoSourceVisible(true)}
            disabled={picking}
            style={[styles.photoCard, { borderColor: theme.color.accent }]}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoCardImage} contentFit="cover" transition={150} />
            ) : (
              <View style={styles.photoPickerContent}>
                <Icon name="cameraPlus" size={24} color={theme.color.accent} strokeWidth={1} />
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
                <Ionicons name="crop" size={15} color="#FFFFFF" />
              </Pressable>
            ) : null}
          </Pressable>
        </View>

        {/* ── Basic Info Card (Matching Figma node 9:4102) ── */}
        <Card style={styles.sectionCard}>
          <AppText weight="semibold" size="large">
            Basic Info
          </AppText>

          {/* Idol Name */}
          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <Field
                icon="star"
                label="Name *"
                placeholder="e.g. Idol name"
                value={field.value}
                onChangeText={field.onChange}
                accessibilityLabel="Idol Name"
                error={errors.name?.message ?? null}
              />
            )}
          />

          {/* Birth Date */}
          <Controller
            control={control}
            name="birthDate"
            render={({ field }) => (
              <DateField
                label="Birth date"
                variant="regular"
                value={field.value ?? ''}
                onChange={field.onChange}
                placeholder="Pick birth date"
                allowClear
              />
            )}
          />

          {/* Country + Region */}
          <CountryRegionFields
            country={watchedCountry as CountryCode}
            region={watchedRegion ?? ''}
            onCountryChange={(c) => setValue('country', c)}
            onRegionChange={(r) => setValue('region', r)}
            layout="row"
          />
        </Card>

        {/* ── Group Info Card (Matching Figma node 371:6794) ── */}
        <Card style={styles.sectionCard}>
          <View style={styles.groupHeaderRow}>
            <AppText weight="semibold" size="large">
              Group Info
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMemberships((prev) => [...prev, emptyMembership()])}
              style={[styles.secondaryAddButton, { backgroundColor: theme.color.accentSurface, borderColor: theme.color.accent }]}
            >
              <Icon name="plus" size={14} color={theme.color.accent} strokeWidth={1.5} />
              <AppText size="xs" style={{ color: theme.color.accent, fontSize: 12, fontFamily: 'Nunito-Light' }}>
                Add Membership
              </AppText>
            </Pressable>
          </View>

          <View style={styles.dividerLine} />

          {memberships.length === 0 ? (
            <AppText size="small" muted style={{ marginTop: 4 }}>
              No current group memberships.
            </AppText>
          ) : (
            memberships.map((m, index) => (
              <View key={m.id ?? `new-${index}`}>
                {index > 0 ? <View style={styles.membershipDivider} /> : null}
                <MembershipCard
                  draft={m}
                  index={index}
                  showMembershipHeader={memberships.length > 1}
                  idolName={watchedName}
                  colorById={colorById}
                  onPatch={(patch) => patchMembership(index, patch)}
                  onSetMain={() => setMainOnly(index)}
                  onPickColor={() => setColorModalFor(index)}
                  groupPickerOpen={openGroupMembershipIndex === index}
                  onToggleGroupPicker={() => setOpenGroupMembershipIndex((current) => (current === index ? null : index))}
                  onCloseGroupPicker={() => setOpenGroupMembershipIndex(null)}
                  onRemove={() => {
                    setOpenGroupMembershipIndex(null);
                    if (m.id) setRemovedMembershipIds((current) => current.includes(m.id!) ? current : [...current, m.id!]);
                    setMemberships((prev) => prev.filter((_, i) => i !== index));
                  }}
                />
              </View>
            ))
          )}
        </Card>

        {/* ── Cheki Type Form Card (Matching Figma node 39:4378) ── */}
        <Card style={styles.sectionCard}>
          <AppText weight="semibold" size="large">
            Cheki Type
          </AppText>

          {/* Table Header */}
          <View style={styles.chekiTableHeader}>
            <AppText size="body" weight="regular" style={styles.chekiColTypeHeader}>
              Type
            </AppText>
            <AppText size="body" weight="regular" style={styles.chekiColCurrencyHeader}>
              Currency
            </AppText>
            <AppText size="body" weight="regular" style={styles.chekiColPriceHeader}>
              Price
            </AppText>
            <View style={{ width: 24 }} />
          </View>

          {/* Table Rows */}
          {chekiTypes.map((ct, idx) => (
            <ChekiTypeRow
              key={ct.id ?? `ct-${idx}`}
              chekiType={ct}
              availableCurrencies={availableCurrencies}
              onChange={(patch) => {
                setChekiTypes((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
              }}
              onRemove={() => {
                setChekiTypes((prev) => prev.filter((_, i) => i !== idx));
              }}
              isLast={idx === chekiTypes.length - 1}
              onAdd={addChekiTypeRow}
            />
          ))}
          {chekiTypes.length === 0 ? (
            <Pressable onPress={addChekiTypeRow} style={styles.addChekiEmptyRow}>
              <Icon name="plusCircle" size={20} color={theme.color.accent} />
              <AppText size="small" color={theme.color.accent}>
                Add Cheki Type
              </AppText>
            </Pressable>
          ) : null}
        </Card>

        {/* ── Social Media Card (foldable; last section of the form) ── */}
        <SocialProfileFields
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

        {formError ? (
          <AppText size="small" color={theme.color.danger} style={{ marginTop: 8, textAlign: 'center' }}>
            {formError}
          </AppText>
        ) : null}

        {/* ── Primary Save Button ── */}
        {showSubmitButton ? (
          <Button
            label={submitLabel}
            onPress={save}
            style={{ marginTop: 8 }}
          />
        ) : null}

        {dangerAction ? (
          <View
            style={[
              styles.dangerSection,
              {
                backgroundColor: theme.color.surface,
                borderColor: theme.color.danger,
                borderWidth: theme.surface.borderWidth,
              },
            ]}
          >
            <AppText weight="semibold" size="large" color={theme.color.danger}>
              Danger Zone
            </AppText>
            <AppText weight="light" size="small" muted style={styles.dangerDescription}>
              {dangerAction.description}
            </AppText>
            <Button label={dangerAction.label} variant="danger" onPress={dangerAction.onPress} />
          </View>
        ) : null}
      </ScrollView>

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
        onComplete={applySocialPhoto}
        keepStagingSource
        existingProfileUrls={{
          x: watchedXProfileUrl,
          instagram: watchedInstagramProfileUrl,
          tiktok: watchedTiktokProfileUrl,
        }}
      />
      {cropSource ? (
        <ProfilePhotoCropEditor
          key={cropSession}
          visible={cropVisible}
          uri={cropSource.sourceUri}
          width={cropSource.width}
          height={cropSource.height}
          ratio={PHOTO_RATIO}
          showSquareGuide
          initialBox={cropSource.box}
          busy={picking}
          error={cropError}
          onCancel={() => {
            setCropError(null);
            setCropVisible(false);
          }}
          onDone={(box) => void applyCropDone(box)}
        />
      ) : null}

      {colorModalFor !== null ? (
        <MemberColorModal
          colors={colors}
          selectedId={memberships[colorModalFor]?.memberColor ?? ''}
          usedIds={memberships.map((m) => m.memberColor).filter(Boolean)}
          onSelect={(id) => {
            patchMembership(colorModalFor, { memberColor: id });
            setColorModalFor(null);
          }}
          onColorCreated={() => setColors(createIdolRepo(getDb()).listMemberColors())}
          onClose={() => setColorModalFor(null)}
        />
      ) : null}

      {guardAffected.length > 0 ? (
        <Modal visible onClose={cancelGuard} title="Reassign Cheki Entries">
          <AppText weight="bold" size="body" color={theme.color.danger}>
            {guardAffected.length} completed cheki entr{(guardAffected.length === 1 ? 'y' : 'ies')} fall outside the new membership periods
          </AppText>
          <AppText size="xs" muted style={{ marginTop: 4, marginBottom: 8 }}>
            Reassign each to another active membership or Solo before saving.
          </AppText>
          {guardAffected.map((entry) => (
            <View key={entry.entryId} style={{ marginBottom: 12 }}>
              <AppText weight="semibold" size="small">
                {entry.eventTitle} · {entry.eventDate}
              </AppText>
              <View style={styles.chips}>
                {(guardOptions[entry.entryId] ?? []).map((option) => (
                  <Chip
                    key={option.groupMembershipId ?? 'solo'}
                    label={option.label}
                    selected={guardReassignments[entry.entryId] === option.groupMembershipId}
                    onPress={() => {
                      setGuardReassignments((current) => ({ ...current, [entry.entryId]: option.groupMembershipId }));
                    }}
                  />
                ))}
              </View>
            </View>
          ))}
          <Button label="Confirm Reassignment" style={{ marginTop: 16 }} onPress={confirmGuard} />
        </Modal>
      ) : null}
    </>
  );
}



export function ChekiTypeRow({
  chekiType,
  availableCurrencies,
  onChange,
  onRemove,
  isLast,
  onAdd,
  typeInputAccessibilityLabel,
  priceInputAccessibilityLabel,
}: {
  chekiType: ChekiTypeFormData;
  availableCurrencies: CurrencyCode[];
  onChange: (patch: Partial<ChekiTypeFormData>) => void;
  onRemove: () => void;
  isLast: boolean;
  onAdd: () => void;
  typeInputAccessibilityLabel?: string;
  priceInputAccessibilityLabel?: string;
}) {
  const theme = useTheme();
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const currencyInfo = CURRENCY_BY_CODE[chekiType.currency] ?? { symbol: '$', name: chekiType.currency };

  const formatPriceStr = (price: number) => {
    return `${currencyInfo.symbol} ${price.toLocaleString()}`;
  };

  const handlePriceTextChange = (text: string) => {
    const rawDigits = text.replace(/[^0-9]/g, '');
    const num = rawDigits ? parseInt(rawDigits, 10) : 0;
    onChange({ unitPrice: num });
  };

  return (
    <View style={styles.chekiRow}>
      {/* Type Label */}
      <TextInput
        accessibilityLabel={typeInputAccessibilityLabel}
        value={chekiType.label}
        onChangeText={(text) => onChange({ label: text })}
        style={styles.chekiTypeInput}
        placeholder="Type"
        placeholderTextColor={BLACK_SCALE.B100}
      />

      {/* Currency Dropdown Selector */}
      <Dropdown
        value={chekiType.currency}
        placeholder="Currency"
        valueAlign="center"
        open={currencyOpen}
        onToggle={() => setCurrencyOpen((current) => !current)}
        accessibilityLabel="Currency"
        style={styles.currencyDropdown}
      >
        {availableCurrencies.map((code) => (
          <Pressable
            key={code}
            accessibilityRole="button"
            accessibilityLabel={`Select currency ${code}`}
            onPress={() => {
              onChange({ currency: code });
              setCurrencyOpen(false);
            }}
            style={[
              styles.currencyOptionRow,
              {
                borderBottomColor: theme.color.borderLight,
                backgroundColor: code === chekiType.currency ? theme.color.accentSurface : undefined,
                borderRadius: code === chekiType.currency ? 8 : undefined,
              },
            ]}
          >
            <AppText size="body" style={styles.currencyOptionLabel}>{code}</AppText>
          </Pressable>
        ))}
      </Dropdown>

      {/* Price Input */}
      <TextInput
        accessibilityLabel={priceInputAccessibilityLabel}
        value={formatPriceStr(chekiType.unitPrice)}
        onChangeText={handlePriceTextChange}
        keyboardType="numeric"
        style={styles.priceInput}
      />

      {/* Action Icon Button */}
      {isLast ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Add Cheki Type" onPress={onAdd} hitSlop={8}>
          <Icon name="plusCircle" size={20} color={theme.color.accent} strokeWidth={1} />
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="Remove Cheki Type" onPress={onRemove} hitSlop={8}>
          <Icon name="xCircle" size={20} color="#DC3545" strokeWidth={1} />
        </Pressable>
      )}

    </View>
  );
}

function MembershipCard({
  draft,
  index,
  showMembershipHeader = true,
  idolName,
  colorById,
  onPatch,
  onSetMain,
  onPickColor,
  groupPickerOpen,
  onToggleGroupPicker,
  onCloseGroupPicker,
  onRemove,
}: {
  draft: MembershipFormData;
  index: number;
  showMembershipHeader?: boolean;
  idolName: string;
  colorById: Map<string, MemberColor>;
  onPatch: (patch: Partial<MembershipFormData>) => void;
  onSetMain: () => void;
  onPickColor: () => void;
  groupPickerOpen: boolean;
  onToggleGroupPicker: () => void;
  onCloseGroupPicker: () => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const groups = useMemo(() => createIdolRepo(getDb()).listGroups(), []);
  const groupPhotoUris = useMemo(
    () => resolveIdolPhotoUris(getDb(), groups.map((group) => group.photoMediaId)),
    [groups],
  );
  const selectedColor = draft.memberColor ? colorById.get(draft.memberColor) ?? null : null;
  const colorHex = selectedColor?.hex ?? '#FFFFFF';
  const gradDisabled = draft.status === 'grad' && !draft.endDate;
  const current = isCurrentMembership(draft);
  return (
    <View style={styles.membershipCardContainer}>
      {showMembershipHeader ? (
        <View style={styles.membershipHeader}>
          <AppText weight="semibold" size="body">
            Membership #{index + 1}{current ? '' : ' · History'}
          </AppText>
          <View style={styles.membershipHeaderActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Set as Main group" onPress={onSetMain} hitSlop={10}>
              <Ionicons name={draft.isMain ? 'star' : 'star-outline'} size={20} color={draft.isMain ? '#FFCC31' : BLACK_SCALE.B100} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Remove membership" onPress={onRemove} hitSlop={10}>
              <Ionicons name="trash-outline" size={18} color="#DC3545" />
            </Pressable>
          </View>
        </View>
      ) : null}

      <GroupPickerDropdown
        groups={groups}
        groupPhotoUris={groupPhotoUris}
        selectedGroupId={draft.groupId}
        open={groupPickerOpen}
        onToggle={onToggleGroupPicker}
        onClose={onCloseGroupPicker}
        onSelect={(groupId) => onPatch({ groupId })}
      />

      {/* Member Color Field (Matching Figma node 371:6798) */}
      <Pressable accessibilityRole="button" onPress={onPickColor} style={[styles.colorPillField, { borderColor: theme.surface.borderColor }]}>
        <Icon name="palette" size={18} color={theme.color.accent} strokeWidth={1} />
        <AppText size="body" style={styles.pillText} color={selectedColor ? BLACK_SCALE.B900 : BLACK_SCALE.B100}>
          {selectedColor ? selectedColor.name : 'Member Color'}
        </AppText>
        {/* Color Swatch Circle (Matching Figma node 371:6801 Ellipse 1) */}
        <View style={[styles.colorSwatchCircle, { backgroundColor: colorHex }]} />
      </Pressable>

      {/* Status Array Pills (Matching Figma node 371:6802) */}
      <View style={styles.statusArrayRow}>
        {/* Active Pill */}
        <Pressable
          accessibilityRole="button"
          onPress={() => onPatch({ status: 'active' })}
          style={[
            styles.statusPil,
            draft.status === 'active'
              ? { backgroundColor: GREEN_SCALE.G200, borderColor: BLACK_SCALE.B900 }
              : { backgroundColor: 'rgba(77, 182, 101, 0.25)', borderColor: 'rgba(0, 0, 0, 0.3)' },
          ]}
        >
          <AppText
            size="body"
            weight="regular"
            color={draft.status === 'active' ? BLACK_SCALE.B900 : 'rgba(0, 0, 0, 0.5)'}
          >
            Active
          </AppText>
        </Pressable>

        {/* Hiatus Pill */}
        <Pressable
          accessibilityRole="button"
          onPress={() => onPatch({
            status: 'hiatus',
            ...(draft.status === 'hiatus' ? {} : { hiatusStartDate: '', hiatusEndDate: '' }),
          })}
          style={[
            styles.statusPil,
            draft.status === 'hiatus'
              ? { backgroundColor: YELLOW_SCALE.Y200, borderColor: BLACK_SCALE.B900 }
              : { backgroundColor: 'rgba(255, 204, 49, 0.5)', borderColor: 'rgba(0, 0, 0, 0.5)' },
          ]}
        >
          <AppText
            size="body"
            weight="regular"
            color={draft.status === 'hiatus' ? BLACK_SCALE.B900 : 'rgba(0, 0, 0, 0.5)'}
          >
            Hiatus
          </AppText>
        </Pressable>

        {/* Grad Pill */}
        <Pressable
          accessibilityRole="button"
          onPress={() => onPatch({ status: 'grad' })}
          style={[
            styles.statusPil,
            draft.status === 'grad'
              ? { backgroundColor: BLACK_SCALE.B50, borderColor: BLACK_SCALE.B900 }
              : { backgroundColor: 'rgba(191, 191, 191, 0.5)', borderColor: 'rgba(0, 0, 0, 0.5)' },
          ]}
        >
          <AppText
            size="body"
            weight="regular"
            color={draft.status === 'grad' ? BLACK_SCALE.B900 : 'rgba(0, 0, 0, 0.5)'}
          >
            Grad
          </AppText>
        </Pressable>
      </View>

      {/* Status-dependent Date Fields (Matching Figma node 394:5221) */}
      {draft.status === 'active' ? (
        <View style={{ width: '100%' }}>
          <DateField label="Debut date" placeholder="Pick debut date" value={draft.startDate} onChange={(text) => onPatch({ startDate: text })} />
        </View>
      ) : null}

      {draft.status === 'hiatus' ? (
        <>
          <View style={{ width: '100%' }}>
            <DateField label="Debut date" placeholder="Pick debut date" value={draft.startDate} onChange={(text) => onPatch({ startDate: text })} />
          </View>
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <DateField label="Hiatus start" placeholder="Pick hiatus start" value={draft.hiatusStartDate} onChange={(text) => onPatch({ hiatusStartDate: text })} allowClear />
            </View>
            <View style={{ flex: 1 }}>
              <DateField label="Hiatus end" placeholder="Pick hiatus end" value={draft.hiatusEndDate} onChange={(text) => onPatch({ hiatusEndDate: text })} allowClear />
            </View>
          </View>
        </>
      ) : null}

      {draft.status === 'grad' ? (
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <DateField label="Debut date" placeholder="Pick debut date" value={draft.startDate} onChange={(text) => onPatch({ startDate: text })} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField
              label="Grad date *"
              placeholder="Pick grad date"
              value={draft.endDate}
              onChange={(text) => onPatch({ endDate: text })}
              allowClear
              error={gradDisabled ? 'Required for Grad' : null}
            />
          </View>
        </View>
      ) : null}

      {showMembershipHeader ? (
        <AppText size="xs" muted style={{ marginTop: 4 }}>
          {draft.isMain ? '★ Main — this name is used when the idol is in multiple groups at once.' : 'Tap the star to make this the Main group.'}
        </AppText>
      ) : null}
    </View>
  );
}

function MemberColorModal({
  colors,
  selectedId,
  usedIds,
  onSelect,
  onClose,
  onColorCreated,
}: {
  colors: MemberColor[];
  selectedId: string;
  usedIds: string[];
  onSelect: (id: string) => void;
  onClose: () => void;
  onColorCreated: () => void;
}) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [hex, setHex] = useState('');
  const [adding, setAdding] = useState(false);

  const addColor = () => {
    const trimmed = name.trim();
    if (!trimmed || !/^#[0-9A-Fa-f]{6}$/.test(hex.trim())) return;
    const repo = createIdolRepo(getDb());
    const color = repo.createMemberColor({ name: trimmed, hex: hex.trim().toUpperCase() });
    setName('');
    setHex('');
    setAdding(false);
    onColorCreated();
    onSelect(color.id);
  };

  return (
    <Modal visible onClose={onClose} title="Member Color">
      <View style={styles.chips}>
        {colors.map((color) => {
          const used = usedIds.includes(color.id);
          return (
            <Pressable
              key={color.id}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedId === color.id }}
              onPress={() => onSelect(color.id)}
              style={[styles.colorRow, { borderColor: selectedId === color.id ? theme.color.accent : theme.surface.borderColor, backgroundColor: selectedId === color.id ? theme.color.accentSurface : theme.color.surface }]}
            >
              <View style={[styles.colorSwatchCircle, { backgroundColor: color.hex, width: 16, height: 16 }]} />
              <AppText size="small" weight="regular">{color.name}</AppText>
              {used ? <AppText size="xs" muted>· in use</AppText> : null}
            </Pressable>
          );
        })}
        {colors.length === 0 ? <AppText size="small" muted>No colors yet. Add one below.</AppText> : null}
      </View>

      {adding ? (
        <View style={{ marginTop: theme.spacing.sm }}>
          <Field label="Color name" value={name} onChangeText={setName} placeholder="e.g. Mint" />
          <Field label="Hex (e.g. #98FB98)" value={hex} onChangeText={setHex} placeholder="#98FB98" autoCapitalize="characters" style={{ marginTop: theme.spacing.sm }} />
          <Button label="Save Color" style={{ marginTop: theme.spacing.sm }} disabled={!name.trim() || !/^#[0-9A-Fa-f]{6}$/.test(hex.trim())} onPress={addColor} />
        </View>
      ) : (
        <Pressable onPress={() => setAdding(true)} style={{ marginTop: theme.spacing.sm }}>
          <AppText weight="bold" size="small" color={theme.color.accent}>+ Add new color</AppText>
        </Pressable>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  // ── Layout & Drag Handle ───────────────────────────────────────────
  scrollContent: {
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    backgroundColor: DEFAULT_PRIMARY_SCALE.P50,
  },

  // ── Photo picker ───────────────────────────────────────────────────
  photoCenterRow: {
    alignItems: 'center',
  },
  photoCard: {
    width: 250,
    height: 188,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: DEFAULT_PRIMARY_SCALE.P300,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoCardImage: {
    width: '100%',
    height: '100%',
  },
  photoCropButton: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPickerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  photoPickerText: {
    color: DEFAULT_PRIMARY_SCALE.P300,
    fontSize: 12,
    fontFamily: 'Nunito-Regular',
    textAlign: 'center',
  },

  // ── Section Card ────────────────────────────────────────────────────
  sectionCard: {
    padding: 16,
    gap: 8,
  },
  dividerLine: {
    height: 1,
    backgroundColor: BLACK_SCALE.B60,
    marginVertical: 4,
  },
  membershipDivider: {
    height: 1,
    backgroundColor: BLACK_SCALE.B60,
    marginVertical: 12,
  },

  pillText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Nunito-Light',
    color: BLACK_SCALE.B900,
  },

  // ── Group Header & Secondary Button ───────────────────────────────
  groupHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  secondaryAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: DEFAULT_PRIMARY_SCALE.P50,
    borderWidth: 1,
    borderColor: DEFAULT_PRIMARY_SCALE.P300,
    borderRadius: 8,
    paddingLeft: 5,
    paddingRight: 8,
    paddingVertical: 4,
  },
  secondaryAddButtonText: {
    color: DEFAULT_PRIMARY_SCALE.P300,
    fontSize: 12,
    fontFamily: 'Nunito-Light',
  },

  // ── Member Color Pill ─────────────────────────────────────────────
  colorPillField: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BLACK_SCALE.B900,
    backgroundColor: '#FFFFFF',
    paddingLeft: 8,
    paddingRight: 16,
    gap: 8,
  },
  colorSwatchCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BLACK_SCALE.B900,
  },

  // ── Status Array Row ──────────────────────────────────────────────
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

  // ── Membership Card Container ─────────────────────────────────────
  membershipCardContainer: {
    gap: 8,
    marginTop: 4,
  },
  membershipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  membershipHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  // ── Cheki Type Form ───────────────────────────────────────────────
  chekiTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: BLACK_SCALE.B60,
  },
  chekiColTypeHeader: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Nunito-Regular',
    color: BLACK_SCALE.B900,
  },
  chekiColCurrencyHeader: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Nunito-Regular',
    color: BLACK_SCALE.B900,
    textAlign: 'center',
  },
  chekiColPriceHeader: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Nunito-Regular',
    color: BLACK_SCALE.B900,
    textAlign: 'right',
    paddingRight: 8,
  },
  chekiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
  },
  chekiTypeInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Nunito-Light',
    color: BLACK_SCALE.B900,
    height: 26,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  currencyDropdown: {
    flex: 1,
  },
  priceInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Nunito-Light',
    color: BLACK_SCALE.B900,
    textAlign: 'right',
    paddingRight: 8,
    height: 26,
    paddingVertical: 0,
  },
  addChekiEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  currencyOptionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  currencyOptionLabel: {
    flex: 1,
    textAlign: 'center',
  },

  // ── Buttons & Chips ───────────────────────────────────────────────
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },

  dangerSection: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
  },
  dangerDescription: {
    marginTop: 4,
    marginBottom: 12,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// IdolFormBottomSheet
// Wraps IdolForm inside the BottomSheet UI matching node 9:5450 in Figma.
// ─────────────────────────────────────────────────────────────────────────────

export interface IdolFormBottomSheetProps extends IdolFormProps {
  visible: boolean;
  onClose: () => void;
}

export function IdolFormBottomSheet({ visible, onClose, submitLabel = 'Save Idol', ...formProps }: IdolFormBottomSheetProps) {
  const [submitRequest, setSubmitRequest] = useState(0);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      maxHeightRatio={0.92}
      footer={(
        <Button
          label={submitLabel}
          onPress={() => setSubmitRequest((current) => current + 1)}
          style={{ height: 40, borderRadius: 16 }}
        />
      )}
    >
      <IdolForm
        {...formProps}
        submitLabel={submitLabel}
        showSubmitButton={false}
        submitRequest={submitRequest}
        onSaved={(idolId) => { formProps.onSaved?.(idolId); onClose(); }}
      />
    </BottomSheet>
  );
}
