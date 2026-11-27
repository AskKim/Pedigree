# Reusable Modular Release And Setup Launcher

<!-- MANIFEST_TOC -->
```
<!-- OUTSIDE_PROMPT_NOTE: Human docs, full Schema v2 reference, and Resetting The Launcher instructions live in prompts/preflight/pf-launcher-uni-readme.md and prompts/preflight/pf-launcher-uni-wiring.md. Pristine copy-ready template: prompts/preflight/templates/pf-launcher-uni-clean.md. -->



<!-- REUSABLE_LAUNCHER_TEMPLATE: true | LAST_UPDATED: 2026-11-25T22:55:00-06:00 -->
<!-- AGENT_EXCLUSION_PROTOCOL: UNIVERSAL
  1. When a [FIRST-TIME-SINGLE-USE] prompt line completes cleanly, rewrite ONLY that line in THIS launcher file on disk to:

     [SINGLE-USE-COMPLETED: <YYYY-MM-DD> | step_id: <step_id> | AGENT_SKIP_LINE: DO NOT READ OR CALL THIS PROMPT FILE]
  2. Do NOT apply AGENT_SKIP_LINE to [REUSABLE] or [PER-RELEASE] prompt lines.
  3. Any model MUST check for AGENT_SKIP_LINE BEFORE reading or calling a prompt file; if present, skip that line immediately without opening the referenced file.
-->
# Reusable Modular Release And Setup Launcher
> **Reusable Modular Rule:** Keep this top static header, master/guardrail handshake, and `=== CONSTRAINTS ===` block byte-identical to preserve prompt-cache prefix hits.
> - **Two File-Edit Setups:** (1) Retire completed `[FIRST-TIME-SINGLE-USE]` lines in place via `AGENT_SKIP_LINE` (never applied to `[REUSABLE]` or `[PER-RELEASE]` lines); (2) log every completed step immediately to `docs/handoff-state.json` (Schema v2) using UTC ISO-8601 (`YYYY-MM-DDTHH:MM:SSZ`) and clear `last_error: null` upon any resumed step's clean completion.
> - **Branch, Version, Stale & Duplicate Guards:**
>   1. **Branch / Version Reset:** If `active_branch` or `target_version` differs from `<branch-name>` or `<version-tag>` (or user requests a branch-local reset), reset `active_branch`, `target_version`, `resume_cursor: null`, `phase_a_scope_hash: null`, `ai_studio_status: "pending"`, `ai_studio_completed_at: null`, `ai_studio_commit_sha: null`, `improvement_log_anchor: null`, `antigravity_status: "pending"`, `antigravity_completed_at: null`, and `last_error: null` (preserving `history[]` and all `AGENT_SKIP_LINE` markers).
>   2. **Stale Checkpoint (> `stale_hours`, default 24h) Or Phase A-Scope Delta = Hard Stop (Block Phase B):** If `ai_studio_completed_at` exceeds `stale_hours`, or if commits touched Phase A-scope paths (`src/`, `public/`, `index.html`, `package.json`, `manifest*`) after Phase A, or `improvement_log_anchor` / branch / version changed, print `STALE_BLOCKED`, log `last_error`, and halt until Phase A is rerun in AI Studio. Phase B-scope edits (`THIRD_PARTY_NOTICES.md`, `.github/workflows/*`, `CHANGELOG.md`) must NOT falsely invalidate Phase A during a Phase B resume.
>   3. **Per-Release Duplicate Guard:** Before executing any `[PER-RELEASE]` step, check `history[]` in `docs/handoff-state.json`. If already `completed` for `<branch-name>` + `<version-tag>` + current `HEAD` (unless `--force-rerun <step_id>` is passed), notify the user with `completed_at` and ask whether to continue or abort.
Read `prompts/master_system_prompt.md` completely, enforce all architectural, scope, type-safety, and output rules, and confirm it outputs `ALIGNED` (or `aligned`) before running steps below.
Read `prompts/preflight/run-uni/guardrails.md` completely, enforce every Hard Stop, Architecture, Data-Safety, Scope, Git, and Token-Efficiency guardrail, and confirm it outputs `GUARDED` (or `guarded`) before executing any step. If either check fails or any step conflicts with a guardrail, record `last_error` in `docs/handoff-state.json`, execute step-scoped rollback ONLY on files touched by the failed step, print `STEP_BLOCKED [<step_id>]: <1-2 line reason> | Reverted: <files> | Resume: fix issue and re-run launcher.`, and stop.
=== CONSTRAINTS ===
1. Read `prompts/preflight/preflight.config.json` first if present to auto-load static repo parameters (`repo_url`, `live_url`, `subpath`, `dev_branch`, `release_branch`, `phase_a_scope_paths`, `stale_hours`). Stop and ask the user only for missing parameters, dynamic run values (`<branch-name>`, `<version-tag>`), optional flags (`--dry-run`, `--force-rerun <step_id>`), and upfront confirmation of the active platform (`ai-studio` vs. `antigravity`); never re-prompt mid-run.
2. **Deterministic Platform Detection:** If local Git CLI / shell / wrapper tools are unavailable (browser preview sandbox), classify as `ai-studio`; if local Git CLI / shell / wrapper tools are available, classify as `antigravity`; if cues conflict, stop and ask once upfront.
3. Enforce two-platform routing: Phase A runs exclusively in `ai-studio`; Phase B runs exclusively in `antigravity` after verifying Phase A completion and freshness.
4. Preserve boot/entry stability, existing runtime/CI behavior, pure TypeScript `src/core/` with zero browser DOM coupling, and unencrypted local database invariants.
5. Enforce `ROADMAP.md` boundaries (`For This Version` vs. deferred/out-of-scope); never silence TypeScript errors with `as any`, `@ts-ignore`, or `@ts-expect-error`; never write personal legal names into repo artifacts.
6. **Step-Scoped Atomic Rollback (Never Blanket `git checkout -- .`):** Inspect `git status -s` before each step (in `antigravity`, optionally capture a non-destructive `git stash create` pre-step reference or use `node prompts/preflight/scripts/preflight-rollback.mjs`) and record `touched_files[]`. If `git status -s` shows unrelated uncommitted changes at start, halt with `STEP_BLOCKED` and ask before continuing. On failure, revert ONLY the failed step's files (`git checkout -- <failed-step-files>` and remove only untracked files created by that step), preserving `docs/handoff-state.json`, prior completed steps, and `AGENT_SKIP_LINE` edits.
7. **Token Discipline & Modes:** Scope reads to required files and diff stats; never dump full trees or passing CI logs. In `--dry-run` mode, validate config/platform/freshness and print the planned `SKIP`/`RUN` table without editing any files.
===================
## Target Run Parameters And Config
- **Config File (Optional):** `prompts/preflight/preflight.config.json` | **Schema:** `prompts/preflight/handoff-state.schema.json`
- **Repo & Live URL:** `<repo-url>` | `<live-url>` (`<subpath>`)
- **Branch Flow:** `<dev-branch>` -> `<release-branch>` | **Active Branch:** `<branch-name>` | **Target Version:** `<version-tag>`
- **Companion Docs:** `prompts/preflight/pf-launcher-uni-readme.md`, `prompts/preflight/pf-launcher-uni-wiring.md`
- **Helper Scripts (Anti-Gravity / CLI):** `prompts/preflight/scripts/preflight-run-context.mjs`, `prompts/preflight/scripts/preflight-state.mjs`, `prompts/preflight/scripts/preflight-log.mjs`, `prompts/preflight/scripts/preflight-rollback.mjs`, `prompts/preflight/scripts/preflight-lint.mjs`, `prompts/preflight/scripts/preflight-reset.mjs`
- **Handoff & Audit Log (`docs/handoff-state.json`, Schema v2):** If absent on first run, create `docs/` (if needed) and write:
  `{ "schema_version": 2, "active_branch": "<branch-name>", "target_version": "<version-tag>", "resume_cursor": null, "phase_a_scope_hash": null, "ai_studio_status": "pending", "ai_studio_completed_at": null, "ai_studio_commit_sha": null, "improvement_log_anchor": null, "antigravity_status": "pending", "antigravity_completed_at": null, "history": [], "last_error": null }`
- **All 14 Paired Modules (`prompts/preflight/run-uni/` <-> `prompts/preflight/run-uni/read/*-readme.md`):**
  - *Shared Guardrails:* `guardrails.md`
  - *Phase A (`ai-studio`):* `ai.md`, `a11y.md`, `crawl-setup.md`, `a11y-check.md`, `crawl-guide.md`, `release-check.md` (Part 1), `ver-update.md`
  - *Phase B (`antigravity`):* `backup-setup.md`, `ci-setup.md`, `backup-check.md`, `ci-guide.md`, `release-check.md` (Part 2), `audit.md`, `release-plan.md`
## Cascade-Start Freshness And Resume Check (Run First On Both Platforms)
1. Validate `docs/handoff-state.json` against `prompts/preflight/handoff-state.schema.json` (in `antigravity`, run `node prompts/preflight/scripts/preflight-run-context.mjs --branch <branch-name> --version <version-tag>` as a single-command bootstrapper, falling back to `node prompts/preflight/scripts/preflight-state.mjs` to evaluate Schema v2, UTC freshness, Phase A-scope delta, and `resume_step_id` in one compact JSON call).
2. Skip any line marked `AGENT_SKIP_LINE` without opening its file. For `[REUSABLE]` / `[PER-RELEASE]` steps, if `history[]` already has `status: "completed"` for `<step_id>` + `<branch-name>` + `<version-tag>` + current `HEAD` (and `--force-rerun <step_id>` was not passed), skip it and resume directly at the first uncompleted or previously failed `step_id`. Passing `--force-rerun <step_id>` overrides only the duplicate guard for that `step_id` without resetting `history[]` or bypassing `ALIGNED`/`GUARDED`/stale Hard Stops.
3. Immediately after each step completes cleanly, append `{ "step_id": "<step_id>", "branch": "<branch-name>", "version": "<version-tag>", "head_sha": "<HEAD|sandbox-uncommitted>", "platform": "<ai-studio|antigravity>", "status": "completed", "completed_at": "<YYYY-MM-DDTHH:MM:SSZ>", "touched_files": [] }` to `history[]`, update `resume_cursor`, and set `last_error: null` (in `antigravity`, update `docs/handoff-state.json` atomically via `node prompts/preflight/scripts/preflight-log.mjs --step <step_id> --status completed --files <csv>`).
## Phase A: AI Studio Block (Execute Only In `ai-studio`; `antigravity` Skips This Block)
Set `ai_studio_status: "in_progress"` in `docs/handoff-state.json`.

- [ ] `[FIRST-TIME-SINGLE-USE]` `step_id: seed-handshake` — Seed `docs/handoff-state.json` (if missing), confirm `ALIGNED` + `GUARDED`, and verify `.nojekyll`, `LICENSE` (`AGPL-3.0`), and `THIRD_PARTY_NOTICES.md` -> Rewrite to `[SINGLE-USE-COMPLETED: <YYYY-MM-DD> | step_id: seed-handshake | AGENT_SKIP_LINE: DO NOT READ OR CALL THIS PROMPT FILE]`.

- [ ] `[FIRST-TIME-SINGLE-USE]` `step_id: ai-baseline` — `prompts/preflight/run-uni/ai.md` -> Rewrite to `[SINGLE-USE-COMPLETED: <YYYY-MM-DD> | step_id: ai-baseline | AGENT_SKIP_LINE: DO NOT READ OR CALL THIS PROMPT FILE]`.

- [ ] `[FIRST-TIME-SINGLE-USE]` `step_id: a11y-setup` — `prompts/preflight/run-uni/a11y.md` -> Rewrite to `[SINGLE-USE-COMPLETED: <YYYY-MM-DD> | step_id: a11y-setup | AGENT_SKIP_LINE: DO NOT READ OR CALL THIS PROMPT FILE]`.

- [ ] `[FIRST-TIME-SINGLE-USE]` `step_id: crawl-setup` — `prompts/preflight/run-uni/crawl-setup.md` -> Rewrite to `[SINGLE-USE-COMPLETED: <YYYY-MM-DD> | step_id: crawl-setup | AGENT_SKIP_LINE: DO NOT READ OR CALL THIS PROMPT FILE]`.
- [ ] `[REUSABLE]` `step_id: a11y-check` — `prompts/preflight/run-uni/a11y-check.md` (diff-scoped UI/ARIA check).
- [ ] `[REUSABLE]` `step_id: crawl-guide` — `prompts/preflight/run-uni/crawl-guide.md` (diff-scoped crawl/manifest check).
- [ ] `[REUSABLE]` `step_id: release-check-p1` — `prompts/preflight/run-uni/release-check.md` (read ONLY `<!-- PHASE_A_START -->` through `<!-- PHASE_A_END -->`).
- [ ] `[PER-RELEASE]` `step_id: ver-update` — `prompts/preflight/run-uni/ver-update.md` (SemVer & changelog sync).

**Phase A Exit:** Write `ai_studio_status: "completed"`, `ai_studio_completed_at: "<YYYY-MM-DDTHH:MM:SSZ>"`, `ai_studio_commit_sha: "<HEAD|sandbox-uncommitted>"`, `improvement_log_anchor: { "file": "CHANGELOG.md", "top_heading": "<string>", "line_count": <int> }`, `resume_cursor: { "phase": "B", "next_step_id": "<first-unretired-phase-b-step-id>" }` (dynamically set to the first unretired Phase B step, skipping any line marked `AGENT_SKIP_LINE`), record `phase_a_scope_hash` via `node prompts/preflight/scripts/preflight-state.mjs --write-hash` if shell is available (or `null` in sandboxed AI Studio), and set `last_error: null` in `docs/handoff-state.json`. If `ai_studio_commit_sha` is "sandbox-uncommitted", print the exact list of modified Phase A files and instruct the user to run `node prompts/preflight/scripts/preflight-state.mjs --write-hash` locally after copying files into Git before starting Phase B. Print banner `PHASE_A_COMPLETE` + 3-line summary (Steps Skipped, Steps Executed, Next Action: Proceed to Anti-Gravity for Phase B) and stop.
## Phase B: Anti-Gravity Block (Execute Only In `antigravity`; `ai-studio` Stops Before This Block)



1. **Phase A Gate & Stale Check:** If `ai_studio_commit_sha === "sandbox-uncommitted"` or `phase_a_scope_hash === null`, Anti-Gravity automatically runs `node prompts/preflight/scripts/preflight-state.mjs --write-hash` right after confirming the AI Studio file drop is copied in, then runs `node prompts/preflight/scripts/preflight-run-context.mjs --branch <branch-name> --version <version-tag>` (or inspect `docs/handoff-state.json` directly). Verify `ai_studio_status === "completed"`, UTC elapsed time <= `stale_hours` (24h), zero unverified Phase A-scope path deltas (`src/`, `public/`, `index.html`, `package.json`, `manifest*`), matching `improvement_log_anchor`, and matching branch/version. If `ai_studio_status !== "completed"` or stale, print `STALE_BLOCKED: <reason> | Resume: rerun Phase A in AI Studio first.`, log `last_error`, and stop.

2. Set `antigravity_status: "in_progress"` in `docs/handoff-state.json`.


- [ ] `[FIRST-TIME-SINGLE-USE]` `step_id: scripts-lint-setup` — Verify `prompts/preflight/scripts/*.mjs` exist locally and pass `node prompts/preflight/scripts/preflight-lint.mjs --check-prefix` -> Rewrite to `[SINGLE-USE-COMPLETED: <YYYY-MM-DD> | step_id: scripts-lint-setup | AGENT_SKIP_LINE: DO NOT READ OR CALL THIS PROMPT FILE]`.

- [ ] `[FIRST-TIME-SINGLE-USE]` `step_id: backup-setup` — `prompts/preflight/run-uni/backup-setup.md` -> Rewrite to `[SINGLE-USE-COMPLETED: <YYYY-MM-DD> | step_id: backup-setup | AGENT_SKIP_LINE: DO NOT READ OR CALL THIS PROMPT FILE]`.

- [ ] `[FIRST-TIME-SINGLE-USE]` `step_id: ci-setup` — `prompts/preflight/run-uni/ci-setup.md` -> Rewrite to `[SINGLE-USE-COMPLETED: <YYYY-MM-DD> | step_id: ci-setup | AGENT_SKIP_LINE: DO NOT READ OR CALL THIS PROMPT FILE]`.
- [ ] `[REUSABLE]` `step_id: backup-check` — `prompts/preflight/run-uni/backup-check.md` (pre-merge backup & scope check).
- [ ] `[REUSABLE]` `step_id: ci-guide` — `prompts/preflight/run-uni/ci-guide.md` (CI health & `dist/` smoke gate).
- [ ] `[REUSABLE]` `step_id: release-check-p2` — `prompts/preflight/run-uni/release-check.md` (read ONLY `<!-- PHASE_B_START -->` through `<!-- PHASE_B_END -->`).
- [ ] `[PER-RELEASE]` `step_id: attribution-audit` — `prompts/preflight/run-uni/audit.md` (AGPL-3.0 & `THIRD_PARTY_NOTICES.md` audit).
- [ ] `[PER-RELEASE]` `step_id: release-plan` — `prompts/preflight/run-uni/release-plan.md` (release cut, post-deploy smoke test, human-only sign-off).
**Phase B Exit:** Write `antigravity_status: "completed"`, `antigravity_completed_at: "<YYYY-MM-DDTHH:MM:SSZ>"`, `resume_cursor: null`, and `last_error: null` to `docs/handoff-state.json`. Print banner `COMPLETE` + 3-line summary (Steps Skipped, Steps Executed, Next Action: Human sign-off / merge) and stop.
```

