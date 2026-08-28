import { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SettingsRow } from '@/components/ui/SettingsRow';
import { useSettingsStore } from '@/stores/settingsStore';

export default function LanguageScreen() {
  const theme = useTheme();
  const settings = useSettingsStore((s) => s.settings);
  const patch = useSettingsStore((s) => s.patch);

  const [headerModalOpen, setHeaderModalOpen] = useState(false);

  if (!settings) return null;

  return (
    <Screen scroll contentStyle={{ padding: 0 }}>
      <View style={{ paddingHorizontal: theme.spacing.md }}>
        <Header title="Language" />
      </View>
      <View style={{ paddingHorizontal: theme.spacing.md }}>
        <Card>
          <SettingsRow icon="language-outline" label="Interface language" value="English" onPress={() => {}} />
          <SettingsRow
            icon="create-outline"
            label="Home header label"
            value={settings.homeHeaderLabel}
            onPress={() => setHeaderModalOpen(true)}
          />
        </Card>
      </View>

      <HeaderLabelModal
        visible={headerModalOpen}
        onClose={() => setHeaderModalOpen(false)}
        value={settings.homeHeaderLabel}
        onSave={(label) => patch({ homeHeaderLabel: label })}
      />
    </Screen>
  );
}

function HeaderLabelModal({ visible, onClose, value, onSave }: { visible: boolean; onClose: () => void; value: string; onSave: (label: string) => void }) {
  const [label, setLabel] = useState(value);
  return (
    <Modal visible={visible} onClose={onClose} title="Home Header Label">
      <Field label="Label" value={label} onChangeText={setLabel} placeholder="oshiLog" />
      <Button
        label="Save"
        style={{ marginTop: 16 }}
        disabled={label.trim().length === 0}
        onPress={() => {
          onSave(label.trim());
          onClose();
        }}
      />
    </Modal>
  );
}
