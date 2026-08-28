import { useEffect, useRef } from 'react';
import { Keyboard, Modal as RNModal, Platform, Pressable, View, StyleSheet, ScrollView } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '@/hooks/useTheme';

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  variant?: 'default' | 'datePicker';
  children: React.ReactNode;
}

export function Modal({ visible, onClose, title, variant = 'default', children }: ModalProps) {
  const theme = useTheme();
  const wasVisible = useRef(visible);
  const isDatePicker = variant === 'datePicker';

  useEffect(() => {
    if (visible || wasVisible.current) Keyboard.dismiss();
    wasVisible.current = visible;
  }, [visible]);

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={[styles.backdrop, isDatePicker && styles.datePickerBackdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View
          testID="popup-modal"
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: theme.color.surface,
              borderRadius: theme.radius.lg,
              borderWidth: theme.surface.borderWidth,
              borderColor: theme.surface.borderColor,
              shadowColor: theme.surface.shadowColor,
              shadowOpacity: theme.surface.shadowOpacity,
              shadowRadius: theme.surface.shadowRadius,
              shadowOffset: { width: 0, height: 2 },
              elevation: theme.surface.elevation,
              padding: isDatePicker ? undefined : theme.spacing.lg,
              paddingTop: isDatePicker ? 8 : undefined,
              paddingHorizontal: isDatePicker ? 16 : undefined,
              paddingBottom: isDatePicker ? 16 : undefined,
              maxHeight: '80%',
            },
          ]}
        >
          {title ? (
            <View style={styles.header}>
              <AppText weight="bold" size="large">
                {title}
              </AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={handleClose} hitSlop={12}>
                <AppText muted size="body">×</AppText>
              </Pressable>
            </View>
          ) : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            scrollsChildToFocus
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  datePickerBackdrop: {
    padding: 16,
  },
  sheet: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
});
