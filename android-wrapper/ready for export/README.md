# Ready for Export — `AskKim/Pedigree`

Copy these files into your `AskKim/Pedigree` repository at the paths below:

## Phase 1 — TypeScript Bridge & PWA Patches

| Exported File | Target Path in `AskKim/Pedigree` |
| --- | --- |
| `native/pedigreeBridge.ts` | `src/native/pedigreeBridge.ts` |
| `native/pedigreeBridge.test.ts` | `src/native/pedigreeBridge.test.ts` |
| `App.tsx` | `src/App.tsx` |
| `useBarnStore.ts` | `src/hooks/useBarnStore.ts` |
| `storageProtection.ts` | `src/storage/storageProtection.ts` |
| `DiagnosticsAndSupportPanel.tsx` | `src/components/DiagnosticsAndSupportPanel.tsx` |

## Phase 2, 3, 4 & 5 — Lean Kotlin Android Shell, Native Bridges, Vault, Dev Panel & Release Metadata (at repo root)

| Workspace Path | Target Path in `AskKim/Pedigree` |
| --- | --- |
| `android-wrapper/` | `android-wrapper/` |
| `.github/workflows/build-android-apk.yml` | `.github/workflows/build-android-apk.yml` |
| `fastlane/metadata/android/` | `fastlane/metadata/android/` |

`android-wrapper/` includes `MainActivity.kt`, `PedigreeAssetPathHandler.kt`, `BackNavigationBridge.kt`, `FileAndExportBridge.kt`, `PrintBridge.kt`, `ExternalNavigationBridge.kt`, `NativeBackupVault.kt`, `DiagnosticRingBuffer.kt`, `DeveloperPanelDialog.kt`, `FileProvider` configuration, and `res/xml/shortcuts.xml`.
