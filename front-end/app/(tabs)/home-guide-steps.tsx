// import { Image } from 'react-native';
import { Image, ImageSource, useImage } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';

import GuideMediaIcon from '@/components/guide/guide-media-icon';
import type { GuideStep } from '@/components/guide/types';

function GuideGif({ source }: { source: ImageSource }) {
  const image = useImage(source);
  // Calculate aspect ratio once dimensions load
  const aspectRatio = image ? image.width / image.height : 1;

  return (
    <Image
      source={image}
      style={{
        width: '100%',
        aspectRatio,
        marginTop: 8,
        marginBottom: 0,
        borderWidth: 1,
        borderColor: '#087cff1a',
        borderRadius: 10,
      }}
    />
  );
}

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
      'A rhythm keeps momentum, consistency becomes a habit. Here begins your cadence.',
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
      "Tap the 'Add Activity' button to create an activity. Pick a name, category and how often you want to do it.",
    media: (
      <GuideMediaIcon
        accent="#087cff"
        label="Add an activity"
        icon={<Ionicons name="add" size={26} color="#d8ecff" />}
      />
    ),
  },
  {
    title: 'Queue activitites',
    description:
      'Tap an activity to queue it. Queued activities move to the top.',
    media: (
      <GuideGif source={require('../../assets/demos/queue-an-activity.gif')} />
    ),
  },
  {
    title: 'Work the list',
    description: 'Swipe left to edit it, swipe right to mark it done.',
    media: (
      <GuideGif source={require('../../assets/demos/activity-swipes.gif')} />
    ),
  },
  {
    title: 'Log past workouts',
    description:
      'Previous days can be logged from the timeline. Tap a cell to toggle it.',
    media: (
      <GuideGif source={require('../../assets/demos/timeline-toggle.gif')} />
    ),
  },
  // {
  //   title: 'Work the list',
  //   description:
  //     'Tap an activity to queue it, swipe left to edit it, and swipe right to mark it done.',
  //   media: (
  //     <GuideMediaIcon
  //       accent="#00c2a8"
  //       label="Swipe to complete"
  //       icon={<Ionicons name="checkmark-circle" size={26} color="#52f2a8" />}
  //     />
  //   ),
  // },
  // {
  //   title: 'Watch the timeline fill',
  //   description:
  //     'Your completed days build up on the Timeline — each colored cell is a step closer to a streak.',
  //   media: (
  //     <GuideMediaIcon
  //       accent="#38d8ff"
  //       label="Your timeline"
  //       icon={<FontAwesome6 name="bars-staggered" size={24} color="#d8ecff" />}
  //     />
  //   ),
  // },
];
