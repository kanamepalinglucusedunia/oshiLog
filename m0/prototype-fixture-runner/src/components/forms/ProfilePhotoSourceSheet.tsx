import { View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useTheme } from '@/hooks/useTheme';

export interface ProfilePhotoSourceSheetProps {
  visible: boolean;
  onClose: () => void;
  onLocal: () => void;
  onSocial: () => void;
}

export function ProfilePhotoSourceSheet({ visible, onClose, onLocal, onSocial }: ProfilePhotoSourceSheetProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} onClose={onClose} title="Choose photo source">
      <View style={{ gap: theme.spacing.sm }}>
        <AppText size="small" muted>The photo will be copied into oshiLog for offline use.</AppText>
        <Button label="Upload from device" variant="secondary" onPress={onLocal} />
        <Button label="Import from social media" onPress={onSocial} />
      </View>
    </Modal>
  );
}
