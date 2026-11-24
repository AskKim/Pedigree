/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Application Release Milestones & Target Deliverables
 * (`src/core/milestones.ts`).
 *
 * Single canonical code location declaring release milestones and future
 * roadmap deliverables for the Community Pedigree Project.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or Node imports.
 */

export interface MilestoneItem {
  id: string;
  title: string;
  description: string;
  targetRelease: string;
  status: 'planned' | 'in_progress' | 'completed';
  details?: string[];
}

export interface ReleaseMilestone {
  version: string;
  label: string;
  summary: string;
  status: 'planned' | 'in_progress' | 'released';
  items: MilestoneItem[];
}

/**
 * Milestones established for Alpha 3.
 */
export const ALPHA_3_MILESTONES: ReleaseMilestone = {
  version: '0.1.0-alpha.3',
  label: 'Alpha 3',
  summary:
    'Device-to-device QR pedigree exchange, architectural modularity, and resolving outdated file dependencies and toolchains.',
  status: 'planned',
  items: [
    {
      id: 'qr-device-to-device-sync',
      title: 'QR code device to device read and receive of pedigrees',
      description:
        'Direct offline peer-to-peer scanning and receiving of pedigree data via animated or chunked QR codes between mobile and desktop devices without requiring an external internet connection or cloud server.',
      targetRelease: '0.1.0-alpha.3',
      status: 'planned',
      details: [
        'High-density and multi-frame QR payload encoding for multi-generation pedigrees',
        'Camera viewfinder reader with validation and conflict resolution',
        'Direct import into local SQLite/OPFS barn store on scan completion',
      ],
    },
    {
      id: 'modularity',
      title: 'Modularity',
      description:
        'Architectural decoupling and modular restructuring of domain logic, UI screens, and storage engines to optimize memory footprint, reduce eager heap consumption, and enable lazy-loaded feature boundaries.',
      targetRelease: '0.1.0-alpha.3',
      status: 'planned',
      details: [
        'Strict boundary separation between core domain computations and UI components',
        'Fine-grained code-splitting and dynamic route/feature imports',
        'Isolated testability for domain calculations and storage adapters',
      ],
    },
    {
      id: 'resolve-outdated-dependencies',
      title: 'Resolving outdated files dependencies Etc',
      description:
        'Comprehensive audit and resolution of outdated files, legacy imports, deprecated package dependencies, and build toolchain hygiene across PWA and Android wrappers.',
      targetRelease: '0.1.0-alpha.3',
      status: 'planned',
      details: [
        'Resolve legacy peer dependency conflicts and upgrade tooling',
        'Deprecate and prune unused legacy import templates and static files',
        'Harden lockfile reproducibility and CI verification passes',
      ],
    },
  ],
};

/**
 * Registry of all historical and upcoming application milestones.
 */
export const APP_MILESTONES: Record<string, ReleaseMilestone> = {
  'alpha-2': {
    version: '0.1.0-alpha.2',
    label: 'Alpha 2',
    summary:
      'Client CRM & waitlist, IAGARB wool/fiber tracking, founder loss/heritability analytics, Barn Scheduler Gantt, LAN P2P sync, atomic SQLite migrations, mobile memory hardening & Android WebView packaging.',
    status: 'released',
    items: [],
  },
  'alpha-3': ALPHA_3_MILESTONES,
};

/**
 * Returns the active or upcoming milestones for a given release version.
 */
export function getMilestonesForRelease(releaseKey: string): ReleaseMilestone | null {
  return APP_MILESTONES[releaseKey] ?? null;
}
