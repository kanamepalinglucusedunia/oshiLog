import { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COUNTRIES, ACCENT_PRESETS, DEFAULT_ACCENT, type CountryCode, type SurfaceStyle } from '@/types/domain';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { Field } from '@/components/ui/Field';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useSettingsStore } from '@/stores/settingsStore';
import { buildTheme } from '@/design-system/resolveTheme';

type Step = 'country' | 'style' | 'accent';

export default function OnboardingScreen() {
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);
  const patch = useSettingsStore((s) => s.patch);
  const setCountryActive = useSettingsStore((s) => s.setCountryActive);

  const [step, setStep] = useState<Step>('country');
  const [selectedCountries, setSelectedCountries] = useState<CountryCode[]>(['JP', 'ID']);
  const [surfaceStyle, setSurfaceStyle] = useState<SurfaceStyle>(settings?.surfaceStyle ?? 'outline');
  const [accentHex, setAccentHex] = useState<string>(settings?.accentColor ?? DEFAULT_ACCENT);
  const [hexInput, setHexInput] = useState(settings?.accentColor ?? DEFAULT_ACCENT);

  // M0 audit runner only: keep onboarding directly capturable after deterministic seeding.

  const toggleCountry = (code: CountryCode) => {
    setSelectedCountries((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const finish = () => {
    for (const country of COUNTRIES) {
      setCountryActive(country.code, selectedCountries.includes(country.code));
    }
    patch({ surfaceStyle, accentColor: accentHex.toUpperCase() });
    completeOnboarding();
    router.replace('/(tabs)');
  };

  const isValidHex = /^#([0-9A-Fa-f]{6})$/.test(accentHex);

  const previewTheme = buildTheme(surfaceStyle, accentHex);

  return (
    <Screen>
      <ScrollView scrollsChildToFocus contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.logoWrap}>
          <View style={[styles.logo, { backgroundColor: previewTheme.color.accentSurface, borderColor: previewTheme.color.accent, borderWidth: 2 }]}>
            <Ionicons name="heart" size={28} color={previewTheme.color.accent} />
          </View>
          <AppText weight="bold" size="h2" align="center">
            oshiLog
          </AppText>
          <AppText muted align="center" size="small">
            Your personal oshikatsu journal
          </AppText>
        </View>

        <View style={styles.steps}>
          {(['country', 'style', 'accent'] as Step[]).map((s) => (
            <Pressable key={s} onPress={() => setStep(s)} style={styles.stepDotWrap}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor: step === s ? previewTheme.color.accent : previewTheme.color.surface,
                    borderColor: previewTheme.color.accent,
                  },
                ]}
              />
            </Pressable>
          ))}
        </View>

        {step === 'country' ? (
          <>
            <AppText weight="bold" size="large" align="center">
              Where are you active?
            </AppText>
            <AppText muted size="small" align="center" style={{ marginBottom: 16 }}>
              Pick at least one country. Japan and Indonesia are pre-selected — confirm or change them.
            </AppText>
            <View style={styles.chips}>
              {COUNTRIES.map((country) => {
                const selected = selectedCountries.includes(country.code);
                return (
                  <Chip
                    key={country.code}
                    label={country.name}
                    leading={<CountryFlag country={country.code} width={18} />}
                    selected={selected}
                    onPress={() => toggleCountry(country.code)}
                    style={{ marginBottom: 8 }}
                  />
                );
              })}
            </View>
            <Button
              label="Continue"
              disabled={selectedCountries.length === 0}
              onPress={() => setStep('style')}
              style={{ marginTop: 24 }}
            />
          </>
        ) : null}

        {step === 'style' ? (
          <>
            <AppText weight="bold" size="large" align="center">
              Pick your surface style
            </AppText>
            <AppText muted size="small" align="center" style={{ marginBottom: 16 }}>
              Outline keeps crisp borders; Soft Shadow is calmer.
            </AppText>
            <View style={styles.styleRow}>
              {(['outline', 'soft-shadow'] as SurfaceStyle[]).map((style) => {
                const selected = surfaceStyle === style;
                const st = buildTheme(style, accentHex);
                return (
                  <Pressable key={style} onPress={() => setSurfaceStyle(style)} style={{ flex: 1 }}>
                    <Card
                      style={[styles.styleCard, selected && { borderColor: previewTheme.color.accent }]}
                    >
                      <View
                        style={[
                          styles.previewBox,
                          {
                            backgroundColor: st.color.surface,
                            borderWidth: st.surface.borderWidth,
                            borderColor: st.surface.borderColor,
                            shadowColor: st.surface.shadowColor,
                            shadowOpacity: st.surface.shadowOpacity,
                            shadowRadius: st.surface.shadowRadius,
                            shadowOffset: { width: 0, height: 2 },
                            elevation: st.surface.elevation,
                          },
                        ]}
                      />
                      <AppText weight={selected ? 'bold' : 'semibold'} size="body" align="center" color={selected ? previewTheme.color.accent : undefined}>
                        {style === 'outline' ? 'Outline' : 'Soft Shadow'}
                      </AppText>
                    </Card>
                  </Pressable>
                );
              })}
            </View>
            <Button label="Continue" onPress={() => setStep('accent')} style={{ marginTop: 24 }} />
          </>
        ) : null}

        {step === 'accent' ? (
          <>
            <AppText weight="bold" size="large" align="center">
              Pick your accent color
            </AppText>
            <AppText muted size="small" align="center" style={{ marginBottom: 16 }}>
              Lavender is the default. Contrast is auto-adjusted for accessibility.
            </AppText>
            <View style={styles.palette}>
              {ACCENT_PRESETS.map((preset) => {
                const selected = accentHex.toUpperCase() === preset.hex;
                return (
                  <Pressable
                    key={preset.hex}
                    accessibilityRole="button"
                    accessibilityLabel={preset.label}
                    onPress={() => {
                      setAccentHex(preset.hex);
                      setHexInput(preset.hex);
                    }}
                    style={[
                      styles.swatch,
                      { backgroundColor: preset.hex },
                      selected && { borderColor: previewTheme.color.border, borderWidth: 3 },
                    ]}
                  />
                );
              })}
            </View>
            <Field
              label="Custom color (HEX)"
              value={hexInput}
              onChangeText={(t) => {
                setHexInput(t);
                const v = t.trim().toUpperCase();
                if (/^#[0-9A-F]{6}$/.test(v)) setAccentHex(v);
              }}
              placeholder="#7F6EB5"
              autoCapitalize="characters"
              error={hexInput.trim() !== '' && !isValidHex ? 'Enter a 6-digit hex like #7F6EB5' : null}
              style={{ marginBottom: 8 }}
            />
            <Card accent style={{ alignItems: 'center', marginBottom: 24 }}>
              <AppText weight="bold" color={previewTheme.color.accent}>
                Preview
              </AppText>
              <View style={[styles.previewButton, { backgroundColor: previewTheme.color.accent, borderRadius: previewTheme.radius.md, marginTop: 8 }]}>
                <AppText weight="bold" color={previewTheme.color.onAccent}>
                  Your journal awaits
                </AppText>
              </View>
            </Card>
            <Button label="Start journaling" onPress={finish} />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 48,
  },
  logoWrap: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 16,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  steps: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  stepDotWrap: {
    padding: 4,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  styleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  styleCard: {
    alignItems: 'center',
    gap: 10,
  },
  previewBox: {
    width: '100%',
    height: 72,
    borderRadius: 12,
  },
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderColor: 'transparent',
  },
  previewButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
});
