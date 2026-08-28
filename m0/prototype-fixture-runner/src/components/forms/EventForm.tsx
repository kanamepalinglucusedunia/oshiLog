import { ImageCropEditor, type CropPhoto } from '@/components/album/ImageCropEditor';
import { CountryRegionFields } from '@/components/forms/CountryRegionFields';
import { EventDatePicker } from '@/components/forms/EventDatePicker';
import { EventIdolPicker } from '@/components/forms/EventIdolPicker';
import { EventTripCard } from '@/components/forms/EventTripCard';
import { EventVenuePicker } from '@/components/forms/EventVenuePicker';
import { IdolForm } from '@/components/forms/IdolForm';
import { VenueFormBottomSheet, createOrUpdateVenue } from '@/components/forms/VenueForm';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Header } from '@/components/ui/Header';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { getDb } from '@/db';
import { RED_SCALE } from '@/design-system/colors';
import { TYPOGRAPHY } from '@/design-system/typography';
import { CARD_STACK_GAP } from '@/design-system/theme';
import { useTheme } from '@/hooks/useTheme';
import { createEventRepo } from '@/repositories/event';
import { createIdolRepo } from '@/repositories/idol';
import { createTripRepo } from '@/repositories/trip';
import { createVenueRepo } from '@/repositories/venue';
import { resolveIdolPhotoUris } from '@/services/dashboard';
import { EventValidationError, validateEventInput } from '@/services/event';
import { getEventDrinkState, getTripsForEventDate } from '@/services/eventForm';
import { albumMediaAspectRatio } from '@/services/idolDetail';
import { detectInstaxFromUri } from '@/services/instaxDetect';
import { enhanceInstaxUri, type EnhanceIntensity } from '@/services/instaxEnhance';
import { cropImageUri, importImageFromUri, type CropTransform } from '@/services/media';
import { buildMembershipPickerOptions, type MembershipPickerOption } from '@/services/membership';
import { useSettingsStore } from '@/stores/settingsStore';
import { readDataAtVersion, useUiStore } from '@/stores/uiStore';
import { COUNTRIES, type ChekiType, type CountryCode, type CurrencyCode, type Event, type MediaAsset, type StoredInstaxPreset, type Venue } from '@/types/domain';
import { todayISO } from '@/utils/date';
import { formatMinorUnits, formatMoneyCompact, formatMoneyInput, parseMinorUnits } from '@/utils/money';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Keyboard, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

interface ChekiTypeItemDraft {
  key: string;
  entryId: string | null;
  chekiTypeId: string | null;
  chekiTypeLabel: string | null;
  quantity: string;
  currency: CurrencyCode | null;
  unitPrice: number | null;
}

interface EntryDraft {
  key: string;
  optionKey: string | null;
  idolId: string | null;
  membershipId: string | null;
  types: ChekiTypeItemDraft[];
  photos: string[];
}

/** A picked cheki photo awaiting the batch crop screen before import. */
interface PendingChekiPhoto {
  key: number;
  /** Source image used by the crop editor. */
  uri: string;
  width: number;
  height: number;
  entryKey: string;
  /** Preview URI committed with Apply while the crop editor stays open. */
  previewUri?: string;
  /** Existing asset to replace when a saved photo is re-cropped. */
  replaceAssetId?: string;
}

const CHEKI_PHOTO_HEIGHT = 100;

function chekiPhotoWidth(asset: Pick<MediaAsset, 'width' | 'height' | 'instaxPreset'> | undefined): number {
  const aspectRatio = albumMediaAspectRatio({
    source: 'cheki',
    width: asset?.width ?? null,
    height: asset?.height ?? null,
    instaxPreset: asset?.instaxPreset ?? 'mini',
  });
  return Math.max(1, Math.round(CHEKI_PHOTO_HEIGHT * aspectRatio));
}

let entryCounter = 0;
const newEntryKey = () => `entry-${++entryCounter}-${Date.now()}`;
let typeCounter = 0;
const newTypeKey = () => `type-${++typeCounter}-${Date.now()}`;

function buildInitialEntries(initial: Event): EntryDraft[] {
  const repo = createEventRepo(getDb());
  const photosByEntry = repo.listEntryPhotoIdsByEvent(initial.id);
  const dbEntries = repo.listEntries(initial.id);
  const grouped = new Map<string, EntryDraft>();

  for (const entry of dbEntries) {
    const groupKey = `${entry.idolId}__${entry.groupMembershipId ?? 'solo'}`;
    const existing = grouped.get(groupKey);
    const typeItem: ChekiTypeItemDraft = {
      key: `type-${entry.id}`,
      entryId: entry.id,
      chekiTypeId: entry.chekiTypeId,
      chekiTypeLabel: entry.chekiTypeLabel,
      quantity: String(entry.quantity),
      currency: entry.currency,
      unitPrice: entry.unitPrice,
    };
    const photos = photosByEntry.get(entry.id) ?? [];

    if (existing) {
      existing.types.push(typeItem);
      if (photos.length > 0) {
        existing.photos.push(...photos);
      }
    } else {
      grouped.set(groupKey, {
        key: `entry-${entry.id}`,
        optionKey: entry.groupMembershipId ? `m-${entry.groupMembershipId}` : `solo-${entry.idolId}`,
        idolId: entry.idolId,
        membershipId: entry.groupMembershipId,
        types: [typeItem],
        photos: [...photos],
      });
    }
  }

  return Array.from(grouped.values());
}

export interface EventFormProps {
  initial?: Event | null;
  submitLabel?: string;
  onCancel?: () => void;
  onSaved?: (eventId: string) => void;
  onDelete?: () => void;
}

