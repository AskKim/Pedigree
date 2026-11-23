/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Show Results, Awards, Grand Championship Progress & E-Leg Vault Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies so the exact
 * same normalization, GC progress evaluation, pedigree honor formatting, and report aggregations
 * run cleanly in Web PWAs, unit tests, and React Native / Expo.
 */

import {
  isSafeRecordKey,
  sanitizePlainText,
  sanitizeSafeRasterImageDataUrl,
  sanitizeSingleLineText,
} from './inputSanitization';
import {
  Animal,
  CareLog,
  generateUuid,
  nowIsoUtc,
  SHOW_AWARD_OPTIONS,
  ShowAnimalResult,
  ShowAwardCode,
  ShowELegAttachment,
  ShowEvent,
} from './models';

export const GC_LEG_TARGET = 3;
export const MAX_SHOW_ELEG_ATTACHMENTS_PER_RESULT = 6;

const ALLOWED_AWARD_CODES = new Set<ShowAwardCode>(
  SHOW_AWARD_OPTIONS.map((opt) => opt.code)
);

const AWARD_DISPLAY_ORDER: ShowAwardCode[] = [
  'BIS',
  'RIS',
  'GCH',
  'BOB',
  'BOS',
  'BOV',
  'BOSV',
];

function finiteNonNegInt(raw: unknown, max = 10_000): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, Math.round(n));
}

function finiteNonNegPoints(raw: unknown, max = 1_000_000): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, Math.round(n * 100) / 100);
}

export function normalizeShowAwards(raw: unknown): ShowAwardCode[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<ShowAwardCode>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const upper = item.trim().toUpperCase() as ShowAwardCode;
    if (ALLOWED_AWARD_CODES.has(upper)) {
      seen.add(upper);
    }
  }
  return AWARD_DISPLAY_ORDER.filter((code) => seen.has(code));
}

export function sanitizeShowELegAttachment(raw: unknown): ShowELegAttachment | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const safeDataUrl = sanitizeSafeRasterImageDataUrl(obj.dataUrl);
  const safeThumbUrl = sanitizeSafeRasterImageDataUrl(obj.thumbnailDataUrl) || safeDataUrl;
  if (!safeDataUrl && !safeThumbUrl) return null;

  const resolvedDataUrl = safeDataUrl || safeThumbUrl;
  const resolvedThumb = safeThumbUrl || resolvedDataUrl;
  const rawId = typeof obj.id === 'string' ? sanitizeSingleLineText(obj.id, 120) : '';

  return {
    id: rawId && isSafeRecordKey(rawId) ? rawId : generateUuid(),
    fileName: sanitizeSingleLineText(obj.fileName || 'e-leg-certificate', 180) || 'e-leg-certificate',
    mimeType: sanitizeSingleLineText(obj.mimeType || 'image/webp', 80) || 'image/webp',
    width: finiteNonNegInt(obj.width, 32_768),
    height: finiteNonNegInt(obj.height, 32_768),
    storedBytes: finiteNonNegInt(obj.storedBytes, 50_000_000),
    thumbnailDataUrl: resolvedThumb,
    dataUrl: resolvedDataUrl,
    caption: sanitizeSingleLineText(obj.caption || '', 240) || undefined,
    addedAtIso:
      typeof obj.addedAtIso === 'string' && obj.addedAtIso.trim()
        ? sanitizeSingleLineText(obj.addedAtIso, 48)
        : nowIsoUtc(),
  };
}

export function hasMeaningfulShowResult(result: ShowAnimalResult): boolean {
  return Boolean(
    result.classPlacement.trim() ||
      result.awards.length > 0 ||
      (result.judgeName || '').trim() ||
      result.judgeNotes.trim() ||
      result.legsEarned > 0 ||
      (result.pointsEarned ?? 0) > 0 ||
      (result.legCertificateNumber || '').trim() ||
      result.eLegAttachments.length > 0
  );
}

