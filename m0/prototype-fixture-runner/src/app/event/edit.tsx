import { useMemo } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { EntityNotFound } from '@/components/ui/EntityNotFound';
import { EventForm } from '@/components/forms/EventForm';
import { getDb } from '@/db';
import { createEventRepo } from '@/repositories/event';

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const event = useMemo(() => createEventRepo(getDb()).getEvent(id), [id]);
  if (!event) return <EntityNotFound entity="Event" onBack={() => router.back()} />;

  const handleDelete = () => {
    Alert.alert('Delete Event', 'This event and its cheki entries will be archived.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          createEventRepo(getDb()).deleteEvent(event.id);
          router.replace('/(tabs)/events');
        },
      },
    ]);
  };

  return (
    <Screen scroll={false} contentStyle={{ padding: 0 }}>
      <EventForm
        initial={event}
        submitLabel="Save Changes"
        onCancel={() => router.back()}
        onSaved={() => router.back()}
        onDelete={handleDelete}
      />
    </Screen>
  );
}
