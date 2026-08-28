import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal as NativeModal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Chip } from '@/components/ui/Chip';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { CountryFlag } from '@/components/ui/CountryFlag';
import { Dropdown } from '@/components/ui/Dropdown';
import { Icon } from '@/components/ui/Icon';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore } from '@/stores/settingsStore';
import { readDataAtVersion, useUiStore } from '@/stores/uiStore';
import { getDb } from '@/db';
import { createRegionRepo } from '@/repositories/region';
import { COUNTRIES, type CountryCode } from '@/types/domain';
import { generatePrimaryScale } from '@/design-system/colors';
import { RADIUS } from '@/design-system/theme';
import { getModalRelativeAnchor, type OverlayFrame } from '@/components/forms/dropdownOverlay';

type AnchorField = 'country' | 'region';

const VIEWPORT_MARGIN = 8;
const PANEL_MAX_HEIGHT = 320;
const OPTION_ROW_HEIGHT = 36; // body line-height (20) + 8px vertical padding
const PANEL_VERTICAL_PADDING = 16; // 8px top + 8px bottom
const ADD_REGION_ROW_HEIGHT = 34; // separator margin + padded "New Region" row
const EMPTY_STATE_HEIGHT = 48;

export interface CountryRegionFieldsProps {
  country: CountryCode | null;
  region: string;
  onCountryChange: (country: CountryCode) => void;
  onRegionChange: (region: string) => void;
  countryLabel?: string;
  regionLabel?: string;
  labelWeight?: 'light' | 'regular' | 'semibold' | 'bold';
  countryPlaceholder?: string;
  regionPlaceholder?: string;
  countryError?: string | null;
  regionError?: string | null;
  layout?: 'vertical' | 'row';
}

