import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Controller, useForm, useWatch, type Control, type FieldErrors, type UseFormSetValue } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore } from '@/stores/settingsStore';
import { getDb } from '@/db';
import { createVenueRepo, type VenueInput } from '@/repositories/venue';
import { CountryRegionFields } from '@/components/forms/CountryRegionFields';
import { VenueSearchBottomSheet } from '@/components/forms/VenueSearchBottomSheet';
import { COUNTRIES, type CountryCode, type CurrencyCode } from '@/types/domain';
import { formatMoneyInput, parseMinorUnits } from '@/utils/money';
import type { VenueSearchResult } from '@/services/venueSearch';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  country: z.string().min(1, 'Country is required'),
  region: z.string().trim().min(1, 'Region is required'),
  address: z.string().trim().optional(),
  drinkPrice: z.string().trim().optional(),
});

export type VenueFormValues = z.infer<typeof schema>;

export interface VenueFormProps {
  initial?: {
    id: string;
    name: string;
    country: CountryCode;
    region: string | null;
    address: string | null;
    notes: string | null;
  };
  submitLabel?: string;
  onSubmit?: (values: VenueFormValues) => void | Promise<void>;
}

interface VenueFormController {
  control: Control<VenueFormValues>;
  errors: FieldErrors<VenueFormValues>;
  setValue: UseFormSetValue<VenueFormValues>;
  country: CountryCode;
  region: string;
  currency: string;
  formError: string | null;
  saving: boolean;
  submit: () => void;
  activeCountries: CountryCode[];
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  applySearchResult: (result: VenueSearchResult) => void;
  dismissRegionNotice: () => void;
  regionNotice: boolean;
}

function currencyForCountry(country: string): CurrencyCode {
  return COUNTRIES.find((item) => item.code === country)?.currency ?? 'JPY';
}

function useVenueForm({ initial, onSubmit }: Pick<VenueFormProps, 'initial' | 'onSubmit'>): VenueFormController {
  const countries = useSettingsStore((s) => s.countries);
  const activeCountries = useMemo(() => countries.filter((c) => c.isActive).map((c) => c.country), [countries]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [regionNotice, setRegionNotice] = useState(false);
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<VenueFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '',
      country: initial?.country ?? activeCountries[0] ?? 'JP',
      region: initial?.region ?? '',
      address: initial?.address ?? '',
      drinkPrice: '',
    },
  });

  const country = useWatch({ control, name: 'country' }) as CountryCode;
  const region = useWatch({ control, name: 'region' }) ?? '';

  useEffect(() => {
    if (activeCountries.length > 0 && !activeCountries.includes(country)) {
      setValue('country', activeCountries[0], { shouldValidate: true });
    }
  }, [activeCountries, country, setValue]);

  const applySearchResult = (result: VenueSearchResult) => {
    setValue('name', result.name, { shouldValidate: true });
    setValue('country', result.country, { shouldValidate: true });
    if (result.region) {
      setValue('region', result.region, { shouldValidate: true });
      setRegionNotice(false);
    } else {
      setValue('region', '', { shouldValidate: false });
      setRegionNotice(true);
    }
    setValue('address', result.address, { shouldValidate: true });
  };

  useEffect(() => {
    if (activeCountries.length > 0 && !activeCountries.includes(country)) {
      setValue('country', activeCountries[0], { shouldValidate: true });
    }
  }, [activeCountries, country, setValue]);

  const submit = () => {
    void handleSubmit(async (values) => {
      setFormError(null);
      setSaving(true);
      try {
        await onSubmit?.(values);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Could not save the venue.');
      } finally {
        setSaving(false);
      }
    })();
  };

  return {
    control,
    errors,
    setValue,
    country,
    region,
    currency: currencyForCountry(country),
    formError,
    saving,
    submit,
    activeCountries,
    searchOpen,
    openSearch: () => setSearchOpen(true),
    closeSearch: () => setSearchOpen(false),
    applySearchResult,
    dismissRegionNotice: () => setRegionNotice(false),
    regionNotice,
  };
}

