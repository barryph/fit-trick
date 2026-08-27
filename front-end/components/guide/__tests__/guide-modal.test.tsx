import React, { useEffect } from 'react';
import { Text } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { GuideModalBody } from '@/components/guide/guide-modal';
import type { GuideStep } from '@/components/guide/types';

const steps: GuideStep[] = [
  { title: 'Welcome', description: 'First copy' },
  { title: 'Add', description: 'Second copy' },
  { title: 'Timeline', description: 'Third copy' },
];

async function pressLabel(label: string) {
  await fireEvent.press(screen.getByLabelText(label));
}

describe('GuideModalBody', () => {
  it('renders the first step with Continue and no Back', async () => {
    await render(<GuideModalBody steps={steps} onClose={jest.fn()} />);

    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
    expect(screen.getByText('Welcome')).toBeTruthy();
    expect(screen.getByLabelText('Go to next step')).toBeTruthy();
    expect(screen.queryByLabelText('Go to previous step')).toBeNull();
  });

  it('advances forward and shows Back/Done states', async () => {
    await render(
      <GuideModalBody
        steps={steps}
        onClose={jest.fn()}
        onComplete={jest.fn()}
      />,
    );

    await pressLabel('Go to next step');
    await waitFor(() => expect(screen.getByText('Step 2 of 3')).toBeTruthy());
    expect(screen.getByLabelText('Go to previous step')).toBeTruthy();

    await pressLabel('Go to next step');
    await waitFor(() => expect(screen.getByText('Step 3 of 3')).toBeTruthy());
    // Final step becomes a "Done" action.
    expect(screen.getByLabelText('Finish guide')).toBeTruthy();
  });

  it('goes back a step', async () => {
    await render(<GuideModalBody steps={steps} onClose={jest.fn()} />);

    await pressLabel('Go to next step');
    await waitFor(() => expect(screen.getByText('Step 2 of 3')).toBeTruthy());

    await pressLabel('Go to previous step');
    await waitFor(() => expect(screen.getByText('Step 1 of 3')).toBeTruthy());
  });

  it('invokes onComplete from the final step', async () => {
    const onComplete = jest.fn();
    await render(
      <GuideModalBody
        steps={steps}
        onClose={jest.fn()}
        onComplete={onComplete}
      />,
    );

    await pressLabel('Go to next step');
    await waitFor(() => expect(screen.getByText('Step 2 of 3')).toBeTruthy());
    await pressLabel('Go to next step');
    await waitFor(() => expect(screen.getByText('Step 3 of 3')).toBeTruthy());

    await pressLabel('Finish guide');

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('dismisses via the close affordance', async () => {
    const onClose = jest.fn();
    await render(<GuideModalBody steps={steps} onClose={onClose} />);

    await pressLabel('Close guide');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders one pagination dot per step', async () => {
    await render(<GuideModalBody steps={steps} onClose={jest.fn()} />);

    expect(screen.getAllByLabelText(/Go to step/).length).toBe(steps.length);
  });
});

// ---------------------------------------------------------------------------
// GIF restart behaviour. A Probe increments on every (re)mount of a step's
// media, mirroring how an expo-image GIF replays from frame 1 when its node is
// re-keyed. The step frames themselves must stay mounted at all times.
// ---------------------------------------------------------------------------

const onGifMount = jest.fn();

function GifProbe({ name }: { name: string }) {
  useEffect(() => {
    onGifMount(name);
  }, [name]);
  return <Text>{`gif:${name}`}</Text>;
}

const gifSteps: GuideStep[] = [
  { title: 'One', description: 'A', demo: <GifProbe name="jobA" /> },
  { title: 'Two', description: 'B', demo: <GifProbe name="jobB" /> },
  { title: 'Three', description: 'C', demo: <GifProbe name="jobC" /> },
];

function isJobVisible(name: string) {
  // Non-active steps are accessibility-hidden (StepFrame sets
  // `accessibilityElementsHidden`), so probe them explicitly to prove they are
  // still mounted/rendered during transitions.
  return screen.getByText(`gif:${name}`, { includeHiddenElements: true }) !== null;
}

describe('GuideModalBody GIF restart', () => {
  beforeEach(() => {
    onGifMount.mockClear();
  });

  it('keeps every step mounted while only remounting the newly active step', async () => {
    await render(<GuideModalBody steps={gifSteps} onClose={jest.fn()} />);

    // All three step frames are mounted from the start (the transition relies
    // on this) — none is removed when we navigate.
    expect(isJobVisible('jobA')).toBe(true);
    expect(isJobVisible('jobB')).toBe(true);
    expect(isJobVisible('jobC')).toBe(true);

    // Drain the initial mounts before we start navigating.
    onGifMount.mockClear();

    // Navigate forward: only `jobB`'s media should remount (restart its GIF).
    await pressLabel('Go to next step');
    await waitFor(() => expect(onGifMount).toHaveBeenCalledWith('jobB'));
    expect(onGifMount).not.toHaveBeenCalledWith('jobA');
    expect(onGifMount).not.toHaveBeenCalledWith('jobC');
    // The outgoing step stays mounted too.
    expect(isJobVisible('jobA')).toBe(true);

    // Reset so the backward navigation measures only its own remounts.
    onGifMount.mockClear();

    // Navigate back: `jobA`'s media remounts again (restarted from the top);
    // `jobB` is not touched again.
    await pressLabel('Go to previous step');
    await waitFor(() => expect(onGifMount).toHaveBeenCalledWith('jobA'));
    expect(onGifMount).not.toHaveBeenCalledWith('jobB');
    // And the returning step plus the others remain rendered.
    expect(isJobVisible('jobA')).toBe(true);
    expect(isJobVisible('jobB')).toBe(true);
    expect(isJobVisible('jobC')).toBe(true);
  });

  it('remounts the arriving step when jumping via a dot', async () => {
    await render(<GuideModalBody steps={gifSteps} onClose={jest.fn()} />);
    onGifMount.mockClear();

    await fireEvent.press(screen.getByLabelText('Go to step 3 of 3: Three'));
    await waitFor(() => expect(onGifMount).toHaveBeenCalledWith('jobC'));
    expect(onGifMount).not.toHaveBeenCalledWith('jobA');
    expect(onGifMount).not.toHaveBeenCalledWith('jobB');

    // The step-transition behaviour is preserved: correct active step shown.
    await waitFor(() => expect(screen.getByText('Step 3 of 3')).toBeTruthy());
    expect(isJobVisible('jobA')).toBe(true);
    expect(isJobVisible('jobB')).toBe(true);
    expect(isJobVisible('jobC')).toBe(true);
  });
});
