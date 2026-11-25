import { describe, expect, it, vi } from 'vitest';
import {
  attemptOneTimeChunkReload,
  isRecoverableChunkError,
  loadWithSingleRetry,
} from '../lazyRoute';

describe('lazyRoute chunk loader', () => {
  it('resolves named screen exports into default component wrappers', async () => {
    const DummyScreen = () => null;
    const result = await loadWithSingleRetry(
      async () => ({ DummyScreen }),
      'DummyScreen',
      'Dummy Screen',
      0
    );
    expect(result.default).toBe(DummyScreen);
  });

  it('automatically retries once if an initial chunk load fails transiently', async () => {
    const RecoveredScreen = () => null;
    const loader = vi
      .fn<() => Promise<Record<string, unknown>>>()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce({ RecoveredScreen });

    const result = await loadWithSingleRetry(loader, 'RecoveredScreen', 'Recovered Screen', 0);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(result.default).toBe(RecoveredScreen);
  });

  it('throws a clear error if the retry also fails or export is missing', async () => {
    const failingLoader = vi
      .fn<() => Promise<Record<string, unknown>>>()
      .mockRejectedValue(new Error('ChunkLoadError: Loading chunk 42 failed'));

    await expect(
      loadWithSingleRetry(failingLoader, 'Missing', 'Reports', 0)
    ).rejects.toThrow(/ChunkLoadError/);
    expect(failingLoader).toHaveBeenCalledTimes(2);

    await expect(
      loadWithSingleRetry(async () => ({}), 'ReportsScreen', 'Reports', 0)
    ).rejects.toThrow(/did not export "ReportsScreen"/);
  });

  it('classifies 504 Outdated Optimize Dep and dynamic import failures cleanly and enforces one-shot reload cooldown', () => {
    expect(isRecoverableChunkError(new Error('504 (Outdated Optimize Dep)'))).toBe(true);
    expect(isRecoverableChunkError(new Error('Failed to fetch dynamically imported module'))).toBe(true);
    expect(isRecoverableChunkError(new Error('TypeError: Cannot read properties of null'))).toBe(false);

    const store = new Map<string, string>([['app_pending_boot_ts', '12345']]);
    const reloadSpy = vi.fn();
    vi.stubGlobal('window', {
      location: { reload: reloadSpy },
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
    vi.stubGlobal('navigator', { onLine: true });

    try {
      expect(attemptOneTimeChunkReload('Dashboard')).toBe(true);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
      expect(store.has('app_pending_boot_ts')).toBe(false);

      // Immediate second failure inside cooldown must NOT loop reloads
      expect(attemptOneTimeChunkReload('Dashboard')).toBe(false);
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
