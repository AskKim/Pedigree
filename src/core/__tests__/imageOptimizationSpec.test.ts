/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  capCanvasDevicePixelRatio,
  clampCanvasDimensionsToAreaCeiling,
  computeScaledDimensions,
  getCanvasAreaCeiling,
  MAX_CANVAS_AREA_PX,
  MAX_CONSTRAINED_CANVAS_AREA_PX,
} from '../imageOptimizationSpec';

describe('imageOptimizationSpec canvas area ceilings & DPR caps', () => {
  it('defines 16M px standard ceiling and 3M px constrained ceiling', () => {
    expect(MAX_CANVAS_AREA_PX).toBe(16_000_000);
    expect(MAX_CONSTRAINED_CANVAS_AREA_PX).toBe(3_000_000);
    expect(getCanvasAreaCeiling(false)).toBe(16_000_000);
    expect(getCanvasAreaCeiling(true)).toBe(3_000_000);
  });

  it('clamps oversized canvas dimensions proportionally to stay within the area ceiling', () => {
    const ok = clampCanvasDimensionsToAreaCeiling(4000, 4000, MAX_CANVAS_AREA_PX);
    expect(ok).toEqual({ width: 4000, height: 4000, wasClamped: false });

    const ultraWide = clampCanvasDimensionsToAreaCeiling(10000, 3000, MAX_CANVAS_AREA_PX);
    expect(ultraWide.wasClamped).toBe(true);
    expect(ultraWide.width * ultraWide.height).toBeLessThanOrEqual(MAX_CANVAS_AREA_PX);
    expect(ultraWide.width).toBeGreaterThan(ultraWide.height);

    const constrained = clampCanvasDimensionsToAreaCeiling(
      3000,
      2000,
      MAX_CONSTRAINED_CANVAS_AREA_PX
    );
    expect(constrained.wasClamped).toBe(true);
    expect(constrained.width * constrained.height).toBeLessThanOrEqual(
      MAX_CONSTRAINED_CANVAS_AREA_PX
    );

    const edge = clampCanvasDimensionsToAreaCeiling(0, -10, 0);
    expect(edge.width).toBeGreaterThanOrEqual(1);
    expect(edge.height).toBeGreaterThanOrEqual(1);
  });

  it('applies area ceilings inside computeScaledDimensions when maxDimension alone exceeds ceiling', () => {
    const squareConstrained = computeScaledDimensions(
      4000,
      4000,
      2048,
      MAX_CONSTRAINED_CANVAS_AREA_PX
    );
    expect(squareConstrained.wasResized).toBe(true);
    expect(squareConstrained.width * squareConstrained.height).toBeLessThanOrEqual(
      MAX_CONSTRAINED_CANVAS_AREA_PX
    );
    expect(squareConstrained.width).toBe(squareConstrained.height);
  });

  it('caps devicePixelRatio at min(2, dpr || 1) and forces 1 when constrained', () => {
    expect(capCanvasDevicePixelRatio(3, false)).toBe(2);
    expect(capCanvasDevicePixelRatio(2, false)).toBe(2);
    expect(capCanvasDevicePixelRatio(1.5, false)).toBe(1.5);
    expect(capCanvasDevicePixelRatio(0, false)).toBe(1);
    expect(capCanvasDevicePixelRatio(undefined, false)).toBe(1);
    expect(capCanvasDevicePixelRatio(Number.NaN, false)).toBe(1);

    expect(capCanvasDevicePixelRatio(3, true)).toBe(1);
    expect(capCanvasDevicePixelRatio(2, true)).toBe(1);
  });
});
