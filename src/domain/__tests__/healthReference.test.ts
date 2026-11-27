/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  ALLOWED_VET_DOCS_REMINDER_INTERVALS,
  createDefaultVetDocsFolderMeta,
  DEFAULT_ALLOWED_WIKI_LANGUAGES,
  DEFAULT_PREFERRED_WIKI_SOURCES,
  DEFAULT_RESTRICTED_WIKI_SOURCES,
  DEFAULT_VET_DOCS_REMINDER_INTERVAL_DAYS,
  doesWikiLanguageMatchAllowed,
  evaluateVetDocsBackupReminder,
  filterAllowedHealthWikiReferences,
  filterAndSortVetPdfEntries,
  findMatchingPreferredWikiSource,
  findMatchingRestrictedWikiSource,
  getHealthWikiLinksForSpecies,
  HEALTH_WIKI_REFERENCES,
  INITIAL_UNVERIFIED_GRACE_DAYS,
  isHealthWikiSourcePreferred,
  isHealthWikiSourceRestricted,
  isHealthWikiUrlRestricted,
  isPdfFileName,
  normalizeAllowedWikiLanguages,
  normalizePreferredWikiSources,
  normalizeReminderIntervalDays,
  normalizeRestrictedDomain,
  normalizeRestrictedWikiSources,
  normalizeVetDocsFolderMeta,
  sortHealthWikiReferencesWithPreferred,
  VetDocFileEntry,
} from '../healthReference';
import { sanitizeSafeExternalHttpUrl } from '../inputSanitization';
import {
  APP_LOCALE,
  APP_LOCALE_METADATA,
  extractBaseLanguageCode,
  normalizeBcp47LanguageTag,
  PREDEFINED_SPECIES_PRESETS,
} from '../models';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('healthReference — curated wikis, PDF metadata normalization & external folder backup reminders', () => {
  it('validates every curated health wiki URL as strict https:// and covers all predefined species', () => {
    expect(HEALTH_WIKI_REFERENCES.length).toBeGreaterThanOrEqual(PREDEFINED_SPECIES_PRESETS.length);

    const seenIds = new Set<string>();
    for (const ref of HEALTH_WIKI_REFERENCES) {
      expect(seenIds.has(ref.id)).toBe(false);
      seenIds.add(ref.id);
      expect(ref.url.startsWith('https://')).toBe(true);
      expect(sanitizeSafeExternalHttpUrl(ref.url)).toBe(ref.url);
      expect(ref.title.trim().length).toBeGreaterThan(3);
      expect(ref.source.trim().length).toBeGreaterThan(2);
    }

    for (const preset of PREDEFINED_SPECIES_PRESETS) {
      const grouped = getHealthWikiLinksForSpecies(preset.name);
      expect(grouped.speciesMatches.length).toBeGreaterThan(0);
      expect(grouped.generalReferences.length).toBeGreaterThan(0);
    }
  });

  it('matches slash-delimited and custom species names cleanly without returning general links as species matches', () => {
    const customRabbit = getHealthWikiLinksForSpecies('Meat Rabbit (New Zealand)');
    expect(customRabbit.speciesMatches.some((r) => r.speciesTags.includes('Rabbit'))).toBe(true);
    expect(customRabbit.generalReferences.every((r) => r.speciesTags.includes('General'))).toBe(
      true
    );

    const customPig = getHealthWikiLinksForSpecies('Pig');
    expect(customPig.speciesMatches.some((r) => r.speciesTags.includes('Swine / Pig'))).toBe(true);

    const unmatchedSpecies = getHealthWikiLinksForSpecies('Camelid');
    expect(unmatchedSpecies.speciesMatches).toHaveLength(0);
    expect(unmatchedSpecies.generalReferences.length).toBeGreaterThan(0);
    expect(unmatchedSpecies.otherSpeciesReferences.length).toBeGreaterThan(0);
  });

  it('normalizes reminder interval days and VetDocsFolderMeta defensively', () => {
    for (const allowed of ALLOWED_VET_DOCS_REMINDER_INTERVALS) {
      expect(normalizeReminderIntervalDays(allowed)).toBe(allowed);
    }
    expect(normalizeReminderIntervalDays(45)).toBe(DEFAULT_VET_DOCS_REMINDER_INTERVAL_DAYS);
    expect(normalizeReminderIntervalDays('invalid')).toBe(DEFAULT_VET_DOCS_REMINDER_INTERVAL_DAYS);

    expect(normalizeVetDocsFolderMeta(null)).toEqual(createDefaultVetDocsFolderMeta());

    const normalized = normalizeVetDocsFolderMeta({
      folderName: '  Barn Vet\r\n\u202EGuides\u0007  ',
      folderLocationNote: '  /sdcard/Documents/VetPDFs\t ',
      configuredAtIso: '2026-11-01T12:00:00.000Z',
      pdfCount: 12.6,
      lastScannedAtIso: 'not-a-date',
      lastBackedUpAtIso: '2026-11-10T08:30:00.000Z',
      reminderIntervalDays: 60,
      snoozedUntilMs: -50,
    });

    expect(normalized.folderName).toBe('Barn Vet Guides');
    expect(normalized.folderLocationNote).toBe('/sdcard/Documents/VetPDFs');
    expect(normalized.configuredAtIso).toBe('2026-11-01T12:00:00.000Z');
    expect(normalized.pdfCount).toBe(13);
    expect(normalized.lastScannedAtIso).toBeNull();
    expect(normalized.lastBackedUpAtIso).toBe('2026-11-10T08:30:00.000Z');
    expect(normalized.reminderIntervalDays).toBe(60);
    expect(normalized.snoozedUntilMs).toBe(0);
  });

  it('detects PDF file names/MIME types and filters/sorts PDF entries deterministically', () => {
    expect(isPdfFileName('GI-Stasis-Protocol.PDF')).toBe(true);
    expect(isPdfFileName('notes.txt')).toBe(false);
    expect(isPdfFileName('attachment', 'application/pdf')).toBe(true);

    const sampleEntries: VetDocFileEntry[] = [
      {
        id: '2',
        name: 'zebra-dosage.pdf',
        relativePath: 'rabbits/zebra-dosage.pdf',
        sizeBytes: 1024,
        lastModifiedMs: 10,
        source: 'folder_handle',
      },
      {
        id: '1',
        name: 'alpha-triage.pdf',
        relativePath: 'emergency/alpha-triage.pdf',
        sizeBytes: 2048,
        lastModifiedMs: 20,
        source: 'folder_handle',
      },
      {
        id: '3',
        name: 'coccidia.pdf',
        relativePath: 'coccidia.pdf',
        sizeBytes: 512,
        lastModifiedMs: 30,
        source: 'picked_file',
      },
    ];

    const sortedAll = filterAndSortVetPdfEntries(sampleEntries, '');
    expect(sortedAll.map((e) => e.id)).toEqual(['3', '1', '2']);

    const filtered = filterAndSortVetPdfEntries(sampleEntries, 'EMERGENCY');
    expect(filtered.map((e) => e.id)).toEqual(['1']);
  });

  it('evaluates unconfigured, grace period, never_acknowledged, up_to_date, overdue, and snoozed states accurately', () => {
    const baseMs = Date.UTC(2026, 10, 23, 12, 0, 0);
    const def = createDefaultVetDocsFolderMeta();

    const unconfigured = evaluateVetDocsBackupReminder(def, baseMs, false);
    expect(unconfigured.level).toBe('unconfigured');
    expect(unconfigured.showBanner).toBe(false);

    // Configured 2 days ago (< 7d grace): initial_unverified, no intrusive banner yet
    const graceMeta = normalizeVetDocsFolderMeta({
      ...def,
      folderName: 'Barn Vet PDFs',
      configuredAtIso: new Date(baseMs - 2 * MS_PER_DAY).toISOString(),
    });
    const inGrace = evaluateVetDocsBackupReminder(graceMeta, baseMs, true);
    expect(inGrace.level).toBe('initial_unverified');
    expect(inGrace.isConfigured).toBe(true);
    expect(inGrace.showBanner).toBe(false);

    // Configured 8 days ago (>= 7d) with no backup confirmation: never_acknowledged banner shown
    const unackedMeta = normalizeVetDocsFolderMeta({
      ...def,
      folderLocationNote: '~/Documents/VetPDFs',
      configuredAtIso: new Date(baseMs - (INITIAL_UNVERIFIED_GRACE_DAYS + 1) * MS_PER_DAY).toISOString(),
    });
    const neverAcked = evaluateVetDocsBackupReminder(unackedMeta, baseMs, false);
    expect(neverAcked.level).toBe('never_acknowledged');
    expect(neverAcked.needsReminder).toBe(true);
    expect(neverAcked.showBanner).toBe(true);

    // Backed up 10 days ago with 30-day cadence: up_to_date
    const freshMeta = normalizeVetDocsFolderMeta({
      ...unackedMeta,
      lastBackedUpAtIso: new Date(baseMs - 10 * MS_PER_DAY).toISOString(),
      reminderIntervalDays: 30,
    });
    const upToDate = evaluateVetDocsBackupReminder(freshMeta, baseMs, false);
    expect(upToDate.level).toBe('up_to_date');
    expect(upToDate.needsReminder).toBe(false);
    expect(upToDate.showBanner).toBe(false);

    // Backed up 35 days ago with 30-day cadence: overdue banner shown
    const overdueMeta = normalizeVetDocsFolderMeta({
      ...freshMeta,
      lastBackedUpAtIso: new Date(baseMs - 35 * MS_PER_DAY).toISOString(),
      reminderIntervalDays: 30,
    });
    const overdue = evaluateVetDocsBackupReminder(overdueMeta, baseMs, false);
    expect(overdue.level).toBe('overdue');
    expect(overdue.needsReminder).toBe(true);
    expect(overdue.showBanner).toBe(true);
    expect(Math.floor(overdue.ageDays ?? 0)).toBe(35);

    // Snoozed overdue reminder suppresses banner until snooze expires
    const snoozedMeta = normalizeVetDocsFolderMeta({
      ...overdueMeta,
      snoozedUntilMs: baseMs + 5 * MS_PER_DAY,
    });
    const snoozed = evaluateVetDocsBackupReminder(snoozedMeta, baseMs, false);
    expect(snoozed.level).toBe('snoozed');
    expect(snoozed.needsReminder).toBe(true);
    expect(snoozed.showBanner).toBe(false);
  });

  it('restricts House Rabbit Society by default and filters/blocks restricted domains and source names', () => {
    expect(DEFAULT_RESTRICTED_WIKI_SOURCES.some((s) => s.name === 'House Rabbit Society')).toBe(true);
    expect(DEFAULT_RESTRICTED_WIKI_SOURCES.some((s) => s.domains.includes('rabbit.org'))).toBe(true);

    // Built-in curated wikis must exclude House Rabbit Society / rabbit.org while keeping Rabbit coverage
    expect(
      HEALTH_WIKI_REFERENCES.some(
        (ref) =>
          ref.source.toLowerCase().includes('house rabbit society') ||
          ref.url.toLowerCase().includes('rabbit.org')
      )
    ).toBe(false);

    const rabbitWikis = getHealthWikiLinksForSpecies('Rabbit');
    expect(rabbitWikis.speciesMatches.length).toBeGreaterThan(0);

    expect(normalizeRestrictedDomain('https://WWW.Rabbit.org/care/health/')).toBe('rabbit.org');
    expect(normalizeRestrictedDomain('not a domain!')).toBe('');

    expect(isHealthWikiUrlRestricted('https://rabbit.org/care/health/')?.name).toBe(
      'House Rabbit Society'
    );
    expect(isHealthWikiUrlRestricted('https://care.rabbit.org/gi-stasis/')?.name).toBe(
      'House Rabbit Society'
    );
    expect(isHealthWikiUrlRestricted('https://www.merckvetmanual.com/')).toBeNull();

    expect(
      isHealthWikiSourceRestricted({
        source: 'House Rabbit Society',
        title: 'Diet Guide',
        url: 'https://mirror.example.com/guide',
      })
    ).toBe(true);

    const customList = normalizeRestrictedWikiSources([
      {
        id: 'restricted-house-rabbit-society',
        name: 'Override Attempt',
        domains: [],
        builtIn: false,
      },
      {
        name: 'Example Livestock Blog',
        domains: ['https://www.example-blog.org/articles'],
        reason: 'Unverified advice',
      },
    ]);

    // Built-in House Rabbit Society cannot be overwritten or removed
    const hrs = customList.find((s) => s.id === 'restricted-house-rabbit-society');
    expect(hrs?.builtIn).toBe(true);
    expect(hrs?.name).toBe('House Rabbit Society');
    expect(hrs?.domains).toContain('rabbit.org');

    const customEntry = customList.find((s) => s.name === 'Example Livestock Blog');
    expect(customEntry?.builtIn).toBe(false);
    expect(customEntry?.domains).toEqual(['example-blog.org']);

    const filteredRefs = filterAllowedHealthWikiReferences(
      [
        {
          id: '1',
          title: 'HRS Guide',
          source: 'House Rabbit Society',
          category: 'Care & Husbandry',
          speciesTags: ['Rabbit'],
          language: 'en-US',
          summary: 'Blocked',
          url: 'https://rabbit.org/care/',
        },
        {
          id: '2',
          title: 'Blog Post',
          source: 'Example Livestock Blog',
          category: 'Care & Husbandry',
          speciesTags: ['Goat'],
          language: 'en-US',
          summary: 'Blocked by custom list',
          url: 'https://sub.example-blog.org/goats',
        },
        {
          id: '3',
          title: 'Merck Manual',
          source: 'Merck Veterinary Manual',
          category: 'General Manual',
          speciesTags: ['Rabbit'],
          language: 'en-US',
          summary: 'Allowed',
          url: 'https://www.merckvetmanual.com/',
        },
      ],
      customList
    );
    expect(filteredRefs.map((r) => r.id)).toEqual(['3']);

    // Custom restricted list also filters getHealthWikiLinksForSpecies dynamically
    const goatWithMerckBlocked = getHealthWikiLinksForSpecies(
      'Goat',
      normalizeRestrictedWikiSources([{ name: 'Penn State Extension', domains: ['extension.psu.edu'] }])
    );
    expect(
      goatWithMerckBlocked.speciesMatches.some((r) => r.source === 'Penn State Extension')
    ).toBe(false);
    expect(
      findMatchingRestrictedWikiSource(
        { source: 'Merck Veterinary Manual', title: 'Diseases', url: 'https://www.merckvetmanual.com/' },
        customList
      )
    ).toBeNull();
  });

  it('defines app locale as English USA (en-US) and enforces English wiki sources with multi-language extensibility', () => {
    expect(APP_LOCALE).toBe('en-US');
    expect(APP_LOCALE_METADATA.locale).toBe('en-US');
    expect(APP_LOCALE_METADATA.baseLanguage).toBe('en');
    expect(APP_LOCALE_METADATA.region).toBe('US');

    expect(normalizeBcp47LanguageTag('en_us')).toBe('en-US');
    expect(normalizeBcp47LanguageTag('ES-mx')).toBe('es-MX');
    expect(extractBaseLanguageCode('en-US')).toBe('en');

    expect(DEFAULT_ALLOWED_WIKI_LANGUAGES).toEqual(['en']);
    for (const ref of HEALTH_WIKI_REFERENCES) {
      expect(doesWikiLanguageMatchAllowed(ref.language, DEFAULT_ALLOWED_WIKI_LANGUAGES)).toBe(true);
    }

    // Region-neutral 'en' matches any English variant; specific 'en-US' excludes 'en-GB'
    expect(doesWikiLanguageMatchAllowed('en-GB', ['en'])).toBe(true);
    expect(doesWikiLanguageMatchAllowed('en-US', ['en'])).toBe(true);
    expect(doesWikiLanguageMatchAllowed('es-MX', ['en'])).toBe(false);
    expect(doesWikiLanguageMatchAllowed('en-GB', ['en-US'])).toBe(false);
    expect(doesWikiLanguageMatchAllowed('en-US', ['en-US'])).toBe(true);

    // Multi-language array allows more than one language at once when configured later
    expect(normalizeAllowedWikiLanguages(['en-US', 'es', 'EN_US', 'fr-CA'])).toEqual([
      'en-US',
      'es',
      'fr-CA',
    ]);
    expect(normalizeAllowedWikiLanguages([])).toEqual(['en']);

    const mixedLanguageRefs = [
      {
        id: 'en-doc',
        title: 'English Vet Guide',
        source: 'Merck Veterinary Manual',
        category: 'General Manual' as const,
        speciesTags: ['Rabbit'],
        language: 'en-US',
        summary: 'English guide',
        url: 'https://www.merckvetmanual.com/',
      },
      {
        id: 'es-doc',
        title: 'Guia Veterinaria',
        source: 'USDA APHIS',
        category: 'Biosecurity & Disease' as const,
        speciesTags: ['Rabbit'],
        language: 'es-MX',
        summary: 'Spanish guide',
        url: 'https://www.aphis.usda.gov/',
      },
      {
        id: 'fr-doc',
        title: 'Guide Veterinaire',
        source: 'CFIA Canada',
        category: 'Biosecurity & Disease' as const,
        speciesTags: ['Rabbit'],
        language: 'fr-CA',
        summary: 'French guide',
        url: 'https://inspection.canada.ca/',
      },
    ];

    expect(filterAllowedHealthWikiReferences(mixedLanguageRefs).map((r) => r.id)).toEqual([
      'en-doc',
    ]);
    expect(
      filterAllowedHealthWikiReferences(mixedLanguageRefs, {
        allowedLanguages: ['en', 'es'],
      }).map((r) => r.id)
    ).toEqual(['en-doc', 'es-doc']);
  });

  it('prioritizes preferred sources (Merck, global federal ag/vet agencies, and global state/federal/land-grant universities)', () => {
    expect(DEFAULT_PREFERRED_WIKI_SOURCES.length).toBeGreaterThanOrEqual(3);

    // 1. Merck / MSD Veterinary Manual
    expect(
      findMatchingPreferredWikiSource({
        source: 'Merck Veterinary Manual',
        title: 'Diseases of Rabbits',
        url: 'https://www.merckvetmanual.com/rabbits',
      })?.category
    ).toBe('veterinary-manual');
    expect(
      findMatchingPreferredWikiSource({
        source: 'MSD Veterinary Manual',
        title: 'Livestock Guide',
        url: 'https://www.msdvetmanual.com/',
      })?.category
    ).toBe('veterinary-manual');

    // 2. USDA & Federal / National Government agencies regardless of country
    expect(
      findMatchingPreferredWikiSource({
        source: 'USDA APHIS',
        title: 'RHDV2 Biosecurity',
        url: 'https://www.aphis.usda.gov/rhdv2',
      })?.category
    ).toBe('federal-government-ag-vet');
    expect(
      findMatchingPreferredWikiSource({
        source: 'DEFRA Animal Health',
        title: 'UK Biosecurity',
        url: 'https://www.gov.uk/government/organisations/department-for-environment-food-rural-affairs',
      })?.category
    ).toBe('federal-government-ag-vet');
    expect(
      findMatchingPreferredWikiSource({
        source: 'Department of Agriculture, Fisheries and Forestry',
        title: 'Biosecurity Australia',
        url: 'https://www.agriculture.gov.au/',
      })?.category
    ).toBe('federal-government-ag-vet');
    expect(
      findMatchingPreferredWikiSource({
        source: 'Canadian Food Inspection Agency',
        title: 'CFIA Animal Health',
        url: 'https://inspection.canada.ca/',
      })?.category
    ).toBe('federal-government-ag-vet');

    // 3. State, Federal & Land-Grant Universities regardless of country
    expect(
      findMatchingPreferredWikiSource({
        source: 'Penn State Extension',
        title: 'Goat Health',
        url: 'https://extension.psu.edu/animals-and-livestock/goats',
      })?.category
    ).toBe('university-extension');
    expect(
      findMatchingPreferredWikiSource({
        source: 'Royal Veterinary College',
        title: 'Rabbit Medicine',
        url: 'https://www.rvc.ac.uk/small-animal-vet',
      })?.category
    ).toBe('university-extension');
    expect(
      findMatchingPreferredWikiSource({
        source: 'University of Sydney',
        title: 'Livestock Health',
        url: 'https://www.sydney.edu.au/vet',
      })?.category
    ).toBe('university-extension');
    expect(
      findMatchingPreferredWikiSource({
        source: 'University of Guelph',
        title: 'Ontario Agricultural College',
        url: 'https://www.uoguelph.ca/',
      })?.category
    ).toBe('university-extension');

    // Restricted sources ALWAYS override preferred sources
    expect(
      isHealthWikiSourcePreferred({
        source: 'House Rabbit Society',
        title: 'University Collaborations',
        url: 'https://rabbit.org/university-notes',
      })
    ).toBe(false);

    // Sorting puts preferred sources first while preserving relative order
    const sorted = sortHealthWikiReferencesWithPreferred([
      {
        id: 'non-pref',
        title: 'General Clinic Blog',
        source: 'Local Clinic',
        category: 'Care & Husbandry',
        speciesTags: ['Rabbit'],
        language: 'en-US',
        summary: 'Standard',
        url: 'https://local-clinic.example.com/',
      },
      {
        id: 'pref-uni',
        title: 'Cornell Veterinary Guide',
        source: 'Cornell University',
        category: 'General Manual',
        speciesTags: ['Rabbit'],
        language: 'en-US',
        summary: 'Preferred',
        url: 'https://www.vet.cornell.edu/',
      },
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['pref-uni', 'non-pref']);

    // Custom preferred source normalization preserves built-ins
    const normalizedPreferred = normalizePreferredWikiSources([
      {
        id: 'preferred-merck-vet-manual',
        name: 'Override Attempt',
        builtIn: false,
      },
      {
        name: 'Wageningen University',
        domains: ['https://www.wur.nl/en'],
      },
    ]);
    expect(
      normalizedPreferred.find((p) => p.id === 'preferred-merck-vet-manual')?.builtIn
    ).toBe(true);
    expect(
      normalizedPreferred.some((p) => p.name === 'Wageningen University' && !p.builtIn)
    ).toBe(true);
  });
});
