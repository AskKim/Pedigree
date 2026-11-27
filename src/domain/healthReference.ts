/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Curated Health Reference Wikis, Local Veterinary PDF Folder Metadata &
 * Periodic Document-Backup Reminder Engine (`src/domain/healthReference.ts`).
 *
 * Pure TypeScript with zero DOM dependencies so sorting, URL validation,
 * species resolution, and reminder math remain unit-testable and portable.
 */

import { sanitizeSafeExternalHttpUrl, sanitizeSingleLineText } from './inputSanitization';
import {
  APP_LOCALE,
  extractBaseLanguageCode,
  normalizeBcp47LanguageTag,
  nowEpochMs,
} from './models';

export const ALLOWED_VET_DOCS_REMINDER_INTERVALS = [14, 30, 60, 90] as const;
export type VetDocsReminderIntervalDays = (typeof ALLOWED_VET_DOCS_REMINDER_INTERVALS)[number];
export const DEFAULT_VET_DOCS_REMINDER_INTERVAL_DAYS: VetDocsReminderIntervalDays = 30;
export const INITIAL_UNVERIFIED_GRACE_DAYS = 7;
export const MAX_VET_PDF_SCAN_DEPTH = 2;
export const MAX_VET_PDF_ENTRIES = 250;
export const MAX_VET_PDF_PREVIEW_BYTES = 50 * 1024 * 1024; // 50 MB guard per previewed PDF

export type HealthWikiCategory =
  | 'General Manual'
  | 'GI & Nutrition'
  | 'Parasites & FAMACHA'
  | 'Biosecurity & Disease'
  | 'Care & Husbandry';

export interface HealthWikiReference {
  id: string;
  title: string;
  source: string;
  category: HealthWikiCategory;
  speciesTags: string[];
  /** BCP 47 language code for the external article (e.g. 'en-US', 'en', 'es-MX'). */
  language: string;
  summary: string;
  url: string;
}

/**
 * Required wiki article language list (BCP 47 tags).
 * Currently enforces English-only sources (`['en']`, matching `'en'`, `'en-US'`, `'en-GB'`, etc.).
 * Easily extended to multiple languages at once (e.g. `['en', 'es']`) when translations are added.
 */
export const DEFAULT_ALLOWED_WIKI_LANGUAGES: ReadonlyArray<string> = ['en'];

export interface WikiLanguageOption {
  code: string;
  label: string;
}

export const AVAILABLE_WIKI_LANGUAGE_OPTIONS: ReadonlyArray<WikiLanguageOption> = [
  { code: 'en', label: 'English (All Regions)' },
  { code: APP_LOCALE, label: 'English (United States)' },
];

export interface RestrictedWikiSource {
  id: string;
  name: string;
  domains: string[];
  reason: string;
  builtIn: boolean;
}

export const DEFAULT_RESTRICTED_WIKI_SOURCES: ReadonlyArray<RestrictedWikiSource> = [
  {
    id: 'restricted-house-rabbit-society',
    name: 'House Rabbit Society',
    domains: ['rabbit.org'],
    reason: 'Excluded from curated livestock & pedigree breeding wiki article connections.',
    builtIn: true,
  },
];

export type PreferredWikiSourceCategory =
  | 'veterinary-manual'
  | 'federal-government-ag-vet'
  | 'university-extension'
  | 'custom';

export interface PreferredWikiSource {
  id: string;
  name: string;
  category: PreferredWikiSourceCategory;
  categoryLabel: string;
  domains: string[];
  domainSuffixes: string[];
  nameKeywords: string[];
  description: string;
  builtIn: boolean;
}

