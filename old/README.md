# `/old/` — Inactive Code & Old Versions

**Status:** `INACTIVE_ARCHIVE` | `EXCLUDED_FROM_RUNTIME` | `AGENT_READ_WRITE_ALLOWED`

## Purpose
This directory stores **inactive code and old versions** retained for reference or archival purposes.

## Rules
1. **Excluded from Runtime:** Excluded from TypeScript compilation (`tsconfig.json`), Vite bundling and dev serving (`vite.config.ts`), and Vitest test discovery (`vitest.config.ts`). Code in `/old/` must never be imported, bundled, served, or executed as part of the live application.
2. **Agent Read/Write Allowed:** Unlike `/import/`, `/old/` is **not** excluded from agent read or write access. Agents may read from, move files into, or edit/clean up `/old/` as instructed.
