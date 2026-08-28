import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { Field } from '@/components/ui/Field';
import { DateField } from '@/components/ui/DateField';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore } from '@/stores/settingsStore';
import { getDb } from '@/db';
import { createTripRepo } from '@/repositories/trip';
import { COUNTRIES, type CountryCode } from '@/types/domain';
import { isValidISODate, todayISO } from '@/utils/date';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  startDate: z.string().optional().refine((val) => !val || isValidISODate(val), 'Invalid date (YYYY-MM-DD)'),
  endDate: z.string().optional().refine((val) => !val || isValidISODate(val), 'Invalid date (YYYY-MM-DD)'),
  description: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

export interface TripFormProps {
  initial?: {
    id: string;
    title: string;
    startDate: string;
    endDate: string;
    description: string | null;
    isFavorite: boolean;
  };
  initialCountries?: CountryCode[];
  submitLabel?: string;
  /** Hide the inline action when a parent supplies a sticky footer action. */
  showSubmitButton?: boolean;
  /** Increment to request submission from an external sticky action. */
  submitRequest?: number;
  onSubmit?: (values: FormValues, countries: CountryCode[]) => void;
}

export function TripForm({
  initial,
  initialCountries,
  submitLabel = 'Save Trip',
  showSubmitButton = true,
  submitRequest = 0,
  onSubmit,
}: TripFormProps) {
  const theme = useTheme();
  const countryPrefs = useSettingsStore((s) => s.countries);
  const activeCountries = useMemo(() => countryPrefs.filter((c) => c.isActive).map((c) => c.country), [countryPrefs]);
  const [countries, setCountries] = useState<CountryCode[]>(initialCountries ?? activeCountries.slice(0, 1));
  const [dateError, setDateError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title ?? '',
      startDate: initial?.startDate ?? '',
      endDate: initial?.endDate ?? '',
      description: initial?.description ?? '',
    },
  });

  const submit = useCallback(() => {
    void handleSubmit((values) => {
      const finalStartDate = values.startDate || todayISO();
      const finalEndDate = values.endDate || finalStartDate;
      if (finalEndDate < finalStartDate) {
        setDateError('End date must be on or after start date');
        return;
      }
      setDateError(null);
      onSubmit?.({ ...values, startDate: finalStartDate, endDate: finalEndDate }, countries);
    })();
  }, [countries, handleSubmit, onSubmit]);

  const handledSubmitRequest = useRef(0);
  useEffect(() => {
    if (submitRequest <= handledSubmitRequest.current) return;
    handledSubmitRequest.current = submitRequest;
    submit();
  }, [submit, submitRequest]);

  return (
    <>
      <Card style={styles.sectionCard}>
        <AppText weight="semibold" size="large" style={styles.cardHeaderTitle}>
          Basic Info
        </AppText>

        <Controller
          control={control}
          name="title"
          render={({ field }) => (
            <Field
              icon="star"
              label="Trip Name"
              placeholder="e.g. Tokyo trip"
              accessibilityLabel="Trip Name"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.title?.message ?? null}
            />
          )}
        />

        <AppText weight="semibold" size="small">
          Countries (at least one)
        </AppText>
        <View style={styles.chips}>
          {(activeCountries.length > 0 ? COUNTRIES.filter((c) => activeCountries.includes(c.code)) : COUNTRIES).map((country) => (
            <Chip
              key={country.code}
              label={country.name}
              leading={<CountryFlag country={country.code} width={18} />}
              selected={countries.includes(country.code)}
              onPress={() =>
                setCountries((prev) => (prev.includes(country.code) ? prev.filter((c) => c !== country.code) : [...prev, country.code]))
              }
              style={{ marginBottom: 8 }}
            />
          ))}
        </View>

        <View style={[styles.row, { gap: theme.spacing.sm }]}>
          <View style={{ flex: 1 }}>
            <Controller
              control={control}
              name="startDate"
              render={({ field }) => <DateField label="Start date" value={field.value ?? ''} onChange={field.onChange} placeholder="Pick start date" />}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Controller
              control={control}
              name="endDate"
              render={({ field }) => <DateField label="End date" value={field.value ?? ''} onChange={field.onChange} placeholder="Pick end date" />}
            />
          </View>
        </View>
        {dateError ? (
          <AppText size="xs" color={theme.color.danger}>{dateError}</AppText>
        ) : null}

        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Field
              label="Description"
              placeholder="Add notes"
              accessibilityLabel="Description"
              value={field.value}
              onChangeText={field.onChange}
              multiline
              numberOfLines={4}
            />
          )}
        />
      </Card>

      {showSubmitButton ? (
        <Button
          label={submitLabel}
          onPress={submit}
          disabled={countries.length === 0}
          style={{ marginTop: theme.spacing.md }}
        />
      ) : null}
    </>
  );
}

export function createOrUpdateTrip(values: { title: string; startDate?: string; endDate?: string; description?: string }, countries: CountryCode[], existingId?: string) {
  const repo = createTripRepo(getDb());
  const startDate = values.startDate || todayISO();
  const endDate = values.endDate || startDate;
  const input = {
    title: values.title,
    startDate,
    endDate,
    description: values.description || null,
    countries,
  };
  return existingId ? repo.updateTrip(existingId, input) : repo.createTrip({ ...input, isFavorite: false });
}

const styles = StyleSheet.create({
  sectionCard: {
    padding: 16,
    gap: 8,
  },
  cardHeaderTitle: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 18,
    lineHeight: 22,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetScroll: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 8,
  },
});

export interface TripFormBottomSheetProps extends TripFormProps {
  visible: boolean;
  onClose: () => void;
}

export function TripFormBottomSheet({ visible, onClose, submitLabel = 'Save Trip', ...formProps }: TripFormBottomSheetProps) {
  const theme = useTheme();
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
          style={{ paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md }}
        />
      )}
    >
      <ScrollView keyboardShouldPersistTaps="handled" scrollsChildToFocus contentContainerStyle={styles.sheetScroll}>
        <TripForm
          {...formProps}
          submitLabel={submitLabel}
          showSubmitButton={false}
          submitRequest={submitRequest}
          onSubmit={(values, countries) => {
            formProps.onSubmit?.(values, countries);
            onClose();
          }}
        />
      </ScrollView>
    </BottomSheet>
  );
}