export function EventForm({ initial = null, submitLabel = 'Save Event', onCancel, onSaved, onDelete }: EventFormProps) {
  const theme = useTheme();
  const countries = useSettingsStore((s) => s.countries);
  const dataVersion = useUiStore((s) => s.dataVersion);
  const activeCountries = useMemo(() => countries.filter((c) => c.isActive).map((c) => c.country), [countries]);

  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.eventDate ?? todayISO());
  const initialVenue = useMemo(
    () => (initial?.venueId ? createVenueRepo(getDb()).getVenue(initial.venueId) : null),
    [initial],
  );
  const [country, setCountry] = useState<CountryCode | null>(initial?.country ?? null);
  const [region, setRegion] = useState(initialVenue?.region ?? '');
  const [venueId, setVenueId] = useState<string | null>(initial?.venueId ?? null);
  const [tripId, setTripId] = useState<string | null>(initial?.tripId ?? null);
  const [ticket, setTicket] = useState(initial?.ticketAmount != null && initial.ticketCurrency ? formatMinorUnits(initial.ticketAmount, initial.ticketCurrency) : '');
  const initialDefaultCurrency: CurrencyCode = COUNTRIES.find((item) => item.code === (initial?.country ?? activeCountries[0] ?? 'JP'))?.currency ?? 'JPY';
  const [ticketCurrency, setTicketCurrency] = useState<CurrencyCode>(initial?.ticketCurrency ?? initialDefaultCurrency);
  const [entries, setEntries] = useState<EntryDraft[]>(initial ? buildInitialEntries(initial) : []);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const defaultCurrency: CurrencyCode = COUNTRIES.find((c) => c.code === (country ?? activeCountries[0] ?? 'JP'))?.currency ?? 'JPY';

  const initialDrink = useMemo(() => {
    if (!initial || initial.drinkAmount == null || !initial.drinkCurrency || !initial.venueId) {
      return { drinkPriceId: null as string | null, drinkCustom: '' };
    }
    const venue = createVenueRepo(getDb()).getVenue(initial.venueId);
    if (!venue) return { drinkPriceId: null as string | null, drinkCustom: '' };
    const matching = createVenueRepo(getDb()).listDrinkPrices(venue.id, false)
      .find((p) => p.price === initial.drinkAmount && p.currency === initial.drinkCurrency);
    return matching
      ? { drinkPriceId: matching.id, drinkCustom: '' }
      : { drinkPriceId: null as string | null, drinkCustom: formatMinorUnits(initial.drinkAmount, initial.drinkCurrency) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [drinkPriceId, setDrinkPriceId] = useState<string | null>(initialDrink.drinkPriceId);
  const [drinkCustom, setDrinkCustom] = useState(initialDrink.drinkCustom);
  const [drinkCurrency, setDrinkCurrency] = useState<CurrencyCode>(initial?.drinkCurrency ?? initialDefaultCurrency);

  // modals
  const [venueModal, setVenueModal] = useState(false);
  const [venueFormVisible, setVenueFormVisible] = useState(false);
  const [tripModal, setTripModal] = useState(false);
  const [drinkModal, setDrinkModal] = useState(false);
  const [idolModalFor, setIdolModalFor] = useState<number | null>(null);
  const [newIdolFor, setNewIdolFor] = useState<number | null>(null);
  const [openTypeDropdown, setOpenTypeDropdown] = useState<{ entryIndex: number; typeIndex: number } | null>(null);
  const [quickTypeFor, setQuickTypeFor] = useState<{ entryIndex: number; typeIndex: number } | null>(null);

  const importedAssets = useRef<Set<string>>(new Set());

  // Batch crop screen state for picked cheki photos (like the album's
  // AddMediaModal: multiple photos, full editor, then import on Done).
  const [pendingChekiPhotos, setPendingChekiPhotos] = useState<PendingChekiPhoto[]>([]);
  const [chekiCropOpen, setChekiCropOpen] = useState(false);
  const [chekiCropSession, setChekiCropSession] = useState(0);
  const nextPhotoKey = useRef(1);

  useEffect(() => () => {
    importedAssets.current.clear();
  }, []);

  const idols = useMemo(() => readDataAtVersion(dataVersion, () => createIdolRepo(getDb()).listIdols(true)), [dataVersion]);
  const venues = useMemo(() => readDataAtVersion(dataVersion, () => createVenueRepo(getDb()).listVenues()), [dataVersion]);
  const trips = useMemo(() => readDataAtVersion(dataVersion, () => createTripRepo(getDb()).listTrips()), [dataVersion]);
  const idolNames = useMemo(() => new Map(idols.map((idol) => [idol.id, idol.name])), [idols]);
  const idolPhotoMediaIds = useMemo(() => new Map(idols.map((idol) => [idol.id, idol.photoMediaId])), [idols]);
  const idolPhotoUris = useMemo(
    () => resolveIdolPhotoUris(getDb(), Array.from(idolPhotoMediaIds.values())),
    [idolPhotoMediaIds],
  );
  const idolPhotoUriByIdolId = useMemo(() => {
    const map = new Map<string, string>();
    for (const [idolId, mediaId] of idolPhotoMediaIds) {
      if (!mediaId) continue;
      const uri = idolPhotoUris.get(mediaId);
      if (uri) map.set(idolId, uri);
    }
    return map;
  }, [idolPhotoMediaIds, idolPhotoUris]);
  const photoAssets = useMemo(() => {
    return readDataAtVersion(dataVersion, () => {
      const allAssetIds = new Set<string>();
      for (const e of entries) {
        for (const id of e.photos) allAssetIds.add(id);
      }
      const map = new Map<string, MediaAsset>();
      const repo = createEventRepo(getDb());
      for (const id of allAssetIds) {
        const asset = repo.getMediaAsset(id);
        if (asset) map.set(id, asset);
      }
      return map;
    });
  }, [dataVersion, entries]);

  const membershipsByGroup = useMemo(() => {
    return readDataAtVersion(dataVersion, () => {
      const repo = createIdolRepo(getDb());
      const map = new Map<string, { id: string; groupId: string; startDate: string; endDate: string | null; name: string | null; groupName?: string }[]>();
      for (const m of repo.listAllMembershipsWithGroupName()) {
        const list = map.get(m.idolId) ?? [];
        list.push({ id: m.id, groupId: m.groupId, startDate: m.startDate, endDate: m.endDate, name: m.name, groupName: m.groupName });
        map.set(m.idolId, list);
      }
      return map;
    });
  }, [dataVersion]);

  const selectedVenue = venues.find((v) => v.id === venueId) ?? null;
  const drinkPrices = useMemo(
    () => (selectedVenue ? createVenueRepo(getDb()).listDrinkPrices(selectedVenue.id, false) : []),
    [selectedVenue],
  );
  const drinkState = useMemo(() => getEventDrinkState(drinkPrices, drinkPriceId), [drinkPrices, drinkPriceId]);
  const selectedDrink = drinkState.selectedDrink;
  const eventTrips = useMemo(() => getTripsForEventDate(trips, date), [trips, date]);
  const effectiveTripId = tripId && eventTrips.some((trip) => trip.id === tripId) ? tripId : null;
  const selectedTrip = trips.find((trip) => trip.id === effectiveTripId) ?? null;

  const pickerOptions = useMemo(() => {
    const out: MembershipPickerOption[] = [];
    for (const idol of idols) {
      const memberships = membershipsByGroup.get(idol.id) ?? [];
      out.push(...buildMembershipPickerOptions({ idolId: idol.id, idolName: idol.name, memberships }, date));
    }
    return out;
  }, [idols, membershipsByGroup, date]);

  const clearVenueSelection = useCallback(() => {
    setVenueId(null);
    setDrinkPriceId(null);
    setDrinkCustom('');
  }, []);

  const handleCountryChange = useCallback((next: CountryCode) => {
    setCountry(next);
    if (ticket.trim() === '') {
      setTicketCurrency(COUNTRIES.find((item) => item.code === next)?.currency ?? 'JPY');
    }
    if (selectedVenue && selectedVenue.country !== next) clearVenueSelection();
  }, [clearVenueSelection, selectedVenue, ticket]);

  const handleRegionChange = useCallback((next: string) => {
    setRegion(next);
    if (next.trim() && selectedVenue && (selectedVenue.region ?? '').toLocaleLowerCase() !== next.trim().toLocaleLowerCase()) {
      clearVenueSelection();
    }
  }, [clearVenueSelection, selectedVenue]);

  const chekiTypes = useMemo(() => {
    return readDataAtVersion(dataVersion, () => {
      const map = new Map<string, ChekiType>();
      for (const t of createIdolRepo(getDb()).listAllChekiTypes()) map.set(t.id, t);
      return map;
    });
  }, [dataVersion]);

  const handleVenueSelected = useCallback((venue: Venue) => {
    Keyboard.dismiss();
    const preservesExistingDrink = initial?.venueId === venue.id && venueId === venue.id;
    setVenueId(venue.id);
    setCountry(venue.country);
    setRegion(venue.region ?? '');
    if (!preservesExistingDrink) {
      const venueDefaultDrink = createVenueRepo(getDb()).listDrinkPrices(venue.id, false).find((price) => price.isDefault);
      setDrinkPriceId(venueDefaultDrink?.id ?? null);
      setDrinkCurrency(venueDefaultDrink?.currency ?? (COUNTRIES.find((item) => item.code === venue.country)?.currency ?? 'JPY'));
      setDrinkCustom('');
    }
    setVenueModal(false);
  }, [initial?.venueId, venueId]);

  const handleTripPress = useCallback(() => {
    Keyboard.dismiss();
    if (effectiveTripId) {
      setTripId(null);
      return;
    }
    if (eventTrips.length === 1) {
      setTripId(eventTrips[0].id);
      return;
    }
    setTripModal(true);
  }, [effectiveTripId, eventTrips]);

  const handleNewIdolSaved = useCallback((idolId?: string) => {
    if (!idolId || newIdolFor === null) return;
    const repo = createIdolRepo(getDb());
    const idol = repo.getIdol(idolId);
    if (!idol) return;
    const defaultChekiType = repo.listChekiTypes(idol.id, false).find((type) => type.isDefault);
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i !== newIdolFor) return e;
        const firstType: ChekiTypeItemDraft = {
          key: e.types[0]?.key ?? newTypeKey(),
          entryId: e.types[0]?.entryId ?? null,
          chekiTypeId: defaultChekiType?.id ?? null,
          chekiTypeLabel: defaultChekiType?.label ?? null,
          quantity: e.types[0]?.quantity ?? '1',
          currency: defaultChekiType?.currency ?? null,
          unitPrice: defaultChekiType?.unitPrice ?? null,
        };
        return {
          ...e,
          optionKey: `solo-${idol.id}`,
          idolId: idol.id,
          membershipId: null,
          types: [firstType],
          photos: [],
        };
      }),
    );
    setNewIdolFor(null);
    setIdolModalFor(null);
  }, [newIdolFor]);

  const addEntry = useCallback(() => {
    setEntries((prev) => [
      ...prev,
      {
        key: newEntryKey(),
        optionKey: null,
        idolId: null,
        membershipId: null,
        types: [
          {
            key: newTypeKey(),
            entryId: null,
            chekiTypeId: null,
            chekiTypeLabel: null,
            quantity: '1',
            currency: null,
            unitPrice: null,
          },
        ],
        photos: [],
      },
    ]);
  }, []);

  const removeEntry = useCallback((index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addTypeOption = useCallback((entryIndex: number) => {
    setEntries((prev) => {
      const entry = prev[entryIndex];
      if (!entry?.idolId) return prev;
      const repo = createIdolRepo(getDb());
      const idolTypes = repo.listChekiTypes(entry.idolId, false);
      const usedTypeIds = new Set(entry.types.map((t) => t.chekiTypeId).filter(Boolean));
      const nextType = idolTypes.find((t) => !usedTypeIds.has(t.id)) ?? idolTypes.find((t) => t.isDefault) ?? idolTypes[0];

      const newTypeItem: ChekiTypeItemDraft = {
        key: newTypeKey(),
        entryId: null,
        chekiTypeId: nextType?.id ?? null,
        chekiTypeLabel: nextType?.label ?? null,
        quantity: '1',
        currency: nextType?.currency ?? null,
        unitPrice: nextType?.unitPrice ?? null,
      };

      return prev.map((e, i) => (i === entryIndex ? { ...e, types: [...e.types, newTypeItem] } : e));
    });
  }, []);

  const removeTypeOption = useCallback((entryIndex: number, typeIndex: number) => {
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i !== entryIndex) return e;
        if (e.types.length <= 1) return e;
        return { ...e, types: e.types.filter((_, ti) => ti !== typeIndex) };
      }),
    );
  }, []);

  const updateTypeOption = useCallback(
    (entryIndex: number, typeIndex: number, patch: Partial<ChekiTypeItemDraft>) => {
      setEntries((prev) =>
        prev.map((e, i) => {
          if (i !== entryIndex) return e;
          const nextTypes = e.types.map((t, ti) => (ti === typeIndex ? { ...t, ...patch } : t));
          return { ...e, types: nextTypes };
        }),
      );
    },
    [],
  );

  const cleanupPendingAssets = () => {
    const repo = createEventRepo(getDb());
    for (const assetId of importedAssets.current) {
      repo.detachMedia(assetId);
    }
    importedAssets.current.clear();
  };

  const pickPhotos = useCallback(async (entryKey: string, max: number, currentPhotoCount: number) => {
    const remaining = Math.max(0, max - currentPhotoCount);
    if (remaining === 0) {
      Alert.alert('Photo limit', `Maximum ${max} photo(s) for quantity ${max}.`);
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo library access is required to add cheki photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: remaining > 1,
      quality: 1,
      exif: false,
    });
    if (result.canceled) return;
    const incoming = result.assets.slice(0, remaining).map((asset) => ({
      key: nextPhotoKey.current++,
      uri: asset.uri,
      width: asset.width || 1,
      height: asset.height || 1,
      entryKey,
    }));
    if (incoming.length === 0) return;
    // The full batch crop editor opens before anything is imported. Remounting
    // per session keeps the editor fresh and guarantees photos are non-empty.
    setChekiCropSession((current) => current + 1);
    setPendingChekiPhotos(incoming);
    setChekiCropOpen(true);
  }, []);

  const openPhotoCrop = useCallback((entryKey: string, assetId: string) => {
    const asset = photoAssets.get(assetId);
    const sourceUri = asset?.localPath ?? asset?.thumbnailPath;
    if (!asset || !sourceUri) {
      Alert.alert('Photo unavailable', 'This cheki photo cannot be opened for editing.');
      return;
    }

    setChekiCropSession((current) => current + 1);
    setPendingChekiPhotos([{
      key: nextPhotoKey.current++,
      uri: sourceUri,
      width: asset.width ?? 1,
      height: asset.height ?? 1,
      entryKey,
      replaceAssetId: assetId,
    }]);
    setChekiCropOpen(true);
  }, [photoAssets]);

  /** Applies the batch crops (+ optional enhance), imports every cheki photo. */
  const applyPendingCrops = useCallback(
    async (
      crops: Record<number, CropTransform> = {},
      enhances: Record<number, EnhanceIntensity> = {},
      instaxPresets?: Record<number, StoredInstaxPreset>,
    ) => {
      const photosToImport = [...pendingChekiPhotos];
      setChekiCropOpen(false);
      setPendingChekiPhotos([]);

      if (photosToImport.length === 0) return;

      const attachImportedPhoto = (photo: PendingChekiPhoto, assetId: string) => {
        setEntries((prev) => prev.map((entry) => {
          if (entry.key !== photo.entryKey) return entry;

          const nextPhotos = photo.replaceAssetId
            ? entry.photos.map((id) => (id === photo.replaceAssetId ? assetId : id))
            : [...entry.photos, assetId];
          return { ...entry, photos: [...new Set(nextPhotos)] };
        }));
      };

      for (const photo of photosToImport) {
        const crop = crops?.[photo.key];
        const enhance = enhances?.[photo.key] ?? 0;
        const instaxPreset = instaxPresets?.[photo.key] ?? 'mini';
        const hasCommittedPreview = !crop && !!photo.previewUri;
        let importUri = hasCommittedPreview ? photo.previewUri! : photo.uri;
        let importTransform: CropTransform | undefined = hasCommittedPreview ? undefined : crop;
        let attachedByImportCallback = false;

        // Standard crop/rotate/flip transforms are applied during import so
        // the persisted asset is encoded once and keeps the rotated dimensions.
        // Perspective and enhance still need an intermediate URI first.
        if (enhance !== 0 || crop?.perspective) {
          try {
            if (crop) importUri = await cropImageUri(photo.uri, crop);
            importTransform = undefined;
          } catch {
            importUri = photo.uri;
            importTransform = undefined;
          }

          if (enhance !== 0) {
            try {
              importUri = await enhanceInstaxUri(importUri, enhance);
            } catch {
              // keep importUri on enhance error
            }
          }
        }

        try {
          const asset = await importImageFromUri(getDb(), importUri, 'cheki', {
            instaxPreset,
            transform: importTransform,
            onImported: (assetId, result) => {
              attachedByImportCallback = true;
              if (!result.deduplicated) importedAssets.current.add(assetId);
              attachImportedPhoto(photo, assetId);
            },
          });
          // Keep mocked/custom importers and deduplicated imports consistent
          // with the early callback path above.
          if (!attachedByImportCallback) {
            if (!asset.deduplicated) importedAssets.current.add(asset.assetId);
            attachImportedPhoto(photo, asset.assetId);
          }
        } catch (error) {
          Alert.alert('Import error', error instanceof Error ? error.message : 'Failed to import cheki photo.');
        }
      }
    },
    [pendingChekiPhotos],
  );

  const updatePendingCropPreview = useCallback(
    (key: number, preview: CropPhoto, transform: CropTransform) => {
      void transform;
      setPendingChekiPhotos((current) => current.map((photo) => (
        photo.key === key ? { ...photo, previewUri: preview.uri } : photo
      )));
    },
    [],
  );

  const removePhoto = useCallback((entryIndex: number, assetId: string) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === entryIndex ? { ...e, photos: e.photos.filter((id) => id !== assetId) } : e)),
    );
    if (importedAssets.current.delete(assetId)) {
      createEventRepo(getDb()).detachMedia(assetId);
    }
  }, []);

  const cancel = () => {
    cleanupPendingAssets();
    onCancel?.();
  };

  const save = () => {
    Keyboard.dismiss();
    const savedCountry: CountryCode = country ?? activeCountries[0] ?? 'JP';

    const ticketMinor = parseMinorUnits(ticket, ticketCurrency);
    if (ticket.trim() !== '' && ticketMinor === null) {
      setFormError('Invalid ticket amount.');
      return;
    }
    let drinkMinor: number | null = null;
    let savedDrinkCurrency: CurrencyCode | null = null;
    if (selectedDrink) {
      drinkMinor = selectedDrink.price;
      savedDrinkCurrency = selectedDrink.currency;
    } else if (drinkState.visible && drinkCustom.trim() !== '') {
      drinkMinor = parseMinorUnits(drinkCustom, drinkCurrency);
      if (drinkMinor === null) {
        setFormError('Invalid drink amount.');
        return;
      }
      savedDrinkCurrency = drinkCurrency;
    }

    const builtEntries: {
      id?: string;
      idolId: string;
      groupMembershipId: string | null;
      chekiTypeId: string;
      quantity: number;
      currency: CurrencyCode;
      unitPrice: number;
      photos: { mediaAssetId: string }[];
    }[] = [];

    for (const card of entries) {
      if (!card.idolId) continue;
      card.types.forEach((typeItem, typeIndex) => {
        const qty = Number.parseInt(typeItem.quantity, 10);
        const validQty = Number.isInteger(qty) && qty > 0 ? qty : 0;
        const itemPhotos = typeIndex === 0 ? card.photos.map((assetId) => ({ mediaAssetId: assetId })) : [];

        builtEntries.push({
          id: typeItem.entryId ?? undefined,
          idolId: card.idolId!,
          groupMembershipId: card.membershipId,
          chekiTypeId: typeItem.chekiTypeId ?? '',
          quantity: validQty,
          currency: typeItem.currency ?? defaultCurrency,
          unitPrice: typeItem.unitPrice ?? 0,
          photos: itemPhotos,
        });
      });
    }

    try {
      validateEventInput(getDb(), {
        title: title.trim(),
        eventDate: date,
        country: savedCountry,
        venueId,
        tripId: effectiveTripId,
        ticketCurrency: ticketMinor !== null ? ticketCurrency : null,
        ticketAmount: ticketMinor,
        drinkCurrency: savedDrinkCurrency,
        drinkAmount: drinkMinor,
        notes: null,
        entries: builtEntries.map((e) => ({
          idolId: e.idolId,
          groupMembershipId: e.groupMembershipId,
          chekiTypeId: e.chekiTypeId,
          quantity: e.quantity,
          currency: e.currency,
          unitPrice: e.unitPrice,
          photoCount: e.photos.length,
        })),
      });
    } catch (err) {
      if (err instanceof EventValidationError) {
        setFormError(err.issues[0]?.message ?? 'Validation failed.');
        return;
      }
      setFormError(err instanceof Error ? err.message : 'Validation failed.');
      return;
    }
    setFormError(null);
    setSaving(true);

    try {
      const repo = createEventRepo(getDb());
      const payload = {
        title: title.trim(),
        eventDate: date,
        country: savedCountry,
        venueId,
        tripId: effectiveTripId,
        ticketCurrency: ticketMinor !== null ? ticketCurrency : null,
        ticketAmount: ticketMinor,
        drinkCurrency: savedDrinkCurrency,
        drinkAmount: drinkMinor,
        notes: null,
        entries: builtEntries,
      };
      const saved = initial ? repo.updateEvent(initial.id, payload) : repo.createEvent(payload);
      importedAssets.current.clear();
      onSaved?.(saved.id);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save the event.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header
        title={initial ? 'Edit Event' : 'New Event'}
        onBack={cancel}
      />
      <FlatList
        testID="event-form-list"
        style={styles.formList}
        data={entries}
        keyExtractor={(entry) => entry.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        scrollsChildToFocus
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 }}
        renderItem={({ item: entry, index }) => (
          <EntryEditor
            index={index}
            entry={entry}
            currency={entry.types[0]?.currency ?? defaultCurrency}
            pickerOptions={pickerOptions}
            chekiTypes={chekiTypes}
            idolNames={idolNames}
            idolPhotoMediaIds={idolPhotoMediaIds}
            idolPhotoUris={idolPhotoUris}
            photoAssets={photoAssets}
            onRemove={removeEntry}
            onPickPhotos={pickPhotos}
            onReopenPhoto={openPhotoCrop}
            onRemovePhoto={removePhoto}
            onOpenIdolPicker={setIdolModalFor}
            openTypeDropdown={openTypeDropdown}
            onToggleTypeDropdown={(entryIndex, typeIndex) => {
              setOpenTypeDropdown((current) =>
                current?.entryIndex === entryIndex && current?.typeIndex === typeIndex
                  ? null
                  : { entryIndex, typeIndex },
              );
            }}
            onCloseTypeDropdown={() => setOpenTypeDropdown(null)}
            onQuickCreateType={(entryIndex, typeIndex) => {
              setOpenTypeDropdown(null);
              setQuickTypeFor({ entryIndex, typeIndex });
            }}
            onAddTypeOption={addTypeOption}
            onRemoveTypeOption={removeTypeOption}
            onUpdateTypeOption={updateTypeOption}
          />
        )}
        ListHeaderComponent={
          <>
            <EventDatePicker value={date} onChange={setDate} />

            <EventTripCard trip={selectedTrip} onPress={handleTripPress} />

            <Card style={styles.detailsCard}>
              <AppText weight="semibold" size="large">Event Details</AppText>

              <Field
                label="Event Name"
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Idol Cream Soda Vol. 2"
              />

              <Field
                label="Ticket Price"
                icon="ticket"
                value={ticket}
                onChangeText={(value) => setTicket(formatMoneyInput(value, ticketCurrency))}
                placeholder="Price"
                keyboardType="numeric"
              />

              <CountryRegionFields
                layout="row"
                country={country}
                region={region}
                countryLabel="Country"
                regionLabel="Region"
                labelWeight="regular"
                onCountryChange={handleCountryChange}
                onRegionChange={handleRegionChange}
              />

              {drinkState.visible ? (
                <View style={styles.venueDrinkRow}>
                  <View style={styles.venueCol}>
                    <AppText weight="regular" size="small">Venue</AppText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Select venue"
                      onPress={() => { Keyboard.dismiss(); setVenueModal(true); }}
                      style={({ pressed }) => [styles.detailField, detailFieldStyle(theme), pressed && styles.pressed]}
                    >
                      <Icon name="buildingOffice" size={18} color={theme.color.accent} strokeWidth={1} />
                      <AppText size="body" weight="light" style={styles.detailValue} color={selectedVenue ? theme.color.text : theme.color.textMuted} numberOfLines={1}>
                        {selectedVenue?.name ?? 'Venue'}
                      </AppText>
                      <Icon name="chevronDown" width={15} height={8} color={theme.color.text} strokeWidth={1} />
                    </Pressable>
                  </View>

                  <View style={styles.drinkCol}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={drinkState.activeDrinks.length > 1 ? 'Select drink' : undefined}
                      accessibilityState={{ disabled: drinkState.activeDrinks.length <= 1 }}
                      disabled={drinkState.activeDrinks.length <= 1}
                      onPress={() => {
                        Keyboard.dismiss();
                        if (drinkState.activeDrinks.length > 1) setDrinkModal(true);
                      }}
                      style={({ pressed }) => [styles.detailField, detailFieldStyle(theme), pressed && styles.pressed]}
                    >
                      <Icon name="bottle" size={18} color={theme.color.accent} strokeWidth={1} />
                      <AppText size="body" weight="regular" style={styles.detailValue} color={selectedDrink ? theme.color.text : theme.color.textMuted} numberOfLines={1}>
                        {selectedDrink ? formatMoneyCompact(selectedDrink.price, selectedDrink.currency) : (drinkCustom.trim() !== '' ? drinkCustom : 'Drink')}
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.venueFullCol}>
                  <AppText weight="regular" size="small">Venue</AppText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Select venue"
                    onPress={() => { Keyboard.dismiss(); setVenueModal(true); }}
                    style={({ pressed }) => [styles.detailField, detailFieldStyle(theme), pressed && styles.pressed]}
                  >
                    <Icon name="buildingOffice" size={18} color={theme.color.accent} strokeWidth={1} />
                    <AppText size="body" weight="light" style={styles.detailValue} color={selectedVenue ? theme.color.text : theme.color.textMuted} numberOfLines={1}>
                      {selectedVenue?.name ?? 'Venue'}
                    </AppText>
                    <Icon name="chevronDown" width={15} height={8} color={theme.color.text} strokeWidth={1} />
                  </Pressable>
                </View>
              )}
            </Card>

            <Card style={styles.chekiHeader}>
              <View style={styles.chekiHeaderTitle}>
                <Icon name="camera" size={24} color={theme.color.text} strokeWidth={1} />
                <AppText weight="semibold" size="large">Cheki Entries</AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add cheki entry"
                onPress={() => { Keyboard.dismiss(); addEntry(); }}
                style={({ pressed }) => [styles.addEntryButton, { backgroundColor: theme.color.accentSurface, borderColor: theme.color.accent, borderWidth: theme.surface.borderWidth }, pressed && { opacity: 0.7 }]}
              >
                <Icon name="plus" size={14} color={theme.color.accent} strokeWidth={1.5} />
                <AppText size="small" weight="light" color={theme.color.accent}>Add Entry</AppText>
              </Pressable>
            </Card>
          </>
        }
        ListFooterComponent={
          <>
            {formError ? (
              <AppText size="small" color={theme.color.danger} style={{ marginTop: 12, textAlign: 'center' }}>
                {formError}
              </AppText>
            ) : null}
            <Button label={submitLabel} onPress={save} loading={saving} style={{ marginTop: 16 }} />
            {onDelete ? (
              <Button
                label="Delete Event"
                variant="danger"
                onPress={onDelete}
                style={{ marginTop: 12 }}
              />
            ) : null}
          </>
        }
      />

      <EventVenuePicker
        visible={venueModal}
        venues={venues}
        country={country}
        region={region}
        selectedKey={venueId}
        onClose={() => setVenueModal(false)}
        onSelect={handleVenueSelected}
        onNewVenue={() => {
          setVenueModal(false);
          setVenueFormVisible(true);
        }}
      />
      <VenueFormBottomSheet
        visible={venueFormVisible}
        onClose={() => setVenueFormVisible(false)}
        submitLabel="Create & Use"
        onSubmit={(values) => {
          const venue = createOrUpdateVenue(values);
          handleVenueSelected(venue);
        }}
      />

      {/* Trip picker */}
      <Modal visible={tripModal} onClose={() => setTripModal(false)} title="Select Trip">
        {eventTrips.map((trip) => (
          <Pressable
            key={trip.id}
            style={({ pressed }) => [styles.pickerRow, { borderBottomColor: theme.color.borderLight }, pressed && { opacity: 0.6 }]}
            onPress={() => {
              Keyboard.dismiss();
              setTripId(trip.id);
              setTripModal(false);
            }}
          >
            <AppText weight="semibold" size="body" style={{ flex: 1 }}>{trip.title}</AppText>
            <AppText size="xs" muted>{trip.startDate} – {trip.endDate}</AppText>
          </Pressable>
        ))}
        {eventTrips.length === 0 ? <AppText size="small" muted>No trip covers the event date.</AppText> : null}
      </Modal>

      <EventIdolPicker
        visible={idolModalFor !== null}
        options={pickerOptions}
        selectedKey={idolModalFor !== null ? entries[idolModalFor]?.optionKey ?? null : null}
        photoUriByIdolId={idolPhotoUriByIdolId}
        onClose={() => setIdolModalFor(null)}
        onNewIdol={() => {
          setNewIdolFor(idolModalFor);
          setIdolModalFor(null);
        }}
        onSelect={(option) => {
          const defaultChekiType = createIdolRepo(getDb())
            .listChekiTypes(option.idolId, false)
            .find((type) => type.isDefault);
          setEntries((prev) =>
            prev.map((e, i) => {
              if (i !== idolModalFor) return e;
              const firstType: ChekiTypeItemDraft = {
                key: e.types[0]?.key ?? newTypeKey(),
                entryId: e.types[0]?.entryId ?? null,
                chekiTypeId: defaultChekiType?.id ?? null,
                chekiTypeLabel: defaultChekiType?.label ?? null,
                quantity: e.types[0]?.quantity ?? '1',
                currency: defaultChekiType?.currency ?? null,
                unitPrice: defaultChekiType?.unitPrice ?? null,
              };
              return {
                ...e,
                optionKey: option.key,
                idolId: option.idolId,
                membershipId: option.groupMembershipId,
                types: [firstType],
                photos: [],
              };
            }),
          );
          setIdolModalFor(null);
        }}
      />

      <Modal visible={newIdolFor !== null} onClose={() => setNewIdolFor(null)} title="New Idol">
        <IdolForm submitLabel="Create & Use" onSaved={handleNewIdolSaved} />
      </Modal>

      <Modal visible={drinkModal} onClose={() => setDrinkModal(false)} title="Select Drink">
        {drinkState.activeDrinks.map((price) => (
          <Pressable
            key={price.id}
            style={({ pressed }) => [styles.pickerRow, { borderBottomColor: theme.color.borderLight }, pressed && { opacity: 0.6 }]}
            onPress={() => {
              setDrinkPriceId(price.id);
              setDrinkCurrency(price.currency);
              setDrinkCustom('');
              setDrinkModal(false);
            }}
          >
            <AppText size="body" style={{ flex: 1 }}>{price.label ?? 'Drink'}</AppText>
            <AppText size="small" muted>{formatMoneyCompact(price.price, price.currency)}</AppText>
          </Pressable>
        ))}
      </Modal>


      {/* Quick-create cheki type */}
      <QuickTypeModal
        visible={quickTypeFor !== null}
        onClose={() => setQuickTypeFor(null)}
        target={quickTypeFor}
        currency={defaultCurrency}
        entries={entries}
        onSelectType={(entryIndex, typeIndex, type) => {
          updateTypeOption(entryIndex, typeIndex, {
            chekiTypeId: type.id,
            chekiTypeLabel: type.label,
            currency: type.currency,
            unitPrice: type.unitPrice,
          });
        }}
      />

      {/* Full batch crop editor for picked cheki photos (like the album). */}
      <ImageCropEditor
        key={chekiCropSession}
        visible={chekiCropOpen}
        photos={pendingChekiPhotos.map((photo) => ({ key: photo.key, uri: photo.uri, width: photo.width, height: photo.height }))}
        onCancel={() => {
          setChekiCropOpen(false);
          setPendingChekiPhotos([]);
        }}
        onAutoDetect={async (uri, preset) => {
          const detection = await detectInstaxFromUri(uri, preset);
          return detection ? detection.quad : null;
        }}
        onEnhancePreview={(uri, intensity) => enhanceInstaxUri(uri, intensity, { preview: true })}
        onPreviewUpdate={updatePendingCropPreview}
        onDone={(crops, enhances, instaxPresets) => applyPendingCrops(crops, enhances, instaxPresets)}
      />
    </>
  );
}

