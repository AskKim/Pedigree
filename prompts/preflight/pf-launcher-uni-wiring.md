// SPDX-FileCopyrightText: 2024-2026 AskKim
// SPDX-License-Identifier: AGPL-3.0-or-later

# Preflight Launcher Wiring Guide

This document maps each step in the **Preflight Launcher** to its source prompt file and indicates whether the step is a one‑time (FIRST‑TIME), reusable (REUSABLE), or per‑release (PER‑RELEASE) execution.

| Step ID | Prompt File | Type |
|---|---|---|
| seed-handshake | `run-uni/seed-handshake.md` | FIRST_TIME |
| ai-baseline | `run-uni/ai.md` | FIRST_TIME |
| a11y-setup | `run-uni/a11y.md` | FIRST_TIME |
| crawl-setup | `run-uni/crawl-setup.md` | FIRST_TIME |
| a11y-check | `run-uni/a11y-check.md` | REUSABLE |
| crawl-guide | `run-uni/crawl-guide.md` | REUSABLE |
| release-check-p1 | `run-uni/release-check.md` (Phase A) | REUSABLE |
| ver-update | `run-uni/ver-update.md` | PER_RELEASE |
| scripts-lint-setup | `run-uni/scripts-lint-setup.md` | FIRST_TIME |
| backup-setup | `run-uni/backup-setup.md` | FIRST_TIME |
| ci-setup | `run-uni/ci-setup.md` | FIRST_TIME |
| backup-check | `run-uni/backup-check.md` | REUSABLE |
| ci-guide | `run-uni/ci-guide.md` | REUSABLE |
| release-check-p2 | `run-uni/release-check.md` (Phase B) | REUSABLE |
| attribution-audit | `run-uni/audit.md` | PER_RELEASE |
| release-plan | `run-uni/release-plan.md` | PER_RELEASE |

> **How to use**: The launcher reads the lines in `pf-launcher-uni.md`. When a `[FIRST‑TIME‑SINGLE‑USE]` step completes, the line is rewritten with an `AGENT_SKIP_LINE` marker so it is not re‑executed. `REUSABLE` and `PER_RELEASE` steps remain active unless the handoff state already records completion for the current branch/version.

---

*Generated from `preflight.manifest.json` – keep this file in sync when the manifest changes.*
