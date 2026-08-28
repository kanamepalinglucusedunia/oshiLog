import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EntityNotFound } from '@/components/ui/EntityNotFound';
import { TripForm, createOrUpdateTrip } from '@/components/forms/TripForm';
import { getDb } from '@/db';
import { createTripRepo } from '@/repositories/trip';

export default function EditTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const trip = useMemo(() => createTripRepo(getDb()).getTrip(id), [id]);
  const countries = useMemo(() => (trip ? createTripRepo(getDb()).listTripCountries(trip.id) : []), [trip]);

  if (!trip) return <EntityNotFound entity="Trip" onBack={() => router.back()} />;

  return (
    <Screen scroll>
      <Header title="Edit Trip" />
      <TripForm
        initial={trip}
        initialCountries={countries}
        submitLabel="Save Changes"
        onSubmit={(values, selectedCountries) => {
          createOrUpdateTrip(values, selectedCountries, trip.id);
          router.back();
        }}
      />
    </Screen>
  );
}