export const DEFAULT_PREFERRED_WIKI_SOURCES: ReadonlyArray<PreferredWikiSource> = [
  {
    id: 'preferred-merck-vet-manual',
    name: 'Merck Veterinary Manual',
    category: 'veterinary-manual',
    categoryLabel: 'Peer-Reviewed Veterinary Manual',
    domains: ['merckvetmanual.com', 'msdvetmanual.com'],
    domainSuffixes: [],
    nameKeywords: ['merck veterinary manual', 'msd veterinary manual'],
    description:
      'Peer-reviewed Merck / MSD Veterinary Manual clinical & livestock disease references.',
    builtIn: true,
  },
  {
    id: 'preferred-federal-gov-ag-vet',
    name: 'USDA & Federal / National Agricultural & Veterinary Agencies (All Countries)',
    category: 'federal-government-ag-vet',
    categoryLabel: 'Federal / National Government',
    domains: [
      'usda.gov',
      'aphis.usda.gov',
      'ars.usda.gov',
      'nal.usda.gov',
      'fda.gov',
      'cdc.gov',
      'nih.gov',
      'inspection.canada.ca',
      'agr.gc.ca',
      'canada.ca',
      'gov.uk',
      'defra.gov.uk',
      'agriculture.gov.au',
      'daff.gov.au',
      'mpi.govt.nz',
      'efsa.europa.eu',
      'woah.org',
      'fao.org',
    ],
    domainSuffixes: [
      '.gov',
      '.gov.uk',
      '.gov.au',
      '.govt.nz',
      '.gc.ca',
      '.gob.mx',
      '.go.jp',
      '.gov.in',
      '.gov.za',
      '.gov.br',
      '.gob.es',
      '.gouv.fr',
      '.bund.de',
    ],
    nameKeywords: [
      'usda',
      'aphis',
      'cfia',
      'defra',
      'daff',
      'ministry of agriculture',
      'department of agriculture',
      'federal government',
      'national veterinary',
      'agricultural research service',
    ],
    description:
      'USDA APHIS/ARS and equivalent federal or national agricultural & veterinary ministries worldwide.',
    builtIn: true,
  },
  {
    id: 'preferred-universities-land-grant',
    name: 'State, Federal & Land-Grant Universities & Extension Services (All Countries)',
    category: 'university-extension',
    categoryLabel: 'University & Extension',
    domains: [
      'extension.psu.edu',
      'psu.edu',
      'cornell.edu',
      'vet.cornell.edu',
      'ucdavis.edu',
      'vetmed.ucdavis.edu',
      'tamu.edu',
      'agrilife.org',
      'osu.edu',
      'msu.edu',
      'wisc.edu',
      'purdue.edu',
      'iastate.edu',
      'ncsu.edu',
      'uga.edu',
      'ufl.edu',
      'uky.edu',
      'vt.edu',
      'ksu.edu',
      'okstate.edu',
      'extension.org',
      'uoguelph.ca',
      'usask.ca',
      'rvc.ac.uk',
      'ed.ac.uk',
      'cam.ac.uk',
      'sydney.edu.au',
      'uq.edu.au',
      'unimelb.edu.au',
      'massey.ac.nz',
      'wur.nl',
    ],
    domainSuffixes: [
      '.edu',
      '.ac.uk',
      '.edu.au',
      '.ac.nz',
      '.ac.za',
      '.edu.cn',
      '.ac.jp',
      '.edu.br',
      '.edu.mx',
    ],
    nameKeywords: [
      'university',
      'land-grant',
      'land grant',
      'extension',
      'state college',
      'veterinary college',
      'school of veterinary',
      'faculty of veterinary',
    ],
    description:
      'State, federal, and land-grant universities and cooperative agricultural extension programs worldwide.',
    builtIn: true,
  },
];

export interface VetDocsFolderMeta {
  folderName: string | null;
  folderLocationNote: string;
  configuredAtIso: string | null;
  pdfCount: number | null;
  lastScannedAtIso: string | null;
  lastBackedUpAtIso: string | null;
  reminderIntervalDays: VetDocsReminderIntervalDays;
  snoozedUntilMs: number;
}

export interface VetDocFileEntry {
  id: string;
  name: string;
  relativePath: string;
  sizeBytes: number;
  lastModifiedMs: number;
  source: 'folder_handle' | 'picked_file';
}

export type VetDocsBackupReminderLevel =
  | 'unconfigured'
  | 'initial_unverified'
  | 'never_acknowledged'
  | 'overdue'
  | 'snoozed'
  | 'up_to_date';

export interface VetDocsBackupReminderEvaluation {
  level: VetDocsBackupReminderLevel;
  isConfigured: boolean;
  needsReminder: boolean;
  showBanner: boolean;
  ageDays: number | null;
  nextDueAtIso: string | null;
  headline: string;
  detail: string;
}

