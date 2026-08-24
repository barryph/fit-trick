import { StyleSheet, View, type ViewProps } from 'react-native';
import ActivityBackground from '@/components/backgrounds/activity-background';

interface IProps extends ViewProps { }

export default function ListItemShell({ style, children }: IProps) {
  return (
    <View style={[styles.activityWrapper, style]}>
      <ActivityBackground />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  activityWrapper: {
    width: '100%',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,.1)',
    borderRadius: 20,
    boxShadow: '0 14px 35px rgba(0,0,0,.22)',
    overflow: 'hidden',
  },
});
