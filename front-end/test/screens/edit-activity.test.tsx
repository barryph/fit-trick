import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { TestSafeAreaProvider } from '@/test/setup/test-safe-area';
import EditActivityPage from '@/app/(tabs)/activities/edit/[id]';
import { useActivityQuery } from '@/hooks/queries/use-activities';
import { useCategoriesQuery } from '@/hooks/queries/use-categories';
import { useEditActivityMutation } from '@/hooks/mutations/use-activity-mutations';

jest.mock('@/hooks/queries/use-activities');
jest.mock('@/hooks/queries/use-categories');

jest.mock('@/hooks/mutations/use-activity-mutations', () => ({
  useEditActivityMutation: jest.fn(() => ({ mutateAsync: jest.fn() })),
  useDeleteActivityMutation: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useCreateActivityMutation: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useCompleteActivityMutation: jest.fn(() => ({ mutateAsync: jest.fn() })),
  useUndoActivityMutation: jest.fn(() => ({ mutateAsync: jest.fn() })),
}));

const mockUseActivityQuery = useActivityQuery as jest.Mock;
const mockUseCategoriesQuery = useCategoriesQuery as jest.Mock;
const mockUseEditActivityMutation = useEditActivityMutation as jest.Mock;
const mockUseFocusEffect = useFocusEffect as jest.Mock;

const categories = [
  { id: 1, userId: 'u1', name: 'Fitness', color: '#038df0' },
  { id: 2, userId: 'u1', name: 'Work', color: '#ff3d54' },
];

const squats = {
  id: 1,
  userId: 'u1',
  name: 'Squats',
  ticker: 'SQT',
  interval: 2,
  categoryId: 1,
  daysUntil: 0,
};

const reading = {
  id: 2,
  userId: 'u1',
  name: 'Reading',
  interval: 3,
  daysUntil: 1,
};

function renderEditPage() {
  return render(
    <TestSafeAreaProvider>
      <EditActivityPage />
    </TestSafeAreaProvider>,
  );
}

function queryActivity(id: string) {
  return { data: id === '1' ? squats : reading, isPending: false, isError: false };
}

describe('Edit Activity page', () => {
  beforeEach(() => {
    mockUseActivityQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });
    mockUseCategoriesQuery.mockReturnValue({
      data: categories,
      isPending: false,
      isError: false,
    });
    // No-op by default; the re-open test installs its own implementation to
    // capture the focus callback.
    mockUseFocusEffect.mockImplementation(() => {});
    mockUseEditActivityMutation.mockReturnValue({ mutateAsync: jest.fn() });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '1' });
  });

  it('populates the form from the current activity', async () => {
    mockUseActivityQuery.mockReturnValue(queryActivity('1'));

    await renderEditPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Squats')).toBeTruthy();
      expect(screen.getByDisplayValue('SQT')).toBeTruthy();
      expect(screen.getByDisplayValue('2')).toBeTruthy();
      expect(screen.getByText('Fitness')).toBeTruthy();
    });
  });

  it('shows the placeholder when the activity has no category', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '2' });
    mockUseActivityQuery.mockReturnValue(queryActivity('2'));

    await renderEditPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('Reading')).toBeTruthy();
      expect(screen.getByText('Choose a Category')).toBeTruthy();
      expect(screen.queryByText('Fitness')).toBeNull();
    });
  });

  it('resets all fields when switching to a different activity', async () => {
    mockUseActivityQuery.mockReturnValue(queryActivity('1'));

    const view = await renderEditPage();

    await waitFor(() => {
      expect(view.getByDisplayValue('Squats')).toBeTruthy();
      expect(view.getByDisplayValue('SQT')).toBeTruthy();
      expect(view.getByText('Fitness')).toBeTruthy();
    });

    // The edit screen is a tab screen that stays mounted, so switching
    // activities reuses the same component instance with new params + cached data.
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '2' });
    mockUseActivityQuery.mockReturnValue(queryActivity('2'));
    view.rerender(
      <TestSafeAreaProvider>
        <EditActivityPage />
      </TestSafeAreaProvider>,
    );

    await waitFor(() => {
      expect(view.getByDisplayValue('Reading')).toBeTruthy();
      expect(view.getByDisplayValue('3')).toBeTruthy();
      expect(view.getByText('Choose a Category')).toBeTruthy();
    });

    expect(view.queryByDisplayValue('Squats')).toBeNull();
    expect(view.queryByDisplayValue('SQT')).toBeNull();
    expect(view.queryByText('Fitness')).toBeNull();
    expect(view.getByPlaceholderText('TCKR').props.value).toBe('');
  });

  it('clears stale UI state when the page is opened again', async () => {
    let focusCallback: (() => void) | undefined;
    mockUseFocusEffect.mockImplementation((cb: () => void) => {
      focusCallback = cb;
    });
    mockUseActivityQuery.mockReturnValue(queryActivity('1'));
    mockUseEditActivityMutation.mockReturnValue({
      mutateAsync: jest.fn().mockRejectedValue(new Error('network down')),
    });

    await renderEditPage();

    await waitFor(() =>
      expect(screen.getByDisplayValue('Squats')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText('Save'));

    const failedSave = 'Something went wrong, please try again.';
    await waitFor(() => expect(screen.getByText(failedSave)).toBeTruthy());

    // Leaving the page and coming back must not restore the stale error.
    await act(async () => {
      focusCallback?.();
    });

    expect(screen.queryByText(failedSave)).toBeNull();
  });
});
