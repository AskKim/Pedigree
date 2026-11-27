#!/usr/bin/env node
// prompts/preflight/scripts/preflight-lint.mjs — Zero-dependency preflight integrity, mate-link & prefix linter




// Last Updated: 2026-11-25T22:55:00-06:00
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const root = 'prompts/preflight';
const runDir = join(root, 'run-uni');
const readDir = join(runDir, 'read');
const cleanTemplate = join(root, 'templates', 'pf-launcher-uni-clean.md');
const launcher = join(root, 'pf-launcher-uni.md');
const checkPrefix = process.argv.includes('--check-prefix');
const MAX_FILE_SIZE = 262144; // 256 KB
const errors = [];
const forbidden = [
  /PF-launcher\.md/,
  /run-uni\/docs\//,
  /run-uni\/tokens\.md/,
  /run-uni\/wiring\.md/,
  /\[ONE-TIME-SETUP\]/,
  /\[PER-RELEASE SINGLE-USE\]/,
  /master_launcher_clean\.md/
];
const allFiles = [];
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.name !== e.name.toLowerCase()) errors.push(`Uppercase name: ${full}`);
    if (e.isDirectory()) walk(full); else allFiles.push(full);
  }
}
walk(root);
for (const f of allFiles) {
  if (statSync(f).size > MAX_FILE_SIZE) continue;
  if (f.endsWith('.json')) {
    try { JSON.parse(readFileSync(f, 'utf8')); } catch (err) { errors.push(`Invalid JSON in ${f}: ${err.message}`); }
  }
  if (f.endsWith('.md') && !f.includes('feedback')) {
    const txt = readFileSync(f, 'utf8');
    for (const rx of forbidden) if (rx.test(txt)) errors.push(`Forbidden legacy pattern ${rx} in ${f}`);
  }
}
if (existsSync(launcher) && statSync(launcher).size <= MAX_FILE_SIZE) {
  const lTxt = readFileSync(launcher, 'utf8');
  const cStart = lTxt.indexOf('=== CONSTRAINTS ===');
  const cEnd = lTxt.indexOf('===================\apos;, cStart);
  const cBlock = cStart !== -1 && cEnd !== -1 ? lTxt.slice(cStart, cEnd) : lTxt;
  const matches = cBlock.match(/^(\d+)\./gm) || [];
  const seen = new Set();
  for (const m of matches) {
    if (seen.has(m)) errors.push(`Duplicate constraint numbering in ${launcher}: ${m}`);
    seen.add(m);
  }
}
if (existsSync(runDir) && existsSync(readDir)) {
  const prompts = readdirSync(runDir).filter((f) => f.endsWith('.md'));
  const readmes = readdirSync(readDir).filter((f) => f.endsWith('-readme.md'));
  const promptSet = new Set(prompts);
  const readmeSet = new Set(readmes);
  for (const file of prompts) {
    const mate = file.replace(/\.md$/, '-readme.md');
    if (!readmeSet.has(mate)) { errors.push(`Missing mate readme for ${file}: expected ${mate}`); continue; }
    const pPath = join(runDir, file);
    const rPath = join(readDir, mate);
    if (statSync(pPath).size <= MAX_FILE_SIZE && statSync(rPath).size <= MAX_FILE_SIZE) {
      const pTxt = readFileSync(pPath, 'utf8');
      const rTxt = readFileSync(rPath, 'utf8');
      if (!pTxt.includes(`prompts/preflight/run-uni/read/${mate}`)) errors.push(`Missing mate link in ${file} -> ${mate}`);
      if (!rTxt.includes(`prompts/preflight/run-uni/${file}`)) errors.push(`Missing mate link in ${mate} -> ${file}`);
    }
  }
  for (const r of readmes) {
    const mate = r.replace(/-readme\.md$/, '.md');
    if (!promptSet.has(mate)) errors.push(`Orphaned readme with no prompt mate: ${r}`);
  }
}
const rcPath = join(runDir, 'release-check.md');
if (existsSync(rcPath) && statSync(rcPath).size <= MAX_FILE_SIZE) {
  const rc = readFileSync(rcPath, 'utf8');
  for (const tag of ['<!-- PHASE_A_START -->', '<!-- PHASE_A_END -->', '<!-- PHASE_B_START -->', '<!-- PHASE_B_END -->']) {
    if (!rc.includes(tag)) errors.push(`Missing anchor ${tag} in release-check.md`);
  }
}
if (existsSync(cleanTemplate) && statSync(cleanTemplate).size <= MAX_FILE_SIZE) {
  const ct = readFileSync(cleanTemplate, 'utf8');
  if (ct.includes('[SINGLE-USE-COMPLETED:')) errors.push('Pristine template contains retired SINGLE-USE-COMPLETED marker');
}
if (checkPrefix && existsSync(launcher) && existsSync(cleanTemplate)) {
  const getPrefix = (p) => {
    if (statSync(p).size > MAX_FILE_SIZE) return '';
    const t = readFileSync(p, 'utf8');
    const idx = t.indexOf('===================');
    return idx === -1 ? '' : createHash('sha256').update(t.slice(t.indexOf('# Reusable Modular'), idx)).digest('hex');
  };
  if (getPrefix(launcher) !== getPrefix(cleanTemplate)) errors.push('Prompt-cache prefix mismatch between pf-launcher-uni.md and templates/pf-launcher-uni-clean.md');
}


// Privacy/path-leak check for docs/handoff-state.json
const handoffPath = join('docs', 'handoff-state.json');
if (existsSync(handoffPath) && statSync(handoffPath).size <= MAX_FILE_SIZE) {
  try {
    const state = JSON.parse(readFileSync(handoffPath, 'utf8'));
    const leakPattern = /\/Users\/|\/home\/|C:\\Users\\/;
    if (state.last_error && leakPattern.test(state.last_error)) {
      errors.push(`Local path leak detected in docs/handoff-state.json last_error`);
    }
    if (Array.isArray(state.history)) {
      for (let i = 0; i < state.history.length; i++) {
        if (state.history[i]?.error && leakPattern.test(state.history[i].error)) {
          errors.push(`Local path leak detected in docs/handoff-state.json history[${i}].error`);
        }
      }
    }
  } catch (err) {
    errors.push(`Invalid JSON in ${handoffPath}: ${err.message}`);
  }
}
if (errors.length > 0) {
  console.error(`PREFLIGHT_LINT_FAILED (${errors.length} issues):`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log('PREFLIGHT_LINT_OK: lowercase names, 1-to-1 mate links, JSON schemas, anchors, and clean paths verified.');
