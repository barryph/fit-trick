import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/base/themed-text';

interface GuideMediaIconProps {
  /** Icon shown in the center of the preview box. */
  icon: React.ReactNode;
  /** Accessible label describing the preview. */
  label: string;
  /** Accent color used for the tinted background/border. */
  accent?: string;
}

/**
 * Default visual used by a guide step when no real art/animation exists yet.
 * Renders the interaction's icon inside a tinted "preview" panel so each step
 * still reads clearly while there is no animated asset to show.
 *
 * Swap it for an animated GIF/video by passing a different `media` on your
 * step instead of this component.
 */
export default function GuideMediaIcon({
  icon,
  label,
  accent = '#087cff',
}: GuideMediaIconProps) {
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="image"
      style={[
        styles.preview,
        {
          backgroundColor: `${accent}1a`,
          borderColor: `${accent}4d`,
        },
      ]}
    >
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: `${accent}22`,
          },
        ]}
      >
        {icon}
      </View>
      <ThemedText size="extraSmall" style={styles.caption}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    alignSelf: 'center',
    width: 124,
    height: 74,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  caption: {
    fontSize: 11,
    lineHeight: 14,
    color: '#fff',
    marginTop: 2,
    letterSpacing: -0.2,
  },
});
