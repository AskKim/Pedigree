# Beginner Phase 5 Implementation Plan

Welcome to **Phase 5**! Phases 1–4 wrote all the code for the web bridge (`pedigreeBridge.ts`), the Android WebView shell (`android-wrapper/`), file import/export/print, the native backup vault, and the Developer Panel.

**Phase 5 is your pre-launch safety inspection and release setup.** No major new features are written here—instead, you verify everything works on real phones, set up your Android signing key so phones can install your Release APK, and prepare store/F-Droid listing metadata.

---

## Step 1: Run the Automated Checks First

Before touching a phone or GitHub Actions, run the quick automated checks in your repository root:

```bash
# In the main AskKim/Pedigree repository:
npm run verify:improvements
npm test
npm run lint
npm run build
```

*(Note: In this standalone wrapper workspace, `npm test`, `npm run lint`, and `npm run build` are the active scripts; `npm run verify:improvements` runs inside your main `AskKim/Pedigree` repo.)*

**What "passing" looks like:**
- All unit tests pass with 0 failures (`pedigreeBridge.test.ts` tests browser fallbacks, Android binary streaming, back stack priority, and origin checks).
- `npm run lint` (`tsc --noEmit`) finishes with 0 TypeScript errors.
- `npm run build` produces a fresh `dist/` folder without errors.

---

## Step 2: Build Debug & Release APKs with GitHub Actions

You do **not** need to install Android Studio locally to build the Android app. The workflow file `.github/workflows/build-android-apk.yml` handles it automatically:

1. Push your changes to `main` (or open a pull request to `main`).
2. On GitHub, open the **Actions** tab and click **Build Android APK** (you can also click **Run workflow** manually).
3. Wait for the job **Build PWA dist & Android Debug/Release APKs** to turn green.
4. Scroll to the bottom of the workflow run under **Artifacts** and download:
   - `community-pedigree-debug-apk` — for testing on your own phone (`org.askkim.pedigree.wrapper.debug`).
   - `community-pedigree-release-apk` — the minified production build (`org.askkim.pedigree.wrapper`).

> **Why are there two APKs?**
> - **Debug APK** (`BuildConfig.DEBUG = true`) includes the Debug Target URL switcher in the Developer Panel and can be installed right away for testing.
> - **Release APK** (`BuildConfig.DEBUG = false`) shrinks the code with R8, strips debug-only URL overrides, and must be signed with your release keystore (Step 4) before Android will install it.

---

## Step 3: Real-Phone Testing Checklist (Android 8+ & Low-RAM Devices)

Install the Debug APK on a test phone (ideally including an older Android 8–10 spare phone with 2–3 GB RAM if you have one) and check off every item below:

### A. Offline Cold Launch & Low-RAM Recovery
- [ ] **Airplane Mode Launch**: Turn on Airplane Mode, force-stop the app in Android Settings, then open it again. It should boot cleanly from bundled `assets/www/` at `https://appassets.androidplatform.net/index.html`.
- [ ] **Older WebView `<109` Check**: Open the Developer Panel (see Part C) and check the `WebView:` line. If the major version is below `109`, confirm the amber notice explains that OPFS is unavailable and IndexedDB/SQLite fallback is active.
- [ ] **Smooth Scrolling on Large Herds**: Open a large herd list / pedigree tree to confirm virtualized rendering stays responsive without freezing or crashing.
- [ ] **Non-Chrome / Privacy Browser Sanity Check**: Open the web app in Firefox or DuckDuckGo on Android to confirm standard browser fallbacks (`window.print()`, Blob download, Web Share) work cleanly when not wrapped.

### B. Back Button, Import, Export, Print & External Links
- [ ] **Back from Modals**: Open a dialog/modal and press Android Back -> the modal closes (app stays open).
- [ ] **Back from Sub-Routes**: Navigate into a sub-screen and press Back -> steps back toward the `home` screen.
- [ ] **Double-Back to Exit at Home**: On `home` with no modals open, press Back once -> `"Press Back again to exit"` toast appears. Press Back again within 2 seconds -> app closes.
- [ ] **File Import**: Trigger a backup/photo import (`<input type="file">`) -> Android's system file picker opens (`OpenDocument`) and lets you select `.zip`, `.json`, `.csv`, `.tsv`, `.html`, `.sqlite`, `.db`, or images.
- [ ] **Save Backup (SAF)**: Export a backup in `save` mode -> Android asks where to save the file and shows `"Saved <filename>"`.
- [ ] **Share Backup**: Export in `share` mode -> Android's Share Sheet opens cleanly via `FileProvider`.
- [ ] **Print / Save as PDF**: Trigger Print -> Android's Print preview opens (`Community Pedigree`), letting you pick a printer or **Save as PDF**.
- [ ] **External Links & Email**: Tap a `mailto:` link -> opens your email app. Tap an `https://` link -> opens in Chrome Custom Tabs / external browser, **never** inside the app's WebView.

