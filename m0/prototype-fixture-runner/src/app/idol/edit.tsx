import { useMemo } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { IdolFormBottomSheet, type MembershipFormSeed } from '@/components/forms/IdolForm';
import { EntityNotFound } from '@/components/ui/EntityNotFound';
import { getDb } from '@/db';
import { createIdolRepo } from '@/repositories/idol';
import { readDataAtVersion, useUiStore } from '@/stores/uiStore';

export default function EditIdolScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const dataVersion = useUiStore((s) => s.dataVersion);

  const idol = useMemo(() => readDataAtVersion(dataVersion, () => createIdolRepo(getDb()).getIdol(id)), [id, dataVersion]);
  const memberships = useMemo<MembershipFormSeed[]>(
    () => readDataAtVersion(dataVersion, () =>
      createIdolRepo(getDb())
        .listCurrentMembershipsWithGroupName(id)
        .map((m) => ({
          id: m.id,
          groupId: m.groupId,
          name: m.name,
          memberColor: m.memberColor,
          status: m.status,
          startDate: m.startDate,
          endDate: m.endDate,
          hiatusStartDate: m.hiatusStartDate,
          hiatusEndDate: m.hiatusEndDate,
          isMain: m.isMain,
        }))),
    [id, dataVersion],
  );

  if (!idol) return <EntityNotFound entity="Idol" onBack={() => router.back()} />;

  return (
    <IdolFormBottomSheet
      visible
      onClose={() => router.back()}
      initial={idol}
      initialMemberships={memberships}
      submitLabel="Save Changes"
      dangerAction={{
        label: 'Delete Idol',
        description: 'Archive this Idol profile. Existing Event records stay intact.',
        onPress: () => {
          Alert.alert('Delete Idol', 'Archive this Idol profile? Existing Event records will stay intact.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                createIdolRepo(getDb()).deleteIdol(idol.id);
                router.replace('/(tabs)/idols');
              },
            },
          ]);
        },
      }}
    />
  );
}
