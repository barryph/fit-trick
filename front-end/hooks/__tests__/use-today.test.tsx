import React from 'react';
import { AppState, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

import { useToday, resetTodayState } from '../use-today';

function TodayHarness() {
  const today = useToday();
  return <Text testID="today">{today}</Text>;
}

/**
 * `useToday` exists so a screen that stays mounted across the user's local
 * midnight stops reporting yesterday's date. The timer is scheduled against the
 * device's local midnight, so these use fake timers with a fake system clock.
 *
 * The date itself is shared app-wide (one timer, one AppState subscription), so
 * the module state is reset between cases.
 */
describe('useToday', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    resetTodayState();
    jest.useRealTimers();
  });

  it('returns the device-local calendar date', async () => {
    // Local components, so this is the same calendar day in any test timezone.
    jest.setSystemTime(new Date(2026, 2, 2, 9, 0, 0));

    await render(<TodayHarness />);

    expect(screen.getByTestId('today')).toHaveTextContent('2026-03-02');
  });

  it("rolls over at the device's local midnight, not at UTC midnight", async () => {
    jest.setSystemTime(new Date(2026, 2, 2, 23, 59, 50, 0));

    await render(<TodayHarness />);
    expect(screen.getByTestId('today')).toHaveTextContent('2026-03-02');

    await act(async () => {
      // 10s to local midnight, then the hook's one-second slack.
      jest.advanceTimersByTime(11_000);
    });

    expect(screen.getByTestId('today')).toHaveTextContent('2026-03-03');
  });

  it('keeps rolling over on subsequent days', async () => {
    jest.setSystemTime(new Date(2026, 2, 2, 23, 59, 50, 0));

    await render(<TodayHarness />);

    await act(async () => {
      jest.advanceTimersByTime(11_000);
    });
    expect(screen.getByTestId('today')).toHaveTextContent('2026-03-03');

    await act(async () => {
      jest.advanceTimersByTime(86_400_000);
    });
    expect(screen.getByTestId('today')).toHaveTextContent('2026-03-04');
  });

  it('resyncs when the app returns to the foreground', async () => {
    jest.setSystemTime(new Date(2026, 2, 2, 9, 0, 0));

    const listeners: Array<(state: string) => void> = [];
    const addEventListener = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, handler) => {
        listeners.push(handler as (state: string) => void);
        return { remove: jest.fn() } as never;
      });

    await render(<TodayHarness />);
    expect(screen.getByTestId('today')).toHaveTextContent('2026-03-02');

    // The device was suspended over midnight (timers do not fire reliably while
    // an app is backgrounded), so the foreground event has to catch up.
    jest.setSystemTime(new Date(2026, 2, 4, 8, 0, 0));
    await act(async () => {
      listeners.forEach((listener) => listener('active'));
    });

    expect(screen.getByTestId('today')).toHaveTextContent('2026-03-04');
    addEventListener.mockRestore();
  });

  it('ignores background and inactive transitions', async () => {
    jest.setSystemTime(new Date(2026, 2, 2, 9, 0, 0));

    const listeners: Array<(state: string) => void> = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, h) => {
      listeners.push(h as (state: string) => void);
      return { remove: jest.fn() } as never;
    });

    await render(<TodayHarness />);

    // Only the transition back into the foreground can have skipped a midnight
    // while JS timers were suspended; the other states must not re-read.
    jest.setSystemTime(new Date(2026, 2, 5, 9, 0, 0));
    await act(async () => {
      listeners.forEach((listener) => listener('background'));
      listeners.forEach((listener) => listener('inactive'));
    });

    expect(screen.getByTestId('today')).toHaveTextContent('2026-03-02');

    await act(async () => {
      listeners.forEach((listener) => listener('active'));
    });

    expect(screen.getByTestId('today')).toHaveTextContent('2026-03-05');
    jest.restoreAllMocks();
  });

  it('rolls every mounted screen over together, on one shared timer', async () => {
    jest.setSystemTime(new Date(2026, 2, 2, 23, 59, 50, 0));

    const addEventListener = jest.spyOn(AppState, 'addEventListener');
    const subscriptionsBefore = addEventListener.mock.calls.length;

    await render(
      <>
        <TodayHarness />
        <TodayHarness />
      </>,
    );

    // Several screens are mounted at once (the tabs), and they must not
    // disagree about the date: one subscription drives all of them, so the
    // listener count grows by one no matter how many components subscribe.
    expect(addEventListener.mock.calls.length - subscriptionsBefore).toBe(1);
    expect(screen.getAllByTestId('today')[0]).toHaveTextContent('2026-03-02');
    expect(screen.getAllByTestId('today')[1]).toHaveTextContent('2026-03-02');

    await act(async () => {
      jest.advanceTimersByTime(11_000);
    });

    expect(screen.getAllByTestId('today')[0]).toHaveTextContent('2026-03-03');
    expect(screen.getAllByTestId('today')[1]).toHaveTextContent('2026-03-03');
    // The rollover itself does not add listeners either.
    expect(addEventListener.mock.calls.length - subscriptionsBefore).toBe(1);

    addEventListener.mockRestore();
  });
});
