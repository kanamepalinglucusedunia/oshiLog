import { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { Chip } from '@/components/ui/Chip';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { SettingsRow } from '@/components/ui/SettingsRow';
import { useSettingsStore } from '@/stores/settingsStore';
import { ACCENT_PRESETS, type SurfaceStyle, type ThemeMode } from '@/types/domain';

export default function ThemeAppearanceScreen() {
  const theme = useTheme();
  const settings = useSettingsStore((s) => s.settings);
  const patch = useSettingsStore((s) => s.patch);

  const [styleModal, setStyleModal] = useState(false);
  const [accentModal, setAccentModal] = useState(false);
  const [modeModal, setModeModal] = useState(false);
  const [hexInput, setHexInput] = useState(settings?.accentColor ?? '#7F6EB5');

  if (!settings) return null;

  return (
    <Screen scroll contentStyle={{ padding: 0 }}>
      <View style={{ paddingHorizontal: theme.spacing.md }}>
        <Header title="Theme & Appearance" />
      </View>
      <View style={{ paddingHorizontal: theme.spacing.md }}>
        <Card>
          <SettingsRow
            icon="moon-outline"
            label="Appearance mode"
            value={settings.themeMode === 'dark' ? 'Dark' : 'Light'}
            onPress={() => setModeModal(true)}
          />
          <SettingsRow
            icon="square-outline"
            label="Surface style"
            value={settings.surfaceStyle === 'outline' ? 'Outline' : 'Soft Shadow'}
            onPress={() => setStyleModal(true)}
          />
          <SettingsRow
            icon="color-palette-outline"
            label="Accent color"
            value={settings.accentColor.toUpperCase()}
            onPress={() => setAccentModal(true)}
          />
        </Card>
      </View>

      <Modal visible={modeModal} onClose={() => setModeModal(false)} title="Appearance Mode">
        {(['light', 'dark'] as ThemeMode[]).map((mode) => (
          <Chip
            key={mode}
            label={mode === 'dark' ? 'Dark' : 'Light'}
            selected={settings.themeMode === mode}
            onPress={() => {
              patch({ themeMode: mode });
              setModeModal(false);
            }}
            style={{ marginBottom: 8 }}
          />
        ))}
      </Modal>

      <Modal visible={styleModal} onClose={() => setStyleModal(false)} title="Surface Style">
        {(['outline', 'soft-shadow'] as SurfaceStyle[]).map((style) => (
          <Chip
            key={style}
            label={style === 'outline' ? 'Outline' : 'Soft Shadow'}
            selected={settings.surfaceStyle === style}
            onPress={() => patch({ surfaceStyle: style })}
            style={{ marginBottom: 8 }}
          />
        ))}
      </Modal>

      <Modal visible={accentModal} onClose={() => setAccentModal(false)} title="Accent Color">
        <View style={styles.palette}>
          {ACCENT_PRESETS.map((preset) => (
            <Pressable
              key={preset.hex}
              accessibilityRole="button"
              onPress={() => patch({ accentColor: preset.hex })}
              style={[styles.swatch, { backgroundColor: preset.hex }, settings.accentColor.toUpperCase() === preset.hex && { borderColor: theme.color.border, borderWidth: 3 }]}
            />
          ))}
        </View>
        <View style={styles.hexRow}>
          <Field
            label="Custom HEX"
            value={hexInput}
            onChangeText={(t) => {
              setHexInput(t);
              if (/^#[0-9A-Fa-f]{6}$/.test(t.trim())) patch({ accentColor: t.trim().toUpperCase() });
            }}
            placeholder="#7F6EB5"
            autoCapitalize="characters"
          />
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  hexRow: {
    marginTop: 8,
  },
});
