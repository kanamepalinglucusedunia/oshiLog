import { useMemo, useState } from 'react';
import { View, StyleSheet, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { getDb } from '@/db';
import { createIdolRepo } from '@/repositories/idol';
import { useUiStore } from '@/stores/uiStore';
import { CARD_STACK_GAP } from '@/design-system/theme';

const HEX_PRESETS = ['#FF9EC4', '#4DB665', '#7EC8E3', '#DC3545', '#7F6EB5', '#E8873A', '#FFCC31', '#4A9BC7', '#FFFFFF', '#000000', '#B5ABD4', '#2E9E9E'];

export default function MemberColorsScreen() {
  const theme = useTheme();
  const dataVersion = useUiStore((s) => s.dataVersion);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [hex, setHex] = useState('#FF9EC4');

  const colors = useMemo(() => {
    void dataVersion;
    return createIdolRepo(getDb()).listMemberColors();
  }, [dataVersion]);

  const save = () => {
    if (!name.trim() || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
    createIdolRepo(getDb()).createMemberColor({ name: name.trim(), hex });
    setName('');
    setHex('#FF9EC4');
    setAdding(false);
  };

  const remove = (id: string, colorName: string) => {
    Alert.alert('Delete Color', `Remove "${colorName}" from the catalog? Memberships keep their current color.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          createIdolRepo(getDb()).deleteMemberColor(id);
        },
      },
    ]);
  };

  return (
    <Screen scroll>
      <View style={{ paddingHorizontal: theme.spacing.md }}>
        <Header title="Member Colors" />
      </View>
      <View style={{ paddingHorizontal: theme.spacing.md }}>
        <Card>
          {colors.length === 0 ? (
            <AppText size="small" muted>No colors yet. Add one below.</AppText>
          ) : (
            colors.map((color) => (
              <View key={color.id} style={[styles.row, { borderBottomColor: theme.color.borderLight }]}>
                <View style={[styles.swatch, { backgroundColor: color.hex, borderColor: theme.surface.borderColor, borderWidth: 1 }]} />
                <AppText size="body" weight="regular" style={{ flex: 1 }}>{color.name}</AppText>
                <AppText size="xs" muted>{color.hex}</AppText>
                <Pressable hitSlop={10} onPress={() => remove(color.id, color.name)}>
                  <Ionicons name="trash-outline" size={18} color={theme.color.danger} />
                </Pressable>
              </View>
            ))
          )}
        </Card>

      {adding ? (
        <Card style={{ marginTop: CARD_STACK_GAP }}>
          <AppText weight="semibold" size="small" style={{ marginBottom: 8 }}>New color</AppText>
          <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Mint" />
            <View style={styles.chips}>
              {HEX_PRESETS.map((preset) => (
                <Pressable key={preset} onPress={() => setHex(preset)} style={[styles.swatch, { backgroundColor: preset, borderWidth: hex === preset ? 3 : 1, borderColor: hex === preset ? theme.color.accent : theme.surface.borderColor }]} />
              ))}
            </View>
            <Field
              label="Hex *"
              value={hex}
              onChangeText={setHex}
              autoCapitalize="characters"
              placeholder="e.g. #FF9EC4"
              style={{ marginTop: theme.spacing.sm }}
            />
            <View style={styles.actionRow}>
              <Button label="Cancel" variant="ghost" onPress={() => setAdding(false)} style={{ flex: 1 }} />
              <Button label="Save" disabled={!name.trim() || !/^#[0-9A-Fa-f]{6}$/.test(hex)} onPress={save} style={{ flex: 1 }} />
            </View>
          </Card>
        ) : (
          <Button label="+ Add Color" variant="secondary" style={{ marginTop: theme.spacing.sm }} onPress={() => setAdding(true)} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
});
