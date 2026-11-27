#!/usr/bin/env node
// prompts/preflight/scripts/preflight-log.mjs — Atomic Schema v2 state writer with lockfile guard


// Last Updated: 2026-11-25T22:50:00-06:00
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, unlinkSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname } from 'node:path';


const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 && args[i + 1] ? args[i + 1] : null; };


const stepId = getArg('--step');
const status = getArg('--status') ?? 'completed';
const platform = getArg('--platform') ?? 'antigravity';
const filesCsv = getArg('--files') ?? '';
const errorMsg = getArg('--error');


const cleanError = errorMsg ? errorMsg.replace(/(\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s"'`]+/g, '<local-path>') : null;
const nextStep = getArg('--next');
const phase = getArg('--phase') ?? (platform === 'ai-studio' ? 'A' : 'B');


if (!stepId || !['completed', 'failed', 'skipped'].includes(status)) {
  console.error('Usage: node prompts/preflight/scripts/preflight-log.mjs --step <id> --status completed|failed|skipped [--platform ai-studio|antigravity] [--files a,b] [--error "<msg>"] [--next <id>]');
  process.exit(1);
}


const statePath = 'docs/handoff-state.json';
const lockPath = 'docs/.handoff.lock';
mkdirSync(dirname(statePath), { recursive: true });


if (existsSync(lockPath)) {
  const ageMs = Date.now() - statSync(lockPath).mtimeMs;
  if (ageMs < 60_000) { console.error('STEP_BLOCKED: Concurrent session lock active at docs/.handoff.lock.'); process.exit(1); }
  unlinkSync(lockPath);
}


writeFileSync(lockPath, String(process.pid), 'utf8');
try {
  let head = 'sandbox-uncommitted';
  try { head = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch {}
  const nowUtc = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const touched = filesCsv ? filesCsv.split(',').map((s) => s.trim()).filter(Boolean) : [];


  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {
    schema_version: 2, active_branch: 'unknown', target_version: 'unknown', resume_cursor: null,
    phase_a_scope_hash: null, ai_studio_status: 'pending', ai_studio_completed_at: null,
    ai_studio_commit_sha: null, improvement_log_anchor: null, antigravity_status: 'pending',
    antigravity_completed_at: null, history: [], last_error: null
  };


  const entry = {
    step_id: stepId, branch: state.active_branch, version: state.target_version,
    head_sha: head, platform, status, completed_at: nowUtc, touched_files: touched
  };


  if (cleanError) entry.error = cleanError;


  state.history = Array.isArray(state.history) ? state.history : [];
  state.history.push(entry);


  state.last_error = status === 'failed' ? (cleanError ?? `Step ${stepId} failed`) : null;
  if (nextStep) state.resume_cursor = { phase, next_step_id: nextStep };


  writeFileSync(`${statePath}.tmp`, JSON.stringify(state, null, 2) + '\n', 'utf8');
  renameSync(`${statePath}.tmp`, statePath);
  console.log(`OK [${stepId}] status=${status} files=${touched.length}`);
} finally {
  if (existsSync(lockPath)) unlinkSync(lockPath);
}