export function CountryRegionFields({
  country,
  region,
  onCountryChange,
  onRegionChange,
  countryLabel = 'Country *',
  regionLabel = 'Region',
  labelWeight = 'semibold',
  countryPlaceholder = 'Country',
  regionPlaceholder = 'Region',
  countryError,
  regionError,
  layout = 'vertical',
}: CountryRegionFieldsProps) {
  const theme = useTheme();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const countries = useSettingsStore((s) => s.countries);
  const accentColor = useSettingsStore((s) => s.settings?.accentColor ?? '#7F6EB5');
  const accentP50 = useMemo(() => generatePrimaryScale(accentColor).P50, [accentColor]);
  const activeCountries = useMemo(() => countries.filter((c) => c.isActive).map((c) => c.country), [countries]);

  const [countryOpen, setCountryOpen] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const [addRegionModal, setAddRegionModal] = useState(false);
  const dataVersion = useUiStore((s) => s.dataVersion);
  const [addCountry, setAddCountry] = useState<CountryCode>(country ?? activeCountries[0] ?? 'JP');
  const [addName, setAddName] = useState('');
  const countryAnchorRef = useRef<View>(null);
  const regionAnchorRef = useRef<View>(null);
  const overlayRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<OverlayFrame | null>(null);
  const [overlayFrame, setOverlayFrame] = useState<OverlayFrame | null>(null);

  const regions = useMemo(() => {
    return readDataAtVersion(dataVersion, () => {
      const repo = createRegionRepo(getDb());
      if (country) return repo.listRegions(country);
      const active = activeCountries.length > 0 ? activeCountries : COUNTRIES.map((c) => c.code);
      return repo.listRegions().filter((r) => active.includes(r.country));
    });
  }, [country, activeCountries, dataVersion]);

  useEffect(() => {
    if (region.trim() && country) {
      createRegionRepo(getDb()).ensureRegion({ country, name: region.trim() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  const filteredCountries = useMemo(() => {
    return activeCountries.length > 0 ? COUNTRIES.filter((c) => activeCountries.includes(c.code)) : [...COUNTRIES];
  }, [activeCountries]);

  const measureAnchor = useCallback((field: AnchorField) => {
    const ref = field === 'country' ? countryAnchorRef : regionAnchorRef;
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) setAnchor({ x, y, width, height });
    });
  }, []);

  const measureOverlay = useCallback(() => {
    overlayRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      setOverlayFrame((previous) => (
        previous && previous.x === x && previous.y === y && previous.width === width && previous.height === height
          ? previous
          : { x, y, width, height }
      ));
    });
  }, []);

  const open = countryOpen || regionOpen;

  useEffect(() => {
    const field: AnchorField | null = countryOpen ? 'country' : regionOpen ? 'region' : null;
    if (!field) return undefined;
    const frame = requestAnimationFrame(() => {
      measureAnchor(field);
      measureOverlay();
    });
    return () => cancelAnimationFrame(frame);
  }, [countryOpen, regionOpen, measureAnchor, measureOverlay]);

  const closePanels = useCallback(() => {
    setCountryOpen(false);
    setRegionOpen(false);
  }, []);

  const nameFor = (code: CountryCode) => {
    return COUNTRIES.find((x) => x.code === code)?.name ?? code;
  };

  const pickCountry = (code: CountryCode) => {
    onCountryChange(code);
    if (region) onRegionChange('');
    closePanels();
  };

  const pickRegion = (r: { country: CountryCode; name: string }) => {
    onRegionChange(r.name);
    onCountryChange(r.country);
    closePanels();
  };

  const openCountry = () => {
    setRegionOpen(false);
    setCountryOpen(true);
    measureAnchor('country');
  };

  const openRegion = () => {
    setCountryOpen(false);
    setRegionOpen(true);
    measureAnchor('region');
  };

  const openAddRegion = () => {
    closePanels();
    setAddCountry(country ?? activeCountries[0] ?? 'JP');
    setAddName('');
    setAddRegionModal(true);
  };

  const saveNewRegion = () => {
    const name = addName.trim();
    if (!name) return;
    const saved = createRegionRepo(getDb()).ensureRegion({ country: addCountry, name });
    onRegionChange(saved.name);
    onCountryChange(saved.country);
    setAddRegionModal(false);
    setAddName('');
  };

  const itemSelected = (active: boolean) =>
    active ? { backgroundColor: accentP50 } : null;

  // Portal geometry (same approach as GroupPickerDropdown): the option panel
  // renders in a root-level transparent modal anchored to the field, so cards,
  // buttons and elevated siblings can never paint over it.
  // measureInWindow returns screen coordinates while a translucent Android
  // Modal can have a non-zero window origin. Convert the anchor before using
  // it so physical devices with a status/navigation inset place the panel at
  // the trigger instead of applying the inset twice.
  const modalAnchor = anchor ? getModalRelativeAnchor(anchor, overlayFrame) : null;
  const overlayWidth = overlayFrame?.width ?? viewportWidth;
  const overlayHeight = overlayFrame?.height ?? viewportHeight;
  const spaceBelow = modalAnchor
    ? overlayHeight - modalAnchor.y - modalAnchor.height - VIEWPORT_MARGIN
    : overlayHeight - VIEWPORT_MARGIN * 2;
  const spaceAbove = modalAnchor ? modalAnchor.y - VIEWPORT_MARGIN : 0;
  const optionCount = regionOpen ? regions.length : filteredCountries.length;
  const contentHeight =
    PANEL_VERTICAL_PADDING +
    optionCount * OPTION_ROW_HEIGHT +
    (regionOpen ? ADD_REGION_ROW_HEIGHT + (regions.length === 0 ? EMPTY_STATE_HEIGHT : 0) : 0);
  const desiredHeight = Math.min(contentHeight, PANEL_MAX_HEIGHT);
  const opensBelow = !anchor || spaceBelow >= desiredHeight || spaceBelow >= spaceAbove;
  const panelHeight = Math.max(1, Math.min(desiredHeight, opensBelow ? spaceBelow : spaceAbove));
  const panelTop = modalAnchor
    ? opensBelow
      ? modalAnchor.y + modalAnchor.height - theme.surface.borderWidth
      : Math.max(VIEWPORT_MARGIN, modalAnchor.y - panelHeight + theme.surface.borderWidth)
    : Math.max(VIEWPORT_MARGIN, (overlayHeight - panelHeight) / 2);
  const panelWidth = Math.min(
    modalAnchor?.width ?? overlayWidth - VIEWPORT_MARGIN * 4,
    overlayWidth - VIEWPORT_MARGIN * 2,
  );
  const panelLeft = Math.min(
    Math.max(modalAnchor?.x ?? VIEWPORT_MARGIN * 2, VIEWPORT_MARGIN),
    Math.max(VIEWPORT_MARGIN, overlayWidth - panelWidth - VIEWPORT_MARGIN),
  );
  const panelRadiusStyle = opensBelow
    ? { borderBottomLeftRadius: theme.radius.md, borderBottomRightRadius: theme.radius.md }
    : { borderTopLeftRadius: theme.radius.md, borderTopRightRadius: theme.radius.md };

  const countryOptions = filteredCountries.map((c) => (
    <Pressable
      key={c.code}
      accessibilityRole="button"
      onPress={() => pickCountry(c.code)}
      style={[styles.item, itemSelected(country === c.code)]}
    >
      <CountryFlag country={c.code} width={18} />
      <AppText size="body" style={styles.itemLabel} numberOfLines={1}>
        {c.name}
      </AppText>
    </Pressable>
  ));

  const regionOptions = regions.map((r) => (
    <Pressable
      key={r.id}
      accessibilityRole="button"
      onPress={() => pickRegion(r)}
      style={[
        styles.item,
        itemSelected(region.toLowerCase() === r.name.toLowerCase() && country === r.country),
      ]}
    >
      <AppText size="body" style={styles.itemLabel} numberOfLines={1}>
        {r.name}
      </AppText>
      {!country ? (
        <View style={styles.itemCountry}>
          <CountryFlag country={r.country} width={14} />
          <AppText size="xs" muted>{nameFor(r.country)}</AppText>
        </View>
      ) : null}
    </Pressable>
  ));

  const countryDropdown = (
    <View ref={countryAnchorRef} collapsable={false} style={layout === 'row' ? styles.pill : undefined}>
      <Dropdown
        label={countryLabel}
        labelWeight={labelWeight}
        value={country ? nameFor(country) : null}
        placeholder={countryPlaceholder}
        leadingIcon="globe"
        open={countryOpen}
        openDirection={opensBelow ? 'down' : 'up'}
        onToggle={countryOpen ? closePanels : openCountry}
        accessibilityLabel={countryLabel}
        error={countryError}
        renderOptionsInline={false}
      >
        {null}
      </Dropdown>
    </View>
  );

  const regionDropdown = (
    <View ref={regionAnchorRef} collapsable={false} style={layout === 'row' ? styles.pill : undefined}>
      <Dropdown
        label={regionLabel}
        labelWeight={labelWeight}
        value={region || null}
        placeholder={regionPlaceholder}
        leadingIcon="locationMarker"
        open={regionOpen}
        openDirection={opensBelow ? 'down' : 'up'}
        onToggle={regionOpen ? closePanels : openRegion}
        accessibilityLabel={regionLabel}
        error={regionError}
        renderOptionsInline={false}
      >
        {null}
      </Dropdown>
    </View>
  );

  return (
    <>
      {layout === 'row' ? (
        <View style={styles.pillRow}>
          {countryDropdown}
          {regionDropdown}
        </View>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {countryDropdown}
          {regionDropdown}
        </View>
      )}

      <NativeModal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={closePanels}
      >
        <View
          ref={overlayRef}
          collapsable={false}
          onLayout={measureOverlay}
          style={styles.overlay}
          accessibilityViewIsModal
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close options"
            onPress={closePanels}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.panel,
              panelRadiusStyle,
              {
                top: panelTop,
                left: panelLeft,
                width: panelWidth,
                height: panelHeight,
                backgroundColor: theme.color.surface,
                borderColor: theme.surface.borderColor,
                borderWidth: theme.surface.borderWidth,
              },
            ]}
          >
            <ScrollView bounces={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {regionOpen ? regionOptions : countryOptions}
              {regionOpen && regions.length === 0 ? (
                <AppText size="small" muted style={styles.empty}>No regions yet.</AppText>
              ) : null}
            </ScrollView>
            {regionOpen ? (
              <Pressable
                accessibilityRole="button"
                onPress={openAddRegion}
                style={[styles.addRegionRow, { borderTopColor: theme.color.borderLight }]}
              >
                <Icon name="plusCircle" size={20} color={theme.color.accent} strokeWidth={1} />
                <AppText weight="light" size="body" color={theme.color.accent}>New Region</AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
      </NativeModal>

      <Modal visible={addRegionModal} onClose={() => setAddRegionModal(false)} title="New Region">
        {country ? (
          <AppText size="small" muted style={{ marginBottom: 12 }}>
            Will be added to {nameFor(country)}.
          </AppText>
        ) : (
          <>
            <AppText weight="semibold" size="small" style={{ marginBottom: 8 }}>Country *</AppText>
            <View style={styles.chips}>
              {(activeCountries.length > 0 ? COUNTRIES.filter((c) => activeCountries.includes(c.code)) : COUNTRIES).map((c) => (
                <Chip
                  key={c.code}
                  label={c.name}
                  leading={<CountryFlag country={c.code} width={18} />}
                  selected={addCountry === c.code}
                  onPress={() => setAddCountry(c.code)}
                  style={{ marginBottom: 8 }}
                />
              ))}
            </View>
          </>
        )}
        <Field label="Region name *" value={addName} onChangeText={setAddName} placeholder="e.g. Sendai" />
        <Button label="Add & Select" style={{ marginTop: 16 }} disabled={addName.trim().length === 0} onPress={saveNewRegion} />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  panel: {
    position: 'absolute',
    padding: 8,
    overflow: 'hidden',
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    width: '100%',
  },
  pill: {
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
  },
  itemLabel: {
    flex: 1,
  },
  itemCountry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addRegionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    paddingVertical: 16,
    textAlign: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
