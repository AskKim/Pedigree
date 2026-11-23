import { describe, expect, it, vi } from 'vitest';
import { loadWithSingleRetry } from '../lazyRoute';

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
});
