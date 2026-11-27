# pf-launcher-uni.md Readme

**Last Updated:** November 25, 2026, 10:42 PM CST

## What This File Is

`prompts/preflight/pf-launcher-uni.md` is a pure token-lean executable modular two-platform release and setup launcher (**Phase A: AI Studio \-\> Phase B: Anti-Gravity**) paired with its wiring architecture doc (`prompts/preflight/pf-launcher-uni-wiring.md`). It is backed by `prompts/preflight/preflight.config.json` (static repo parameters), `prompts/preflight/handoff-state.schema.json` (Schema v2), `prompts/preflight/templates/pf-launcher-uni-clean.md` (pristine copy-ready template), and 6 zero-dependency Node.js helper scripts under `prompts/preflight/scripts/` (`preflight-run-context.mjs`, `preflight-state.mjs`, `preflight-log.mjs`, `preflight-rollback.mjs`, `preflight-lint.mjs`, `preflight-reset.mjs`). It defines standard Exit Banners (`ALIGNED | GUARDED | PHASE_A_COMPLETE | STALE_BLOCKED | STEP_BLOCKED | COMPLETE`) and supports Execution Flags (`--dry-run | --force-rerun <step_id>`). It features two distinct file-edit setups: permanent `AGENT_SKIP_LINE` retirement of completed single-use prompts in the launcher (never applied to reusable prompts), plus per-step state and timestamp logging in `docs/handoff-state.json` supporting cascade-start freshness checks and resume-on-restart behavior. All 14 prompt and guide launcher-called files sit in `prompts/preflight/run-uni/`, while their 14 matching `*-readme.md` mates sit in `prompts/preflight/run-uni/read/`.

## How to Use It

1. Copy `prompts/preflight/templates/pf-launcher-uni-clean.md` into `prompts/preflight/pf-launcher-uni.md` in a target repository and optionally populate static configuration parameters in `prompts/preflight/preflight.config.json` (or fill inline parameters: `<repo-url>`, `<live-url>`, `<subpath>`, `<dev-branch>`, `<release-branch>`, `<branch-name>`, and `<version-tag>`). Uses `--dry-run` and `--force-rerun <step_id>` flags when needed.  
2. Ensure `prompts/master_system_prompt.md` (`aligned`) and `prompts/preflight/run-uni/guardrails.md` (`guarded`) are in place to allow the pre-payload handshake to run.  
3. Hand the launcher to **AI Studio** first to execute Phase A; AI Studio auto-seeds `docs/handoff-state.json`, retires completed single-use steps, logs each step, marks Phase A complete with a timestamp, and prints a notice to move to Anti-Gravity. If AI Studio ran in a sandbox without Git CLI (logging "sandbox-uncommitted"), copy the modified files into your local repo so Anti-Gravity can perform the automatic hash handoff and step retirement.  
4. Hand the launcher to **Anti-Gravity** to execute Phase B; Anti-Gravity skips Phase A, verifies Phase A is complete and not stale (by timestamp, commit delta, or version change), automatically runs `node prompts/preflight/scripts/preflight-state.mjs --write-hash` and retires `scripts-lint-setup` via `AGENT_SKIP_LINE` on the first Phase B run if "sandbox-uncommitted" was logged, and runs Phase B—automatically resuming at any previously failed or incomplete step if prior work is still fresh.

## Resetting The Launcher

**Full Reset (Copying To A Different Website Or Repository):**

1. **1-Command Helper:** Run `node prompts/preflight/scripts/preflight-reset.mjs --full` (or with `--init`, `--clear-error`, or `--rearm <step_id>`) to perform a full reset from the pristine template.  
2. **Manual Fallback:** Start from the pristine template in `prompts/preflight/templates/pf-launcher-uni-clean.md`; if copying from an already-used repo copy, revert every `[SINGLE-USE-COMPLETED: ... | AGENT_SKIP_LINE: ...]` line back to its original prompt call.  
3. Replace `<repo-url>`, `<live-url>`, `<subpath>`, `<dev-branch>`, `<release-branch>`, `<branch-name>`, and `<version-tag>` with the new site's values (or update `prompts/preflight/preflight.config.json`).  
4. Delete or omit any prior `docs/handoff-state.json` so the first Phase A (AI Studio) run auto-seeds a clean state log.

**Branch-Local Reset (Copying Or Working Inside An Editable Branch):**

1. **1-Command Helper:** Run `node prompts/preflight/scripts/preflight-reset.mjs --branch <branch-name> --version <version-tag>` to reset active fields while preserving `history[]` and retired `AGENT_SKIP_LINE` markers.  
2. **Manual Fallback:** Keep existing `AGENT_SKIP_LINE` markers intact in `prompts/preflight/pf-launcher-uni.md` unless a specific one-time setup must be re-run on that branch (in which case revert only that line). Commit your branch edits first so `HEAD` advances cleanly, then reset only the active checkpoint fields in `docs/handoff-state.json` (`active_branch`, `target_version`, `ai_studio_status: "pending"`, `ai_studio_completed_at: null`, `ai_studio_commit_sha: null`, `improvement_log_anchor: null`, `antigravity_status: "pending"`, `antigravity_completed_at: null`, `last_error: null`) while preserving `history[]`.

## Related Files

- `prompts/preflight/pf-launcher-uni.md`  
- `prompts/preflight/pf-launcher-uni-wiring.md`  
- `prompts/preflight/templates/pf-launcher-uni-clean.md`  
- `prompts/preflight/preflight.config.json`  
- `prompts/preflight/handoff-state.schema.json`  
- `prompts/preflight/scripts/` (`preflight-run-context.mjs`, `preflight-state.mjs`, `preflight-log.mjs`, `preflight-rollback.mjs`, `preflight-lint.mjs`, `preflight-reset.mjs`)  
- `prompts/preflight/run-uni/` and `prompts/preflight/run-uni/read/` (14 paired modules executing Phase A and Phase B operations)