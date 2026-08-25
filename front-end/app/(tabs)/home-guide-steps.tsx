import Ionicons from '@expo/vector-icons/Ionicons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';

import GuideMediaIcon from '@/components/guide/guide-media-icon';
import type { GuideStep } from '@/components/guide/types';

/**
 * The Steps for the Home screen onboarding guide.
 *
 * This is the file to edit when you want to change wording, swap a visual,
 * add a step, or remove one — the modal reads this array as-is.
 */
export const HOME_GUIDE_STEPS: GuideStep[] = [
  {
    title: 'Welcome to Kadence',
    description:
      'A small daily rhythm keeps momentum once a week becomes a habit — and everything lands here.',
    media: (
      <GuideMediaIcon
        accent="#087cff"
        label="Your dashboard"
        icon={<Ionicons name="apps" size={26} color="#d8ecff" />}
      />
    ),
  },
  {
    title: 'Add your first activity',
    description:
      'Tap the + button to create an activity. Pick a name, category and how often you want to do it.',
    media: (
      <GuideMediaIcon
        accent="#087cff"
        label="Add an activity"
        icon={<Ionicons name="add" size={26} color="#d8ecff" />}
      />
    ),
  },
  {
    title: 'Work the list',
    description:
      'Tap an activity to queue it, swipe left to edit it, and swipe right to mark it done.',
    media: (
      <GuideMediaIcon
        accent="#00c2a8"
        label="Swipe to complete"
        icon={<Ionicons name="checkmark-circle" size={26} color="#52f2a8" />}
      />
    ),
  },
  {
    title: 'Watch the timeline fill',
    description:
      'Your completed days build up on the Timeline — each colored cell is a step closer to a streak.',
    media: (
      <GuideMediaIcon
        accent="#38d8ff"
        label="Your timeline"
        icon={<FontAwesome6 name="bars-staggered" size={24} color="#d8ecff" />}
      />
    ),
  },
];
