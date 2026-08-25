import { View } from 'react-native';

const NOOP = () => {};

const Animated = {
  View,
  ScrollView: View,
  createAnimatedComponent: (Component: typeof View) => Component,
};

module.exports = {
  __esModule: true,
  default: Animated,
  Animated,
  View,
  ScrollView: View,
  createAnimatedComponent: (Component: typeof View) => Component,
  useSharedValue: (initial: unknown) => ({ value: initial }),
  useAnimatedStyle: () => ({}),
  useAnimatedProps: () => ({}),
  useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
  useAnimatedRef: () => ({ current: null }),
  useAnimatedScrollHandler: () => NOOP,
  useAnimatedReaction: NOOP,
  scrollTo: NOOP,
  withTiming: (value: unknown) => value,
  withSpring: (value: unknown) => value,
  withDelay: (_delay: number, value: unknown) => value,
  runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  runOnUI: (fn: (...args: unknown[]) => unknown) => fn,
  Easing: {
    linear: NOOP,
    ease: NOOP,
    bezier: () => NOOP,
    cubic: NOOP,
    inOut: () => NOOP,
    in: () => NOOP,
    out: () => NOOP,
  },
};
