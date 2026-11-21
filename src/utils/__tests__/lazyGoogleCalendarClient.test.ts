/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseSpies = vi.hoisted(() => {
  const mockSignOut = vi.fn(async () => {});
  const mockUser = { uid: 'user-1', email: 'breeder@example.test' };
  const mockAuth = {
    currentUser: mockUser,
    signOut: mockSignOut,
  };
  let authStateUnsubscribe = vi.fn();
  const mockOnAuthStateChanged = vi.fn(() => authStateUnsubscribe);
  const mockSignInWithPopup = vi.fn(async () => ({ user: mockUser }));
  const mockCredentialFromResult = vi.fn(() => ({ accessToken: 'ya29.mock-token' }));
  const mockAddScope = vi.fn();

  class MockGoogleAuthProvider {
    addScope = mockAddScope;
    static credentialFromResult = mockCredentialFromResult;
  }

  return {
    mockSignOut,
    mockUser,
    mockAuth,
    getUnsubscribe: () => authStateUnsubscribe,
    resetUnsubscribe: () => {
      authStateUnsubscribe = vi.fn();
    },
    mockOnAuthStateChanged,
    mockSignInWithPopup,
    mockCredentialFromResult,
    mockAddScope,
    MockGoogleAuthProvider,
    getApps: vi.fn(() => []),
    getApp: vi.fn(() => ({ name: '[DEFAULT]' })),
    initializeApp: vi.fn(() => ({ name: '[DEFAULT]' })),
    getAuth: vi.fn(() => mockAuth),
  };
});

vi.mock('firebase/app', () => ({
  getApps: firebaseSpies.getApps,
  getApp: firebaseSpies.getApp,
  initializeApp: firebaseSpies.initializeApp,
}));

vi.mock('firebase/auth', () => ({
  getAuth: firebaseSpies.getAuth,
  onAuthStateChanged: firebaseSpies.mockOnAuthStateChanged,
  GoogleAuthProvider: firebaseSpies.MockGoogleAuthProvider,
  signInWithPopup: firebaseSpies.mockSignInWithPopup,
}));

describe('googleCalendarClient lazy Firebase loading', () => {
  beforeEach(() => {
    vi.resetModules();
    firebaseSpies.resetUnsubscribe();
    firebaseSpies.getApps.mockClear();
    firebaseSpies.getApp.mockClear();
    firebaseSpies.initializeApp.mockClear();
    firebaseSpies.getAuth.mockClear();
    firebaseSpies.mockOnAuthStateChanged.mockClear();
    firebaseSpies.mockSignInWithPopup.mockClear();
    firebaseSpies.mockCredentialFromResult.mockClear();
    firebaseSpies.mockAddScope.mockClear();
    firebaseSpies.mockSignOut.mockClear();
  });

  it('does not initialize Firebase on import, getCurrentGoogleCalendarUser, or unauthenticated signOut', async () => {
    const client = await import('../googleCalendarClient');

    expect(client.getCurrentGoogleCalendarUser()).toBeNull();
    expect(client.getGoogleCalendarAccessToken()).toBeNull();
    await client.signOutGoogleCalendar();

    expect(firebaseSpies.initializeApp).not.toHaveBeenCalled();
    expect(firebaseSpies.getAuth).not.toHaveBeenCalled();
    expect(firebaseSpies.mockSignOut).not.toHaveBeenCalled();
  });

  it('cancels lazy listener attachment if unsubscribed before dynamic Firebase import settles', async () => {
    const client = await import('../googleCalendarClient');
    const onSuccess = vi.fn();
    const onFailure = vi.fn();

    const cleanup = client.initGoogleCalendarAuth(onSuccess, onFailure);
    cleanup();

    // Wait for dynamic imports to settle so cancellation is verified post-resolution
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(firebaseSpies.mockOnAuthStateChanged).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('dynamically loads Firebase on signInGoogleCalendar and clears cached token on signOut', async () => {
    const client = await import('../googleCalendarClient');

    const { user, accessToken } = await client.signInGoogleCalendar();
    expect(user).toEqual(firebaseSpies.mockUser);
    expect(accessToken).toBe('ya29.mock-token');
    expect(firebaseSpies.initializeApp).toHaveBeenCalledTimes(1);
    expect(firebaseSpies.getAuth).toHaveBeenCalledTimes(1);
    expect(firebaseSpies.mockAddScope).toHaveBeenCalledTimes(2);
    expect(client.getGoogleCalendarAccessToken()).toBe('ya29.mock-token');
    expect(client.getCurrentGoogleCalendarUser()).toEqual(firebaseSpies.mockUser);

    await client.signOutGoogleCalendar();
    expect(client.getGoogleCalendarAccessToken()).toBeNull();
    expect(firebaseSpies.mockSignOut).toHaveBeenCalledTimes(1);
  });
});