### C. Developer Panel & Native Backup Vault
Test all **3 ways** to open the Developer & Diagnostics Panel:
1. **Header Icon Hold**: Press and hold the header app icon for **800ms** (without dragging your finger >10px).
2. **5-Tap Corner**: Tap **5 times within 2.5 seconds** in the top-right corner of the screen.
3. **App Icon Shortcut**: Long-press the Community Pedigree icon on your Android home screen and tap **Diagnostics** (`Open Diagnostics & Vault`).

Inside the panel, verify:
- [ ] **Storage Truth Card** shows honest values for `navigator.storage.persisted()`, JS storage estimate, read-only `app_webview` size, and `filesDir/pedigree-vault/` snapshot count + last backup timestamp.
- [ ] **Copy Diagnostic JSON** copies compact JSON to the clipboard and contains **zero** herd records or personal data.
- [ ] **Reload App** reloads the WebView cleanly.
- [ ] **Soft Cache Reset (`?emergency_reset=true`)** clears HTTP cache and reloads while **keeping all saved barn data intact**.
- [ ] **Release Build Security Check**: When testing the signed Release APK, open the Developer Panel via the 5-tap corner or launcher shortcut and confirm the **Debug Target URL** box is completely gone.

---

## Step 4: Create & Lock Down Your Release Signing Key

Android requires every public Release APK to be digitally signed with a private keystore (`.jks`). **If you lose this keystore, you can never publish an update to the same app ID—keep a safe offline backup!**

### 1. Generate the Keystore (Run Once on Your Computer)
Make sure Java (`keytool`) is installed, then run:

```bash
keytool -genkeypair -v \
  -keystore pedigree-release.jks \
  -alias pedigree-release \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

It will ask you for:
- A **keystore password** (save this!)
- Your name / organization (e.g., `Community Pedigree`)
- A **key password** (you can press Enter to reuse the keystore password, or set one and save it)

> **STOP AND BACK IT UP NOW:** Copy `pedigree-release.jks` and both passwords to an offline backup (encrypted USB drive or password manager). **Never commit `.jks` files to GitHub.**

### 2. Convert the Keystore to Base64
GitHub Secrets only store text, so convert `pedigree-release.jks` to a single-line base64 string:

- **Linux / WSL:**
  ```bash
  base64 -w 0 pedigree-release.jks
  ```
- **macOS:**
  ```bash
  base64 -i pedigree-release.jks | tr -d '\n'
  ```

### 3. Add the 4 Secrets to GitHub
In your GitHub repository, go to **Settings → Secrets and variables → Actions → New repository secret** and add these exact 4 names:

| Secret Name | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | The single-line base64 output from above |
| `ANDROID_KEYSTORE_PASSWORD` | Your keystore password |
| `ANDROID_KEY_ALIAS` | `pedigree-release` (or the alias you chose) |
| `ANDROID_KEY_PASSWORD` | Your key password |

The next time **Build Android APK** runs in GitHub Actions, it will automatically decode the keystore, sign `community-pedigree-release-apk`, and delete the temporary `.jks` file when finished.

---

## Step 5: F-Droid / Public Release Metadata & Next Release (Google Calendar OAuth)

Your project is already structured for F-Droid and open-source release distribution:
- **License**: `AGPL-3.0-or-later` (`LICENSE` and `android-wrapper/LICENSE`).
- **No Proprietary Blobs**: `android-wrapper/app/build.gradle.kts` sets `dependenciesInfo { includeInApk = false; includeInBundle = false }`.
- **Store / F-Droid Listing Metadata**: Ready-to-edit Fastlane metadata lives in `fastlane/metadata/android/en-US/` (`title.txt`, `short_description.txt`, `full_description.txt`, `changelogs/1.txt`).
- **Google Calendar OAuth (First Public Release Plan)**: `ExternalNavigationBridge.kt` already routes OAuth URLs to Android Custom Tabs (with share disabled) and includes `onOAuthRedirectIntent(intent)` in `MainActivity.onNewIntent` as the clean extension hook when you enable Google Calendar OAuth after v1.
