/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Pedigree Print Styling, Color, Border & Layout Presets (`src/domain/pedigreePrintStyles.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) calls so the exact same
 * print palettes and layout rules power HTML exports, native PDF 1.4 rendering, and React Native / Expo.
 * All paper backgrounds are strictly locked to `#FFFFFF` for printer ink safety.
 */

import {
  CustomThemeColors,
  DEFAULT_WARM_THEME_COLORS,
  mixHex,
  relativeLuminance,
} from './themePalette';

export type PedigreeColorPresetId =
  | 'classic_sage'
  | 'royal_navy'
  | 'heritage_burgundy'
  | 'barn_palette'
  | 'monochrome_ink';

export type PedigreeBorderStyleId =
  | 'classic_rule'
  | 'double_frame'
  | 'modern_rounded'
  | 'minimal_lines';

export type PedigreeLayoutPresetId =
  | 'evans_standard'
  | 'show_certificate'
  | 'compact_ledger'
  | 'family_portrait'
  | 'iagarb_angora';

export interface PedigreeColorPresetSpec {
  id: PedigreeColorPresetId;
  label: string;
  description: string;
  primaryHex: string;
  accentHex: string;
  sireHex: string;
  damHex: string;
  borderHex: string;
  cellBorderHex: string;
}

export interface PedigreeBorderStyleSpec {
  id: PedigreeBorderStyleId;
  label: string;
  description: string;
}

export interface PedigreeLayoutPresetSpec {
  id: PedigreeLayoutPresetId;
  label: string;
  description: string;
}

export interface PedigreeQuickPresetSpec {
  id: string;
  label: string;
  description: string;
  colorPreset: PedigreeColorPresetId;
  borderStyle: PedigreeBorderStyleId;
  layoutPreset: PedigreeLayoutPresetId;
}

export interface ResolvedPedigreePrintTheme {
  colorPreset: PedigreeColorPresetId;
  borderStyle: PedigreeBorderStyleId;
  layoutPreset: PedigreeLayoutPresetId;
  paperBg: '#FFFFFF';
  inkHex: string;
  mutedInkHex: string;
  primaryHex: string;
  accentHex: string;
  sireHex: string;
  damHex: string;
  borderHex: string;
  cellBorderHex: string;
  isMonochrome: boolean;
}

export const PEDIGREE_COLOR_PRESETS: readonly PedigreeColorPresetSpec[] = [
  {
    id: 'classic_sage',
    label: 'Classic Barn Sage',
    description: 'Traditional forest green header with slate sire & terracotta dam accents.',
    primaryHex: '#1E3F2A',
    accentHex: '#2D5A3D',
    sireHex: '#366685',
    damHex: '#8C3F20',
    borderHex: '#2D5A3D',
    cellBorderHex: '#B8B3A8',
  },
  {
    id: 'royal_navy',
    label: 'Registry Navy & Gold',
    description: 'Deep navy headers with muted brass borders and cobalt/burgundy parent bars.',
    primaryHex: '#1B365D',
    accentHex: '#7A5C18',
    sireHex: '#2B547E',
    damHex: '#7C2D3B',
    borderHex: '#1B365D',
    cellBorderHex: '#AEBAC9',
  },
  {
    id: 'heritage_burgundy',
    label: 'Heritage Burgundy',
    description: 'Warm show-barn burgundy headings with espresso rules.',
    primaryHex: '#5C1D28',
    accentHex: '#4A3728',
    sireHex: '#345978',
    damHex: '#8C3340',
    borderHex: '#5C1D28',
    cellBorderHex: '#C4B6B2',
  },
  {
    id: 'barn_palette',
    label: 'My Barn Theme',
    description: 'Adapts your custom Barn Color Picker palette safely for white-paper print.',
    primaryHex: DEFAULT_WARM_THEME_COLORS.lightPrimary,
    accentHex: DEFAULT_WARM_THEME_COLORS.lightAccent,
    sireHex: DEFAULT_WARM_THEME_COLORS.lightMale,
    damHex: DEFAULT_WARM_THEME_COLORS.lightAccent,
    borderHex: DEFAULT_WARM_THEME_COLORS.lightPrimary,
    cellBorderHex: '#B8B3A8',
  },
  {
    id: 'monochrome_ink',
    label: 'Ink Saver (B&W)',
    description: 'Pure black & charcoal lines optimized for monochrome laser or thermal print.',
    primaryHex: '#000000',
    accentHex: '#18181B',
    sireHex: '#18181B',
    damHex: '#3F3F46',
    borderHex: '#000000',
    cellBorderHex: '#9CA3AF',
  },
];

export const PEDIGREE_BORDER_STYLES: readonly PedigreeBorderStyleSpec[] = [
  {
    id: 'classic_rule',
    label: 'Classic Rule',
    description: 'Crisp single grid lines with colored sire/dam accent bars.',
  },
  {
    id: 'double_frame',
    label: 'Certificate Double Frame',
    description: 'Formal double outer certificate border framing the pedigree.',
  },
  {
    id: 'modern_rounded',
    label: 'Modern Rounded',
    description: 'Subtle rounded outer subject & header framing with clean table grid.',
  },
  {
    id: 'minimal_lines',
    label: 'Minimal Hairline',
    description: 'Lightweight rules maximizing vertical room for 6–8 generation pedigrees.',
  },
];

export const PEDIGREE_LAYOUT_PRESETS: readonly PedigreeLayoutPresetSpec[] = [
  {
    id: 'evans_standard',
    label: 'Evans Classic',
    description: 'Standard Evans-style header, subject summary strip, and full rowspan matrix.',
  },
  {
    id: 'show_certificate',
    label: 'Show Certificate',
    description: 'Centered formal title banner with prominent registration & GC callouts.',
  },
  {
    id: 'compact_ledger',
    label: 'Compact Ledger',
    description: 'Tighter header & subject summary leaving maximum vertical space for deep trees.',
  },
  {
    id: 'family_portrait',
    label: 'Family Portrait (Photos)',
    description: 'Multi-photo pedigree displaying portrait thumbnails for subject, parents & grandparents.',
  },
  {
    id: 'iagarb_angora',
    label: 'IAGARB German Angora',
    description: 'Official 100-point wool judging breakdown, 325g/90d yield stats & ancestor fiber table.',
  },
];

export const PEDIGREE_QUICK_STYLE_PRESETS: readonly PedigreeQuickPresetSpec[] = [
  {
    id: 'evans-classic',
    label: 'Evans Classic',
    description: 'Barn Sage · Classic Rule · Evans Layout',
    colorPreset: 'classic_sage',
    borderStyle: 'classic_rule',
    layoutPreset: 'evans_standard',
  },
  {
    id: 'grand-champion',
    label: 'Grand Champion Cert',
    description: 'Registry Navy · Double Frame · Show Certificate',
    colorPreset: 'royal_navy',
    borderStyle: 'double_frame',
    layoutPreset: 'show_certificate',
  },
  {
    id: 'family-portrait',
    label: 'Family Photo Keepsake',
    description: 'Barn Sage · Double Frame · Multi-Photo Portrait',
    colorPreset: 'classic_sage',
    borderStyle: 'double_frame',
    layoutPreset: 'family_portrait',
  },
  {
    id: 'iagarb-german-angora',
    label: 'IAGARB German Angora',
    description: 'Heritage Burgundy · Classic Rule · Wool Yield & 100-pt Scale',
    colorPreset: 'heritage_burgundy',
    borderStyle: 'classic_rule',
    layoutPreset: 'iagarb_angora',
  },
  {
    id: 'deep-archival',
    label: 'Deep 8-Gen Ledger',
    description: 'Barn Sage · Minimal Hairline · Compact Ledger',
    colorPreset: 'classic_sage',
    borderStyle: 'minimal_lines',
    layoutPreset: 'compact_ledger',
  },
  {
    id: 'laser-ink-saver',
    label: 'Laser Ink Saver',
    description: 'Monochrome B&W · Classic Rule · Compact Ledger',
    colorPreset: 'monochrome_ink',
    borderStyle: 'classic_rule',
    layoutPreset: 'compact_ledger',
  },
];

function ensurePrintInkHex(rawHex: string | undefined, fallbackHex: string): string {
  const trimmed = (rawHex || '').trim();
  const valid = /^#[0-9a-fA-F]{6}$/.test(trimmed)
    ? trimmed.toUpperCase()
    : fallbackHex.toUpperCase();
  const lum = relativeLuminance(valid);
  if (lum > 0.34) {
    return mixHex(valid, '#141B15', 0.56);
  }
  if (lum > 0.22) {
    return mixHex(valid, '#141B15', 0.3);
  }
  return valid;
}

export function hexToPdfRgb(hex: string): [number, number, number] {
  const clean = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : '1E3F2A';
  const num = parseInt(clean, 16);
  return [
    Number((((num >> 16) & 255) / 255).toFixed(3)),
    Number((((num >> 8) & 255) / 255).toFixed(3)),
    Number(((num & 255) / 255).toFixed(3)),
  ];
}

export function normalizeColorPresetId(raw: unknown): PedigreeColorPresetId {
  if (
    raw === 'classic_sage' ||
    raw === 'royal_navy' ||
    raw === 'heritage_burgundy' ||
    raw === 'barn_palette' ||
    raw === 'monochrome_ink'
  ) {
    return raw;
  }
  return 'classic_sage';
}

export function normalizeBorderStyleId(raw: unknown): PedigreeBorderStyleId {
  if (
    raw === 'classic_rule' ||
    raw === 'double_frame' ||
    raw === 'modern_rounded' ||
    raw === 'minimal_lines'
  ) {
    return raw;
  }
  return 'classic_rule';
}

export function normalizeLayoutPresetId(raw: unknown): PedigreeLayoutPresetId {
  if (
    raw === 'evans_standard' ||
    raw === 'show_certificate' ||
    raw === 'compact_ledger' ||
    raw === 'family_portrait' ||
    raw === 'iagarb_angora'
  ) {
    return raw;
  }
  return 'evans_standard';
}

export function resolvePedigreePrintTheme(
  options?: {
    colorPreset?: PedigreeColorPresetId;
    borderStyle?: PedigreeBorderStyleId;
    layoutPreset?: PedigreeLayoutPresetId;
  },
  customColors?: CustomThemeColors
): ResolvedPedigreePrintTheme {
  const colorPreset = normalizeColorPresetId(options?.colorPreset);
  const borderStyle = normalizeBorderStyleId(options?.borderStyle);
  const layoutPreset = normalizeLayoutPresetId(options?.layoutPreset);

  if (colorPreset === 'monochrome_ink') {
    return {
      colorPreset,
      borderStyle,
      layoutPreset,
      paperBg: '#FFFFFF',
      inkHex: '#000000',
      mutedInkHex: '#3F3F46',
      primaryHex: '#000000',
      accentHex: '#18181B',
      sireHex: '#18181B',
      damHex: '#3F3F46',
      borderHex: '#000000',
      cellBorderHex: '#9CA3AF',
      isMonochrome: true,
    };
  }

  if (colorPreset === 'barn_palette') {
    const primary = ensurePrintInkHex(
      customColors?.lightPrimary,
      DEFAULT_WARM_THEME_COLORS.lightPrimary
    );
    const accent = ensurePrintInkHex(
      customColors?.lightAccent,
      DEFAULT_WARM_THEME_COLORS.lightAccent
    );
    const sire = ensurePrintInkHex(
      customColors?.lightMale,
      DEFAULT_WARM_THEME_COLORS.lightMale
    );
    return {
      colorPreset,
      borderStyle,
      layoutPreset,
      paperBg: '#FFFFFF',
      inkHex: '#171C17',
      mutedInkHex: '#434D42',
      primaryHex: primary,
      accentHex: accent,
      sireHex: sire,
      damHex: accent,
      borderHex: primary,
      cellBorderHex: '#B8B3A8',
      isMonochrome: false,
    };
  }

  const spec =
    PEDIGREE_COLOR_PRESETS.find((p) => p.id === colorPreset) ?? PEDIGREE_COLOR_PRESETS[0];

  return {
    colorPreset,
    borderStyle,
    layoutPreset,
    paperBg: '#FFFFFF',
    inkHex: '#1E241E',
    mutedInkHex: '#434D42',
    primaryHex: spec.primaryHex,
    accentHex: spec.accentHex,
    sireHex: spec.sireHex,
    damHex: spec.damHex,
    borderHex: spec.borderHex,
    cellBorderHex: spec.cellBorderHex,
    isMonochrome: false,
  };
}
