import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button } from './Button';

export interface PrimaryButton2Props {
  onReset?: () => void;
  onSave: () => void;
  resetLabel?: string;
  saveLabel?: string;
  resetDisabled?: boolean;
  saveDisabled?: boolean;
  saveLoading?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Dual action button component (Reset / Save) as Primary Button 2.
 */
export function PrimaryButton2({
  onReset,
  onSave,
  resetLabel = 'Reset',
  saveLabel = 'Save',
  resetDisabled = false,
  saveDisabled = false,
  saveLoading = false,
  style,
}: PrimaryButton2Props) {
  return (
    <View style={[styles.container, style]}>
      {onReset ? (
        <Button
          label={resetLabel}
          variant="secondary"
          labelSize="body"
          labelWeight="regular"
          disabled={resetDisabled}
          style={styles.button}
          onPress={onReset}
        />
      ) : null}
      <Button
        label={saveLabel}
        variant="primary"
        labelSize="body"
        labelWeight="regular"
        disabled={saveDisabled}
        loading={saveLoading}
        style={styles.button}
        onPress={onSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    width: '100%',
  },
  button: {
    flex: 1,
    height: 36,
    minHeight: 36,
    paddingVertical: 0,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
