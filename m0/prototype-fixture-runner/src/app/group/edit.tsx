import { useMemo } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { EntityNotFound } from '@/components/ui/EntityNotFound';
import { GroupForm, createOrUpdateGroup } from '@/components/forms/GroupForm';
import { getDb } from '@/db';
import { createIdolRepo } from '@/repositories/idol';
import { useTheme } from '@/hooks/useTheme';

export default function EditGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  const group = useMemo(() => createIdolRepo(getDb()).getGroup(id), [id]);
  if (!group) return <EntityNotFound entity="Group" onBack={() => router.back()} />;

  const confirmDelete = () => {
    Alert.alert('Delete Group', 'This group will be archived. Memberships remain in idol history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          createIdolRepo(getDb()).deleteGroup(group.id);
          router.replace('/(tabs)/idols');
        },
      },
    ]);
  };

  return (
    <Screen scroll>
      <Header title="Edit Group" />
      <GroupForm
        initial={group}
        submitLabel="Save Changes"
        onSubmit={(values, photoMediaId) => {
          createOrUpdateGroup(values, photoMediaId, group.id);
          router.back();
        }}
      />
      <Button label="Delete Group" variant="danger" style={{ marginTop: theme.spacing.md }} onPress={confirmDelete} />
    </Screen>
  );
}
