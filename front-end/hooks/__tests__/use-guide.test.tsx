import React from 'react';
import { Pressable, Text } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from '@testing-library/react-native';

import {
  isGuideCompleted,
  markGuideCompleted,
} from '@/lib/storage/guide-state';
import { useGuide } from '@/hooks/use-guide';

jest.mock('@/lib/storage/guide-state');
const mockIsComplete = isGuideCompleted as jest.Mock;
const mockMarkComplete = markGuideCompleted as jest.Mock;

interface TriggerProps {
  onComplete?: () => void;
  autoShow?: boolean;
}

function Trigger({ onComplete, autoShow = true }: TriggerProps) {
  const guide = useGuide({
    pageId: 'home',
    autoShow,
    onComplete,
  });
  return (
    <>
      <Text>{guide.isOpen ? 'open' : 'closed'}</Text>
      <Pressable accessibilityLabel="Open guide" onPress={guide.open}>
        <Text>trigger open</Text>
      </Pressable>
      <Pressable accessibilityLabel="Dismiss guide" onPress={guide.dismiss}>
        <Text>trigger dismiss</Text>
      </Pressable>
      <Pressable accessibilityLabel="Finish guide" onPress={guide.finish}>
        <Text>trigger finish</Text>
      </Pressable>
    </>
  );
}

async function renderGuide(props = {}) {
  return render(<Trigger {...props} />);
}

async function pressLabel(label: string) {
  await fireEvent(screen.getByLabelText(label), 'press');
}

describe('useGuide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsComplete.mockResolvedValue(false);
    mockMarkComplete.mockResolvedValue(undefined);
  });

  it('opens the guide on the first visit', async () => {
    await renderGuide();
    await waitFor(() => expect(screen.getByText('open')).toBeTruthy());
  });

  it('stays closed on a repeat visit', async () => {
    mockIsComplete.mockResolvedValue(true);
    await renderGuide();
    await waitFor(() => expect(screen.getByText('closed')).toBeTruthy());
  });

  it('open() reopens the guide any time', async () => {
    mockIsComplete.mockResolvedValue(true);
    await renderGuide();
    await waitFor(() => expect(screen.getByText('closed')).toBeTruthy());

    await act(async () => {
      await pressLabel('Open guide');
    });

    expect(screen.getByText('open')).toBeTruthy();
  });

  it('finish marks the guide as seen and fires the completion callback', async () => {
    const onComplete = jest.fn();
    await renderGuide({ onComplete });
    await waitFor(() => expect(screen.getByText('open')).toBeTruthy());

    await act(async () => {
      await pressLabel('Finish guide');
    });

    expect(screen.getByText('closed')).toBeTruthy();
    expect(mockMarkComplete).toHaveBeenCalledWith('home');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('dismiss also marks the guide as seen', async () => {
    await renderGuide();
    await waitFor(() => expect(screen.getByText('open')).toBeTruthy());

    await act(async () => {
      await pressLabel('Dismiss guide');
    });

    expect(screen.getByText('closed')).toBeTruthy();
    expect(mockMarkComplete).toHaveBeenCalledWith('home');
  });
});
