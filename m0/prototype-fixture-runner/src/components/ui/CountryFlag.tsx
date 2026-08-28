import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/hooks/useTheme';
import type { CountryCode } from '@/types/domain';

// Flag image assets exported from Figma node 96:6336 (Country Flag component set).
const FLAG_SOURCES: Partial<Record<CountryCode | 'CN', number>> = {
  CN: require('../../../assets/flags/china.png'),
  ID: require('../../../assets/flags/indonesia.png'),
  JP: require('../../../assets/flags/japan.png'),
  KR: require('../../../assets/flags/south-korea.png'),
  TH: require('../../../assets/flags/thailand.png'),
  MY: require('../../../assets/flags/malaysia.png'),
};

export interface CountryFlagProps {
  country: CountryCode | 'CN';
  /** Width of the flag; height is always width * (2/3). Defaults to 30. */
  width?: number;
}

export function CountryFlag({ country, width = 30 }: CountryFlagProps) {
  const theme = useTheme();
  const height = Math.round(width * (2 / 3));
  const source = FLAG_SOURCES[country];
  if (!source) return null;
  return (
    <View
      style={[
        styles.container,
        {
          width,
          height,
          borderColor: theme.surface.borderColor,
          borderWidth: theme.surface.borderWidth,
        },
      ]}
    >
      <Image source={source} style={styles.image} contentFit="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 4,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
