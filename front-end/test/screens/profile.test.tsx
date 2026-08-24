import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { TestSafeAreaProvider } from '@/test/setup/test-safe-area';
import ProfileScreen from '@/app/(tabs)/profile';
import { testUser } from '@/test/setup/fixtures/users';
import { setMockAuth, getMockAuth } from '@/test/setup/mock-auth';
import { ApiError } from '@/lib/query/unwrap';
import { ErrorCode } from '@/api/api.types';

jest.mock('@/context/auth-context', () =>
  require('@/test/setup/mock-auth').createAuthContextMock(),
);

async function renderProfile() {
  const view = await render(
    <TestSafeAreaProvider>
      <ProfileScreen />
    </TestSafeAreaProvider>,
  );
  await screen.findByText('Profile');
  return view;
}

async function openDeleteModal() {
  await fireEvent.press(screen.getByText('Delete Account'));
}

describe('Profile screen account deletion', () => {
  beforeEach(() => {
    setMockAuth({ user: testUser, isAuthenticated: true });
  });

  it('shows a clearly visible Delete Account button', async () => {
    await renderProfile();

    expect(screen.getByText('Delete Account')).toBeTruthy();
  });

  it('requires an explicit confirmation with a warning before deleting', async () => {
    await renderProfile();
    await openDeleteModal();

    expect(screen.getAllByText('Delete Account')).toHaveLength(2);
    expect(
      screen.getByText(
        /permanently remove your account, your activities, your history and all of your data/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/cannot be undone/)).toBeTruthy();

    // Nothing has been requested yet.
    expect(getMockAuth().deleteAccount).not.toHaveBeenCalled();
  });

  it('does not delete when the user cancels', async () => {
    await renderProfile();
    await openDeleteModal();

    await fireEvent.press(screen.getByText('Cancel'));

    expect(getMockAuth().deleteAccount).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText(/cannot be undone/)).toBeNull();
    });
  });

  it('deletes the account and clears auth state on success', async () => {
    await renderProfile();
    await openDeleteModal();

    await fireEvent.press(screen.getByText('Delete'));

    expect(getMockAuth().deleteAccount).toHaveBeenCalledTimes(1);
    // Redirecting to login is the navigation guard's responsibility, not the
    // modal's: clearing auth state makes the guard redirect.
  });

  it('shows a loading state while the deletion request is pending', async () => {
    let resolveDelete: () => void = () => {};
    const auth = setMockAuth({
      user: testUser,
      isAuthenticated: true,
      deleteAccount: jest.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveDelete = resolve;
          }),
      ),
    });

    await renderProfile();
    await openDeleteModal();
    // Not awaited: the request stays pending so the loading state can be
    // observed, and RNTL v14's async fireEvent would wait on the handler.
    const pendingPress = fireEvent.press(screen.getByText('Delete'));

    // The button is replaced by a spinner while pending.
    await waitFor(() => {
      expect(screen.queryByText('Delete')).toBeNull();
    });
    expect(auth.deleteAccount).toHaveBeenCalledTimes(1);

    resolveDelete();
    await pendingPress;
  });

  it('surfaces the error and keeps the modal open when deletion fails', async () => {
    const auth = setMockAuth({
      user: testUser,
      isAuthenticated: true,
      deleteAccount: jest.fn().mockRejectedValue(
        new ApiError({
          code: ErrorCode.PROVIDER_REVOCATION_FAILED,
          message:
            "We couldn't disconnect your account from its provider. Nothing was deleted. Please try again.",
        }),
      ),
    });

    await renderProfile();
    await openDeleteModal();
    await fireEvent.press(screen.getByText('Delete'));

    await waitFor(() => {
      expect(
        screen.getByText(/We couldn't disconnect your account/),
      ).toBeTruthy();
    });
    expect(auth.deleteAccount).toHaveBeenCalledTimes(1);

    // The user can retry without leaving the screen.
    await fireEvent.press(screen.getByText('Delete'));
    expect(auth.deleteAccount).toHaveBeenCalledTimes(2);
  });

  it('keeps the cancel button available when the modal is open', async () => {
    await renderProfile();
    await openDeleteModal();

    await fireEvent.press(screen.getByText('Cancel'));
    expect(getMockAuth().deleteAccount).not.toHaveBeenCalled();
  });
});
