## Phase 5 — Verification, Low-RAM & Android 8+ Testing & Release Prep (AI Studio + GitHub Actions)

### Prior Assumptions Check
- Confirm Phases 1–4 are complete and `android-wrapper` compiles cleanly in GitHub Actions with `minSdk 26` and `targetSdk 36`.
- Confirm the permanent origin (`https://appassets.androidplatform.net`) and backup/export workflows match what breeders expect.
- Confirm release signing key storage is planned before cutting public release artifacts.

### Implementation Plan
- Run Repository & Wrapper Checks: Run `npm run verify:improvements`, `npm test`, `npm run lint`, and `npm run build` on the PWA repo, and verify the GitHub Actions APK workflow builds clean debug and release APKs.
- Test Offline Cold Launch & Renderer Recovery: Verify airplane-mode cold startup from bundled assets, confirm `onRenderProcessGone` recovers without an infinite crash loop, and check non-Chrome/privacy browsers and Android 8+ / low-RAM spare phones (including older WebView `<109` IndexedDB fallback behavior and `useVirtualWindow` / lazy pedigree responsiveness).
- Verify Back, Export, Print & Developer Panel Flows: Test Back presses from modals, sub-routes, and the `'home'` double-back toast; test file import (`onShowFileChooser`), SAF/share binary export, `PrintManager` output, `mailto:` / Custom Tabs routing, and all Developer Panel triggers and actions.
- Lock Release Signing & Prep Public Release / F-Droid Metadata: Store the release signing keystore and credentials safely in GitHub Actions secrets with an offline backup of the `.jks` file, keep `BuildConfig.DEBUG` debug overrides disabled in release builds, and prepare F-Droid / release metadata alongside the plan for adding Google Calendar OAuth in the first public release.
