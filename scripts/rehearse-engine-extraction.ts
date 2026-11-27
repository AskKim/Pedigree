/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Engine Extraction Rehearsal (`npm run verify:extraction`).
 *
 * Copies `src/engine`, `src/features`, `src/utils`, `tsconfig.json`, and `tsconfig.engine.json`
 * into an isolated temporary directory (without `src/domain`, `src/app`, `src/storage`,
 * `src/hooks`, or `src/components`) and runs `tsc -p tsconfig.engine.json --noEmit` to prove
 * the framework layers compile standalone before any future `/engine` repo extraction.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIRS_TO_COPY = ['src/engine', 'src/features', 'src/utils'];
const FILES_TO_COPY = ['tsconfig.json', 'tsconfig.engine.json'];

function copyDirRecursive(srcDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-extraction-rehearsal-'));

try {
  for (const relDir of DIRS_TO_COPY) {
    copyDirRecursive(path.join(ROOT, relDir), path.join(tempRoot, relDir));
  }
  for (const relFile of FILES_TO_COPY) {
    fs.copyFileSync(path.join(ROOT, relFile), path.join(tempRoot, relFile));
  }

  const nodeModulesSrc = path.join(ROOT, 'node_modules');
  const nodeModulesDest = path.join(tempRoot, 'node_modules');
  if (fs.existsSync(nodeModulesSrc)) {
    fs.symlinkSync(nodeModulesSrc, nodeModulesDest, 'dir');
  }

  const tscBin = path.join(ROOT, 'node_modules', '.bin', 'tsc');
  execFileSync(tscBin, ['-p', 'tsconfig.engine.json', '--noEmit'], {
    cwd: tempRoot,
    stdio: 'inherit',
  });

  console.log('[verify:extraction] PASS — isolated engine + features + utils compiled with zero domain/app/storage files.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
