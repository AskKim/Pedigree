/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure keyboard-navigation helpers for WAI-ARIA comboboxes & listboxes.
 */

export function clampComboboxIndex(currentIndex: number, totalItems: number): number {
  if (totalItems <= 0 || currentIndex < 0) {
    return -1;
  }
  return Math.min(currentIndex, totalItems - 1);
}

/**
 * Computes the next enabled option index for ArrowDown, ArrowUp, Home, and End keys.
 * Returns -1 when no enabled options exist.
 */
export function stepEnabledComboboxIndex(
  currentIndex: number,
  totalItems: number,
  key: string,
  isDisabled?: (index: number) => boolean
): number {
  if (totalItems <= 0) {
    return -1;
  }

  const checkDisabled = (idx: number): boolean => (isDisabled ? Boolean(isDisabled(idx)) : false);

  if (key === 'Home') {
    for (let idx = 0; idx < totalItems; idx++) {
      if (!checkDisabled(idx)) return idx;
    }
    return -1;
  }

  if (key === 'End') {
    for (let idx = totalItems - 1; idx >= 0; idx--) {
      if (!checkDisabled(idx)) return idx;
    }
    return -1;
  }

  if (key !== 'ArrowDown' && key !== 'ArrowUp') {
    return clampComboboxIndex(currentIndex, totalItems);
  }

  const delta = key === 'ArrowDown' ? 1 : -1;
  let candidate =
    currentIndex < 0 || currentIndex >= totalItems
      ? key === 'ArrowDown'
        ? 0
        : totalItems - 1
      : (currentIndex + delta + totalItems) % totalItems;

  for (let steps = 0; steps < totalItems; steps++) {
    if (!checkDisabled(candidate)) {
      return candidate;
    }
    candidate = (candidate + delta + totalItems) % totalItems;
  }

  return -1;
}
