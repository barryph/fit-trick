import { useEffect, useState, type ReactNode } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  type SharedValue,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import Button from '@/components/base/button';
import Background from '@/components/backgrounds/background';
import { ThemedText } from '@/components/base/themed-text';
import type { GuideStep } from '@/components/guide/types';

/** Horizontal travel (px) for the step slide transition. */
const SLIDE = 42;
/** How long the step slide takes to complete. */
const SLIDE_DURATION = 300;
/** Cap the content region so the card never dominates small screens. */
const CONTENT_HEIGHT = Math.min(
  Math.max(Dimensions.get('window').height * 0.3, 220),
  300,
);

/** Pagination geometry (px). */
const DOT_W = 8;
const DOT_GAP = 8;
const ACTIVE_DOT_W = 26;
const DOT_MARGIN = 5;
const DOT_STEP = DOT_W + DOT_GAP; //16

function dotsPaginationWidth(count: number) {
  return (count - 1) * DOT_STEP + ACTIVE_DOT_W;
}

interface GuideModalProps {
  visible: boolean;
  steps: GuideStep[];
  onClose: () => void;
  onComplete?: () => void;
  /**
   * Called with the newly active step index (0-based) whenever the active
   * step changes, including on open (index 0). Used by hosts to fire
   * onboarding-funnel analytics.
   */
  onStepChange?: (index: number) => void;
}

/**
 * Modal shell: full-screen dimmed backdrop + the tilted card. The actual
 * guide UI (steps, pagination, actions) lives in {@link GuideModalBody}.
 */
export default function GuideModal({
  visible,
  steps,
  onClose,
  onComplete,
  onStepChange,
}: GuideModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <SafeAreaView edges={['top', 'bottom']} style={styles.backdrop}>
        <Pressable
          onPress={onClose}
          style={styles.backdropFill}
          accessibilityRole="button"
          accessibilityLabel="Close guide"
        />
        <View style={styles.card}>
          <GuideModalBody
            steps={steps}
            visible={visible}
            onClose={onClose}
            onComplete={onComplete}
            onStepChange={onStepChange}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

interface GuideModalBodyProps {
  steps: GuideStep[];
  /** Whether the guide is currently open. Resets to step one on each open. */
  visible?: boolean;
  onClose: () => void;
  onComplete?: () => void;
  /** See {@link GuideModalProps.onStepChange}. */
  onStepChange?: (index: number) => void;
}

/**
 * The reusable, animated guide panels — steps slide in/out and the pagination
 * dot glides. Split out of the `Modal` shell so it renders under jest and can
 * be reused inside any modal/presenter the host prefers.
 *
 * Every step is mounted once, at the same origin. A single shared value
 * (`page`) drives each step's opacity + horizontal offset, so navigating only
 * animates that value — no step is mounted or re-homed mid-transition, which
 * is what eliminates the incoming step briefly flashing at its resting
 * position (an Android-only Reanimated mount/attach race in the old
 * outgoing/active keyed-branch design).
 */
export function GuideModalBody({
  steps,
  visible = true,
  onClose,
  onComplete,
  onStepChange,
}: GuideModalBodyProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  // One counter per step. Every step stays mounted (the transition animation
  // relies on that), but each step's animated media (e.g. a GIF) is given a
  // `key` derived from `mediaKeys` so that when a step is navigated to, its
  // visual is re-mounted — replaying the GIF from frame 1 — without unmounting
  // the step frame or disturbing the outgoing step.
  const [mediaKeys, setMediaKeys] = useState<number[]>([]);

  // Bump the counter for `index`, forcing that step's animated media to remount
  // (restart its GIF) on the next render.
  function bumpMediaKey(index: number) {
    setMediaKeys((prev) => {
      const next = prev.slice();
      while (next.length <= index) next.push(0);
      next[index] += 1;
      return next;
    });
  }

  // Single source of truth for the step transition. `page === 0` shows
  // step 0, `page === 1` shows step 1, etc.; fractional values are the mid
  // transition between two adjacent steps.
  const page = useSharedValue(0);
  const pillX = useSharedValue(0);

  // Reset to the first step each time the guide is (re)opened — keyed on the
  // `visible` flag. Shared values stay live across reopens.
  useEffect(() => {
    if (!visible) return;
    setActiveIndex(0);
    bumpMediaKey(0);
    onStepChange?.(0);
  }, [visible, onStepChange]);

  // Mirror the reset into the animation values (deps listed so `react-hooks`
  // is satisfied; the shared objects keep a stable identity in production).
  useEffect(() => {
    if (!visible) return;
    page.value = 0;
    pillX.value = 0;
  }, [visible, page, pillX]);

  // Animate to `nextIndex`. Because `page` is the single source of truth for
  // every step's position/opacity, retargeting mid-flight (rapid taps) is
  // smooth and never leaves the guide in an inconsistent state.
  function goTo(nextIndex: number) {
    if (nextIndex === activeIndex) return;
    if (nextIndex < 0 || nextIndex >= steps.length) return;

    setActiveIndex(nextIndex);
    onStepChange?.(nextIndex);
    bumpMediaKey(nextIndex);
    page.value = withTiming(nextIndex, {
      duration: SLIDE_DURATION,
      easing: Easing.inOut(Easing.cubic),
    });
    pillX.value = withSpring(
      nextIndex * DOT_STEP + nextIndex * (DOT_MARGIN / 2),
      { duration: SLIDE_DURATION },
    );
  }

  const isFirst = activeIndex === 0;
  const isLast = activeIndex === steps.length - 1;

  return (
    <>
      <Background />

      <View style={styles.headerRow}>
        <ThemedText
          size="small"
          type="default"
          style={styles.stepCounter}
          accessibilityRole="header"
        >
          Step {activeIndex + 1} of {steps.length}
        </ThemedText>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close guide"
          style={styles.closeButton}
        >
          <ThemedText style={styles.closeIcon}>✕</ThemedText>
        </Pressable>
      </View>

      <View style={styles.content}>
        {steps.map((step, index) => (
          <StepFrame
            key={index}
            step={step}
            index={index}
            page={page}
            active={index === activeIndex}
            mediaKey={mediaKeys[index] ?? 0}
          />
        ))}
      </View>

      <View style={styles.paginationRow}>
        <View
          accessibilityRole="tablist"
          style={{
            width: dotsPaginationWidth(steps.length),
            height: 14,
            flexDirection: 'row',
          }}
        >
          <Animated.View
            style={[styles.activeDot, { transform: [{ translateX: pillX }] }]}
          />
          {steps.map((dot, index) => (
            <Pressable
              key={index}
              onPress={() => goTo(index)}
              accessibilityRole="tab"
              accessibilityLabel={`Go to step ${index + 1} of ${steps.length}: ${dot.title}`}
              accessibilityState={{ selected: index === activeIndex }}
              style={[
                styles.dot,
                index === activeIndex && { width: ACTIVE_DOT_W },
              ]}
            />
          ))}
        </View>
      </View>

      <View style={styles.actions}>
        {!isFirst && (
          <Pressable
            onPress={() => goTo(activeIndex - 1)}
            accessibilityRole="button"
            accessibilityLabel="Go to previous step"
            style={styles.backButton}
          >
            <ThemedText style={styles.backText}>&larr; Back</ThemedText>
          </Pressable>
        )}
        <View style={styles.continueWrapper}>
          <Button
            onPress={() => {
              if (isLast) onComplete?.();
              else goTo(activeIndex + 1);
            }}
            accessibilityLabel={isLast ? 'Finish guide' : 'Go to next step'}
            accessibilityRole="button"
          >
            {isLast ? 'Done' : 'Continue'}
          </Button>
        </View>
      </View>
    </>
  );
}

interface StepFrameProps {
  step: GuideStep;
  index: number;
  page: SharedValue<number>;
  active: boolean;
  /** Changed whenever this step is navigated to, so its media (GIF) replays. */
  mediaKey: number;
}

/**
 * One always-mounted step layer. It stays pinned to the content origin and
 * derives its opacity + slide purely from `page`, so it never needs to be
 * mounted (or re-homed) when the active step changes.
 *
 * - `index - page === 0`  -> this step is centred (fully visible at rest).
 * - `index - page  > 0`   -> this step is upcoming: positioned +SLIDE to the
 *   right and fading in as it approaches.
 * - `index - page  < 0`   -> this step is behind: sliding to -SLIDE and
 *   fading out as it leaves.
 */
function StepFrame({ step, index, page, active, mediaKey }: StepFrameProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const rel = index - page.value;
    return {
      opacity: interpolate(rel, [-1, 0, 1], [0, 1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: rel * SLIDE }],
    };
  });

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, animatedStyle]}
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      accessibilityLiveRegion={active ? 'polite' : 'none'}
    >
      <StepView step={step} mediaKey={mediaKey} />
    </Animated.View>
  );
}

