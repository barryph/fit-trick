import { Colors } from '@/constants/theme';
import { ThemedText } from '@/components/base/themed-text';

export default function Logo() {
  return (
    <ThemedText
      type="defaultBold"
      style={{
        color: '#fff',
        fontSize: 24,
      }}
    >
      Kad
      <ThemedText
        type="defaultBold"
        style={{
          color: Colors.light.faint,
          fontSize: 24,
        }}
      >
        ence
      </ThemedText>
    </ThemedText>
  );
}