export function normalizeShowResults(
  raw: unknown,
  options?: { dropEmpty?: boolean }
): ShowAnimalResult[] {
  if (!Array.isArray(raw)) return [];
  const byAnimalId = new Map<string, ShowAnimalResult>();

  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const rawAnimalId = typeof obj.animalId === 'string' ? obj.animalId.trim() : '';
    if (!rawAnimalId || !isSafeRecordKey(rawAnimalId)) continue;
    const animalId = sanitizeSingleLineText(rawAnimalId, 140);
    if (!animalId) continue;

    const rawAttachments = Array.isArray(obj.eLegAttachments) ? obj.eLegAttachments : [];
    const eLegAttachments: ShowELegAttachment[] = [];
    const seenAttachmentIds = new Set<string>();
    for (const att of rawAttachments) {
      if (eLegAttachments.length >= MAX_SHOW_ELEG_ATTACHMENTS_PER_RESULT) break;
      const clean = sanitizeShowELegAttachment(att);
      if (clean && !seenAttachmentIds.has(clean.id)) {
        seenAttachmentIds.add(clean.id);
        eLegAttachments.push(clean);
      }
    }

    const points = finiteNonNegPoints(obj.pointsEarned);
    const judgeName = sanitizeSingleLineText(obj.judgeName || '', 120);
    const certNo = sanitizeSingleLineText(obj.legCertificateNumber || '', 80);

    const normalized: ShowAnimalResult = {
      animalId,
      classPlacement: sanitizeSingleLineText(obj.classPlacement || '', 120),
      awards: normalizeShowAwards(obj.awards),
      judgeName: judgeName || undefined,
      judgeNotes: sanitizePlainText(obj.judgeNotes || '', 4_000).trim(),
      legsEarned: finiteNonNegInt(obj.legsEarned, 20),
      pointsEarned: points > 0 ? points : undefined,
      legCertificateNumber: certNo || undefined,
      eLegAttachments,
    };

    if (options?.dropEmpty && !hasMeaningfulShowResult(normalized)) {
      continue;
    }

    byAnimalId.set(animalId, normalized);
  }

  return Array.from(byAnimalId.values());
}

export function mergeEnteredAnimalIdsWithResults(
  enteredAnimalIds: string[],
  results?: ShowAnimalResult[]
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of enteredAnimalIds) {
    const clean = typeof id === 'string' ? id.trim() : '';
    if (!clean || !isSafeRecordKey(clean) || seen.has(clean)) continue;
    seen.add(clean);
    ordered.push(clean);
  }
  for (const res of results ?? []) {
    const clean = typeof res.animalId === 'string' ? res.animalId.trim() : '';
    if (!clean || !isSafeRecordKey(clean) || seen.has(clean)) continue;
    seen.add(clean);
    ordered.push(clean);
  }
  return ordered;
}

/**
 * Computes per-animal leg count deltas (`nextLegs - prevLegs`) when creating,
 * updating, or deleting a `ShowEvent` so `Animal.legsCount` stays synchronized.
 */
export function computeShowLegDeltas(
  prevResults: ShowAnimalResult[] | undefined,
  nextResults: ShowAnimalResult[] | undefined
): Map<string, number> {
  const prevByAnimal = new Map<string, number>();
  for (const r of prevResults ?? []) {
    if (!r.animalId) continue;
    prevByAnimal.set(r.animalId, (prevByAnimal.get(r.animalId) || 0) + finiteNonNegInt(r.legsEarned, 20));
  }

  const nextByAnimal = new Map<string, number>();
  for (const r of nextResults ?? []) {
    if (!r.animalId) continue;
    nextByAnimal.set(r.animalId, (nextByAnimal.get(r.animalId) || 0) + finiteNonNegInt(r.legsEarned, 20));
  }

  const allIds = new Set<string>([...prevByAnimal.keys(), ...nextByAnimal.keys()]);
  const deltas = new Map<string, number>();
  for (const animalId of allIds) {
    const delta = (nextByAnimal.get(animalId) || 0) - (prevByAnimal.get(animalId) || 0);
    if (delta !== 0) {
      deltas.set(animalId, delta);
    }
  }
  return deltas;
}

