/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Theme Palette & Custom Color Picker Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript color math with zero browser DOM (`window`, `document`) calls.
 * Computes full Light ("Warm Parchment & Copper") and Dark ("Original Woodland & Copper")
 * token sets, plus automatic WCAG contrast text and surface tints when users pick custom hex colors.
 */

export interface CustomThemeColors {
  lightPrimary?: string;
  lightAccent?: string;
  lightMale?: string;
  lightCanvas?: string;
  lightSurface?: string;
  darkPrimary?: string;
  darkAccent?: string;
  darkMale?: string;
  darkCanvas?: string;
  darkSurface?: string;
}

export interface ThemePresetOption {
  id: string;
  name: string;
  description: string;
  colors: CustomThemeColors;
}

export const DEFAULT_WARM_THEME_COLORS: Required<CustomThemeColors> = {
  // Warm Parchment & Copper (Light)
  lightPrimary: '#2D5E3F',
  lightAccent: '#8C3F20',
  lightMale: '#366685',
  lightCanvas: '#F2E9DA',
  lightSurface: '#FAF5EB',
  // Original Woodland & Copper (Dark — matched to original demo screenshots)
  darkPrimary: '#8DD6A3',
  darkAccent: '#783519',
  darkMale: '#88C0E6',
  darkCanvas: '#0F1611',
  darkSurface: '#172219',
};

export const WARM_THEME_PRESETS: ThemePresetOption[] = [
  {
    id: 'original-woodland',
    name: 'Original Woodland & Copper',
    description: 'Deep moss woodland dark mode and sun-warmed parchment light mode with copper accents.',
    colors: { ...DEFAULT_WARM_THEME_COLORS },
  },
  {
    id: 'nz-red-heritage',
    name: 'New Zealand Red Barn',
    description: 'Rich rufus-mahogany accents paired with warm cedar dark surfaces and cream linen.',
    colors: {
      lightPrimary: '#9E3D22',
      lightAccent: '#6E4B26',
      lightMale: '#35607A',
      lightCanvas: '#F4EAE0',
      lightSurface: '#FCF6F0',
      darkPrimary: '#F09A79',
      darkAccent: '#69321E',
      darkMale: '#88BBD9',
      darkCanvas: '#171210',
      darkSurface: '#231B18',
    },
  },
  {
    id: 'harvest-ochre',
    name: 'Harvest Meadow & Ochre',
    description: 'Warm golden-ochre active tabs with botanical olive-sage actions and oat surfaces.',
    colors: {
      lightPrimary: '#3A6338',
      lightAccent: '#9A601E',
      lightMale: '#3B6680',
      lightCanvas: '#F3EBDC',
      lightSurface: '#FBF7EE',
      darkPrimary: '#A4D88C',
      darkAccent: '#754A18',
      darkMale: '#8BC2DE',
      darkCanvas: '#121610',
      darkSurface: '#1B2117',
    },
  },
  {
    id: 'espresso-homestead',
    name: 'Homestead Espresso & Sage',
    description: 'Warm walnut-espresso dark canvas and honeyed parchment light mode.',
    colors: {
      lightPrimary: '#2F5D46',
      lightAccent: '#824328',
      lightMale: '#3B6582',
      lightCanvas: '#EFE5D6',
      lightSurface: '#F9F3EA',
      darkPrimary: '#88D1A8',
      darkAccent: '#703A22',
      darkMale: '#8BBEE0',
      darkCanvas: '#161310',
      darkSurface: '#211D18',
    },
  },
];

function normalizeHex(hex: string | undefined, fallback: string): string {
  const raw = (hex || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  return fallback.toUpperCase();
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
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
export function mixHex(hexA: string, hexB: string, weight: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, weight));
  return rgbToHex(r1 + (r2 - r1) * w, g1 + (g2 - g1) * w, b1 + (b2 - b1) * w);
}

/**
 * Computes WCAG relative luminance (0 = black, 1 = white) to pick readable foreground ink.
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Picks warm dark espresso or warm cream text for crisp contrast on any user-chosen button fill.
 */
export function pickContrastInk(bgHex: string): string {
  return relativeLuminance(bgHex) > 0.34 ? '#0D2616' : '#FFF8F0';
}

/**
 * Resolves the complete CSS variable map for the active `themeMode` and `customColors`.
 */
