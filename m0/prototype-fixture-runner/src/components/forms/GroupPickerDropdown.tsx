import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Modal as NativeModal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@/components/ui/AppText';
import { Dropdown } from '@/components/ui/Dropdown';
import { Icon } from '@/components/ui/Icon';
import { TYPOGRAPHY } from '@/design-system/typography';
import { COUNTRIES, type Group } from '@/types/domain';
import { useTheme } from '@/hooks/useTheme';
import { getModalRelativeAnchor, type OverlayFrame } from '@/components/forms/dropdownOverlay';

interface GroupPickerDropdownProps {
  groups: Group[];
  groupPhotoUris: ReadonlyMap<string, string>;
  selectedGroupId: string | null;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (groupId: string | null) => void;
}

const VIEWPORT_MARGIN = 8;
const PANEL_MAX_HEIGHT = 320;
const PANEL_MIN_HEIGHT = 180;

export type GroupPickerPanelSection = 'search' | 'list' | 'newGroup';

export function getGroupPickerPanelOrder(opensBelow: boolean): GroupPickerPanelSection[] {
  return opensBelow ? ['search', 'list', 'newGroup'] : ['newGroup', 'list', 'search'];
}

export function getGroupPickerPanelBorderStyle(
  opensBelow: boolean,
  radius: number,
  borderWidth: number,
) {
  return {
    borderTopLeftRadius: opensBelow ? 0 : radius,
    borderTopRightRadius: opensBelow ? 0 : radius,
    borderBottomLeftRadius: opensBelow ? radius : 0,
    borderBottomRightRadius: opensBelow ? radius : 0,
    borderTopWidth: opensBelow ? 0 : borderWidth,
    borderBottomWidth: opensBelow ? borderWidth : 0,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function GroupPickerDropdown({
  groups,
  groupPhotoUris,
  selectedGroupId,
  open,
  onToggle,
  onClose,
  onSelect,
}: GroupPickerDropdownProps) {
  const theme = useTheme();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const anchorRef = useRef<View>(null);
  const overlayRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<OverlayFrame | null>(null);
  const [overlayFrame, setOverlayFrame] = useState<OverlayFrame | null>(null);
  const [query, setQuery] = useState('');
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return groups;
    return groups.filter((group) => {
      const country = COUNTRIES.find((item) => item.code === group.country)?.name ?? group.country;
      return [group.name, country, group.region ?? ''].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [groups, query]);

  const measureAnchor = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
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

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      measureAnchor();
      measureOverlay();
    });
    return () => cancelAnimationFrame(frame);
  }, [measureAnchor, measureOverlay, open]);

  const close = useCallback(() => {
    Keyboard.dismiss();
    setQuery('');
    onClose();
  }, [onClose]);

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    measureAnchor();
    onToggle();
  };

  const select = (groupId: string | null) => {
    onSelect(groupId);
    close();
  };

  const modalAnchor = anchor ? getModalRelativeAnchor(anchor, overlayFrame) : null;
  const overlayWidth = overlayFrame?.width ?? viewportWidth;
  const overlayHeight = overlayFrame?.height ?? viewportHeight;
  const fallbackWidth = Math.max(0, overlayWidth - VIEWPORT_MARGIN * 4);
  const panelWidth = clamp(modalAnchor?.width ?? fallbackWidth, 0, overlayWidth - VIEWPORT_MARGIN * 2);
  const panelLeft = clamp(
    modalAnchor?.x ?? VIEWPORT_MARGIN * 2,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, overlayWidth - panelWidth - VIEWPORT_MARGIN),
  );
  const spaceBelow = modalAnchor
    ? overlayHeight - modalAnchor.y - modalAnchor.height - VIEWPORT_MARGIN
    : overlayHeight - VIEWPORT_MARGIN * 2;
  const spaceAbove = modalAnchor ? modalAnchor.y - VIEWPORT_MARGIN : 0;
  const opensBelow = !anchor || spaceBelow >= PANEL_MIN_HEIGHT || spaceBelow >= spaceAbove;
  const availableHeight = opensBelow ? spaceBelow : spaceAbove;
  const panelHeight = Math.min(PANEL_MAX_HEIGHT, Math.max(PANEL_MIN_HEIGHT, availableHeight));
  const panelTop = modalAnchor
    ? opensBelow
      ? modalAnchor.y + modalAnchor.height
      : Math.max(VIEWPORT_MARGIN, modalAnchor.y - panelHeight)
    : Math.max(VIEWPORT_MARGIN, (overlayHeight - panelHeight) / 2);
  const panelBorderStyle = getGroupPickerPanelBorderStyle(opensBelow, theme.radius.md, theme.surface.borderWidth);

  const renderGroup = ({ item: group }: { item: Group }) => {
    const country = COUNTRIES.find((item) => item.code === group.country)?.name ?? group.country;
    const photoUri = groupPhotoUris.get(group.photoMediaId ?? '');
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Select group ${group.name}`}
        accessibilityState={{ selected: selectedGroupId === group.id }}
        onPress={() => select(group.id)}
        style={[
          styles.groupOption,
          { borderRadius: theme.radius.md },
          selectedGroupId === group.id ? { backgroundColor: theme.color.accentSurface } : null,
        ]}
      >
        <View
          style={[
            styles.groupOptionAvatar,
            {
              borderColor: theme.surface.borderColor,
              borderWidth: theme.surface.borderWidth,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.color.surfaceMuted,
            },
          ]}
        >
          {photoUri ? (
            <Image
              source={{ uri: photoUri }}
              style={styles.groupOptionAvatarImage}
              contentFit="cover"
              recyclingKey={group.photoMediaId ?? group.id}
            />
          ) : (
            <Icon name="userGroup" size={24} color={theme.color.accent} strokeWidth={1} />
          )}
        </View>
        <View style={styles.groupOptionDetails}>
          <AppText size="body" weight="regular" numberOfLines={1}>
            {group.name}
          </AppText>
          <View style={styles.groupOptionMeta}>
            <AppText size="small" weight="light" color={theme.color.accent} numberOfLines={1}>
              {country}
            </AppText>
            {group.region ? (
              <>
                <View style={[styles.groupOptionMetaDivider, { backgroundColor: theme.color.accent }]} />
                <AppText size="small" weight="light" color={theme.color.accent} numberOfLines={1}>
                  {group.region}
                </AppText>
              </>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <>
      <View ref={anchorRef} collapsable={false} onLayout={measureAnchor}>
        <Dropdown
          value={selectedGroup?.name ?? null}
          placeholder="Select Group"
          leadingIcon="userGroup"
          open={open}
          openDirection={opensBelow ? 'down' : 'up'}
          onToggle={toggle}
          accessibilityLabel="Group"
          openBorderColor={theme.surface.borderColor}
          openPlaceholderColor={theme.color.textMuted}
          fieldPaddingRight={16}
          renderOptionsInline={false}
        >
          {null}
        </Dropdown>
      </View>

      <NativeModal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={close}
      >
        <View
          ref={overlayRef}
          collapsable={false}
          onLayout={measureOverlay}
          testID="group-picker-overlay"
          accessibilityViewIsModal
          style={styles.overlay}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close group picker"
            onPress={close}
            style={StyleSheet.absoluteFill}
          />
          <View
            testID="group-picker-panel"
            style={[
              styles.panel,
              {
                top: panelTop,
                left: panelLeft,
                width: panelWidth,
                height: panelHeight,
                backgroundColor: theme.color.surface,
                borderColor: theme.surface.borderColor,
                borderWidth: theme.surface.borderWidth,
                ...panelBorderStyle,
                shadowColor: theme.surface.shadowColor,
                shadowOpacity: theme.surface.style === 'soft-shadow' ? theme.surface.shadowOpacity : 0,
                shadowRadius: theme.surface.shadowRadius,
                elevation: theme.surface.style === 'soft-shadow' ? theme.surface.elevation : 0,
              },
            ]}
          >
            {getGroupPickerPanelOrder(opensBelow).map((section) => (
              <Fragment key={section}>
                {section === 'search' ? (
                  <View
                    testID="group-picker-search"
                    style={[
                      styles.search,
                      {
                        borderColor: theme.surface.borderColor,
                        borderWidth: theme.surface.borderWidth,
                        borderRadius: theme.radius.sm,
                        marginBottom: opensBelow ? 8 : 0,
                        marginTop: opensBelow ? 0 : 8,
                      },
                    ]}
                  >
                    <Icon name="search" size={16} color={theme.color.text} strokeWidth={1} />
                    <TextInput
                      accessibilityLabel="Search groups"
                      placeholder="Search"
                      placeholderTextColor={theme.color.textMuted}
                      value={query}
                      onChangeText={setQuery}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[styles.searchInput, { color: theme.color.text }]}
                    />
                  </View>
                ) : section === 'list' ? (
                  <FlatList
                    testID="group-picker-list"
                    style={styles.list}
                    data={filteredGroups}
                    keyExtractor={(group) => group.id}
                    renderItem={renderGroup}
                    scrollEnabled
                    nestedScrollEnabled={false}
                    bounces={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    onScrollBeginDrag={Keyboard.dismiss}
                    showsVerticalScrollIndicator
                    initialNumToRender={8}
                    windowSize={5}
                    ListHeaderComponent={(
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Select group Solo"
                        onPress={() => select(null)}
                        style={styles.soloOption}
                      >
                        <AppText size="body" weight="regular">Solo</AppText>
                      </Pressable>
                    )}
                    ListEmptyComponent={(
                      <AppText size="small" muted style={styles.emptyOption}>No groups found</AppText>
                    )}
                  />
                ) : (
                  <Pressable
                    testID="new-group-option"
                    accessibilityRole="button"
                    accessibilityLabel="New Group"
                    onPress={close}
                    style={[
                      styles.newGroupOption,
                      {
                        borderColor: theme.surface.borderColor,
                        borderTopWidth: opensBelow ? theme.surface.borderWidth : 0,
                        borderBottomWidth: opensBelow ? 0 : theme.surface.borderWidth,
                        marginTop: opensBelow ? 8 : 0,
                        marginBottom: opensBelow ? 0 : 8,
                      },
                    ]}
                  >
                    <Icon name="plusCircle" size={20} color={theme.color.accent} strokeWidth={1} />
                    <AppText size="body" weight="light" color={theme.color.accent}>New Group</AppText>
                  </Pressable>
                )}
              </Fragment>
            ))}
          </View>
        </View>
      </NativeModal>
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
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 8,
    gap: 4,
    marginBottom: 4,
  },
  searchInput: {
    flex: 1,
    height: 30,
    paddingVertical: 0,
    ...TYPOGRAPHY.regular.small,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  soloOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  groupOption: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  groupOptionAvatar: {
    width: 40,
    height: 40,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupOptionAvatarImage: {
    width: '100%',
    height: '100%',
  },
  groupOptionDetails: {
    flex: 1,
    minWidth: 0,
  },
  groupOptionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupOptionMetaDivider: {
    width: 1,
    height: 14,
  },
  emptyOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  newGroupOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
    minHeight: 41,
  },
});