export interface AnimalShowHistoryEntry {
  showId: string;
  showName: string;
  eventDateIso: string;
  location: string;
  sanctioningBody: string;
  result: ShowAnimalResult | null;
}

export interface AnimalELegVaultItem extends ShowELegAttachment {
  showId: string;
  showName: string;
  eventDateIso: string;
  sanctioningBody: string;
  legCertificateNumber?: string;
}

export interface GrandChampionProgress {
  isGrandChampion: boolean;
  grandChampionNumber: string;
  legsEarned: number;
  legsTarget: number;
  distinctJudgesCount: number;
  isEligible: boolean;
  progressPercent: number;
  statusLabel: string;
  shortLabel: string;
}

export interface AnimalShowSummary {
  showsEntered: number;
  placementsRecorded: number;
  totalShowEventLegs: number;
  totalCareLogLegs: number;
  effectiveLegs: number;
  totalPoints: number;
  awardCounts: Record<ShowAwardCode, number>;
  awardsSummaryText: string;
  distinctJudgesWithLegs: number;
  eLegAttachments: AnimalELegVaultItem[];
  entries: AnimalShowHistoryEntry[];
  gcProgress: GrandChampionProgress;
  pedigreeHonorLine: string;
}

export function formatAwardCountsText(awardCounts: Record<ShowAwardCode, number>): string {
  const parts: string[] = [];
  for (const code of AWARD_DISPLAY_ORDER) {
    const count = awardCounts[code] || 0;
    if (count > 0) {
      parts.push(count === 1 ? code : `${count}x ${code}`);
    }
  }
  return parts.join(' · ');
}

