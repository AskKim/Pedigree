/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Feature Module Contract (`@features/featureModule.interface.ts`).
 *
 * Architectural Boundary Rules:
 * 1. ZERO Cross-Feature Imports: Modules in `@features/*` must NEVER import
 *    from other sibling feature modules directly.
 * 2. Features may only import from `@engine/*` or from their own internal subdirectories.
 * 3. Cross-feature data exchange and UI orchestration must be mediated by
 *    `@engine/*` event/storage primitives or assembled in `@app/*`.
 */

export interface FeatureMetadata {
  /** Unique kebab-case feature identifier (e.g. 'backup-vault', 'document-export') */
  readonly id: string;
  /** Human-readable feature name */
  readonly name: string;
  /** Semantic version string */
  readonly version: string;
  /** Brief description of capability */
  readonly description: string;
  /** Required platform capabilities, if any */
  readonly requiredCapabilities?: string[];
}

export interface FeatureLifecycleContext {
  /** Feature-specific configuration passed from the application layer */
  config?: Record<string, unknown>;
  /** Signal for background teardown or memory cleanup */
  signal?: AbortSignal;
}

export interface IFeatureModule<TConfig = Record<string, unknown>, TState = unknown> {
  readonly metadata: FeatureMetadata;

  /** Initializes the feature module with application context */
  initialize(context: FeatureLifecycleContext & { config?: TConfig }): Promise<void>;

  /** Optional teardown when module is unmounted or app freezes */
  dispose?(): Promise<void>;

  /** Optional snapshot of feature state for persistence or diagnostic export */
  getStateSnapshot?(): TState;
}
