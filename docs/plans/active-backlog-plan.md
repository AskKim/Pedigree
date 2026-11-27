# Implementation Plan: Settings Page UI/UX Modernization & Logical Subunits

**Target:** Improve Settings page UI/UX by condensing related items into shared subunits, arranging subunits in logical order, adding title text, and providing links to Prompts, About, Developer, and Help pages.

## Objectives
1. **Title Text & Quick Jump Bar**:
   - Add a structured, clear header with page title "Barn Settings & Preferences", subtitle, live badges (v0.1.0-alpha.3, 100% Offline-First, Active Barn), and quick-action links to Prompts, About, Developer ("The Techy Stuff"), and Help & Species Guides.
2. **About Community Pedigree Experience**:
   - Create `src/components/AboutModal.tsx` accessible modal showing Community Pedigree details, offline-first philosophy, AGPL-3.0 license, system specs, and direct buttons to docs, prompts, and developer console.
3. **Condense Logically Related Items into Shared Subunits in Logical Order**:
   - **Subunit 1: Farm & Breeder Identity** (Barn/Farm name, Breeder name, printed pedigree logo uploader/preview, contact & address info with 100% Local Privacy notice).
   - **Subunit 2: Species & Workspace Setup** (Default species, custom livestock editor modal trigger, pinned startup landing page, summary strip toggle, Judge's Notebook toggle).
   - **Subunit 3: Measurement Units, Currency & Pedigree Standards** (Default weight display unit, report currency, default pedigree depth 3–6 Gen, print photo option).
   - **Subunit 4: Appearance & Color Studio** (Theme mode switcher, warm palette presets, fine-grained custom color pickers with reset default).
   - **Subunit 5: Calendar Integration & Task Alarms** (Destination mode, Google Calendar connection/target, task dispatch toggles, due time, multi-alarm lead times, task naming with real-time app/calendar preview, export open dated tasks).
   - **Subunit 6: Device Storage, Image Compression & Memory** (Storage quota meter with locked/standard indicator, image compression preset selector with size hints & savings, OPFS /archives auto-offload, device capability controller integration).
   - **Subunit 7: Backup, Multi-Device Sync & Installation** (Import/Export Hub launcher, multi-device sync preview, health wikis/vet PDF folder launcher, smart install card for PWA / APK).
   - **Subunit 8: Developer, Help & System Resources** (Cards linking to Help Docs, Developer Console, Prompts Directory, About Dialog, and collapsible keyboard shortcuts guide).
4. **Wiring & Navigation**:
   - In `src/App.tsx`, wire `onOpenPromptsDirectory={() => setRoute('prompts')}` to `SettingsAndSyncScreen`.
   - Ensure PromptsDirectory back button returns to the calling screen (`settings` or `techyStuff`).
5. **Verification & Invariant Drift**:
   - Register `IMP-074` in `src/domain/improvementRegistry.ts` and `IMPROVEMENTS.md`.
   - Verify with `npm run verify:improvements`, `npm run lint`, and `npm test`.
