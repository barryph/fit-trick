import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { Stack, useSegments } from 'expo-router';
import { RootLayoutNav } from '@/components/root-layout-nav';
import { mockReplace } from '@/test/setup/navigation-mocks';
import { resetMockAuth, setMockAuth } from '@/test/setup/mock-auth';

jest.mock('@/context/auth-context', () =>
  require('@/test/setup/mock-auth').createAuthContextMock(),
);

describe('RootLayoutNav auth gate', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    resetMockAuth();
    (useSegments as jest.Mock).mockReturnValue([]);
    // Emit a sentinel from Stack.Screen so tests can observe whether the
    // protected navigator is actually mounted (the default mock renders nothing).
    (Stack as any).Screen = function StackScreenSentinel() {
      return React.createElement(Text, null, 'stack-screen');
    };
  });

  it('redirects unauthenticated users to login', async () => {
    setMockAuth({ isAuthenticated: false, isLoading: false, user: null });
    (useSegments as jest.Mock).mockReturnValue(['(tabs)']);

    await render(<RootLayoutNav />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  it('does not redirect while loading', async () => {
    setMockAuth({ isAuthenticated: false, isLoading: true, user: null });
    (useSegments as jest.Mock).mockReturnValue(['(tabs)']);

    await render(<RootLayoutNav />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('redirects authenticated users away from auth screens', async () => {
    setMockAuth({ isAuthenticated: true, isLoading: false });
    (useSegments as jest.Mock).mockReturnValue(['login']);

    await render(<RootLayoutNav />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  it('allows unauthenticated users on auth screens', async () => {
    setMockAuth({ isAuthenticated: false, isLoading: false, user: null });
    (useSegments as jest.Mock).mockReturnValue(['login']);

    await render(<RootLayoutNav />);

    await waitFor(() => {
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  it('keeps the navigator mounted when the session is invalidated on a protected route', async () => {
    // Logged in on a protected route (e.g. account deletion from the profile
    // screen): the gate is ready and the Stack is rendered.
    setMockAuth({ isAuthenticated: true, isLoading: false });
    (useSegments as jest.Mock).mockReturnValue(['(tabs)']);

    const { getAllByText, rerender } = await render(<RootLayoutNav />);
    await waitFor(() => {
      expect(getAllByText('stack-screen').length).toBeGreaterThan(0);
    });

    // Session invalidated: the navigator must stay mounted while the gate
    // redirects, or the replace action is dropped as unhandled.
    setMockAuth({ isAuthenticated: false, isLoading: false, user: null });
    rerender(<RootLayoutNav />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
    expect(getAllByText('stack-screen').length).toBeGreaterThan(0);
  });

  it('renders protected screens when authenticated on a protected route', async () => {
    setMockAuth({ isAuthenticated: true, isLoading: false });
    (useSegments as jest.Mock).mockReturnValue(['(tabs)']);

    const { getAllByText } = await render(<RootLayoutNav />);

    await waitFor(() => {
      expect(getAllByText('stack-screen').length).toBeGreaterThan(0);
    });
  });
});
