/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Central External Platform Importer Registry (`src/core/importers/registry.ts`).
 *
 * Designed so every additional livestock/pedigree platform we add (Evans Software, Kintracs,
 * Hutch, Livestocked, CattleMax, etc.) registers cleanly in one array with zero UI rewrite.
 */

import { HerdBossImporter } from './herdBossImporter';
import { PlatformImporter } from './importerTypes';

export const PLATFORM_IMPORTERS: PlatformImporter[] = [HerdBossImporter];

export function getPlatformImporterById(id: string): PlatformImporter {
  return PLATFORM_IMPORTERS.find((imp) => imp.id === id) || PLATFORM_IMPORTERS[0];
}
