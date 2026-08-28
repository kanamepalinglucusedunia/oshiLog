import { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { Chip } from '@/components/ui/Chip';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { useSettingsStore } from '@/stores/settingsStore';
import { readDataAtVersion, useUiStore } from '@/stores/uiStore';
import { getDb } from '@/db';
import { createRegionRepo } from '@/repositories/region';
import { COUNTRIES, type CountryCode, type Region } from '@/types/domain';
import { CARD_STACK_GAP } from '@/design-system/theme';

export default function CountryRegionScreen() {
  const theme = useTheme();
  const countries = useSettingsStore((s) => s.countries);
  const setCountryActive = useSettingsStore((s) => s.setCountryActive);

  const [addModal, setAddModal] = useState(false);
  const [addCountry, setAddCountry] = useState<CountryCode>('JP');
  const [addName, setAddName] = useState('');
  const dataVersion = useUiStore((s) => s.dataVersion);

  const regionsByCountry = useMemo(() => {
    return readDataAtVersion(dataVersion, () => {
      const map = new Map<CountryCode, Region[]>();
      for (const r of createRegionRepo(getDb()).listRegions()) {
        const list = map.get(r.country) ?? [];
        list.push(r);
        map.set(r.country, list);
      }
      return map;
    });
  }, [dataVersion]);

  const countryName = (code: CountryCode) => COUNTRIES.find((c) => c.code === code)?.name ?? code;
  const isActive = (code: CountryCode) => countries.find((c) => c.country === code)?.isActive ?? false;

  const toggleActive = (code: CountryCode, active: boolean) => {
    if (active && countries.filter((c) => c.isActive).length === 1) return;
    setCountryActive(code, !active);
  };

  const openAdd = (code: CountryCode) => {
    setAddCountry(code);
    setAddName('');
    setAddModal(true);
  };

  const saveRegion = () => {
    const name = addName.trim();
    if (!name) return;
    createRegionRepo(getDb()).ensureRegion({ country: addCountry, name });
    setAddModal(false);
    setAddName('');
  };

  return (
    <Screen scroll contentStyle={{ padding: 0 }}>
      <View style={{ paddingHorizontal: theme.spacing.md }}>
        <Header title="Country & Region" />
      </View>
      <View style={{ paddingHorizontal: theme.spacing.md }}>
        {COUNTRIES.map((c) => {
          const active = isActive(c.code);
          const regions = regionsByCountry.get(c.code) ?? [];
          return (
            <Card key={c.code} style={{ marginBottom: CARD_STACK_GAP }}>
              <View style={styles.cardHeader}>
                <CountryFlag country={c.code} width={22} />
                <AppText weight="semibold" size="body" style={{ flex: 1 }}>
                  {c.name}
                </AppText>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  hitSlop={10}
                  onPress={() => toggleActive(c.code, active)}
                >
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={24}
                    color={active ? theme.color.accent : theme.color.textMuted}
                  />
                </Pressable>
              </View>

              {regions.length === 0 ? (
                <AppText size="small" muted style={{ marginVertical: 6 }}>
                  No regions yet.
                </AppText>
              ) : (
                <View style={styles.chips}>
                  {regions.map((r) => (
                    <Chip key={r.id} label={r.name} style={{ marginBottom: 8 }} />
                  ))}
                </View>
              )}

              <Pressable
                accessibilityRole="button"
                onPress={() => openAdd(c.code)}
                style={({ pressed }) => [styles.addRow, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="add-circle-outline" size={18} color={theme.color.accent} />
                <AppText weight="semibold" size="small" color={theme.color.accent}>
                  Add region
                </AppText>
              </Pressable>
            </Card>
          );
        })}
      </View>

      <Modal visible={addModal} onClose={() => setAddModal(false)} title="Add Region">
        <AppText size="small" muted style={{ marginBottom: 12 }}>
          Added to {countryName(addCountry)}.
        </AppText>
        <Field label="Region name *" value={addName} onChangeText={setAddName} placeholder="e.g. Sendai" />
        <Button label="Add" style={{ marginTop: 16 }} disabled={addName.trim().length === 0} onPress={saveRegion} />
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingVertical: 6,
  },
});
