/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * In-App Documentation & Species Guide Modal (`HelpDocumentationModal`).
 * Provides core offline-first workflow docs alongside collapsible/accordion guides
 * for every active and built-in livestock species.
 */

import {
  BookOpen,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Database,
  Dna,
  GitFork,
  Layers,
  ListFilter,
  Printer,
  ShieldCheck,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  getSpeciesIdentifierLabels,
  isSameSpecies,
  PREDEFINED_SPECIES_PRESETS,
  SpeciesProfile,
} from '../domain/models';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';

interface HelpDocumentationModalProps {
  speciesProfiles: SpeciesProfile[];
  activeSpeciesName?: string;
  onClose: () => void;
}

type DocSectionFilter = 'all' | 'core' | 'species';

interface SpeciesExtraGuide {
  idConvention: string;
  housingAndCare: string;
  pedigreeAndShowNotes: string;
}

const SPECIES_EXTRA_GUIDES: Record<string, SpeciesExtraGuide> = {
  rabbit: {
    idConvention: 'Left ear tattoo for individual herd ID; right ear reserved for ARBA registration tattoo.',
    housingAndCare: 'Place clean nestbox 3 days pre-kindling; check kits daily and clean/remove nestbox around day 21.',
    pedigreeAndShowNotes: 'Supports ARBA lbs.oz dot notation (e.g., 4.12) and 3-leg Grand Champion / E-Leg tracking; Angora wool harvests track 90-day shearing intervals.',
  },
  goat: {
    idConvention: 'Ear tattoo (tail-web or ear) or official USDA/scrapie ear tag + herd prefix.',
    housingAndCare: 'Schedule CDT & BoSe booster ~28 days before kidding and prepare clean kidding stall 7 days prior.',
    pedigreeAndShowNotes: 'Track ADGA/AGS style names, linear/milk star notes in animal journals, and strict medication withdrawal dates.',
  },
  sheep: {
    idConvention: 'USDA scrapie ear tag, herd management ear tag, or ear tattoo.',
    housingAndCare: 'Crutch/shear pre-lambing (~14 days prior) and move ewes into lambing jugs ~5 days before due date.',
    pedigreeAndShowNotes: 'Supports fleece/wool weight logging and flock sire-group tracking.',
  },
  'swine / pig': {
    idConvention: 'Ear notch pattern, ear tag, or RFID button.',
    housingAndCare: 'Move sows to farrowing pen ~5 days pre-farrowing; log piglet iron & navel care at day 3.',
    pedigreeAndShowNotes: 'Track litter weights, processing yields in Economics Ledger, and quarantine biosecurity lots.',
  },
  cattle: {
    idConvention: 'Dangle ear tag, USDA official RFID/metal tag, brand, or tattoo.',
    housingAndCare: 'Dry-off and mineral checks ~60 days pre-calving; shift cows to calving paddock ~14 days prior.',
    pedigreeAndShowNotes: 'Long 283-day gestation cadence with calf birthweight, weaning weight, and pasture rotation notes.',
  },
  'guinea pig': {
    idConvention: 'Ear tag (ACBA) or descriptive coat/markings collar ID.',
    housingAndCare: 'Separate boars before birth (~day 4 pre-due) to avoid immediate postpartum back-breeding.',
    pedigreeAndShowNotes: 'Track ACBA show legs, 3-to-6 generation pedigrees, and daily vitamin C / weight trends.',
  },
  chinchilla: {
    idConvention: 'Ranch brand + year letter/number ear tag.',
    housingAndCare: 'Install kit-safe small-spacing cage wire and lower/remove high ledges ~5 days before birth.',
    pedigreeAndShowNotes: 'Record mutation genetics, fur clarity/density notes, and long 111-day gestation cycles.',
  },
  ferret: {
    idConvention: 'Microchip ISO ID or ear tattoo.',
    housingAndCare: 'Prepare quiet darkened whelping box ~5 days pre-whelping; handle minimally during week 1.',
    pedigreeAndShowNotes: 'Track hob/jill color genetics, coat health, and show placements.',
  },
  alpaca: {
    idConvention: 'Microchip + ARI/CLAA ear tag or registry number.',
    housingAndCare: 'Spit-off & ultrasound confirmation ~day 45; prep birthing pasture & cria thermal coat kit ~14 days prior.',
    pedigreeAndShowNotes: 'Use the Wool & Fiber panel to log annual shearing prime vs. grade yields and staple lengths.',
  },
  dog: {
    idConvention: 'ISO/AKC microchip number, collar ID, or kennel tattoo.',
    housingAndCare: 'Prep whelping box ~5 days pre-due; optional X-ray puppy count at day 7 before whelping.',
    pedigreeAndShowNotes: 'Record genetic/carrier clearances (DNA tested clear, OFA/CERF notes) and buyer keepsake birth certificates.',
  },
  cat: {
    idConvention: 'Microchip number or cattery registration ID.',
    housingAndCare: 'Set up quiet queening box ~5 days pre-birth; log kitten birth weights at day 1 and FVRCP windows at week 6.',
    pedigreeAndShowNotes: 'Track cattery titles, colorpoint/dilute locus genetics, and buyer reservation waitlists.',
  },
};

