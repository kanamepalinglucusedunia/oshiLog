import { Linking, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { useTheme } from '@/hooks/useTheme';

export interface LocationDataAttributionProps {
  style?: StyleProp<ViewStyle>;
}

export function LocationDataAttribution({ style }: LocationDataAttributionProps) {
  const theme = useTheme();
  return (
    <View style={[{ gap: theme.spacing.xs }, style]}>
      <Pressable accessibilityRole="link" accessibilityLabel="Powered by Geoapify" onPress={() => void Linking.openURL('https://www.geoapify.com/')}>
        <AppText size="xs" muted>Powered by Geoapify</AppText>
      </Pressable>
      <Pressable accessibilityRole="link" accessibilityLabel="OpenStreetMap contributors" onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}>
        <AppText size="xs" muted>OpenStreetMap contributors</AppText>
      </Pressable>
    </View>
  );
}
