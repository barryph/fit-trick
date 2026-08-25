import { useEffect, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

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
  Math.max(Dimensions.get('window').height * 0.34, 220),
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
}: GuideModalProps) {
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
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
}

/**
 * The reusable, animated guide panels — steps slide in/out and the pagination
 * dot glides. Split out of the `Modal` shell so it renders under jest and can
 * be reused inside any modal/presenter the host prefers.
 */
export function GuideModalBody({
  steps,
  visible = true,
  onClose,
  onComplete,
}: GuideModalBodyProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [outgoingIndex, setOutgoingIndex] = useState<number | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);

  // Shared animation values — drive the step slide and the pagination dot.
  const contentProgress = useSharedValue(0);
  const pillX = useSharedValue(0);

  // Reset to the first step each time the guide is (re)opened — keyed on the
  // `visible` flag, never escape the shared values (they are stable in
  // production but recreated by jest mocks, which would cascade resets).
  useEffect(() => {
    if (!visible) return;
    setActiveIndex(0);
    setOutgoingIndex(null);
    setDirection(1);
  }, [visible]);

  // Mirror the reset into the animation values (deps listed so `react-hooks`
  // is satisfied; the shared objects keep a stable identity in production).
  useEffect(() => {
    if (!visible) return;
    contentProgress.value = 0;
    pillX.value = 0;
  }, [visible, contentProgress, pillX]);

  function finishTransition() {
    setOutgoingIndex(null);
  }

  // Kick off the step slide + dot glide only after the new outgoing/active
  // step views have committed, so those views are attached at progress 0 and
  // the transition starts from its true resting state. Starting the animation
  // in the handler would let the shared value advance on the UI thread before
  // React installs the new step subtree — that gap is what flashes the
  // incoming step mid-flight before the transition begins.
  useEffect(() => {
    if (outgoingIndex === null) return;

    // The pagination dot glides across while the step content slides.
    pillX.value = withSpring(
      activeIndex * DOT_STEP + activeIndex * (DOT_MARGIN / 2),
      {
        duration: SLIDE_DURATION,
      },
    );

    // Slide current content out while the next step enters, then commit.
    // The completion callback runs on the UI thread once the slide finishes.
    contentProgress.value = withTiming(
      1,
      { duration: SLIDE_DURATION, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) {
          scheduleOnRN(finishTransition);
        }
      },
    );
  }, [outgoingIndex, activeIndex, contentProgress, pillX]);

  function goTo(nextIndex: number) {
    if (nextIndex === activeIndex) return;
    if (nextIndex < 0 || nextIndex >= steps.length) return;

    const nextDirection: 1 | -1 = nextIndex > activeIndex ? 1 : -1;
    setDirection(nextDirection);
    setOutgoingIndex(activeIndex);
    setActiveIndex(nextIndex);

    // Snap both shared values to their resting frame synchronously, so when
    // React commits the new outgoing/active views they attach at the very
    // start of the transition (incoming step hidden, outgoing step visible)
    // and only then does the effect above begin the slide.
    contentProgress.value = 0;
  }

  const activeStyle = useAnimatedStyle(() => {
    if (outgoingIndex === null) return {};
    const enterX = direction === 1 ? SLIDE : -SLIDE;
    return {
      opacity: interpolate(
        contentProgress.value,
        [0, 1],
        [0, 1],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          translateX: interpolate(
            contentProgress.value,
            [0, 1],
            [enterX, 0],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const outgoingStyle = useAnimatedStyle(() => {
    if (outgoingIndex === null) return {};
    const exitX = direction === 1 ? -SLIDE : SLIDE;
    return {
      opacity: interpolate(
        contentProgress.value,
        [0, 1],
        [1, 0],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          translateX: interpolate(
            contentProgress.value,
            [0, 1],
            [0, exitX],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const step = steps[activeIndex];
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

      <View style={styles.content} accessibilityLiveRegion="polite">
        {outgoingIndex !== null && (
          <Animated.View
            key={`outgoing-${outgoingIndex}`}
            style={[StyleSheet.absoluteFill, outgoingStyle]}
            pointerEvents="none"
            accessibilityElementsHidden
          >
            <StepView step={steps[outgoingIndex]} />
          </Animated.View>
        )}

        {/* Keyed per step so the view *attaches* (opacity 0 at the start of
            the slide) instead of being reconciled in place mid-transition.
            Reconciling in place would leave the old step's fully-visible
            snapshot on this node for one frame — the source of the flash. */}
        <Animated.View
          key={`active-${activeIndex}`}
          style={[StyleSheet.absoluteFill, activeStyle]}
        >
          <StepView step={step} />
        </Animated.View>
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

function StepView({ step }: { step: GuideStep }) {
  return (
    <View style={styles.stepBody}>
      {step.media}
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
