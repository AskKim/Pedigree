/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Automated CLI Drift Verifier (`scripts/verify-improvements.ts`).
 *
 * Reads all tracked files from disk and runs `evaluateImprovementInvariants` from
 * `src/core/improvementRegistry.ts`. Exits non-zero if a GitHub sync or merge
 * accidentally removed or reverted any logged improvement.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  evaluateImprovementInvariants,
  IMPROVEMENTS_REGISTRY,
} from '../src/core/improvementRegistry';

async function main() {
  const rootDir = process.cwd();
  const uniquePaths = new Set<string>();

  for (const entry of IMPROVEMENTS_REGISTRY) {
    for (const inv of entry.invariants) {
      uniquePaths.add(inv.filePath.replace(/^\/+/, ''));
    }
  }

  const filesByPath: Record<string, string | undefined> = {};

  await Promise.all(
    Array.from(uniquePaths).map(async (relPath) => {
      try {
        filesByPath[relPath] = await readFile(resolve(rootDir, relPath), 'utf8');
      } catch {
        filesByPath[relPath] = undefined;
      }
    })
  );

  const report = evaluateImprovementInvariants(filesByPath, IMPROVEMENTS_REGISTRY);

  console.log(
    `[verify:improvements] Checked ${report.totalEntries} improvements across ${report.totalFilesChecked} files.`
  );

  if (report.ok) {
    console.log(
      `[verify:improvements] PASS — all ${report.passedCount}/${report.totalEntries} tracked improvements are intact.`
    );
    process.exit(0);
  }

  console.error(
    `[verify:improvements] FAIL — detected ${report.violations.length} drift violation(s):`
  );
  for (const v of report.violations) {
    console.error(`\n  [${v.entryId}] ${v.title}`);
    console.error(`    File: ${v.filePath}`);
    console.error(`    Issue: ${v.issue}`);
    console.error('    Restore Playbook:');
    v.restorePlaybook.forEach((step, idx) => {
      console.error(`      ${idx + 1}. ${step}`);
    });
  }

  process.exit(1);
}

void main();
