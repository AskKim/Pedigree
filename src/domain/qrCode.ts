/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript ISO/IEC 18004 QR Code Generator & Deep-Link Builder (`src/domain/qrCode.ts`).
 *
 * Generates 100% offline, zero-dependency scannable QR codes (Versions 1–14, Byte mode,
 * EC Level M with automatic EC-L fallback for long URLs) as crisp single-path inline `<svg>`
 * strings suitable for 4"x2.25" thermal cage labels, 8-up US Letter cage card sheets,
 * and on-screen previews.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or Node imports.
 */

import type { Animal, CageLocation } from './models';
import {
  buildQueryDeepLink,
  computeReedSolomonRemainder,
  encodeQrMatrix,
  normalizeAppBaseUrl,
  parseQueryDeepLinkParams,
  renderQrSvg,
  type QrErrorCorrectionLevel,
  type QrMatrixResult,
  type QrSvgOptions,
} from '@engine/primitives/qrCodec';

export {
  computeReedSolomonRemainder,
  encodeQrMatrix,
  normalizeAppBaseUrl,
  renderQrSvg,
  type QrErrorCorrectionLevel,
  type QrMatrixResult,
  type QrSvgOptions,
};

export interface AppDeepLinkTarget {
  taskId: string;
  animalId: string;
  cageId: string;
  species: string;
  route: string;
  emergencyReset: boolean;
  hasDeepLink: boolean;
}

/**
 * Builds a scannable local PWA deep link pointing straight to an animal's profile inside Herd.
 */
export function buildAnimalProfileDeepLink(
  appBaseUrl: string | undefined,
  animal: Pick<Animal, 'id' | 'species'>
): string {
  const id = (animal.id || '').trim();
  if (!id) return '';
  return buildQueryDeepLink(appBaseUrl, [
    ['route', 'herd'],
    ['species', animal.species],
    ['animalId', id],
  ]);
}

/**
 * Builds a scannable local PWA deep link pointing straight to a cage/pen card on the Facility Board.
 */
export function buildCageBoardDeepLink(
  appBaseUrl: string | undefined,
  cage: Pick<CageLocation, 'id' | 'species'>
): string {
  const id = (cage.id || '').trim();
  if (!id) return '';
  return buildQueryDeepLink(appBaseUrl, [
    ['route', 'dashboard'],
    ['species', cage.species],
    ['cageId', id],
  ]);
}

/**
 * Pure parser for startup deep-link URL query strings (`?route=herd&species=Rabbit&animalId=...`).
 */
export function parseAppDeepLinkParams(search: string | undefined | null): AppDeepLinkTarget {
  const map = parseQueryDeepLinkParams(search);
  const taskId = map.get('taskId') || '';
  const animalId = map.get('animalId') || '';
  const cageId = map.get('cageId') || '';
  const species = map.get('species') || '';
  const route = map.get('route') || '';
  const emergencyReset = map.get('emergency_reset') === 'true';

  return {
    taskId,
    animalId,
    cageId,
    species,
    route,
    emergencyReset,
    hasDeepLink: Boolean(taskId || animalId || cageId || species || route),
  };
}
