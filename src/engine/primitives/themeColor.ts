/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure Content-Agnostic WCAG Theme Color Math & CSS Variable Resolver
 * (`@engine/primitives/themeColor.ts`).
 *
 * Zero DOM, zero Node built-ins, zero domain terminology.
 */

export interface SemanticThemePalette {
  lightPrimary?: string;
  lightAccent?: string;
  lightSecondary?: string;
  lightCanvas?: string;
  lightSurface?: string;
  darkPrimary?: string;
  darkAccent?: string;
  darkSecondary?: string;
  darkCanvas?: string;
  darkSurface?: string;
}

export interface SemanticThemeDefaults {
  lightPrimary: string;
  lightAccent: string;
  lightSecondary: string;
  lightCanvas: string;
  lightSurface: string;
  darkPrimary: string;
  darkAccent: string;
  darkSecondary: string;
  darkCanvas: string;
  darkSurface: string;
}

export const DEFAULT_SEMANTIC_THEME_PALETTE: SemanticThemeDefaults = {
  lightPrimary: '#2D5E3F',
  lightAccent: '#8C3F20',
  lightSecondary: '#366685',
  lightCanvas: '#F2E9DA',
  lightSurface: '#FAF5EB',
  darkPrimary: '#8DD6A3',
  darkAccent: '#783519',
  darkSecondary: '#88C0E6',
  darkCanvas: '#0F1611',
  darkSurface: '#172219',
};

export interface SemanticCssVariableTokenNames {
  canvas: string;
  surface: string;
  subtle: string;
  border: string;
  ink: string;
  muted: string;
  primary: string;
  onPrimary: string;
  primaryTint: string;
  accentFill: string;
  accentOnFill: string;
  accentText: string;
  accentTint: string;
  secondary: string;
  secondaryTint: string;
  danger: string;
  onDanger: string;
}

export function buildPrefixedTokenNames(prefix = '--app'): SemanticCssVariableTokenNames {
  const cleanPrefix = prefix.startsWith('--') ? prefix.replace(/-+$/, '') : `--${prefix.replace(/-+$/, '')}`;
  return {
    canvas: `${cleanPrefix}-canvas`,
    surface: `${cleanPrefix}-surface`,
    subtle: `${cleanPrefix}-subtle`,
    border: `${cleanPrefix}-border`,
    ink: `${cleanPrefix}-ink`,
    muted: `${cleanPrefix}-muted`,
    primary: `${cleanPrefix}-primary`,
    onPrimary: `${cleanPrefix}-on-primary`,
    primaryTint: `${cleanPrefix}-primary-tint`,
    accentFill: `${cleanPrefix}-accent-fill`,
    accentOnFill: `${cleanPrefix}-accent-on-fill`,
    accentText: `${cleanPrefix}-accent-text`,
    accentTint: `${cleanPrefix}-accent-tint`,
    secondary: `${cleanPrefix}-secondary`,
    secondaryTint: `${cleanPrefix}-secondary-tint`,
    danger: `${cleanPrefix}-danger`,
    onDanger: `${cleanPrefix}-on-danger`,
  };
}

export function normalizeHexColor(hex: string | undefined, fallback: string): string {
  const raw = (hex || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  return fallback.toUpperCase();
}

export function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbTupleToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * Linearly mixes two `#RRGGBB` colors (`weight` 0 = `hexA`, 1 = `hexB`).
 */
export function mixHexColor(hexA: string, hexB: string, weight: number): string {
  const [r1, g1, b1] = hexToRgbTuple(hexA);
  const [r2, g2, b2] = hexToRgbTuple(hexB);
  const w = Math.max(0, Math.min(1, weight));
  return rgbTupleToHex(r1 + (r2 - r1) * w, g1 + (g2 - g1) * w, b1 + (b2 - b1) * w);
}

/**
 * Computes WCAG relative luminance (0 = black, 1 = white) to pick readable foreground ink.
 */
export function computeRelativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgbTuple(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Picks dark or light ink with crisp WCAG contrast over any background hex color.
 */
export function pickReadableContrastInk(
  bgHex: string,
  darkInk = '#0D2616',
  lightInk = '#FFF8F0'
): string {
  return computeRelativeLuminance(bgHex) > 0.34 ? darkInk : lightInk;
}

/**
 * Sanitizes an unknown color object down to an allowlist of validated `#RRGGBB` hex entries.
 */
export function sanitizeHexColorRecord<TKey extends string>(
  raw: unknown,
  allowedKeys: readonly TKey[]
): Partial<Record<TKey, string>> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const clean: Partial<Record<TKey, string>> = {};
  let hasAny = false;
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const candidate = src[key];
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
        clean[key] = trimmed.toUpperCase();
        hasAny = true;
      }
    }
  }
  return hasAny ? clean : undefined;
}

/**
 * Resolves a complete semantic CSS variable map for Light or Dark mode using any
 * caller-provided token names or prefix.
 */
