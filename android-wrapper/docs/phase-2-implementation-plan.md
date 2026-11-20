## Phase 2 — Lean Kotlin WebView Shell & Automated APK Build (`android-wrapper/` in AI Studio)

### Prior Assumptions Check
- Confirm Phase 1 (`src/native/pedigreeBridge.ts`, header icon long-press, history/modal unwinding, install-banner suppression, and honest storage status) is merged or ready in `AskKim/Pedigree`.
- Confirm `vite.config.ts` hardcodes `basePath = '/'` while `.github/workflows/deploy-pages.yml` passes `--base=...` on the CLI for GitHub Pages.
- Confirm the target baseline: native Kotlin shell (no Capacitor), `minSdk 26` (Android 8.0), `targetSdk 36` (Android 16), AGPLv3 license, and dependencies limited strictly to `androidx.appcompat`, `androidx.webkit` (such as `1.18.0` or `1.19.0-alpha02`), `androidx.browser`, and Kotlin stdlib.

### Implementation Plan
- Scaffold `android-wrapper/` Project Files: Generate `settings.gradle.kts`, `build.gradle.kts`, `app/build.gradle.kts`, `app/proguard-rules.pro`, `app/src/main/AndroidManifest.xml` (including Android 11+ `<queries>` entries for browsers/Custom Tabs and `mailto:`), and `LICENSE` (GNU AGPLv3).
- Disable Proprietary Blobs & Keep Builds Reproducible: Configure `dependenciesInfo { includeInApk = false; includeInBundle = false }` in `app/build.gradle.kts`, avoid fragile baseline-profile plugins, and pin Gradle/AGP versions cleanly.
- Serve Bundled `dist/` via `WebViewAssetLoader`: Mount `https://appassets.androidplatform.net/` using `WebViewAssetLoader` with a custom asset handler that serves `.wasm` as `application/wasm` and `.js`/`.mjs` as `application/javascript`, while allowing a `BuildConfig.DEBUG`-only override to `https://askkim.github.io/Pedigree/` (rejecting any non-HTTPS URL).
- Enforce OWASP WebView Hardening & Lifecycle Safety: Disable file/content access (`allowFileAccess = false`, `allowContentAccess = false`), disallow mixed content (`MIXED_CONTENT_NEVER_ALLOW`), tie `WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)` to debug builds only, lock `WebViewCompat.addWebMessageListener` to the exact app origin, wire `ServiceWorkerControllerCompat` through `WebViewAssetLoader`, call `webView.onPause()` / `onResume()` without calling `webView.pauseTimers()`, and handle `onRenderProcessGone()`.
- Create `.github/workflows/build-android-apk.yml`: Build `dist/` from the PWA codebase in GitHub Actions (`npm ci && npm run build`), copy `dist/` into `android-wrapper/app/src/main/assets/www/`, run `./gradlew assembleDebug assembleRelease` with `gradle/actions/setup-gradle`, and upload APK artifacts (signing release builds when keystore secrets are present).