const EntryEditor = memo(function EntryEditor({
  index,
  entry,
  currency,
  pickerOptions,
  chekiTypes,
  idolNames,
  idolPhotoMediaIds,
  idolPhotoUris,
  photoAssets,
  onRemove,
  onPickPhotos,
  onReopenPhoto,
  onRemovePhoto,
  onOpenIdolPicker,
  openTypeDropdown,
  onToggleTypeDropdown,
  onCloseTypeDropdown,
  onQuickCreateType,
  onAddTypeOption,
  onRemoveTypeOption,
  onUpdateTypeOption,
}: {
  index: number;
  entry: EntryDraft;
  currency: CurrencyCode;
  pickerOptions: MembershipPickerOption[];
  chekiTypes: Map<string, ChekiType>;
  idolNames: Map<string, string>;
  idolPhotoMediaIds: Map<string, string | null>;
  idolPhotoUris: Map<string, string>;
  photoAssets: Map<string, MediaAsset>;
  onRemove: (index: number) => void;
  onPickPhotos: (entryKey: string, max: number, currentPhotoCount: number) => void;
  onReopenPhoto: (entryKey: string, assetId: string) => void;
  onRemovePhoto: (index: number, assetId: string) => void;
  onOpenIdolPicker: (index: number) => void;
  openTypeDropdown: { entryIndex: number; typeIndex: number } | null;
  onToggleTypeDropdown: (entryIndex: number, typeIndex: number) => void;
  onCloseTypeDropdown: () => void;
  onQuickCreateType: (entryIndex: number, typeIndex: number) => void;
  onAddTypeOption: (entryIndex: number) => void;
  onRemoveTypeOption: (entryIndex: number, typeIndex: number) => void;
  onUpdateTypeOption: (entryIndex: number, typeIndex: number, patch: Partial<ChekiTypeItemDraft>) => void;
}) {
  const theme = useTheme();
  const option = pickerOptions.find((o) => o.key === entry.optionKey);
  const selectedIdolId = entry.idolId ?? option?.idolId ?? null;
  const idolName = selectedIdolId ? idolNames.get(selectedIdolId) ?? option?.label ?? 'Selected Idol' : null;
  const idolPhotoMediaId = selectedIdolId ? idolPhotoMediaIds.get(selectedIdolId) : null;
  const idolPhotoUri = idolPhotoMediaId ? idolPhotoUris.get(idolPhotoMediaId) ?? null : null;
  const idolChekiTypes = useMemo(
    () => (selectedIdolId ? createIdolRepo(getDb()).listChekiTypes(selectedIdolId, false) : []),
    [selectedIdolId],
  );
  const totalQuantity = useMemo(
    () => entry.types.reduce((sum, t) => sum + (Math.max(1, Number.parseInt(t.quantity, 10) || 1)), 0),
    [entry.types],
  );
  const inputBorder = {
    borderColor: theme.surface.borderColor,
    borderWidth: theme.surface.borderWidth,
  };

  return (
    <Card style={styles.entryCard}>
      <View style={styles.entryHeader}>
        <AppText weight="semibold" size="large">
          #{index + 1}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove Cheki ${index + 1}`}
          onPress={() => { Keyboard.dismiss(); onRemove(index); }}
          hitSlop={8}
          style={({ pressed }) => [
            styles.removeEntryButton,
            {
              backgroundColor: RED_SCALE.R50,
              borderColor: RED_SCALE.R300,
              borderWidth: theme.surface.borderWidth,
            },
            pressed && styles.pressed,
          ]}
        >
          <Icon name="x" size={14} color={RED_SCALE.R300} strokeWidth={1.5} />
          <AppText size="small" weight="light" color={RED_SCALE.R300}>
            Remove Entry
          </AppText>
        </Pressable>
      </View>
      <View style={[styles.entryDivider, { backgroundColor: theme.color.borderLight }]} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Select idol for Cheki ${index + 1}`}
        onPress={() => { Keyboard.dismiss(); onOpenIdolPicker(index); }}
        style={({ pressed }) => [
          selectedIdolId ? styles.idolCard : styles.idolSelectField,
          inputBorder,
          pressed && styles.pressed,
        ]}
      >
        {selectedIdolId ? (
          <>
            <View
              style={[
                styles.idolPhoto,
                {
                  backgroundColor: theme.color.surfaceMuted,
                  borderColor: theme.surface.borderColor,
                  borderWidth: theme.surface.borderWidth,
                },
              ]}
            >
              {idolPhotoUri ? (
                <Image
                  source={{ uri: idolPhotoUri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : (
                <Icon name="user" size={20} color={theme.color.textMuted} />
              )}
            </View>
            <View style={styles.idolCopy}>
              <AppText size="body" weight="regular" numberOfLines={1}>
                {idolName}
              </AppText>
              <AppText
                size="small"
                weight="light"
                color={theme.color.accent}
                numberOfLines={1}
              >
                {option?.groupName ?? 'Solo'}
              </AppText>
            </View>
            <Icon name="chevronDown" width={15} height={8} color={theme.color.text} strokeWidth={1} />
          </>
        ) : (
          <>
            <Icon name="star" size={18} color={theme.color.textMuted} strokeWidth={1} />
            <AppText
              size="body"
              weight="light"
              style={styles.idolCopy}
              color={theme.color.textMuted}
            >
              Select Idol
            </AppText>
          </>
        )}
      </Pressable>

      {entry.idolId ? (
        <>
          <View style={[styles.chekiTypesContainer, inputBorder]}>
            {entry.types.map((typeItem, typeIndex) => {
              const typeLabel =
                typeItem.chekiTypeLabel ??
                (typeItem.chekiTypeId ? (chekiTypes.get(typeItem.chekiTypeId)?.label ?? null) : null);
              const itemQuantity = Math.max(1, Number.parseInt(typeItem.quantity, 10) || 1);
              const isMultiple = entry.types.length > 1;
              const isLast = typeIndex === entry.types.length - 1;
              const isDropdownOpen =
                openTypeDropdown?.entryIndex === index && openTypeDropdown?.typeIndex === typeIndex;

              return (
                <View key={typeItem.key} style={styles.chekiTypeRowContainer}>
                  <View style={styles.chekiTypeRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Select Cheki type for Cheki ${index + 1}${isMultiple ? ` option ${typeIndex + 1}` : ''}`}
                      accessibilityState={{ expanded: isDropdownOpen }}
                      onPress={() => {
                        Keyboard.dismiss();
                        onToggleTypeDropdown(index, typeIndex);
                      }}
                      style={styles.typePicker}
                    >
                      <AppText
                        size="body"
                        weight="light"
                        style={styles.typePickerLabel}
                        color={typeLabel ? theme.color.text : theme.color.textMuted}
                        numberOfLines={1}
                      >
                        {typeLabel
                          ? `${typeLabel} (${formatMoneyCompact(typeItem.unitPrice ?? 0, typeItem.currency ?? currency)})`
                          : 'Select Cheki Type'}
                      </AppText>
                      <Icon name={isDropdownOpen ? 'chevronUp' : 'chevronDown'} width={15} height={8} color={theme.color.text} strokeWidth={1} />
                    </Pressable>

                    <View style={styles.quantityStepper}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Decrease Cheki quantity ${index + 1}${isMultiple ? ` option ${typeIndex + 1}` : ''}`}
                        accessibilityState={{ disabled: itemQuantity <= 1 }}
                        disabled={itemQuantity <= 1}
                        onPress={() => {
                          Keyboard.dismiss();
                          onUpdateTypeOption(index, typeIndex, { quantity: String(itemQuantity - 1) });
                        }}
                        style={[
                          styles.stepperButton,
                          {
                            borderColor: theme.surface.borderColor,
                            borderWidth: theme.surface.borderWidth,
                            backgroundColor: theme.color.surface,
                            opacity: itemQuantity <= 1 ? 0.45 : 1,
                          },
                        ]}
                      >
                        <Icon name="minus" size={12} color={theme.color.text} strokeWidth={1.5} />
                      </Pressable>
                      <TextInput
                        accessibilityLabel="Cheki Quantity"
                        value={typeItem.quantity}
                        onChangeText={(text) => {
                          onUpdateTypeOption(index, typeIndex, { quantity: text });
                        }}
                        keyboardType="number-pad"
                        style={[
                          TYPOGRAPHY.light.body,
                          styles.quantityInput,
                          { color: theme.color.text },
                        ]}
                        selectTextOnFocus
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Increase Cheki quantity ${index + 1}${isMultiple ? ` option ${typeIndex + 1}` : ''}`}
                        onPress={() => {
                          Keyboard.dismiss();
                          onUpdateTypeOption(index, typeIndex, { quantity: String(itemQuantity + 1) });
                        }}
                        style={[
                          styles.stepperButton,
                          {
                            borderColor: theme.color.accent,
                            borderWidth: theme.surface.borderWidth,
                            backgroundColor: theme.color.accentSurface,
                          },
                        ]}
                      >
                        <Icon name="plus" size={12} color={theme.color.accent} strokeWidth={1.5} />
                      </Pressable>
                    </View>

                    {isMultiple && !isLast ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove Cheki type ${typeIndex + 1} from entry ${index + 1}`}
                        onPress={() => {
                          Keyboard.dismiss();
                          onRemoveTypeOption(index, typeIndex);
                        }}
                        hitSlop={4}
                        style={styles.addTypeButton}
                      >
                        <Icon name="xCircle" size={24} color={RED_SCALE.R300} strokeWidth={1} />
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Add Cheki type option to entry ${index + 1}`}
                        onPress={() => {
                          Keyboard.dismiss();
                          onAddTypeOption(index);
                        }}
                        hitSlop={4}
                        style={styles.addTypeButton}
                      >
                        <Icon name="plusCircle" size={24} color={theme.color.text} strokeWidth={1} />
                      </Pressable>
                    )}
                  </View>

                  {isDropdownOpen ? (
                    <View
                      style={[
                        styles.typeDropdownMenu,
                        {
                          backgroundColor: theme.color.surface,
                          borderColor: theme.color.borderLight,
                          borderWidth: theme.surface.borderWidth,
                        },
                      ]}
                    >
                      {idolChekiTypes.length === 0 ? (
                        <AppText size="small" muted style={{ padding: 8 }}>
                          No cheki types for this idol.
                        </AppText>
                      ) : (
                        idolChekiTypes.map((type) => (
                          <Pressable
                            key={type.id}
                            accessibilityRole="button"
                            accessibilityLabel={type.label}
                            onPress={() => {
                              onUpdateTypeOption(index, typeIndex, {
                                chekiTypeId: type.id,
                                chekiTypeLabel: type.label,
                                currency: type.currency,
                                unitPrice: type.unitPrice,
                              });
                              onCloseTypeDropdown();
                            }}
                            style={({ pressed }) => [
                              styles.dropdownOptionRow,
                              { borderBottomColor: theme.color.borderLight },
                              type.id === typeItem.chekiTypeId && { backgroundColor: theme.color.accentSurface },
                              pressed && styles.pressed,
                            ]}
                          >
                            <AppText weight="light" size="body" style={{ flex: 1 }} color={theme.color.text}>
                              {type.label}
                            </AppText>
                            <AppText size="small" weight="regular" color={theme.color.accent}>
                              {formatMoneyCompact(type.unitPrice, type.currency)}
                            </AppText>
                          </Pressable>
                        ))
                      )}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Create new cheki type"
                        onPress={() => {
                          onCloseTypeDropdown();
                          onQuickCreateType(index, typeIndex);
                        }}
                        style={styles.dropdownCreateBtn}
                      >
                        <AppText weight="bold" size="small" color={theme.color.accent}>
                          + Create new cheki type
                        </AppText>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          <View style={[styles.entryDivider, { backgroundColor: theme.color.borderLight }]} />
          {entry.photos.length === 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add photos for Cheki ${index + 1}`}
              onPress={() => { Keyboard.dismiss(); onPickPhotos(entry.key, totalQuantity, entry.photos.length); }}
              style={({ pressed }) => [
                styles.photoPicker,
                {
                  borderColor: theme.color.accent,
                  borderWidth: theme.surface.borderWidth,
                  backgroundColor: theme.color.accentSurface,
                },
                pressed && styles.pressed,
              ]}
            >
              <Icon name="cameraPlus" size={30} color={theme.color.accent} strokeWidth={1} />
              <AppText size="small" weight="regular" color={theme.color.accent}>
                Pick Photo
              </AppText>
            </Pressable>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoStrip}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add photos for Cheki ${index + 1}`}
                onPress={() => { Keyboard.dismiss(); onPickPhotos(entry.key, totalQuantity, entry.photos.length); }}
                style={({ pressed }) => [
                  styles.photoPicker,
                  styles.photoPickerCompact,
                  {
                    borderColor: theme.color.accent,
                    borderWidth: theme.surface.borderWidth,
                    backgroundColor: theme.color.accentSurface,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Icon name="cameraPlus" size={30} color={theme.color.accent} strokeWidth={1} />
                <AppText size="small" weight="regular" color={theme.color.accent}>
                  Pick Photo
                </AppText>
              </Pressable>
              {entry.photos.map((assetId, photoIndex) => {
                const asset = photoAssets.get(assetId);
                const uri = asset?.thumbnailPath ?? asset?.localPath;
                return (
                  <Pressable
                    key={assetId}
                    accessibilityRole="button"
                    accessibilityLabel={`Cheki photo ${photoIndex + 1}`}
                    accessibilityHint="Tap to crop this photo again"
                    style={({ pressed }) => [
                      styles.photoThumb,
                      {
                        width: chekiPhotoWidth(asset),
                        height: CHEKI_PHOTO_HEIGHT,
                        backgroundColor: theme.color.surfaceMuted,
                        borderColor: theme.surface.borderColor,
                        borderWidth: theme.surface.borderWidth,
                      },
                      pressed && styles.pressed,
                    ]}
                    onPress={() => { Keyboard.dismiss(); onReopenPhoto(entry.key, assetId); }}
                  >
                    {uri ? (
                      <Image
                        source={{ uri }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                      />
                    ) : (
                      <Icon name="imagePlus" size={26} color={theme.color.textMuted} />
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete Cheki photo ${photoIndex + 1}`}
                      accessibilityHint="Delete this photo from the cheki entry"
                      hitSlop={4}
                      onPress={() => { Keyboard.dismiss(); onRemovePhoto(index, assetId); }}
                      style={[
                        styles.photoRemove,
                        {
                          backgroundColor: RED_SCALE.R50,
                          borderColor: RED_SCALE.R300,
                          borderWidth: theme.surface.borderWidth,
                        },
                      ]}
                    >
                      <Icon name="x" size={11} color={RED_SCALE.R300} strokeWidth={1.5} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </>
      ) : null}
    </Card>
  );
});

function QuickTypeModal({
  visible,
  onClose,
  target,
  currency,
  entries,
  onSelectType,
}: {
  visible: boolean;
  onClose: () => void;
  target: { entryIndex: number; typeIndex: number } | null;
  currency: CurrencyCode;
  entries: EntryDraft[];
  onSelectType: (entryIndex: number, typeIndex: number, type: ChekiType) => void;
}) {
  const theme = useTheme();
  const [label, setLabel] = useState('');
  const [price, setPrice] = useState('');

  const save = () => {
    const minor = parseMinorUnits(price, currency);
    if (!label.trim() || minor === null || target === null) return;
    const idolId = entries[target.entryIndex]?.idolId;
    if (!idolId) return;
    const type = createIdolRepo(getDb()).createChekiType({ idolId, label: label.trim(), currency, unitPrice: minor });
    onSelectType(target.entryIndex, target.typeIndex, type);
    setLabel('');
    setPrice('');
    onClose();
  };

  return (
    <Modal visible={visible} onClose={onClose} title="New Cheki Type">
      <Field label="Label" value={label} onChangeText={setLabel} placeholder="e.g. Animate" />
      <Field label={`Unit price (${currency})`} value={price} onChangeText={(value) => setPrice(formatMoneyInput(value, currency))} keyboardType="numeric" placeholder="1500" style={{ marginTop: theme.spacing.sm }} />
      <Button label="Create & Use" style={{ marginTop: 16 }} disabled={!label.trim() || price.trim() === ''} onPress={save} />
    </Modal>
  );
}

function detailFieldStyle(theme: ReturnType<typeof useTheme>) {
  return {
    backgroundColor: theme.color.surface,
    borderColor: theme.surface.borderColor,
    borderWidth: theme.surface.borderWidth,
    borderRadius: theme.radius.lg,
    shadowColor: theme.surface.shadowColor,
    shadowOpacity: theme.surface.style === 'soft-shadow' ? theme.surface.shadowOpacity : 0,
    shadowRadius: theme.surface.shadowRadius,
    shadowOffset: { width: 0, height: 1 },
    elevation: theme.surface.style === 'soft-shadow' ? theme.surface.elevation : 0,
  };
}

const styles = StyleSheet.create({
  formList: {
    flex: 1,
  },
  detailsCard: {
    marginTop: CARD_STACK_GAP,
    gap: 8,
  },
  venueDrinkRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    width: '100%',
  },
  venueCol: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  drinkCol: {
    width: 120,
  },
  venueFullCol: {
    width: '100%',
    gap: 4,
  },
  detailFieldBlock: {
    gap: 4,
  },
  detailField: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  detailValue: {
    flex: 1,
    minWidth: 0,
  },
  pressed: {
    opacity: 0.7,
  },
  chekiHeader: {
    marginTop: CARD_STACK_GAP,
    minHeight: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chekiHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addEntryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  entryCard: {
    marginTop: CARD_STACK_GAP,
    padding: 16,
    gap: 8,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  removeEntryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingLeft: 5,
    paddingRight: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  entryDivider: {
    width: '100%',
    height: 1,
  },
  idolSelectField: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    borderRadius: 16,
  },
  idolCard: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
    paddingRight: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  idolPhoto: {
    width: 40,
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idolCopy: {
    flex: 1,
    minWidth: 0,
  },
  chekiTypesContainer: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    width: '100%',
  },
  chekiTypeRowContainer: {
    width: '100%',
  },
  chekiTypeRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  typeDropdownMenu: {
    borderRadius: 12,
    padding: 6,
    marginTop: 6,
    marginBottom: 4,
    width: '100%',
  },
  dropdownOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dropdownCreateBtn: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginTop: 2,
  },
  typeRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginTop: 8,
  },
  typePicker: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typePickerLabel: {
    flex: 1,
  },
  quantityStepper: {
    width: 95,
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperButton: {
    width: 20,
    height: 20,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  quantityInput: {
    flex: 1,
    height: 24,
    padding: 0,
    textAlign: 'center',
  },
  addTypeButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPicker: {
    height: CHEKI_PHOTO_HEIGHT,
    width: '100%',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPickerCompact: {
    width: CHEKI_PHOTO_HEIGHT,
    height: CHEKI_PHOTO_HEIGHT,
    flex: 0,
  },
  photoStrip: {
    height: CHEKI_PHOTO_HEIGHT,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  photoThumb: {
    height: CHEKI_PHOTO_HEIGHT,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 999,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