export function resolveSemanticThemeCssVariables(
  themeMode: 'light' | 'dark',
  palette?: SemanticThemePalette,
  options?: {
    defaults?: SemanticThemeDefaults;
    cssVarPrefix?: string;
    tokenNames?: SemanticCssVariableTokenNames;
  }
): Record<string, string> {
  const defaults = options?.defaults ?? DEFAULT_SEMANTIC_THEME_PALETTE;
  const tokens = options?.tokenNames ?? buildPrefixedTokenNames(options?.cssVarPrefix ?? '--app');

  const merged: SemanticThemeDefaults = {
    lightPrimary: normalizeHexColor(palette?.lightPrimary, defaults.lightPrimary),
    lightAccent: normalizeHexColor(palette?.lightAccent, defaults.lightAccent),
    lightSecondary: normalizeHexColor(palette?.lightSecondary, defaults.lightSecondary),
    lightCanvas: normalizeHexColor(palette?.lightCanvas, defaults.lightCanvas),
    lightSurface: normalizeHexColor(palette?.lightSurface, defaults.lightSurface),
    darkPrimary: normalizeHexColor(palette?.darkPrimary, defaults.darkPrimary),
    darkAccent: normalizeHexColor(palette?.darkAccent, defaults.darkAccent),
    darkSecondary: normalizeHexColor(palette?.darkSecondary, defaults.darkSecondary),
    darkCanvas: normalizeHexColor(palette?.darkCanvas, defaults.darkCanvas),
    darkSurface: normalizeHexColor(palette?.darkSurface, defaults.darkSurface),
  };

  if (themeMode === 'dark') {
    const canvas = merged.darkCanvas;
    const surface = merged.darkSurface;
    const isLightCustomCanvas = computeRelativeLuminance(canvas) > 0.45;
    const ink = isLightCustomCanvas ? '#231E18' : '#EFECE4';
    const muted = mixHexColor(ink, surface, 0.38);
    const subtle = mixHexColor(surface, ink, 0.08);
    const border = mixHexColor(surface, ink, 0.16);
    const primary = merged.darkPrimary;
    const accentFill = merged.darkAccent;
    const accentText =
      computeRelativeLuminance(accentFill) < 0.22
        ? mixHexColor(accentFill, '#FFB899', 0.58)
        : accentFill;

    return {
      [tokens.canvas]: canvas,
      [tokens.surface]: surface,
      [tokens.subtle]: subtle,
      [tokens.border]: border,
      [tokens.ink]: ink,
      [tokens.muted]: muted,
      [tokens.primary]: primary,
      [tokens.onPrimary]: pickReadableContrastInk(primary),
      [tokens.primaryTint]: mixHexColor(surface, primary, 0.2),
      [tokens.accentFill]: accentFill,
      [tokens.accentOnFill]: pickReadableContrastInk(accentFill),
      [tokens.accentText]: accentText,
      [tokens.accentTint]: mixHexColor(surface, accentFill, 0.35),
      [tokens.secondary]: merged.darkSecondary,
      [tokens.secondaryTint]: mixHexColor(surface, merged.darkSecondary, 0.22),
      [tokens.danger]: '#F28B82',
      [tokens.onDanger]: pickReadableContrastInk('#F28B82'),
    };
  }

  const canvas = merged.lightCanvas;
  const surface = merged.lightSurface;
  const isDarkCustomCanvas = computeRelativeLuminance(canvas) < 0.25;
  const ink = isDarkCustomCanvas ? '#EFECE4' : '#241E18';
  const muted = mixHexColor(ink, surface, 0.42);
  const subtle = mixHexColor(canvas, ink, 0.07);
  const border = mixHexColor(canvas, ink, 0.18);
  const primary = merged.lightPrimary;
  const accentFill = merged.lightAccent;
  const accentText =
    computeRelativeLuminance(accentFill) > 0.45
      ? mixHexColor(accentFill, '#5C220E', 0.45)
      : accentFill;

  return {
    [tokens.canvas]: canvas,
    [tokens.surface]: surface,
    [tokens.subtle]: subtle,
    [tokens.border]: border,
    [tokens.ink]: ink,
    [tokens.muted]: muted,
    [tokens.primary]: primary,
    [tokens.onPrimary]: pickReadableContrastInk(primary),
    [tokens.primaryTint]: mixHexColor(surface, primary, 0.16),
    [tokens.accentFill]: accentFill,
    [tokens.accentOnFill]: pickReadableContrastInk(accentFill),
    [tokens.accentText]: accentText,
    [tokens.accentTint]: mixHexColor(surface, accentFill, 0.16),
    [tokens.secondary]: merged.lightSecondary,
    [tokens.secondaryTint]: mixHexColor(surface, merged.lightSecondary, 0.15),
    [tokens.danger]: '#B5382B',
    [tokens.onDanger]: pickReadableContrastInk('#B5382B'),
  };
}
