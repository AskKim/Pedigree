import { describe, expect, it } from 'vitest';
import { clampComboboxIndex, stepEnabledComboboxIndex } from '../comboboxNav';

describe('comboboxNav — WAI-ARIA keyboard stepping', () => {
  it('clamps indices cleanly when option count shrinks or becomes empty', () => {
    expect(clampComboboxIndex(3, 0)).toBe(-1);
    expect(clampComboboxIndex(-1, 5)).toBe(-1);
    expect(clampComboboxIndex(4, 2)).toBe(1);
    expect(clampComboboxIndex(1, 5)).toBe(1);
  });

  it('steps ArrowDown, ArrowUp, Home, and End with wrapping', () => {
    expect(stepEnabledComboboxIndex(-1, 4, 'ArrowDown')).toBe(0);
    expect(stepEnabledComboboxIndex(0, 4, 'ArrowDown')).toBe(1);
    expect(stepEnabledComboboxIndex(3, 4, 'ArrowDown')).toBe(0);

    expect(stepEnabledComboboxIndex(-1, 4, 'ArrowUp')).toBe(3);
    expect(stepEnabledComboboxIndex(0, 4, 'ArrowUp')).toBe(3);
    expect(stepEnabledComboboxIndex(2, 4, 'ArrowUp')).toBe(1);

    expect(stepEnabledComboboxIndex(2, 4, 'Home')).toBe(0);
    expect(stepEnabledComboboxIndex(0, 4, 'End')).toBe(3);
  });

  it('skips disabled options and returns -1 if every option is disabled', () => {
    const isDisabled = (idx: number) => idx === 1 || idx === 2;
    expect(stepEnabledComboboxIndex(0, 4, 'ArrowDown', isDisabled)).toBe(3);
    expect(stepEnabledComboboxIndex(3, 4, 'ArrowUp', isDisabled)).toBe(0);

    const isFirstLastDisabled = (idx: number) => idx === 0 || idx === 3;
    expect(stepEnabledComboboxIndex(-1, 4, 'Home', isFirstLastDisabled)).toBe(1);
    expect(stepEnabledComboboxIndex(-1, 4, 'End', isFirstLastDisabled)).toBe(2);

    expect(stepEnabledComboboxIndex(0, 3, 'ArrowDown', () => true)).toBe(-1);
  });
});
