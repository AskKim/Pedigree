/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Minimal zero-dependency ES2018 runtime shims.
 * Targets 2018-era browsers (Chrome 68+, Safari 12+, Firefox 63+, Edge 79+) without core-js bloat:
 * - globalThis (ES2020)
 * - Promise.allSettled (ES2020)
 * - Object.fromEntries (ES2019)
 */

export function ensureEs2018Globals(host?: Record<string, unknown>): void {
  const g: Record<string, any> | undefined =
    host ??
    (typeof globalThis !== 'undefined'
      ? (globalThis as Record<string, any>)
      : typeof window !== 'undefined'
      ? (window as Record<string, any>)
      : typeof self !== 'undefined'
      ? (self as Record<string, any>)
      : typeof global !== 'undefined'
      ? (global as Record<string, any>)
      : undefined);

  if (!g) return;

  if (typeof g.globalThis === 'undefined') {
    try {
      g.globalThis = g;
    } catch {
      // Ignore read-only global hosts
    }
  }

  const promiseObj = (g.Promise ?? (typeof Promise === 'function' ? Promise : undefined)) as
    | Record<string, any>
    | undefined;

  if (promiseObj && typeof promiseObj['allSettled'] !== 'function') {
    promiseObj['allSettled'] = function allSettledShim(values: Iterable<unknown>): Promise<unknown[]> {
      const items = Array.from(values);
      return promiseObj.all(
        items.map((item) =>
          promiseObj.resolve(item).then(
            (value: unknown) => ({ status: 'fulfilled' as const, value }),
            (reason: unknown) => ({ status: 'rejected' as const, reason })
          )
        )
      );
    };
  }

  const objectObj = (g.Object ?? Object) as Record<string, any>;
  if (objectObj && typeof objectObj['fromEntries'] !== 'function') {
    objectObj['fromEntries'] = function fromEntriesShim(
      entries: Iterable<readonly [PropertyKey, unknown]>
    ): Record<string, unknown> {
      const out: Record<string, unknown> = {};
      if (!entries) return out;
      for (const pair of entries) {
        if (pair != null) {
          out[String(pair[0])] = pair[1];
        }
      }
      return out;
    };
  }
}

ensureEs2018Globals();
