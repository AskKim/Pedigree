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

import {
  computeRelativeLuminance,
  mixHexColor,
  pickReadableContrastInk,
  resolveSemanticThemeCssVariables,
  type SemanticCssVariableTokenNames,
} from '@engine/primitives/themeColor';

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

const BARN_CSS_TOKEN_NAMES: SemanticCssVariableTokenNames = {
  canvas: '--barn-canvas',
  surface: '--barn-surface',
  subtle: '--barn-subtle',
  border: '--barn-border',
  ink: '--barn-ink',
  muted: '--barn-muted',
  primary: '--barn-sage',
  onPrimary: '--barn-on-sage',
  primaryTint: '--barn-sage-tint',
  accentFill: '--barn-accent-fill',
  accentOnFill: '--barn-accent-on-fill',
  accentText: '--barn-terracotta',
  accentTint: '--barn-terracotta-tint',
  secondary: '--barn-slate',
  secondaryTint: '--barn-slate-tint',
  danger: '--barn-danger',
  onDanger: '--barn-on-danger',
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

/**
 * Linearly mixes two `#RRGGBB` colors (`weight` 0 = `hexA`, 1 = `hexB`).
 */
export function mixHex(hexA: string, hexB: string, weight: number): string {
  return mixHexColor(hexA, hexB, weight);
}

/**
 * Computes WCAG relative luminance (0 = black, 1 = white) to pick readable foreground ink.
 */
export function relativeLuminance(hex: string): number {
  return computeRelativeLuminance(hex);
}

/**
 * Picks warm dark espresso or warm cream text for crisp contrast on any user-chosen button fill.
 */
export function pickContrastInk(bgHex: string): string {
  return pickReadableContrastInk(bgHex, '#0D2616', '#FFF8F0');
}

/**
 * Resolves the complete CSS variable map for the active `themeMode` and `customColors`.
 */
export function resolveThemeCssVariables(
  themeMode: 'light' | 'dark',
  custom?: CustomThemeColors
): Record<string, string> {
  return resolveSemanticThemeCssVariables(
    themeMode,
    custom
      ? {
          lightPrimary: custom.lightPrimary,
          lightAccent: custom.lightAccent,
          lightSecondary: custom.lightMale,
          lightCanvas: custom.lightCanvas,
          lightSurface: custom.lightSurface,
          darkPrimary: custom.darkPrimary,
          darkAccent: custom.darkAccent,
          darkSecondary: custom.darkMale,
          darkCanvas: custom.darkCanvas,
          darkSurface: custom.darkSurface,
        }
      : undefined,
    {
      defaults: {
        lightPrimary: DEFAULT_WARM_THEME_COLORS.lightPrimary,
        lightAccent: DEFAULT_WARM_THEME_COLORS.lightAccent,
        lightSecondary: DEFAULT_WARM_THEME_COLORS.lightMale,
        lightCanvas: DEFAULT_WARM_THEME_COLORS.lightCanvas,
        lightSurface: DEFAULT_WARM_THEME_COLORS.lightSurface,
        darkPrimary: DEFAULT_WARM_THEME_COLORS.darkPrimary,
        darkAccent: DEFAULT_WARM_THEME_COLORS.darkAccent,
        darkSecondary: DEFAULT_WARM_THEME_COLORS.darkMale,
        darkCanvas: DEFAULT_WARM_THEME_COLORS.darkCanvas,
        darkSurface: DEFAULT_WARM_THEME_COLORS.darkSurface,
      },
      tokenNames: BARN_CSS_TOKEN_NAMES,
    }
  );
}
