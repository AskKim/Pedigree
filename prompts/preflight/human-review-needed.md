# **Human Review Needed: Pre-Flight And Release Audit Guide**

**Last Updated:** November 25, 2026, 10:55 PM CST

**Who This Guide Is For:** Any repository admin or maintainer preparing to test or publish a release—even if this is your first time managing a live web app release. Every check below is something an AI assistant cannot safely do on your behalf and requires a human to verify and approve.

**How To Use This Guide:** Work through each section in order from top to bottom. Every step tells you exactly what to open, what to look for, and how to know it passed before moving on.

# **1\. Pre-Export And Staging Sanity Check (Before Live Testing)**

Before running the launcher on a real server or branch, make sure the exported files copied from Google Drive into your repository are clean plain text.

1. **Check File Formatting:** Open the exported files in `prompts/preflight/` and `prompts/preflight/scripts/`. Make sure none of the `.mjs` script files still have triple-backtick code fences (```` ``` ````) at the top or bottom—each `.mjs` file must start on line 1 with `#!/usr/bin/env node`.  
2. **Check Your Static Config:** Open `prompts/preflight/preflight.config.json` and confirm that `<repo-url>`, `<live-url>`, `<subpath>`, `<dev-branch>`, and `<release-branch>` are filled in with your real repository values rather than placeholders.  
3. **Run The Built-In Linter:** In your terminal (or Anti-Gravity), run `node prompts/preflight/scripts/preflight-lint.mjs --check-prefix`.

*How to know it passed:* The terminal prints `PREFLIGHT_LINT_OK` with zero errors. If it prints `PREFLIGHT_LINT_FAILED`, fix the listed line before continuing.

# **2\. Search Console And Webmaster Verification**

Search engines require the site owner to verify ownership directly in their webmaster dashboard. An AI assistant cannot log into your Google or Bing accounts.

1. **Verify Site Ownership:** Log into Google Search Console (and Bing Webmaster Tools if used) and select your `<live-url>` property. If this is your first release, verify ownership using the HTML meta tag placed in `index.html`.  
2. **Submit Your Sitemap:** In Search Console, open the **Sitemaps** menu, enter your sitemap URL (`<live-url>sitemap.xml`), and click **Submit**.  
3. **Inspect The Live URL:** Paste `<live-url>` into the top **URL Inspection** bar and click **Test Live URL**. Once it confirms the page is reachable with HTTP 200 and no mobile/indexing errors, click **Request Indexing**.

*How to know it passed:* Search Console shows a green checkmark ("URL is available to Google") and your sitemap status reads **Success**.

# **3\. GitHub Account, Repository And Branch Protection Settings**

Repository permissions, branch locks, and public profile links must be reviewed directly in GitHub's web interface.

1. **Check The Repository About Box:** Open your repository's main page on GitHub and click the gear icon next to **About**. Confirm the description is clear, the **Website** field points to `<live-url>`, and relevant topic tags are added.  
2. **Confirm Branch Protections:** Go to **Settings \-\> Branches** in GitHub. Verify that both `<dev-branch>` and `<release-branch>` have protection rules enabled that block accidental force-pushes and branch deletion.  
3. **Prune Temporary Staging Repos Or Branches:** Check your branches list (`git branch -a`) and GitHub account for any old `staging/*`, `experiment/*`, or throwaway test repositories from earlier syncs. Delete any that are past their retention window and no longer needed.  
4. **Check Public Inbound Links:** If you link to the app from your GitHub profile, README, or social pages, click those links to confirm they land directly on `<live-url>` without a 404 error.

*How to know it passed:* Protected branches show a shield/lock icon in GitHub Settings, no stale staging branches remain, and all public links open the live app cleanly.

# **4\. Legal, Licensing And Attribution Sign-Off**

Automated scripts can scan for license headers and generate notice files, but only a human can legally sign off on software licensing and public disclosures.

1. **Verify Root License Files:** Open `LICENSE` in the repository root and confirm it contains the full **AGPL-3.0** license text (and check `CONTRIBUTING.md` if dual **AGPL-3.0 / Apache-2.0** contributor terms are used).  
2. **Review Third-Party Notices:** Open `THIRD_PARTY_NOTICES.md` (and `public/THIRD_PARTY_NOTICES.txt` if present). Confirm that every listed third-party library or snippet uses a compatible license (`MIT`, `BSD`, `ISC`, `Apache-2.0`, `CC0`, `CC-BY-4.0`, or `AGPL-3.0`) and that no incompatible or unattributed proprietary code remains.  
3. **Confirm Source Code Disclosure Links:** Because **AGPL-3.0** requires offering source code to network users, confirm that the app's footer or About screen links cleanly to your public GitHub repository.  
4. **Privacy Check:** Scan `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md`, `docs/handoff-state.json`, and recent commit messages to confirm no personal legal names or local computer folder paths (such as `/Users/...` or `C:\Users\...`) were accidentally included.

*How to know it passed:* Every license is compatible, source links work, and no personal or private machine details appear in tracked files.

# **5\. Physical Device, Offline Storage And Print Verification**

Desktop browser previews cannot catch real touchscreen sizing, mobile offline quirks, or paper/PDF print formatting issues.

1. **Test On A Real Phone Or Tablet:** Open `<live-url>` on an actual mobile device. Tap through the main menus, buttons, and forms to verify buttons are easy to tap without mis-tapping and the screen does not scroll sideways when zoomed in.  
2. **Test Offline Mode (Airplane Mode):** Load the app once while online, then turn on **Airplane Mode** (or disconnect Wi-Fi/cellular) and reload the page. Verify the app still opens cleanly from its offline cache without a browser "No Internet" error screen.  
3. **Test Data Export And Import:** While offline or online, export a backup file from the app, then import it back in. Verify your records round-trip cleanly without data loss, corruption, or unexpected storage permission errors.  
4. **Check Print And PDF Output:** Open a pedigree or main view and use **Print \-\> Save as PDF**. Open the saved PDF and verify that text is readable, navigation clutter is hidden, and nothing is cut off at the page edges.

*How to know it passed:* The app loads in Airplane Mode, backup export/import works cleanly, buttons are comfortable to tap, and the saved PDF looks clean.

# **6\. Android Wrapper Parity Check (If Shipping The Native App)**

If this release includes an Android WebView wrapper build (android-wrapper/), confirm these items before distributing an APK.

1. **Confirm Version Numbers:** Open `android-wrapper/app/build.gradle` (or `build.gradle.kts`) and verify that `versionName` matches the version in `package.json`, `versionCode` is an integer that increased by `1` from the previous release, and `minSdk` is `26` or higher.  
2. **Install And Smoke-Test On A Real Android Device:** Install the built APK on your test phone. Verify local data saves across app restarts, external links and `mailto:` links open outside the app cleanly, and no broken WebView error pages appear.

*How to know it passed:* The APK installs over the previous version without an upgrade conflict, data persists after force-closing the app, and external links work properly.

# **7\. Final Go / No-Go Release Sign-Off**

This is your final human checkpoint before merging to production and publishing the version tag.

1. **Confirm Launcher Banners:** Verify that Phase A printed `PHASE_A_COMPLETE` in AI Studio and Phase B printed `COMPLETE` in Anti-Gravity with zero unresolved `STEP_BLOCKED` or `STALE_BLOCKED` errors.  
2. **Review The Final File Diff Summary:** Run `git diff --stat <release-branch>..<dev-branch>` and skim the list of changed files. Confirm every file belongs in this release and matches the **For This Version** section of `ROADMAP.md` (with zero scratch files, localhost links, or test data dumps).  
3. **Approve Merge And Publish Tag:** Merge `<dev-branch>` into `<release-branch>`, push the `<version-tag>` Git tag, and publish the GitHub Release notes using the entries from `CHANGELOG.md`.  
4. **Run One Final Post-Deploy Smoke Check:** Wait for the GitHub Pages deployment workflow (`deploy-pages.yml`) to turn green, then open `<live-url>` in a fresh private/incognito browser window. Confirm the new version number appears, zero 404 or console errors appear, and offline reload works cleanly.

*How to know it passed:* The live site serves the new version cleanly in an incognito window with zero console errors, and the GitHub Release tag is live.