function VenueFields({ form }: { form: VenueFormController }) {
  const theme = useTheme();
  return (
    <Card>
      <AppText weight="semibold" size="large">
        Basic Info
      </AppText>
      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
        <Button
          label="Find venue or address"
          variant="secondary"
          onPress={form.openSearch}
          labelSize="small"
          labelWeight="semibold"
          style={{ minHeight: 44 }}
        />

        <Controller
          control={form.control}
          name="name"
          render={({ field }) => (
            <Field
              icon="star"
              label="Name *"
              placeholder="e.g. Venue Name"
              accessibilityLabel="Venue Name"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={form.errors.name?.message ?? null}
            />
          )}
        />

        <CountryRegionFields
          country={form.country}
          region={form.region}
          onCountryChange={(country) => form.setValue('country', country, { shouldValidate: true })}
          onRegionChange={(region) => {
            form.setValue('region', region, { shouldValidate: true });
            if (region.trim()) form.dismissRegionNotice();
          }}
          countryLabel="Country *"
          regionLabel="Region *"
          countryPlaceholder="Select country"
          regionPlaceholder="Select region"
          countryError={form.errors.country?.message ?? null}
          regionError={form.errors.region?.message ?? null}
          layout="row"
        />
        {form.regionNotice ? (
          <AppText size="xs" color={theme.color.warning}>
            Region was not provided. Select it before saving.
          </AppText>
        ) : null}

        <Controller
          control={form.control}
          name="address"
          render={({ field }) => (
            <Field
              label="Address"
              placeholder="Enter address"
              accessibilityLabel="Venue Address"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              multiline
              numberOfLines={4}
              error={form.errors.address?.message ?? null}
            />
          )}
        />

        <Controller
          control={form.control}
          name="drinkPrice"
          render={({ field }) => (
            <Field
              icon="bottle"
              label={`Drink Price (${form.currency})`}
              placeholder="e.g. 600"
              accessibilityLabel="Drink Price"
              value={field.value}
              onChangeText={(value) => field.onChange(formatMoneyInput(value, form.currency as CurrencyCode))}
              onBlur={field.onBlur}
              keyboardType="numeric"
              error={form.errors.drinkPrice?.message ?? null}
            />
          )}
        />
      </View>
      {form.formError ? (
        <AppText size="small" color={theme.color.danger} style={{ marginTop: theme.spacing.sm }} accessibilityRole="alert">
          {form.formError}
        </AppText>
      ) : null}
      <VenueSearchBottomSheet
        visible={form.searchOpen}
        activeCountries={form.activeCountries}
        fallbackCountry={form.country}
        onClose={form.closeSearch}
        onSelect={form.applySearchResult}
      />
    </Card>
  );
}

export function VenueForm({ initial, submitLabel = 'Save Venue', onSubmit }: VenueFormProps) {
  const form = useVenueForm({ initial, onSubmit });
  const theme = useTheme();
  return (
    <>
      <VenueFields form={form} />
      <Button
        label={submitLabel}
        onPress={form.submit}
        loading={form.saving}
        labelSize="large"
        labelWeight="semibold"
        style={{ marginTop: theme.spacing.md, paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md }}
      />
    </>
  );
}

function buildVenueInput(values: { name: string; country: string; region?: string; address?: string }): VenueInput {
  return {
    name: values.name.trim(),
    country: values.country as CountryCode,
    region: values.region?.trim() || null,
    address: values.address?.trim() || null,
    isFavorite: false,
  };
}

function parseDefaultDrinkPrice(values: { country: string; drinkPrice?: string }) {
  if (!values.drinkPrice?.trim()) return null;
  const currency = currencyForCountry(values.country);
  const price = parseMinorUnits(values.drinkPrice, currency);
  if (price === null) throw new Error(`Enter a valid drink price in ${currency}.`);
  return { currency, price };
}

function saveDefaultDrinkPrice(repo: ReturnType<typeof createVenueRepo>, venueId: string, drinkPrice: { currency: CurrencyCode; price: number } | null) {
  if (!drinkPrice) return;
  const existing = repo.listDrinkPrices(venueId, false).find((drink) => drink.isDefault);
  if (existing) {
    repo.updateDrinkPrice(existing.id, { ...drinkPrice, isDefault: true });
  } else {
    repo.createDrinkPrice({ venueId, label: null, ...drinkPrice, isDefault: true });
  }
}

export function createOrUpdateVenue(values: VenueFormValues, existingId?: string) {
  const repo = createVenueRepo(getDb());
  const input = buildVenueInput(values);
  const drinkPrice = parseDefaultDrinkPrice(values);
  const venue = existingId ? repo.updateVenue(existingId, input) : repo.createVenue(input);
  saveDefaultDrinkPrice(repo, venue.id, drinkPrice);
  return venue;
}

export function createVenueAndMigrate(values: VenueFormValues, sourceId: string) {
  const repo = createVenueRepo(getDb());
  const drinkPrice = parseDefaultDrinkPrice(values);
  return repo.createVenueAndMigrate(
    buildVenueInput(values),
    sourceId,
    drinkPrice ? { label: null, ...drinkPrice, isDefault: true } : undefined,
  );
}

export interface VenueFormBottomSheetProps extends VenueFormProps {
  visible: boolean;
  onClose: () => void;
}

export function VenueFormBottomSheet({ visible, onClose, submitLabel = 'Save Venue', ...formProps }: VenueFormBottomSheetProps) {
  const theme = useTheme();
  const form = useVenueForm({
    initial: formProps.initial,
    onSubmit: async (values) => {
      await formProps.onSubmit?.(values);
      onClose();
    },
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      maxHeightRatio={0.9}
      footer={(
        <Button
          label={submitLabel}
          onPress={form.submit}
          loading={form.saving}
          labelSize="large"
          labelWeight="semibold"
          style={{ paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md }}
        />
      )}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        scrollsChildToFocus
        contentContainerStyle={{ paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.md, gap: theme.spacing.sm }}
      >
        <VenueFields form={form} />
      </ScrollView>
    </BottomSheet>
  );
}