export function resolveThemeCssVariables(
  themeMode: 'light' | 'dark',
  custom?: CustomThemeColors
): Record<string, string> {
  const merged: Required<CustomThemeColors> = {
    lightPrimary: normalizeHex(custom?.lightPrimary, DEFAULT_WARM_THEME_COLORS.lightPrimary),
    lightAccent: normalizeHex(custom?.lightAccent, DEFAULT_WARM_THEME_COLORS.lightAccent),
    lightMale: normalizeHex(custom?.lightMale, DEFAULT_WARM_THEME_COLORS.lightMale),
    lightCanvas: normalizeHex(custom?.lightCanvas, DEFAULT_WARM_THEME_COLORS.lightCanvas),
    lightSurface: normalizeHex(custom?.lightSurface, DEFAULT_WARM_THEME_COLORS.lightSurface),
    darkPrimary: normalizeHex(custom?.darkPrimary, DEFAULT_WARM_THEME_COLORS.darkPrimary),
    darkAccent: normalizeHex(custom?.darkAccent, DEFAULT_WARM_THEME_COLORS.darkAccent),
    darkMale: normalizeHex(custom?.darkMale, DEFAULT_WARM_THEME_COLORS.darkMale),
    darkCanvas: normalizeHex(custom?.darkCanvas, DEFAULT_WARM_THEME_COLORS.darkCanvas),
    darkSurface: normalizeHex(custom?.darkSurface, DEFAULT_WARM_THEME_COLORS.darkSurface),
  };

  if (themeMode === 'dark') {
    const canvas = merged.darkCanvas;
    const surface = merged.darkSurface;
    const isLightCustomCanvas = relativeLuminance(canvas) > 0.45;
    const ink = isLightCustomCanvas ? '#231E18' : '#EFECE4';
    const muted = mixHex(ink, surface, 0.38);
    const subtle = mixHex(surface, ink, 0.08);
    const border = mixHex(surface, ink, 0.16);
    const primary = merged.darkPrimary;
    const accentFill = merged.darkAccent;
    // Ensure Dam text / curve is warm and luminous against dark surfaces
    const terracottaText =
      relativeLuminance(accentFill) < 0.22 ? mixHex(accentFill, '#FFB899', 0.58) : accentFill;

    return {
      '--barn-canvas': canvas,
      '--barn-surface': surface,
      '--barn-subtle': subtle,
      '--barn-border': border,
      '--barn-ink': ink,
      '--barn-muted': muted,
      '--barn-sage': primary,
      '--barn-on-sage': pickContrastInk(primary),
      '--barn-sage-tint': mixHex(surface, primary, 0.2),
      '--barn-accent-fill': accentFill,
      '--barn-accent-on-fill': pickContrastInk(accentFill),
      '--barn-terracotta': terracottaText,
      '--barn-terracotta-tint': mixHex(surface, accentFill, 0.35),
      '--barn-slate': merged.darkMale,
      '--barn-slate-tint': mixHex(surface, merged.darkMale, 0.22),
      '--barn-danger': '#F28B82',
    };
  }

  // Warm Light Mode
  const canvas = merged.lightCanvas;
  const surface = merged.lightSurface;
  const isDarkCustomCanvas = relativeLuminance(canvas) < 0.25;
  const ink = isDarkCustomCanvas ? '#EFECE4' : '#241E18';
  const muted = mixHex(ink, surface, 0.42);
  const subtle = mixHex(canvas, ink, 0.07);
  const border = mixHex(canvas, ink, 0.18);
  const primary = merged.lightPrimary;
  const accentFill = merged.lightAccent;
  const terracottaText =
    relativeLuminance(accentFill) > 0.45 ? mixHex(accentFill, '#5C220E', 0.45) : accentFill;

  return {
    '--barn-canvas': canvas,
    '--barn-surface': surface,
    '--barn-subtle': subtle,
    '--barn-border': border,
    '--barn-ink': ink,
    '--barn-muted': muted,
    '--barn-sage': primary,
    '--barn-on-sage': pickContrastInk(primary),
    '--barn-sage-tint': mixHex(surface, primary, 0.16),
    '--barn-accent-fill': accentFill,
    '--barn-accent-on-fill': pickContrastInk(accentFill),
    '--barn-terracotta': terracottaText,
    '--barn-terracotta-tint': mixHex(surface, accentFill, 0.16),
    '--barn-slate': merged.lightMale,
    '--barn-slate-tint': mixHex(surface, merged.lightMale, 0.15),
    '--barn-danger': '#B5382B',
  };
}