export function computeAnimalShowSummary(
  animal: Animal,
  shows: ShowEvent[] = [],
  careLogs: CareLog[] = []
): AnimalShowSummary {
  const awardCounts: Record<ShowAwardCode, number> = {
    BOB: 0,
    BOS: 0,
    BIS: 0,
    GCH: 0,
    BOV: 0,
    BOSV: 0,
    RIS: 0,
  };

  const entries: AnimalShowHistoryEntry[] = [];
  const eLegAttachments: AnimalELegVaultItem[] = [];
  const legJudges = new Set<string>();

  let totalShowEventLegs = 0;
  let totalPoints = 0;
  let placementsRecorded = 0;

  for (const show of shows) {
    const result = (show.results ?? []).find((r) => r.animalId === animal.id) ?? null;
    const isEntered = (show.enteredAnimalIds ?? []).includes(animal.id) || Boolean(result);
    if (!isEntered) continue;

    entries.push({
      showId: show.id,
      showName: show.name,
      eventDateIso: show.eventDateIso,
      location: show.location,
      sanctioningBody: show.sanctioningBody,
      result,
    });

    if (result) {
      const hasPlacementOrWin = Boolean(
        result.classPlacement.trim() ||
          result.awards.length > 0 ||
          result.legsEarned > 0 ||
          (result.pointsEarned ?? 0) > 0
      );
      if (hasPlacementOrWin) {
        placementsRecorded += 1;
      }
      totalShowEventLegs += finiteNonNegInt(result.legsEarned, 20);
      totalPoints += finiteNonNegPoints(result.pointsEarned);

      for (const code of result.awards) {
        if (ALLOWED_AWARD_CODES.has(code)) {
          awardCounts[code] += 1;
        }
      }

      if (result.legsEarned > 0 && result.judgeName?.trim()) {
        legJudges.add(result.judgeName.trim().toLowerCase());
      }

      for (const att of result.eLegAttachments ?? []) {
        eLegAttachments.push({
          ...att,
          showId: show.id,
          showName: show.name,
          eventDateIso: show.eventDateIso,
          sanctioningBody: show.sanctioningBody,
          legCertificateNumber: result.legCertificateNumber,
        });
      }
    }
  }

  entries.sort((a, b) => (b.eventDateIso || '').localeCompare(a.eventDateIso || ''));

  const totalCareLogLegs = careLogs.filter(
    (l) => l.animalId === animal.id && l.showLegEarned
  ).length;

  const effectiveLegs = Math.max(
    finiteNonNegInt(animal.legsCount, 10_000),
    totalShowEventLegs,
    totalCareLogLegs
  );

  const gcNumber = (animal.grandChampionNumber || '').trim();
  const isGrandChampion = Boolean(gcNumber) || awardCounts.GCH > 0;
  const isEligible = !isGrandChampion && effectiveLegs >= GC_LEG_TARGET;
  const progressPercent = isGrandChampion
    ? 100
    : Math.min(100, Math.round((effectiveLegs / GC_LEG_TARGET) * 100));

  let statusLabel: string;
  let shortLabel: string;
  if (gcNumber) {
    statusLabel = `Grand Champion #${gcNumber} (${effectiveLegs} leg${effectiveLegs === 1 ? '' : 's'})`;
    shortLabel = `GC #${gcNumber}`;
  } else if (awardCounts.GCH > 0) {
    statusLabel = `Grand Champion Win (${effectiveLegs} leg${effectiveLegs === 1 ? '' : 's'})`;
    shortLabel = `GCH (${effectiveLegs} leg${effectiveLegs === 1 ? '' : 's'})`;
  } else if (effectiveLegs >= GC_LEG_TARGET) {
    statusLabel = `GC Eligible (${effectiveLegs}/${GC_LEG_TARGET} legs${legJudges.size > 0 ? ` · ${legJudges.size} judge${legJudges.size === 1 ? '' : 's'}` : ''})`;
    shortLabel = `GC Eligible (${effectiveLegs}/3)`;
  } else {
    statusLabel = `${effectiveLegs}/${GC_LEG_TARGET} legs to GC${legJudges.size > 0 ? ` (${legJudges.size} judge${legJudges.size === 1 ? '' : 's'})` : ''}`;
    shortLabel = `${effectiveLegs}/${GC_LEG_TARGET} legs`;
  }

  const awardsSummaryText = formatAwardCountsText(awardCounts);
  const roundedPoints = Math.round(totalPoints * 100) / 100;

  const honorParts: string[] = [];
  if (gcNumber) {
    honorParts.push(`GC #${gcNumber}`);
  } else if (isEligible) {
    honorParts.push(`GC Eligible (${effectiveLegs}/3 Legs)`);
  } else if (effectiveLegs > 0) {
    honorParts.push(`${effectiveLegs}/3 Legs to GC`);
  }
  if (awardsSummaryText) {
    honorParts.push(awardsSummaryText);
  }
  if (roundedPoints > 0) {
    honorParts.push(`${roundedPoints} pts`);
  }
  if (eLegAttachments.length > 0) {
    honorParts.push(`${eLegAttachments.length} E-Leg${eLegAttachments.length === 1 ? '' : 's'}`);
  }

  return {
    showsEntered: entries.length,
    placementsRecorded,
    totalShowEventLegs,
    totalCareLogLegs,
    effectiveLegs,
    totalPoints: roundedPoints,
    awardCounts,
    awardsSummaryText,
    distinctJudgesWithLegs: legJudges.size,
    eLegAttachments,
    entries,
    gcProgress: {
      isGrandChampion,
      grandChampionNumber: gcNumber,
      legsEarned: effectiveLegs,
      legsTarget: GC_LEG_TARGET,
      distinctJudgesCount: legJudges.size,
      isEligible,
      progressPercent,
      statusLabel,
      shortLabel,
    },
    pedigreeHonorLine: honorParts.join(' · '),
  };
}