function StepView({ step, mediaKey }: { step: GuideStep; mediaKey: number }) {
  return (
    <View style={styles.stepBody}>
      <MediaFrame media={step.media} mediaKey={mediaKey} />
      <ThemedText
        type="defaultBold"
        size="medium"
        style={styles.stepTitle}
        accessibilityRole="header"
      >
        {step.title}
      </ThemedText>
      <ThemedText type="default" style={styles.stepDescription}>
        {step.description}
      </ThemedText>
    </View>
  );
}

/**
 * Renders an optional animated visual (GIF/illustration) for a step. Keyed on
 * `mediaKey` so the node is re-mounted (restarting its GIF from frame 1) every
 * time its step becomes active — without affecting the always-mounted step
 * frames or the outgoing step's transition.
 */
function MediaFrame({
  media,
  mediaKey,
}: {
  media?: ReactNode;
  mediaKey: number;
}) {
  if (media == null) return null;
  return <View key={mediaKey}>{media}</View>;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: 300,
    maxWidth: '100%',
    alignSelf: 'center',
    borderRadius: 16,
    padding: 20,
    zIndex: 1,
    overflow: 'hidden',
    minHeight: CONTENT_HEIGHT + 110,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepCounter: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  closeIcon: {
    color: '#fff',
    fontSize: 16,
  },
  content: {
    height: CONTENT_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
    marginTop: 8,
  },
  stepBody: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 8,
  },
  stepTitle: {
    color: '#fff',
    textAlign: 'center',
  },
  stepDescription: {
    color: '#c6cfe0',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  paginationRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  activeDot: {
    position: 'absolute',
    left: 0,
    width: ACTIVE_DOT_W,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginHorizontal: DOT_MARGIN,
  },
  dot: {
    marginHorizontal: 5,
    width: DOT_W,
    height: DOT_W,
    borderRadius: DOT_W / 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
  },
  backButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: '#9ba1a6',
    fontSize: 16,
    letterSpacing: -0.2,
  },
  continueWrapper: {
    flex: 1,
  },
});
