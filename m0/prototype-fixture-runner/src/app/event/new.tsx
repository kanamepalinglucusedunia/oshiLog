import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { EventForm } from '@/components/forms/EventForm';

export default function NewEventScreen() {
  const router = useRouter();
  return (
    <Screen scroll={false} contentStyle={{ padding: 0 }}>
      <EventForm
        onCancel={() => router.back()}
        onSaved={(id) => router.replace(`/event/${id}`)}
      />
    </Screen>
  );
}
