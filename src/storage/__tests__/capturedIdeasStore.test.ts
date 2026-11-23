/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCapturedIdeas,
  deleteCapturedIdea,
  loadCapturedIdeas,
  saveCapturedIdea,
} from '../capturedIdeasStore';

function createMemoryLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

describe('capturedIdeasStore — offline persistence, sanitization & cleanup', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sanitizes, saves, loads, deletes, and clears captured ideas via offline fallback storage', async () => {
    const initial = await loadCapturedIdeas();
    expect(initial).toEqual([]);

    const saved = await saveCapturedIdea('  <b>Add</b> feed lot & weight reminders  ');
    expect(saved.entry.text).toBe('Add feed lot &amp; weight reminders');
    expect(saved.entry.createdAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(saved.ideas).toHaveLength(1);

    const loaded = await loadCapturedIdeas();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(saved.entry.id);

    const savedSecond = await saveCapturedIdea('Track winter breeding shelter temps');
    expect(savedSecond.ideas).toHaveLength(2);

    const afterDelete = await deleteCapturedIdea(saved.entry.id);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].id).toBe(savedSecond.entry.id);

    const afterClear = await clearCapturedIdeas();
    expect(afterClear).toEqual([]);
    expect(await loadCapturedIdeas()).toEqual([]);
  });

  it('rejects invalid or empty idea inputs before writing to storage', async () => {
    await expect(saveCapturedIdea('<script>alert(1)</script>')).rejects.toThrow();
    expect(await loadCapturedIdeas()).toEqual([]);
  });
});