const RAW_HEALTH_WIKI_REFERENCES: ReadonlyArray<HealthWikiReference> = [
  {
    id: 'wiki-rabbit-merck',
    title: 'Merck Veterinary Manual: Diseases of Rabbits',
    source: 'Merck Veterinary Manual',
    category: 'General Manual',
    speciesTags: ['Rabbit'],
    language: 'en-US',
    summary: 'Clinical reference covering pasteurellosis, snuffles, ear mites, and coccidiosis.',
    url: 'https://www.merckvetmanual.com/all-other-pets/rabbits/diseases-and-disorders-of-rabbits',
  },
  {
    id: 'wiki-rabbit-rhdv2',
    title: 'Rabbit Hemorrhagic Disease (RHDV2) Biosecurity',
    source: 'USDA APHIS',
    category: 'Biosecurity & Disease',
    speciesTags: ['Rabbit'],
    language: 'en-US',
    summary: 'Official quarantine steps, disinfection protocols, and outbreak reporting guidance.',
    url: 'https://www.aphis.usda.gov/livestock-poultry-disease/rabbit-hemorrhagic-disease',
  },
  {
    id: 'wiki-small-ruminant-wormx',
    title: 'FAMACHA & Integrated Parasite Control Wiki',
    source: 'ACSRPC (WormX)',
    category: 'Parasites & FAMACHA',
    speciesTags: ['Goat', 'Sheep', 'Alpaca'],
    language: 'en-US',
    summary: 'Barber pole worm management, selective deworming, and resistance prevention.',
    url: 'https://www.wormx.info/',
  },
  {
    id: 'wiki-goat-merck',
    title: 'Merck Veterinary Manual: Goat Health & Herd Management',
    source: 'Merck Veterinary Manual',
    category: 'General Manual',
    speciesTags: ['Goat'],
    language: 'en-US',
    summary: 'Clinical reference for CAE, CL, enterotoxemia, pregnancy toxemia, and kidding care.',
    url: 'https://www.merckvetmanual.com/management-and-nutrition/management-of-reproduction-goats/overview-of-reproduction-in-goats',
  },
  {
    id: 'wiki-goat-psu',
    title: 'Penn State Extension: Dairy & Meat Goat Health',
    source: 'Penn State Extension',
    category: 'Care & Husbandry',
    speciesTags: ['Goat'],
    language: 'en-US',
    summary: 'Practical vaccination schedules, hoof trimming hygiene, and mineral nutrition guides.',
    url: 'https://extension.psu.edu/animals-and-livestock/goats',
  },
  {
    id: 'wiki-sheep-merck',
    title: 'Merck Veterinary Manual: Sheep Reproduction & Health',
    source: 'Merck Veterinary Manual',
    category: 'General Manual',
    speciesTags: ['Sheep'],
    language: 'en-US',
    summary: 'Clinical guidance on lambing readiness, copper sensitivity, footrot, and flock health.',
    url: 'https://www.merckvetmanual.com/management-and-nutrition/management-of-reproduction-sheep/overview-of-reproduction-in-sheep',
  },
  {
    id: 'wiki-swine-merck',
    title: 'Merck Veterinary Manual: Swine Management & Biosecurity',
    source: 'Merck Veterinary Manual',
    category: 'General Manual',
    speciesTags: ['Swine / Pig'],
    language: 'en-US',
    summary: 'Farrowing care, iron supplementation, respiratory biosecurity, and herd nutrition.',
    url: 'https://www.merckvetmanual.com/management-and-nutrition/management-of-reproduction-pigs/overview-of-reproduction-in-pigs',
  },
  {
    id: 'wiki-cattle-merck',
    title: 'Merck Veterinary Manual: Cattle Health & Herd Care',
    source: 'Merck Veterinary Manual',
    category: 'General Manual',
    speciesTags: ['Cattle'],
    language: 'en-US',
    summary: 'Calf scours, respiratory disease triage, mastitis prevention, and calving protocols.',
    url: 'https://www.merckvetmanual.com/management-and-nutrition/management-of-reproduction-cattle/overview-of-reproduction-in-cattle',
  },
  {
    id: 'wiki-cavy-merck',
    title: 'Merck Veterinary Manual: Guinea Pig Care & Vitamin C',
    source: 'Merck Veterinary Manual',
    category: 'GI & Nutrition',
    speciesTags: ['Guinea Pig'],
    language: 'en-US',
    summary: 'Ascorbic acid requirements, dental overgrowth, bumblefoot, and antibiotic sensitivities.',
    url: 'https://www.merckvetmanual.com/all-other-pets/guinea-pigs/diseases-and-disorders-of-guinea-pigs',
  },
  {
    id: 'wiki-chinchilla-merck',
    title: 'Merck Veterinary Manual: Chinchilla Health & Fur Care',
    source: 'Merck Veterinary Manual',
    category: 'Care & Husbandry',
    speciesTags: ['Chinchilla'],
    language: 'en-US',
    summary: 'Heat stress thresholds, dental malocclusion, GI bloat, and respiratory triage.',
    url: 'https://www.merckvetmanual.com/all-other-pets/chinchillas/diseases-and-disorders-of-chinchillas',
  },
  {
    id: 'wiki-ferret-merck',
    title: 'Merck Veterinary Manual: Ferret Medicine & Screening',
    source: 'Merck Veterinary Manual',
    category: 'General Manual',
    speciesTags: ['Ferret'],
    language: 'en-US',
    summary: 'Adrenal disease, insulinoma signs, vaccine reactions, and GI foreign-body checks.',
    url: 'https://www.merckvetmanual.com/all-other-pets/ferrets/diseases-and-disorders-of-ferrets',
  },
  {
    id: 'wiki-alpaca-merck',
    title: 'Merck Veterinary Manual: Llama & Alpaca Health',
    source: 'Merck Veterinary Manual',
    category: 'General Manual',
    speciesTags: ['Alpaca'],
    language: 'en-US',
    summary: 'Camelid parasite management, meningeal worm prevention, and crias neonatal care.',
    url: 'https://www.merckvetmanual.com/all-other-pets/llamas-and-alpacas/overview-of-llamas-and-alpacas',
  },
  {
    id: 'wiki-dog-vin',
    title: 'Veterinary Partner: Canine Health Library',
    source: 'VIN Veterinary Partner',
    category: 'General Manual',
    speciesTags: ['Dog'],
    language: 'en-US',
    summary: 'Veterinarian-reviewed medication sheets, whelping alerts, and parasite facts.',
    url: 'https://veterinarypartner.vin.com/default.aspx?pid=19239&catId=102899',
  },
  {
    id: 'wiki-cat-vin',
    title: 'Veterinary Partner: Feline Health Library',
    source: 'VIN Veterinary Partner',
    category: 'General Manual',
    speciesTags: ['Cat'],
    language: 'en-US',
    summary: 'Veterinarian-reviewed feline infectious care, queening nutrition, and drug safety.',
    url: 'https://veterinarypartner.vin.com/default.aspx?pid=19239&catId=102903',
  },
  {
    id: 'wiki-general-merck',
    title: 'Merck Veterinary Manual: Full Livestock & Pet Index',
    source: 'Merck Veterinary Manual',
    category: 'General Manual',
    speciesTags: ['General'],
    language: 'en-US',
    summary: 'Peer-reviewed diagnostic reference across livestock, small mammals, and pharmacology.',
    url: 'https://www.merckvetmanual.com/',
  },
  {
    id: 'wiki-general-biosecurity',
    title: 'USDA Livestock Disease Prevention & Biosecurity',
    source: 'USDA APHIS',
    category: 'Biosecurity & Disease',
    speciesTags: ['General'],
    language: 'en-US',
    summary: 'Quarantine isolation intervals, visitor footwear sanitation, and reportable diseases.',
    url: 'https://www.aphis.usda.gov/livestock-poultry-disease',
  },
];

