import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { View, StyleSheet, Pressable, LayoutAnimation } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs, Redirect, useRouter } from 'expo-router';
import { NavbarPill, NAVBAR_WIDTH } from '@/components/ui/NavbarPill';
import { SpeedDial, type SpeedDialAction } from '@/components/ui/SpeedDial';
import { IdolFormBottomSheet } from '@/components/forms/IdolForm';
import { GroupFormBottomSheet, createOrUpdateGroup } from '@/components/forms/GroupForm';
import { TripFormBottomSheet, createOrUpdateTrip } from '@/components/forms/TripForm';
import { VenueFormBottomSheet, createOrUpdateVenue } from '@/components/forms/VenueForm';
import { useTabPagerStore } from '@/stores/tabPagerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useFormSheetStore, type OpenFormKind } from '@/stores/formSheetStore';

const TAB_ROUTE_ORDER = ['index', 'idols', 'events', 'venues', 'trips']; // syncs with NavbarPill.NAV_ITEMS

function animatePillLayout() {
  LayoutAnimation.configureNext({
    duration: 240,
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  });
}

interface PillTabBarProps {
  state: { routes: { name: string; params?: object }[]; index: number };
  navigation: { navigate: (name: string, params?: object) => void };
}

/** Tabs that open the event form directly from the FAB (no speed dial). */
const DIRECT_ACTION_TABS = new Set(['index', 'events']);

export function buildActions(
  routeName: string,
  openForm: (kind: Exclude<OpenFormKind, null>) => void,
  openEvent: () => void,
): SpeedDialAction[] {
  const event: SpeedDialAction = { label: 'New Event', icon: 'calendar', onPress: openEvent };
  switch (routeName) {
    case 'idols':
      return [
        { label: 'New Idol', icon: 'star', onPress: () => openForm('idol') },
        { label: 'New Group', icon: 'userGroup', onPress: () => openForm('group') },
        event,
      ];
    case 'venues':
      return [{ label: 'New Venue', icon: 'buildingOffice', onPress: () => openForm('venue') }, event];
    case 'trips':
      return [{ label: 'New Trip', icon: 'plane', onPress: () => openForm('trip') }, event];
    default:
      return [event];
  }
}

function PillTabBar(props: PillTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [dialOpen, setDialOpen] = useState(false);
  const requestOpenForm = useFormSheetStore((s) => s.requestOpenForm);

  const activeRoute = props.state.routes[props.state.index]?.name ?? 'index';
  const activeIndex = TAB_ROUTE_ORDER.indexOf(activeRoute);
  const setFocusedIndex = useTabPagerStore((s) => s.setFocusedIndex);

  useEffect(() => {
    setFocusedIndex(activeIndex);
  }, [activeIndex, setFocusedIndex]);

  const openEvent = () => {
    setDialOpen(false);
    router.push('/event/new');
  };

  const openForm = (kind: Exclude<OpenFormKind, null>) => {
    setDialOpen(false);
    requestOpenForm(kind);
  };

  const navigate = (routeName: string) => {
    const route = props.state.routes.find((r) => r.name === routeName);
    setDialOpen(false);
    if (route) {
      animatePillLayout();
      props.navigation.navigate(routeName, route.params);
    }
  };

  const handleFabPress = () => {
    if (DIRECT_ACTION_TABS.has(activeRoute)) {
      openEvent();
      return;
    }
    setDialOpen((v) => !v);
  };

  return (
    <>
      {dialOpen ? <Pressable style={styles.scrim} accessibilityLabel="Close quick actions" onPress={() => setDialOpen(false)} /> : null}
      <View style={[styles.stack, { bottom: Math.max(insets.bottom, 16) }]} pointerEvents="box-none">
        <View style={styles.column}>
          {dialOpen ? <SpeedDial actions={buildActions(activeRoute, openForm, openEvent)} /> : null}
          <NavbarPill activeRoute={activeRoute} onNavigate={navigate} onFabPress={handleFabPress} dialOpen={dialOpen} />
        </View>
      </View>
    </>
  );
}

function ActiveFormSheets() {
  return (
    <>
      <SheetHost kind="idol">
        {({ visible, onClose }) => (
          <IdolFormBottomSheet
            visible={visible}
            onClose={onClose}
          />
        )}
      </SheetHost>
      <SheetHost kind="group">
        {({ visible, onClose }) => (
          <GroupFormBottomSheet
            visible={visible}
            onClose={onClose}
            onSubmit={(values, photoMediaId) => {
              createOrUpdateGroup(values, photoMediaId);
            }}
          />
        )}
      </SheetHost>
      <SheetHost kind="trip">
        {({ visible, onClose }) => (
          <TripFormBottomSheet
            visible={visible}
            onClose={onClose}
            onSubmit={(values, countries) => {
              createOrUpdateTrip(values, countries);
            }}
          />
        )}
      </SheetHost>
      <SheetHost kind="venue">
        {({ visible, onClose }) => (
          <VenueFormBottomSheet
            visible={visible}
            onClose={onClose}
            onSubmit={(values) => {
              createOrUpdateVenue(values);
            }}
          />
        )}
      </SheetHost>
    </>
  );
}

/** Animation in ms the BottomSheet needs to slide down before unmounting. */
const SHEET_CLOSE_MS = 260;

/**
 * Hosts a single add-form bottom sheet. Keeps the sheet mounted during its
 * slide-down animation (visible=false) before clearing the store, so closing
 * animates instead of unmounting instantly. Remounts fresh on every open.
 */
function SheetHost({
  kind,
  children,
}: {
  kind: Exclude<OpenFormKind, null>;
  children: (props: { visible: boolean; onClose: () => void }) => ReactNode;
}) {
  const openForm = useFormSheetStore((s) => s.openForm);
  const closeOpenForm = useFormSheetStore((s) => s.closeOpenForm);
  const [closing, setClosing] = useState(false);

  const mounted = openForm === kind || closing;
  const visible = !closing && openForm === kind;

  const handleClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      closeOpenForm();
    }, SHEET_CLOSE_MS);
  }, [closing, closeOpenForm]);

  if (!mounted) return null;
  return <>{children({ visible, onClose: handleClose })}</>;
}

export default function TabsLayout() {
  const onboardingCompleted = useSettingsStore((s) => s.settings?.onboardingCompleted ?? false);

  if (!onboardingCompleted) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <>
      <Tabs
        detachInactiveScreens
        screenOptions={{
          headerShown: false,
          lazy: true,
          freezeOnBlur: true,
        }}
        tabBar={(props) => <PillTabBar {...props} />}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="idols" options={{ title: 'Idol' }} />
        <Tabs.Screen name="events" options={{ title: 'Event' }} />
        <Tabs.Screen name="venues" options={{ title: 'Venue' }} />
        <Tabs.Screen name="trips" options={{ title: 'Trip' }} />
      </Tabs>
      <ActiveFormSheets />
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 49,
  },
  stack: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  column: {
    width: NAVBAR_WIDTH,
    alignItems: 'flex-end',
    gap: 8,
  },
});
