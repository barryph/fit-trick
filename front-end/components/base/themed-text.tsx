import { StyleSheet, Text, type TextProps } from 'react-native';
// import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?:
    | 'default'
    | 'defaultSmall'
    | 'title'
    | 'defaultSemiBold'
    | 'defaultBold'
    | 'subtitle'
    | 'link';
  weight?: '400' | '600' | '700';
  size?: 'extraSmall' | 'small' | 'regular' | 'medium' | 'large' | 'title';
  font?: 'system';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  weight,
  size,
  font,
  ...rest
}: ThemedTextProps) {
  // const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  const color = '#fff';

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'defaultSmall' ? styles.defaultSmall : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'defaultBold' ? styles.defaultBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        weight === '400' ? styles.weightRegular : undefined,
        weight === '600' ? styles.weightSemiBold : undefined,
        weight === '700' ? styles.weightBold : undefined,
        size === 'extraSmall' ? styles.sizeExtraSmall : undefined,
        size === 'small' ? styles.sizeSmall : undefined,
        size === 'regular' ? styles.sizeRegular : undefined,
        size === 'medium' ? styles.sizeMedium : undefined,
        size === 'large' ? styles.sizeLarge : undefined,
        size === 'title' ? styles.sizeTitle : undefined,
        font === 'system' ? styles.fontSystem : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const baseStyles = {
  fontFamily: 'IBMPlexMono_400Regular',
};

const styles = StyleSheet.create({
  default: {
    ...baseStyles,
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSmall: {
    ...baseStyles,
    fontSize: 14,
    lineHeight: 20,
  },
  defaultSemiBold: {
    ...baseStyles,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'IBMPlexMono_600SemiBold',
  },
  defaultBold: {
    ...baseStyles,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'IBMPlexMono_700Bold',
  },
  title: {
    ...baseStyles,
    fontSize: 32,
    fontFamily: 'IBMPlexMono_700Bold',
    lineHeight: 38,
  },
  subtitle: {
    ...baseStyles,
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    ...baseStyles,
    lineHeight: 30,
    fontSize: 16,
    color: '#0a7ea4',
  },
  weightRegular: {
    fontFamily: 'IBMPlexMono_400Regular',
  },
  weightSemiBold: {
    fontFamily: 'IBMPlexMono_600SemiBold',
  },
  weightBold: {
    fontFamily: 'IBMPlexMono_700Bold',
  },
  sizeExtraSmall: {
    fontSize: 12,
  },
  sizeSmall: {
    fontSize: 14,
  },
  sizeRegular: {
    fontSize: 16,
  },
  sizeMedium: {
    fontSize: 24,
    lineHeight: 29,
  },
  sizeLarge: {
    fontSize: 28,
    lineHeight: 33,
  },
  sizeTitle: {
    fontSize: 32,
    lineHeight: 37,
  },
  fontSystem: {
    fontFamily: '"system-ui"',
  },
});