const CORE_FEATURE_DOCS = [
  {
    id: 'storage',
    title: '100% Local Offline Storage & External Backups',
    icon: Database,
    points: [
      'Your entire barn database runs locally on your device using SQLite/IndexedDB (plus optional OPFS Vault snapshots on supported browsers)—no account, cloud lock-in, or internet connection required.',
      'External Backup Rule: Browser cache clears or uninstalls can erase local app storage. Export a Timestamped JSON Backup, SQLite binary, or .ZIP photo archive regularly via the Import / Export Hub.',
      'Settings surfaces any overdue or missing external backup warning right at the top so you never miss a safety checkpoint.',
    ],
  },
  {
    id: 'herd',
    title: 'Herd Registry, Cages & Health / Medication Logs',
    icon: ListFilter,
    points: [
      'Each species keeps its own isolated Herd Registry, Breeding Lab, and Tasks while sharing your global Barn preferences.',
      'Record weights, tattoos/tags/microchips, registration numbers, Grand Champion legs, show placements, and veterinary treatments with automatic meat/dairy withdrawal-clear date alerts.',
      'Archived, Sold, Retired, and Deceased animals stay preserved for complete multi-generation pedigrees without cluttering your active roster.',
    ],
  },
  {
    id: 'breeding',
    title: 'Breeding Lab, Projected COI & Cascading Tasks',
    icon: CalendarCheck,
    points: [
      'Test prospective sire × dam pairings to calculate projected Wright Coefficient of Inbreeding (COI), view common ancestors, and preview Punnett coat outcomes before breeding.',
      'Saving a breeding automatically schedules your species-specific Master Task Cascade (palpation/ultrasound, nestbox/whelping prep, birth check, weaning, rebreed window).',
      'Export tasks directly to your device calendar via offline .ICS files or Google Calendar with multi-alarm reminders (e.g., 1 day before + 15 minutes before).',
    ],
  },
  {
    id: 'pedigree',
    title: 'Pedigree Explorer (3–8 Gen) & Blank Templates',
    icon: GitFork,
    points: [
      'Explore interactive pinch-to-zoom charts from 3 to 8 generations, highlight repeated linebred ancestors, inspect ARBA registration completeness flags, and link missing parents inline.',
      'Need paper write-in sheets for shows or new stock? Tap Blank Template in the Pedigree tab (even when a herd is empty) to print or export a clean 3–6 generation blank chart with optional farm header.',
    ],
  },
  {
    id: 'genetics',
    title: 'Color Genetics & Carrier Disclosures',
    icon: Dna,
    points: [
      'Enter compact genotypes (e.g., A_ B_ C_ D_ ee) or build them interactively in the Coat Explorer Sandbox.',
      'Track recessive/health carrier statuses and cleared proofs (Test Bred, DNA Tested Clear) across ancestors with automatic pedigree disclosures.',
    ],
  },
  {
    id: 'ledgers',
    title: 'Barn Bench, Feed, Economics, CRM, Journal & Judge Modules',
    icon: Layers,
    points: [
      'Barn Bench: Fast row-by-row entry for weights, body condition scores, nail trims, and cage moves.',
      'Feed & Lot Ledger: Purchase tracking, lot numbers, feed-tag photo capture, and automated biosecurity retention.',
      'Economics, Mileage & 4-H Ledger: Expenses, receipts, meat/pelt harvest yields, IRS-deductible farm/show mileage logs, and youth project books.',
      'Client CRM, Personal Journal & Judge Notebook: Ranked buyer waitlists & deposit agreements, searchable color-coded barn journal entries, and an opt-in show judge schedule & contract tool.',
    ],
  },
  {
    id: 'printing',
    title: 'Printing & Sharing (.HTM, Direct .PDF, Cage Cards & Showcase)',
    icon: Printer,
    points: [
      'Every pedigree, blank template, cage card, companion keepsake certificate, and For-Sale Showcase opens in a live Print & Export Preview modal.',
      'Choose Landscape or Portrait orientation, ARBA lbs.oz dot notation, custom color/border presets, optional breeder logo, and per-export photo overrides without changing your saved Settings defaults.',
    ],
  },
] as const;

