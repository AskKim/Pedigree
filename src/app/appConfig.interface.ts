/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Application and Domain Configuration Interface (`@app/appConfig.interface.ts`).
 *
 * Layer 3 Architectural Role:
 * Assembles content-agnostic core services (@engine/*) with self-contained
 * feature modules (@features/*), providing concrete domain terminology,
 * multi-species settings, branding, UI route hierarchies, and runtime wiring.
 */

import type { IPlatformBridge } from '@engine/bridge';
import type { IStorageAdapter } from '@engine/storage';
import type { StorageAdapter } from '../storage/storageAdapter';

export interface DomainTerminology {
  readonly singularAnimal: string;
  readonly pluralAnimal: string;
  readonly sireLabel: string;
  readonly damLabel: string;
  readonly offspringGroupLabel: string;
  readonly birthEventLabel: string;
  readonly identificationLabel: string;
}

/**
 * App-agnostic metadata configuration holding display strings, versioning, and branding.
 */
export interface AppMetadataConfig {
  readonly appId: string;
  readonly appName: string;
  readonly appVersion: string;
  readonly description: string;
  readonly copyrightNotice: string;
  readonly defaultLocale: string;
}

/**
 * Descriptor for registering and enabling feature modules in the application layer.
 */
export interface AppFeatureRegistration {
  readonly featureId: string;
  readonly enabled: boolean;
  readonly config?: Record<string, unknown>;
}

/**
 * Root contract for an application instance configuration.
 */
export interface IAppConfiguration {
  readonly metadata: AppMetadataConfig;
  readonly activeSpeciesId: string;
  readonly supportedSpecies: string[];
  readonly terminology: Record<string, DomainTerminology>;
  readonly features: AppFeatureRegistration[];
}

/**
 * Composition-root runtime services injected across the application shell and hooks.
 */
export interface AppRuntimeServices {
  readonly bridge: IPlatformBridge;
  readonly storage: IStorageAdapter;
  readonly domainStorage?: StorageAdapter;
}

/**
 * Creates a normalized AppMetadataConfig from partial inputs with safe defaults.
 *
 * @param overrides Optional partial metadata overrides
 * @returns Fully populated, immutable AppMetadataConfig
 */
export function createDefaultAppMetadata(
  overrides?: Partial<AppMetadataConfig>
): AppMetadataConfig {
  return Object.freeze({
    appId: overrides?.appId ?? 'community-pedigree',
    appName: overrides?.appName ?? 'Community Pedigree',
    appVersion: overrides?.appVersion ?? '0.1.0-alpha.3',
    description:
      overrides?.description ??
      '100% Free Offline-First Multi-Species Livestock Registry, Pedigree & Barn Chore Manager.',
    copyrightNotice:
      overrides?.copyrightNotice ??
      'Copyright (C) 2026 Pedigree Contributors (AGPL-3.0-or-later)',
    defaultLocale: overrides?.defaultLocale ?? 'en-US',
  });
}

