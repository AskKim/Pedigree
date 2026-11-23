import { describe, expect, it } from 'vitest';
import { computeVirtualWindow } from '../useVirtualWindow';

describe('ES2018 Window Virtualizer (computeVirtualWindow)', () => {
  it('handles empty lists cleanly', () => {
    expect(
      computeVirtualWindow({
        itemCount: 0,
        scrollTop: 120,
        viewportHeight: 500,
        estimateSize: 60,
      })
    ).toEqual({
      startIndex: 0,
      endIndex: -1,
      paddingTop: 0,
      paddingBottom: 0,
      totalHeight: 0,
    });
  });

  it('renders a bounded fallback slice before viewport height is measured', () => {
    const res = computeVirtualWindow({
      itemCount: 1200,
      scrollTop: 0,
      viewportHeight: 0,
      estimateSize: 50,
      initialFallbackCount: 15,
    });
    expect(res.startIndex).toBe(0);
    expect(res.endIndex).toBe(14);
    expect(res.paddingTop).toBe(0);
    expect(res.totalHeight).toBe(1200 * 50);
    expect(res.paddingBottom).toBe((1200 - 15) * 50);
  });

  it('windows mid-list scrolls with overscan and exact padding totals', () => {
    const res = computeVirtualWindow({
      itemCount: 1000,
      scrollTop: 5000, // item 100 at 50px each
      viewportHeight: 400, // 8 visible items: 100..107
      estimateSize: 50,
      overscan: 4,
    });
    expect(res.startIndex).toBe(96);
    expect(res.endIndex).toBe(111);
    expect(res.paddingTop).toBe(96 * 50);
    expect(res.paddingBottom).toBe((1000 - 112) * 50);
    expect(
      res.paddingTop + (res.endIndex - res.startIndex + 1) * 50 + res.paddingBottom
    ).toBe(res.totalHeight);
  });

  it('respects measured variable row heights and clamps overscrolled offsets', () => {
    const measured = new Map<number, number>([
      [0, 120],
      [1, 100],
      [2, 80],
    ]);
    const res = computeVirtualWindow({
      itemCount: 50,
      scrollTop: 999999,
      viewportHeight: 300,
      estimateSize: 60,
      overscan: 2,
      measuredHeights: measured,
    });
    expect(res.endIndex).toBe(49);
    expect(res.paddingBottom).toBe(0);
    // First 3 rows are 120+100+80=300, remaining 47 rows are 60px -> total 3120
    expect(res.totalHeight).toBe(300 + 47 * 60);
  });
});