export function HelpDocumentationModal({
  speciesProfiles,
  activeSpeciesName,
  onClose,
}: HelpDocumentationModalProps) {
  const [sectionFilter, setSectionFilter] = useState<DocSectionFilter>('all');
  const [expandedSpeciesKeys, setExpandedSpeciesKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (activeSpeciesName) {
      initial.add(activeSpeciesName.trim().toLowerCase());
    } else if (speciesProfiles[0]?.name) {
      initial.add(speciesProfiles[0].name.trim().toLowerCase());
    }
    return initial;
  });

  const modalRef = useAccessibleDialog({
    isOpen: true,
    onClose,
  });

  const orderedSpeciesEntries = useMemo(() => {
    const activeNames = new Set(speciesProfiles.map((sp) => sp.name.trim().toLowerCase()));
    const combined: Array<{
      key: string;
      profile: Omit<SpeciesProfile, 'createdAt' | 'updatedAt'>;
      isConfiguredInBarn: boolean;
    }> = [];
    const seen = new Set<string>();

    for (const sp of speciesProfiles) {
      const key = sp.name.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push({ key, profile: sp, isConfiguredInBarn: true });
      }
    }

    for (const preset of PREDEFINED_SPECIES_PRESETS) {
      const key = preset.name.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push({
          key,
          profile: preset,
          isConfiguredInBarn: activeNames.has(key),
        });
      }
    }

    return combined;
  }, [speciesProfiles]);

  const toggleSpeciesAccordion = (key: string) => {
    setExpandedSpeciesKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandAllSpecies = () => {
    setExpandedSpeciesKeys(new Set(orderedSpeciesEntries.map((entry) => entry.key)));
  };

  const collapseAllSpecies = () => {
    setExpandedSpeciesKeys(new Set());
  };

  return (
    <div
      ref={modalRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-docs-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden focus:outline-none">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--barn-border)] flex flex-wrap items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <h2 id="help-docs-modal-title" className="font-display text-xl font-semibold">
                Documentation &amp; Species Guides
              </h2>
            </div>
            <p className="text-xs text-[var(--barn-muted)] mt-0.5">
              Offline reference for core barn workflows, backups, printing, and per-species breeding schedules.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close documentation and species guides"
            className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Filter Bar */}
        <div className="px-5 py-2.5 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="inline-flex flex-wrap items-center gap-1 p-0.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)]">
            {(
              [
                ['all', 'All Documentation'],
                ['core', 'Core Features'],
                ['species', `Species Guides (${orderedSpeciesEntries.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={sectionFilter === key}
                onClick={() => setSectionFilter(key)}
                className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  sectionFilter === key
                    ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                    : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center gap-1.5 text-[11px] text-[var(--barn-muted)]">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            <span>Works 100% offline on device</span>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {(sectionFilter === 'all' || sectionFilter === 'core') && (
            <section aria-labelledby="help-core-features-heading" className="space-y-3">
              <div>
                <h3
                  id="help-core-features-heading"
                  className="font-display text-lg font-semibold text-[var(--barn-ink)]"
                >
                  Core Features &amp; Workflows
                </h3>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Essential tools built into Community Pedigree across every species workspace.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CORE_FEATURE_DOCS.map((doc) => {
                  const Icon = doc.icon;
                  return (
                    <article
                      key={doc.id}
                      className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-4 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                        <h4 className="text-sm font-semibold text-[var(--barn-ink)]">{doc.title}</h4>
                      </div>
                      <ul className="space-y-1.5 text-xs text-[var(--barn-muted)] list-disc pl-4 leading-relaxed">
                        {doc.points.map((pt, idx) => (
                          <li key={idx}>{pt}</li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {(sectionFilter === 'all' || sectionFilter === 'species') && (
            <section aria-labelledby="help-species-guides-heading" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3
                    id="help-species-guides-heading"
                    className="font-display text-lg font-semibold text-[var(--barn-ink)]"
                  >
                    Per-Species Breeding &amp; Management Guides
                  </h3>
                  <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                    Expand any species to inspect gestation cadence, sex/birth terminology, ID conventions, and milestone alerts.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={expandAllSpecies}
                    className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium"
                  >
                    Expand All
                  </button>
                  <button
                    type="button"
                    onClick={collapseAllSpecies}
                    className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium"
                  >
                    Collapse All
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {orderedSpeciesEntries.map(({ key, profile, isConfiguredInBarn }) => {
                  const isOpen = expandedSpeciesKeys.has(key);
                  const isCurrent = Boolean(
                    activeSpeciesName && isSameSpecies(activeSpeciesName, profile.name)
                  );
                  const idLabels = getSpeciesIdentifierLabels(profile.name);
                  const extra = SPECIES_EXTRA_GUIDES[key];

                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] overflow-hidden"
                    >
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => toggleSpeciesAccordion(key)}
                        className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 hover:bg-[var(--barn-subtle)]/70 transition-colors"
                      >
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          {isOpen ? (
                            <ChevronDown className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
                          )}
                          <span className="text-sm font-semibold text-[var(--barn-ink)]">
                            {profile.name}
                          </span>
                          <span className="text-[11px] text-[var(--barn-muted)]">
                            · {profile.gestationDays}d gestation · {profile.maleLabel}/{profile.femaleLabel}/{profile.offspringLabel}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/50 text-[var(--barn-sage)]">
                              Active Tab
                            </span>
                          )}
                          {!isCurrent && isConfiguredInBarn && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[var(--barn-muted)]">
                              In Your Barn
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-[var(--barn-muted)] shrink-0">
                          {isOpen ? 'Hide' : 'Details'}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4 pt-2 border-t border-[var(--barn-border)]/70 bg-[var(--barn-surface)] space-y-3 text-xs">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="p-2.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                              <div className="text-[10px] uppercase tracking-wide text-[var(--barn-muted)]">
                                Gestation
                              </div>
                              <div className="font-mono font-semibold text-[var(--barn-ink)] mt-0.5">
                                {profile.gestationDays} days
                              </div>
                            </div>
                            <div className="p-2.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                              <div className="text-[10px] uppercase tracking-wide text-[var(--barn-muted)]">
                                Weaning Target
                              </div>
                              <div className="font-mono font-semibold text-[var(--barn-ink)] mt-0.5">
                                {profile.weanDaysAfterBirth} days post-{profile.birthEventLabel.toLowerCase()}
                              </div>
                            </div>
                            <div className="p-2.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                              <div className="text-[10px] uppercase tracking-wide text-[var(--barn-muted)]">
                                Rebreed Window
                              </div>
                              <div className="font-mono font-semibold text-[var(--barn-ink)] mt-0.5">
                                {profile.rebreedDaysAfterBirth} days post-birth
                              </div>
                            </div>
                            <div className="p-2.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                              <div className="text-[10px] uppercase tracking-wide text-[var(--barn-muted)]">
                                ID Convention
                              </div>
                              <div className="font-medium text-[var(--barn-ink)] mt-0.5 truncate" title={idLabels.fieldLabel}>
                                {idLabels.shortLabel}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <div className="font-semibold text-[var(--barn-ink)]">
                                Automatic Milestone Cascade ({profile.milestones.length})
                              </div>
                              {profile.milestones.length > 0 ? (
                                <ul className="space-y-1 text-[var(--barn-muted)] list-disc pl-4">
                                  {profile.milestones.map((m, idx) => (
                                    <li key={idx}>
                                      <strong className="text-[var(--barn-ink)]">{m.label}</strong> —{' '}
                                      {m.daysOffset === 0
                                        ? `On expected ${profile.birthEventLabel.toLowerCase()} day`
                                        : m.relativeTo === 'AFTER_BRED'
                                        ? `${m.daysOffset}d after breeding`
                                        : m.relativeTo === 'BEFORE_BIRTH'
                                        ? `${m.daysOffset}d before due date`
                                        : `${m.daysOffset}d after ${profile.birthEventLabel.toLowerCase()}`}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-[var(--barn-muted)]">
                                  Custom milestone schedule configurable in Settings → Livestock Species.
                                </p>
                              )}
                            </div>

                            <div className="space-y-1.5 text-[var(--barn-muted)]">
                              <div className="font-semibold text-[var(--barn-ink)]">
                                Identification, Housing &amp; Records
                              </div>
                              <p>
                                <strong className="text-[var(--barn-ink)]">Terminology:</strong>{' '}
                                {profile.maleLabel} (Male) · {profile.femaleLabel} (Female) ·{' '}
                                {profile.offspringLabel} (Offspring) · {profile.birthEventLabel} (Birth)
                              </p>
                              <p>
                                <strong className="text-[var(--barn-ink)]">Primary ID:</strong>{' '}
                                {extra?.idConvention ?? `${idLabels.fieldLabel} (${idLabels.placeholder}).`}
                              </p>
                              <p>
                                <strong className="text-[var(--barn-ink)]">Care &amp; Housing:</strong>{' '}
                                {extra?.housingAndCare ??
                                  `Customize gestation, weaning, and milestone task templates anytime in Settings → Livestock Species.`}
                              </p>
                              {extra?.pedigreeAndShowNotes && (
                                <p>
                                  <strong className="text-[var(--barn-ink)]">Pedigree &amp; Shows:</strong>{' '}
                                  {extra.pedigreeAndShowNotes}
                                </p>
                              )}
                              {profile.exampleBreeds.length > 0 && (
                                <p>
                                  <strong className="text-[var(--barn-ink)]">Common Breeds:</strong>{' '}
                                  {profile.exampleBreeds.join(', ')}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--barn-border)] bg-[var(--barn-canvas)] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <span className="text-[var(--barn-muted)]">
            Customize species gestation days, prefixes, and milestone offsets anytime in Settings.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] px-4 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
}
