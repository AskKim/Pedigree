/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('googleCalendarClient Firebase-free offline behavior', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('starts disconnected with no user or access token and cleanly detaches auth listener', async () => {
    const client = await import('../googleCalendarClient');
    const onSuccess = vi.fn();
    const onFailure = vi.fn();

    expect(client.getCurrentGoogleCalendarUser()).toBeNull();
    expect(client.getGoogleCalendarAccessToken()).toBeNull();

    const cleanup = client.initGoogleCalendarAuth(onSuccess, onFailure);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(null);
    cleanup();

    await client.signOutGoogleCalendar();
    expect(client.getGoogleCalendarAccessToken()).toBeNull();
  });

  it('rejects direct signInGoogleCalendar cleanly and directs users to offline .ICS export', async () => {
    const client = await import('../googleCalendarClient');

    await expect(client.signInGoogleCalendar()).rejects.toThrow(/Firebase removed/i);
    expect(client.getGoogleCalendarAccessToken()).toBeNull();
    expect(client.getCurrentGoogleCalendarUser()).toBeNull();
  });
});
