## Phase 3 — Native Back, File Picker, Binary Export/Share & Print Bridges (`android-wrapper/` in AI Studio)

### Prior Assumptions Check
- Confirm Phase 1's `pedigreeBridge` message contract and Phase 2's `MainActivity.kt`, `WebViewAssetLoader` origin, `AndroidManifest.xml`, and GitHub Actions APK workflow are in place.
- Confirm Google Calendar OAuth remains deferred from active v1 signing while extension hooks stay clean for the public release.
- Confirm all bridge handlers verify the incoming `WebMessageCompat` origin before acting.

### Implementation Plan
- Implement `BackNavigationBridge.kt`: Register an AndroidX `OnBackPressedCallback`, dispatch `{"type":"NATIVE_BACK","id":"..."}` to the PWA with a 250ms reply timeout, do nothing when `handled: true`, and when `handled: false` or timed out, check `webView.canGoBack()` or use a 2-second double-back-to-exit toast before calling `finish()`.
- Implement `FileAndExportBridge.kt`: Override `WebChromeClient.onShowFileChooser` using `ActivityResultContracts.OpenDocument` for `.zip`, `.json`, `.csv`, `.tsv`, `.htm`, `.html`, `.sqlite`, `.db`, and images, and handle binary `ArrayBuffer` messages (`WebViewFeature.MESSAGE_ARRAY_BUFFER`) off the main thread via SAF (`ACTION_CREATE_DOCUMENT`) or `FileProvider` + `Intent.ACTION_SEND`.
- Implement `PrintBridge.kt`: Handle `REQUEST_PRINT` through Android's `PrintManager` and `webView.createPrintDocumentAdapter("Community Pedigree")` so pedigree certificates, cage cards, and Barn Binders print or save as PDF cleanly.
- Wire External Links, `mailto:` & OAuth Custom Tabs Hook: Route `mailto:` to `Intent.ACTION_SENDTO`, route external `https://` links and future Google Calendar / Firebase OAuth URLs to Android Custom Tabs (`androidx.browser`) with default-browser fallback (and `ActivityNotFoundException` guards), never opening Google OAuth inside the `WebView`.
