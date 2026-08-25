import { Pressable, StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface GuideInfoButtonProps {
  onPress: () => void;
  /** Optional accessible label override. */
  label?: string;
}

/**
 * Small circular `i` (information) affordance used to reopen a page's guide
 * at any time. Drop it into any page that renders a `GuideModal`.
 */
export default function GuideInfoButton({
  onPress,
  label = 'Open guide',
}: GuideInfoButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.button}
    >
      <View style={styles.circle}>
        <MaterialIcons name="info" size={22} color="#d8ecff" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