export function normalizeRestrictedDomain(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let clean = sanitizeSingleLineText(raw, 200).toLowerCase();
  if (!clean) return '';
  clean = clean.replace(/^https?:\/\//i, '');
  clean = clean.split(/[/?#]/)[0] ?? '';
  clean = clean.replace(/:\d+$/, '');
  clean = clean.replace(/^www\./, '').replace(/\.+$/, '');
  if (!clean || clean.length > 253) return '';
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(clean)) {
    return '';
  }
  return clean;
}

export function extractHostnameFromUrl(url: string): string {
  const clean = sanitizeSingleLineText(url, 400);
  if (!clean) return '';
  try {
    const parsed = new URL(clean);
    return parsed.hostname.toLowerCase().replace(/\.+$/, '');
  } catch {
    const match = clean.match(/^https?:\/\/([^/:?#]+)/i);
    return match ? match[1].toLowerCase().replace(/\.+$/, '') : '';
  }
}

export function doesDomainMatchRestricted(hostname: string, restrictedDomain: string): boolean {
  const cleanHost = hostname.trim().toLowerCase().replace(/\.+$/, '');
  const cleanDomain = normalizeRestrictedDomain(restrictedDomain);
  if (!cleanHost || !cleanDomain) return false;
  return cleanHost === cleanDomain || cleanHost.endsWith(`.${cleanDomain}`);
}

export function normalizeRestrictedWikiSources(raw: unknown): RestrictedWikiSource[] {
  const merged = new Map<string, RestrictedWikiSource>();
  for (const entry of DEFAULT_RESTRICTED_WIKI_SOURCES) {
    merged.set(entry.id, {
      ...entry,
      domains: entry.domains.map((d) => normalizeRestrictedDomain(d)).filter(Boolean),
    });
  }

  if (!Array.isArray(raw)) {
    return Array.from(merged.values());
  }

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Partial<RestrictedWikiSource>;
    const name = sanitizeSingleLineText(obj.name ?? '', 120);
    if (!name) continue;
    const domains = Array.isArray(obj.domains)
      ? Array.from(new Set(obj.domains.map((d) => normalizeRestrictedDomain(d)).filter(Boolean)))
      : [];
    const reason =
      sanitizeSingleLineText(obj.reason ?? '', 220) ||
      'Excluded by barn restricted wiki sources list.';
    const rawId = sanitizeSingleLineText(obj.id ?? '', 80);
    const id =
      rawId && !merged.has(rawId)
        ? rawId
        : `restricted-custom-${name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'source'}`;

    // Never overwrite or downgrade built-in restricted entries
    const existing = merged.get(id);
    if (existing?.builtIn) continue;

    // Avoid duplicating a built-in source by exact name
    const matchesBuiltInName = Array.from(merged.values()).some(
      (builtIn) => builtIn.builtIn && builtIn.name.toLowerCase() === name.toLowerCase()
    );
    if (matchesBuiltInName) continue;

    merged.set(id, {
      id,
      name,
      domains,
      reason,
      builtIn: false,
    });
  }

  return Array.from(merged.values());
}

export function findMatchingRestrictedWikiSource(
  ref: Pick<HealthWikiReference, 'source' | 'title' | 'url'>,
  restrictedSources: ReadonlyArray<RestrictedWikiSource> = DEFAULT_RESTRICTED_WIKI_SOURCES
): RestrictedWikiSource | null {
  const hostname = extractHostnameFromUrl(ref.url);
  const cleanSource = sanitizeSingleLineText(ref.source, 160).toLowerCase();
  const cleanTitle = sanitizeSingleLineText(ref.title, 200).toLowerCase();

  for (const restricted of restrictedSources) {
    if (
      hostname &&
      restricted.domains.some((domain) => doesDomainMatchRestricted(hostname, domain))
    ) {
      return restricted;
    }

    const cleanName = sanitizeSingleLineText(restricted.name, 120).toLowerCase();
    if (cleanName && (cleanSource.includes(cleanName) || cleanTitle.includes(cleanName))) {
      return restricted;
    }
  }

  return null;
}

export function isHealthWikiSourceRestricted(
  ref: Pick<HealthWikiReference, 'source' | 'title' | 'url'>,
  restrictedSources: ReadonlyArray<RestrictedWikiSource> = DEFAULT_RESTRICTED_WIKI_SOURCES
): boolean {
  return findMatchingRestrictedWikiSource(ref, restrictedSources) !== null;
}

export function isHealthWikiUrlRestricted(
  url: string,
  restrictedSources: ReadonlyArray<RestrictedWikiSource> = DEFAULT_RESTRICTED_WIKI_SOURCES
): RestrictedWikiSource | null {
  return findMatchingRestrictedWikiSource({ source: '', title: '', url }, restrictedSources);
}

export function normalizeAllowedWikiLanguages(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_ALLOWED_WIKI_LANGUAGES];
  }
  const unique = new Set<string>();
  for (const item of raw) {
    const normalized = normalizeBcp47LanguageTag(item);
    if (normalized) {
      unique.add(normalized);
    }
  }
  return unique.size > 0 ? Array.from(unique) : [...DEFAULT_ALLOWED_WIKI_LANGUAGES];
}

export function doesWikiLanguageMatchAllowed(
  refLanguage: string,
  allowedLanguages: ReadonlyArray<string> = DEFAULT_ALLOWED_WIKI_LANGUAGES
): boolean {
  const refNorm = normalizeBcp47LanguageTag(refLanguage);
  if (!refNorm) return false;
  const refBase = extractBaseLanguageCode(refNorm);
  const effectiveAllowed =
    allowedLanguages.length > 0 ? allowedLanguages : DEFAULT_ALLOWED_WIKI_LANGUAGES;

  return effectiveAllowed.some((candidate) => {
    const allowedNorm = normalizeBcp47LanguageTag(candidate);
    if (!allowedNorm) return false;
    if (allowedNorm === refNorm) return true;
    const allowedBase = extractBaseLanguageCode(allowedNorm);
    // Language-only code (e.g. 'en') matches any regional variant ('en-US', 'en-GB', etc.)
    if (allowedNorm === allowedBase && refBase === allowedBase) return true;
    // Generic language-only reference ('en') satisfies regional preference ('en-US')
    if (refNorm === refBase && refBase === allowedBase) return true;
    return false;
  });
}

export function normalizePreferredDomainSuffix(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let clean = sanitizeSingleLineText(raw, 60).toLowerCase().replace(/^\*+/, '');
  if (!clean) return '';
  if (!clean.startsWith('.')) {
    clean = `.${clean}`;
  }
  if (!/^(?:\.[a-z0-9-]+)+$/.test(clean)) return '';
  return clean;
}

export function doesDomainMatchSuffix(hostname: string, suffix: string): boolean {
  const cleanHost = hostname.trim().toLowerCase().replace(/\.+$/, '');
  const cleanSuffix = normalizePreferredDomainSuffix(suffix);
  if (!cleanHost || !cleanSuffix) return false;
  return cleanHost.endsWith(cleanSuffix) && cleanHost.length > cleanSuffix.length;
}

export function normalizePreferredWikiSources(raw: unknown): PreferredWikiSource[] {
  const merged = new Map<string, PreferredWikiSource>();
  for (const entry of DEFAULT_PREFERRED_WIKI_SOURCES) {
    merged.set(entry.id, {
      ...entry,
      domains: entry.domains.map((d) => normalizeRestrictedDomain(d)).filter(Boolean),
      domainSuffixes: entry.domainSuffixes
        .map((s) => normalizePreferredDomainSuffix(s))
        .filter(Boolean),
      nameKeywords: entry.nameKeywords
        .map((k) => sanitizeSingleLineText(k, 80).toLowerCase())
        .filter(Boolean),
    });
  }

  if (!Array.isArray(raw)) {
    return Array.from(merged.values());
  }

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Partial<PreferredWikiSource>;
    const name = sanitizeSingleLineText(obj.name ?? '', 140);
    if (!name) continue;
    const domains = Array.isArray(obj.domains)
      ? Array.from(new Set(obj.domains.map((d) => normalizeRestrictedDomain(d)).filter(Boolean)))
      : [];
    const domainSuffixes = Array.isArray(obj.domainSuffixes)
      ? Array.from(
          new Set(obj.domainSuffixes.map((s) => normalizePreferredDomainSuffix(s)).filter(Boolean))
        )
      : [];
    const nameKeywords = Array.isArray(obj.nameKeywords)
      ? Array.from(
          new Set(
            obj.nameKeywords
              .map((k) => sanitizeSingleLineText(k, 80).toLowerCase())
              .filter(Boolean)
          )
        )
      : [name.toLowerCase()];
    const description =
      sanitizeSingleLineText(obj.description ?? '', 220) ||
      'Added to barn preferred health wiki sources list.';
    const rawId = sanitizeSingleLineText(obj.id ?? '', 80);
    const id =
      rawId && !merged.has(rawId)
        ? rawId
        : `preferred-custom-${
            name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '') || 'source'
          }`;

    const existing = merged.get(id);
    if (existing?.builtIn) continue;

    const matchesBuiltInName = Array.from(merged.values()).some(
      (builtIn) => builtIn.builtIn && builtIn.name.toLowerCase() === name.toLowerCase()
    );
    if (matchesBuiltInName) continue;

    merged.set(id, {
      id,
      name,
      category: 'custom',
      categoryLabel: 'Custom Preferred Source',
      domains,
      domainSuffixes,
      nameKeywords: nameKeywords.length > 0 ? nameKeywords : [name.toLowerCase()],
      description,
      builtIn: false,
    });
  }

  return Array.from(merged.values());
}

export function findMatchingPreferredWikiSource(
  ref: Pick<HealthWikiReference, 'source' | 'title' | 'url'>,
  preferredSources: ReadonlyArray<PreferredWikiSource> = DEFAULT_PREFERRED_WIKI_SOURCES,
  restrictedSources: ReadonlyArray<RestrictedWikiSource> = DEFAULT_RESTRICTED_WIKI_SOURCES
): PreferredWikiSource | null {
  // Restricted sources ALWAYS override preferred matching
  if (isHealthWikiSourceRestricted(ref, restrictedSources)) {
    return null;
  }

  const hostname = extractHostnameFromUrl(ref.url);
  const cleanSource = sanitizeSingleLineText(ref.source, 160).toLowerCase();
  const cleanTitle = sanitizeSingleLineText(ref.title, 200).toLowerCase();

  for (const preferred of preferredSources) {
    if (
      hostname &&
      preferred.domains.some((domain) => doesDomainMatchRestricted(hostname, domain))
    ) {
      return preferred;
    }
    if (
      hostname &&
      preferred.domainSuffixes.some((suffix) => doesDomainMatchSuffix(hostname, suffix))
    ) {
      return preferred;
    }
    if (
      preferred.nameKeywords.some((kw) => {
        const cleanKw = sanitizeSingleLineText(kw, 80).toLowerCase();
        return Boolean(cleanKw && (cleanSource.includes(cleanKw) || cleanTitle.includes(cleanKw)));
      })
    ) {
      return preferred;
    }
  }

  return null;
}

export function isHealthWikiSourcePreferred(
  ref: Pick<HealthWikiReference, 'source' | 'title' | 'url'>,
  preferredSources: ReadonlyArray<PreferredWikiSource> = DEFAULT_PREFERRED_WIKI_SOURCES,
  restrictedSources: ReadonlyArray<RestrictedWikiSource> = DEFAULT_RESTRICTED_WIKI_SOURCES
): boolean {
  return findMatchingPreferredWikiSource(ref, preferredSources, restrictedSources) !== null;
}

export function sortHealthWikiReferencesWithPreferred(
  refs: ReadonlyArray<HealthWikiReference>,
  preferredSources: ReadonlyArray<PreferredWikiSource> = DEFAULT_PREFERRED_WIKI_SOURCES,
  restrictedSources: ReadonlyArray<RestrictedWikiSource> = DEFAULT_RESTRICTED_WIKI_SOURCES
): HealthWikiReference[] {
  const preferredList: HealthWikiReference[] = [];
  const standardList: HealthWikiReference[] = [];
  for (const ref of refs) {
    if (isHealthWikiSourcePreferred(ref, preferredSources, restrictedSources)) {
      preferredList.push(ref);
    } else {
      standardList.push(ref);
    }
  }
  return [...preferredList, ...standardList];
}

export interface HealthWikiFilterOptions {
  restrictedSources?: ReadonlyArray<RestrictedWikiSource>;
  allowedLanguages?: ReadonlyArray<string>;
  preferredSources?: ReadonlyArray<PreferredWikiSource>;
}

export function filterAllowedHealthWikiReferences(
  refs: ReadonlyArray<HealthWikiReference>,
  restrictedOrOptions:
    | ReadonlyArray<RestrictedWikiSource>
    | HealthWikiFilterOptions = DEFAULT_RESTRICTED_WIKI_SOURCES,
  allowedLanguagesArg?: ReadonlyArray<string>
): HealthWikiReference[] {
  const isOptionsObj = !Array.isArray(restrictedOrOptions);
  const restrictedSources = isOptionsObj
    ? (restrictedOrOptions as HealthWikiFilterOptions).restrictedSources ??
      DEFAULT_RESTRICTED_WIKI_SOURCES
    : (restrictedOrOptions as ReadonlyArray<RestrictedWikiSource>);
  const allowedLanguages = isOptionsObj
    ? (restrictedOrOptions as HealthWikiFilterOptions).allowedLanguages ??
      DEFAULT_ALLOWED_WIKI_LANGUAGES
    : allowedLanguagesArg ?? DEFAULT_ALLOWED_WIKI_LANGUAGES;

  return refs.filter(
    (ref) =>
      !isHealthWikiSourceRestricted(ref, restrictedSources) &&
      doesWikiLanguageMatchAllowed(ref.language, allowedLanguages)
  );
}

export const HEALTH_WIKI_REFERENCES: ReadonlyArray<HealthWikiReference> =
  RAW_HEALTH_WIKI_REFERENCES.map((entry) => ({
    ...entry,
    language: normalizeBcp47LanguageTag(entry.language) || APP_LOCALE,
    url: sanitizeSafeExternalHttpUrl(entry.url),
  })).filter(
    (entry) =>
      entry.url.startsWith('https://') &&
      !isHealthWikiSourceRestricted(entry, DEFAULT_RESTRICTED_WIKI_SOURCES) &&
      doesWikiLanguageMatchAllowed(entry.language, DEFAULT_ALLOWED_WIKI_LANGUAGES)
  );

function doesReferenceMatchSpecies(ref: HealthWikiReference, speciesName: string): boolean {
  const cleanSpecies = speciesName.trim().toLowerCase();
  if (!cleanSpecies) return false;
  return ref.speciesTags.some((tag) => {
    const cleanTag = tag.trim().toLowerCase();
    if (!cleanTag || cleanTag === 'general') return false;
    if (cleanTag === cleanSpecies) return true;
    const parts = cleanTag.split('/').map((p) => p.trim()).filter(Boolean);
    return parts.some(
      (part) =>
        part === cleanSpecies ||
        cleanSpecies.includes(part) ||
        (cleanSpecies.length >= 3 && part.includes(cleanSpecies))
    );
  });
}

export interface ResolvedHealthWikiGroups {
  speciesMatches: HealthWikiReference[];
  generalReferences: HealthWikiReference[];
  otherSpeciesReferences: HealthWikiReference[];
}

export function getHealthWikiLinksForSpecies(
  speciesName: string,
  restrictedOrOptions:
    | ReadonlyArray<RestrictedWikiSource>
    | HealthWikiFilterOptions = DEFAULT_RESTRICTED_WIKI_SOURCES
): ResolvedHealthWikiGroups {
  const isOptionsObj = !Array.isArray(restrictedOrOptions);
  const restrictedSources = isOptionsObj
    ? (restrictedOrOptions as HealthWikiFilterOptions).restrictedSources ??
      DEFAULT_RESTRICTED_WIKI_SOURCES
    : (restrictedOrOptions as ReadonlyArray<RestrictedWikiSource>);
  const allowedLanguages = isOptionsObj
    ? (restrictedOrOptions as HealthWikiFilterOptions).allowedLanguages ??
      DEFAULT_ALLOWED_WIKI_LANGUAGES
    : DEFAULT_ALLOWED_WIKI_LANGUAGES;
  const preferredSources = isOptionsObj
    ? (restrictedOrOptions as HealthWikiFilterOptions).preferredSources ??
      DEFAULT_PREFERRED_WIKI_SOURCES
    : DEFAULT_PREFERRED_WIKI_SOURCES;

  const speciesMatches: HealthWikiReference[] = [];
  const generalReferences: HealthWikiReference[] = [];
  const otherSpeciesReferences: HealthWikiReference[] = [];

  for (const ref of filterAllowedHealthWikiReferences(HEALTH_WIKI_REFERENCES, {
    restrictedSources,
    allowedLanguages,
  })) {
    if (ref.speciesTags.includes('General')) {
      generalReferences.push(ref);
    } else if (doesReferenceMatchSpecies(ref, speciesName)) {
      speciesMatches.push(ref);
    } else {
      otherSpeciesReferences.push(ref);
    }
  }

  return {
    speciesMatches: sortHealthWikiReferencesWithPreferred(
      speciesMatches,
      preferredSources,
      restrictedSources
    ),
    generalReferences: sortHealthWikiReferencesWithPreferred(
      generalReferences,
      preferredSources,
      restrictedSources
    ),
    otherSpeciesReferences: sortHealthWikiReferencesWithPreferred(
      otherSpeciesReferences,
      preferredSources,
      restrictedSources
    ),
  };
}

export function normalizeReminderIntervalDays(raw: unknown): VetDocsReminderIntervalDays {
  const n = Number(raw);
  if (n === 14 || n === 30 || n === 60 || n === 90) {
    return n;
  }
  return DEFAULT_VET_DOCS_REMINDER_INTERVAL_DAYS;
}

export function createDefaultVetDocsFolderMeta(): VetDocsFolderMeta {
  return {
    folderName: null,
    folderLocationNote: '',
    configuredAtIso: null,
    pdfCount: null,
    lastScannedAtIso: null,
    lastBackedUpAtIso: null,
    reminderIntervalDays: DEFAULT_VET_DOCS_REMINDER_INTERVAL_DAYS,
    snoozedUntilMs: 0,
  };
}

export function normalizeVetDocsFolderMeta(raw: unknown): VetDocsFolderMeta {
  const fallback = createDefaultVetDocsFolderMeta();
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Partial<VetDocsFolderMeta>;

  const folderName =
    typeof obj.folderName === 'string' && sanitizeSingleLineText(obj.folderName, 140)
      ? sanitizeSingleLineText(obj.folderName, 140)
      : null;

  const folderLocationNote = sanitizeSingleLineText(obj.folderLocationNote ?? '', 180);

  const normalizeOptionalIso = (val: unknown): string | null => {
    if (typeof val !== 'string' || !val.trim()) return null;
    const ms = new Date(val).getTime();
    return Number.isNaN(ms) ? null : val.trim();
  };

  const pdfCount =
    typeof obj.pdfCount === 'number' && Number.isFinite(obj.pdfCount) && obj.pdfCount >= 0
      ? Math.round(obj.pdfCount)
      : null;

  const snoozedUntilMs =
    typeof obj.snoozedUntilMs === 'number' && Number.isFinite(obj.snoozedUntilMs) && obj.snoozedUntilMs > 0
      ? obj.snoozedUntilMs
      : 0;

  return {
    folderName,
    folderLocationNote,
    configuredAtIso: normalizeOptionalIso(obj.configuredAtIso),
    pdfCount,
    lastScannedAtIso: normalizeOptionalIso(obj.lastScannedAtIso),
    lastBackedUpAtIso: normalizeOptionalIso(obj.lastBackedUpAtIso),
    reminderIntervalDays: normalizeReminderIntervalDays(obj.reminderIntervalDays),
    snoozedUntilMs,
  };
}

export function isPdfFileName(fileName: string, mimeType?: string): boolean {
  const cleanName = (fileName || '').trim().toLowerCase();
  if (cleanName.endsWith('.pdf')) return true;
  if (mimeType && mimeType.trim().toLowerCase() === 'application/pdf') return true;
  return false;
}

export function filterAndSortVetPdfEntries(
  entries: ReadonlyArray<VetDocFileEntry>,
  query: string
): VetDocFileEntry[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? entries.filter(
        (item) =>
          item.name.toLowerCase().includes(q) || item.relativePath.toLowerCase().includes(q)
      )
    : entries.slice();

  return filtered.sort((a, b) => {
    const pathCmp = a.relativePath.localeCompare(b.relativePath, undefined, {
      sensitivity: 'base',
    });
    if (pathCmp !== 0) return pathCmp;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function evaluateVetDocsBackupReminder(
  meta: VetDocsFolderMeta,
  nowMs: number = nowEpochMs(),
  hasDirectoryHandle: boolean = false
): VetDocsBackupReminderEvaluation {
  const intervalDays = normalizeReminderIntervalDays(meta.reminderIntervalDays);
  const hasPointer = Boolean(meta.folderName || hasDirectoryHandle);
  const hasLocationNote = Boolean(meta.folderLocationNote.trim());
  const isConfigured = hasPointer || hasLocationNote;

  if (!isConfigured) {
    return {
      level: 'unconfigured',
      isConfigured: false,
      needsReminder: false,
      showBanner: false,
      ageDays: null,
      nextDueAtIso: null,
      headline: 'No local vet PDF folder pointed yet',
      detail:
        'Connect a folder or record a device path to keep offline vet guides handy and schedule external folder backup reminders.',
    };
  }

  const folderLabel = meta.folderName
    ? `"${meta.folderName}"`
    : `your vet folder (${meta.folderLocationNote.trim()})`;
  const isSnoozed = meta.snoozedUntilMs > nowMs;

  if (meta.lastBackedUpAtIso) {
    const backedUpMs = new Date(meta.lastBackedUpAtIso).getTime();
    if (!Number.isNaN(backedUpMs)) {
      const ageDays = Math.max(0, (nowMs - backedUpMs) / MS_PER_DAY);
      const nextDueMs = backedUpMs + intervalDays * MS_PER_DAY;
      const nextDueAtIso = new Date(nextDueMs).toISOString();

      if (ageDays >= intervalDays) {
        const wholeDays = Math.floor(ageDays);
        if (isSnoozed) {
          return {
            level: 'snoozed',
            isConfigured: true,
            needsReminder: true,
            showBanner: false,
            ageDays,
            nextDueAtIso,
            headline: `Vet PDF folder backup due (snoozed · ${wholeDays}d since last copy)`,
            detail: `Remember to copy ${folderLabel} to an external USB drive, SD card, or synced archive.`,
          };
        }
        return {
          level: 'overdue',
          isConfigured: true,
          needsReminder: true,
          showBanner: true,
          ageDays,
          nextDueAtIso,
          headline: `Back up external vet PDFs (${wholeDays}d since last copy)`,
          detail: `Because local PDF files stay outside app backups, copy ${folderLabel} to another drive or cloud vault every ${intervalDays} days.`,
        };
      }

      return {
        level: 'up_to_date',
        isConfigured: true,
        needsReminder: false,
        showBanner: false,
        ageDays,
        nextDueAtIso,
        headline: 'External veterinary PDF folder backup recorded',
        detail: `Marked backed up ${Math.floor(ageDays)}d ago · Next ${intervalDays}-day reminder scheduled for ${nextDueAtIso.slice(0, 10)}.`,
      };
    }
  }

  // Never marked backed up yet
  const configuredMs = meta.configuredAtIso ? new Date(meta.configuredAtIso).getTime() : NaN;
  const setupAgeDays = !Number.isNaN(configuredMs)
    ? Math.max(0, (nowMs - configuredMs) / MS_PER_DAY)
    : INITIAL_UNVERIFIED_GRACE_DAYS;

  if (setupAgeDays < INITIAL_UNVERIFIED_GRACE_DAYS) {
    const dueMs = (Number.isNaN(configuredMs) ? nowMs : configuredMs) + INITIAL_UNVERIFIED_GRACE_DAYS * MS_PER_DAY;
    return {
      level: 'initial_unverified',
      isConfigured: true,
      needsReminder: false,
      showBanner: false,
      ageDays: setupAgeDays,
      nextDueAtIso: new Date(dueMs).toISOString(),
      headline: 'External vet folder connected — mark initial backup when ready',
      detail: `Personal PDFs in ${folderLabel} are not included inside Community Pedigree exports; confirm when you have an external copy.`,
    };
  }

  if (isSnoozed) {
    return {
      level: 'snoozed',
      isConfigured: true,
      needsReminder: true,
      showBanner: false,
      ageDays: setupAgeDays,
      nextDueAtIso: null,
      headline: 'External vet PDF backup reminder snoozed',
      detail: `Remember to keep an external copy of ${folderLabel} since PDFs stay outside app .ZIP backups.`,
    };
  }

  return {
    level: 'never_acknowledged',
    isConfigured: true,
    needsReminder: true,
    showBanner: true,
    ageDays: setupAgeDays,
    nextDueAtIso: null,
    headline: 'Back up your external veterinary PDF folder',
    detail: `Local files in ${folderLabel} stay on-device and are not bundled in barn exports. Save an external copy and confirm below.`,
  };
}
