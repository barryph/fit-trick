import React from 'react';
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
