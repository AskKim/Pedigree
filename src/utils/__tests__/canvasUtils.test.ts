import { describe, test, expect } from 'vitest';
import { clampCanvasDimensions, releaseCanvas, DEFAULT_STANDARD_CANVAS_AREA_CEILING, DEFAULT_CONSTRAINED_CANVAS_AREA_CEILING } from '../canvasUtils';


describe('canvasUtils', () => {
  test('clampCanvasDimensions respects area ceiling', () => {
    const width = 5000;
    const height = 5000; // area 25,000,000 > default 16,000,000
    const result = clampCanvasDimensions(width, height, DEFAULT_STANDARD_CANVAS_AREA_CEILING);
    expect(result.width * result.height).toBeLessThanOrEqual(DEFAULT_STANDARD_CANVAS_AREA_CEILING);
    expect(result.wasClamped).toBe(true);
  });

  test('clampCanvasDimensions respects constrained ceiling', () => {
    const width = 2000;
    const height = 2000; // area 4,000,000 > constrained 3,000,000
    const result = clampCanvasDimensions(width, height, DEFAULT_CONSTRAINED_CANVAS_AREA_CEILING);
    expect(result.width * result.height).toBeLessThanOrEqual(DEFAULT_CONSTRAINED_CANVAS_AREA_CEILING);
    expect(result.wasClamped).toBe(true);
  });

  test('releaseCanvas does not throw when given null or undefined', () => {
    expect(() => releaseCanvas(null)).not.toThrow();
    expect(() => releaseCanvas(undefined)).not.toThrow();
  });
});
