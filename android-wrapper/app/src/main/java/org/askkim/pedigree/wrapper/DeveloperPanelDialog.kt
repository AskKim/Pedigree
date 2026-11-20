/*
 * Community Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewCompat
import org.json.JSONObject
import java.util.Locale

/**
 * Lazy, leak-free native Developer & Diagnostics Panel rendered as an AndroidX [AlertDialog]
 * with a programmatic [ScrollView].
 *
 * Design highlights:
 * - **Zero extra dependencies**: built purely with standard Android views (`ScrollView`, `LinearLayout`,
 *   `TextView`, `Button`) so no Material/Compose bloat is added to the APK.
 * - **Leak-free lifecycle**: holds no static Activity reference and is explicitly dismissed in
 *   `MainActivity.onDestroy()`.
 * - **Zero PII**: shows runtime versions, honest `navigator.storage` probe results, read-only
 *   `app_webview` / `pedigree-vault` byte counts, and sanitized [DiagnosticRingBuffer] events—never
 *   animal records or personal data.
 * - **Release security**: the Debug Target URL switcher is gated on `BuildConfig.DEBUG` so R8
 *   strips it completely from release APKs.
 */
class DeveloperPanelDialog(
    private val activity: AppCompatActivity,
    private val diagnosticBuffer: DiagnosticRingBuffer,
    private val nativeBackupVault: NativeBackupVault,
    private val webViewProvider: () -> WebView?,
    private val activeOriginProvider: () -> String,
    private val activeStartUrlProvider: () -> String,
    private val onReloadApp: () -> Unit,
    private val onSoftCacheReset: () -> Unit,
    private val onDebugTargetUrlChanged: (String?) -> Unit
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var activeDialog: AlertDialog? = null
    private var lastTriggerSource: String = "unknown"

    private var cachedPersisted: Boolean? = null
    private var cachedQuotaUsageBytes: Long? = null
    private var cachedQuotaTotalBytes: Long? = null

    /**
     * Inflates and shows the diagnostics dialog on demand, triggering async JS storage quota
     * and native disk-size probes without blocking the UI thread.
     */
    fun show(triggerSource: String) {
        if (activity.isFinishing || activity.isDestroyed) return
        if (activeDialog?.isShowing == true) return

        lastTriggerSource = triggerSource
        cachedPersisted = null
        cachedQuotaUsageBytes = null
        cachedQuotaTotalBytes = null
        diagnosticBuffer.record(
            DiagnosticRingBuffer.LEVEL_INFO,
            "DEV_PANEL_OPEN",
            "Opened Developer Panel ($triggerSource)"
        )

        val pkgInfo = WebViewCompat.getCurrentWebViewPackage(activity)
        val webViewPkg = pkgInfo?.packageName ?: "unknown"
        val webViewVer = pkgInfo?.versionName ?: "unknown"
        val webViewMajor = webViewVer.substringBefore('.').trim().toIntOrNull()
        val activeOrigin = activeOriginProvider()
        val activeUrlSanitized = DiagnosticRingBuffer.sanitizeUrl(webViewProvider()?.url ?: activeStartUrlProvider())

        val scrollView = ScrollView(activity).apply {
            isFillViewport = true
        }
        val container = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            val pad = dp(16)
            setPadding(pad, pad, pad, pad)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }
        scrollView.addView(container)

        // 1. WebView Runtime Info
        container.addView(buildSectionHeader("WebView & Container Runtime"))
        val runtimeText = buildString {
            appendLine("Build: ${BuildConfig.VERSION_NAME} (${if (BuildConfig.DEBUG) "DEBUG" else "RELEASE"})")
            appendLine("Android: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
            appendLine("WebView: $webViewPkg $webViewVer")
            appendLine("Origin: $activeOrigin")
            if (activeUrlSanitized.isNotEmpty()) {
                appendLine("URL: $activeUrlSanitized")
            }
            append("Trigger: $triggerSource")
        }
        container.addView(buildMonospaceBox(runtimeText))

        if (webViewMajor != null && webViewMajor < 109) {
            val opfsWarn = TextView(activity).apply {
                text = "Notice: WebView <109 detected ($webViewMajor). OPFS is unavailable; IndexedDB/SQLite fallback active."
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                setTextColor(0xFFD97706.toInt())
                setPadding(0, dp(6), 0, dp(4))
            }
            container.addView(opfsWarn)
        }

        // 2. Storage Truth Card
        container.addView(buildSectionHeader("Storage Truth Card"))
        val initialVault = nativeBackupVault.getVaultInfo()
        val initialAppWebView = nativeBackupVault.getAppWebViewBytes()
        val storageTruthView = buildMonospaceBox(
            formatStorageTruthText(
                persistedText = "Querying...",
                quotaText = "Querying...",
                appWebViewBytes = initialAppWebView,
                vaultState = initialVault
            )
        )
        container.addView(storageTruthView)

        // Query JS navigator.storage.persisted() & estimate() with short timeout + read-only disk stats
        var jsPersistedLabel = "Unavailable"
        var jsQuotaLabel = "Unavailable"
        var latestAppWebViewBytes = initialAppWebView
        var latestVaultState = initialVault

        fun refreshStorageCardText() {
            if (activeDialog?.isShowing != true || activity.isFinishing || activity.isDestroyed) return
            storageTruthView.text = formatStorageTruthText(
                persistedText = jsPersistedLabel,
                quotaText = jsQuotaLabel,
                appWebViewBytes = latestAppWebViewBytes,
                vaultState = latestVaultState
            )
        }

        probeWebViewStorageQuota(activeOrigin) { persisted, usage, quota, statusNote ->
            cachedPersisted = persisted
            cachedQuotaUsageBytes = usage
            cachedQuotaTotalBytes = quota
            jsPersistedLabel = persisted?.toString() ?: statusNote
            jsQuotaLabel = if (usage != null && quota != null && quota > 0L) {
                "${formatBytes(usage)} / ${formatBytes(quota)}"
            } else if (usage != null) {
                formatBytes(usage)
            } else {
                statusNote
            }
            refreshStorageCardText()
        }

        nativeBackupVault.refreshStorageMetricsAsync { updatedVault, updatedAppWebViewBytes ->
            mainHandler.post {
                latestVaultState = updatedVault
                latestAppWebViewBytes = updatedAppWebViewBytes
                refreshStorageCardText()
            }
        }

        // 3. Recovery & Diagnostic Actions
        container.addView(buildSectionHeader("Actions"))

        val copyJsonBtn = buildActionButton("Copy Diagnostic JSON") {
            val compactJson = buildCompactDiagnosticJson(
                webViewPkg = webViewPkg,
                webViewVer = webViewVer,
                webViewMajor = webViewMajor,
                activeOrigin = activeOrigin,
                vaultState = latestVaultState,
                appWebViewBytes = latestAppWebViewBytes
            )
            val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            if (clipboard != null) {
                clipboard.setPrimaryClip(ClipData.newPlainText("Pedigree Diagnostics", compactJson))
                Toast.makeText(activity, R.string.dev_panel_copied, Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(activity, R.string.dev_panel_copy_failed, Toast.LENGTH_SHORT).show()
            }
        }
        container.addView(copyJsonBtn)

        val reloadBtn = buildActionButton("Reload App") {
            dismiss()
            onReloadApp()
        }
        container.addView(reloadBtn)

        val softResetBtn = buildActionButton("Soft Cache Reset (?emergency_reset=true)") {
            dismiss()
            onSoftCacheReset()
        }
        container.addView(softResetBtn)

        // 4. BuildConfig.DEBUG-only HTTPS URL Switcher (stripped by R8 in release builds)
        if (BuildConfig.DEBUG) {
            container.addView(buildSectionHeader("Debug Target URL (DEBUG Only)"))
            val urlInput = EditText(activity).apply {
                setText(activeStartUrlProvider())
                setSingleLine(true)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                typeface = Typeface.MONOSPACE
                hint = "https://askkim.github.io/..."
            }
            container.addView(urlInput)

            val switchRow = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
            }
            val useBundledBtn = Button(activity).apply {
                text = "Bundled Assets"
                isAllCaps = false
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                setOnClickListener {
                    dismiss()
                    onDebugTargetUrlChanged(null)
                }
            }
            val loadDebugUrlBtn = Button(activity).apply {
                text = "Load HTTPS URL"
                isAllCaps = false
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                setOnClickListener {
                    val candidate = urlInput.text?.toString()?.trim().orEmpty()
                    if (!isAllowedDebugHttpsUrl(candidate)) {
                        Toast.makeText(activity, R.string.dev_panel_debug_url_invalid, Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    dismiss()
                    onDebugTargetUrlChanged(candidate)
                }
            }
            switchRow.addView(useBundledBtn)
            switchRow.addView(loadDebugUrlBtn)
            container.addView(switchRow)
        }

        // 5. 100-Event Ring Buffer Log
        val events = diagnosticBuffer.snapshot()
        container.addView(buildSectionHeader("Recent Events (${events.size}/${DiagnosticRingBuffer.CAPACITY})"))
        val eventsText = if (events.isEmpty()) {
            "No native events recorded yet."
        } else {
            val sb = StringBuilder(events.size * 64)
            for (i in events.indices.reversed()) {
                val ev = events[i]
                val t = DiagnosticRingBuffer.formatLocalTimeShort(ev.timestampMs)
                val lvl = ev.level.firstOrNull()?.uppercaseChar() ?: 'I'
                sb.append('[').append(t).append("] ").append(lvl).append(' ')
                    .append(ev.code)
                if (ev.repeatCount > 1) {
                    sb.append(" (x").append(ev.repeatCount).append(')')
                }
                sb.append(": ").append(ev.message)
                if (i > 0) sb.append('\n')
            }
            sb.toString()
        }
        container.addView(buildMonospaceBox(eventsText))

        val dialog = AlertDialog.Builder(activity)
            .setTitle(R.string.dev_panel_title)
            .setView(scrollView)
            .setPositiveButton(android.R.string.ok, null)
            .create()

        dialog.setOnDismissListener {
            mainHandler.removeCallbacksAndMessages(null)
            if (activeDialog === dialog) {
                activeDialog = null
            }
        }

        activeDialog = dialog
        dialog.show()
    }

    /** Dismisses the dialog and cancels any pending storage-probe polling callbacks. */
    fun dismiss() {
        mainHandler.removeCallbacksAndMessages(null)
        val dlg = activeDialog
        activeDialog = null
        if (dlg != null && dlg.isShowing) {
            try {
                dlg.dismiss()
            } catch (_: Exception) {
                // Activity window already detached
            }
        }
    }

    /**
     * Evaluates `navigator.storage.persisted()` and `navigator.storage.estimate()` inside the
     * active WebView (only when its origin matches [activeOrigin]) using a 500ms timeout ceiling.
     */
    private fun probeWebViewStorageQuota(
        activeOrigin: String,
        onResult: (persisted: Boolean?, usage: Long?, quota: Long?, statusNote: String) -> Unit
    ) {
        val wv = webViewProvider()
        if (wv == null) {
            onResult(null, null, null, "WebView unmounted")
            return
        }

        val currentOrigin = extractOrigin(wv.url)
        if (currentOrigin == null || currentOrigin != activeOrigin) {
            onResult(null, null, null, "Origin mismatch")
            return
        }

        var settled = false
        val timeoutRunnable = Runnable {
            if (!settled) {
                settled = true
                onResult(null, null, null, "Timed out (${STORAGE_PROBE_TIMEOUT_MS}ms)")
            }
        }
        mainHandler.postDelayed(timeoutRunnable, STORAGE_PROBE_TIMEOUT_MS)

        val triggerScript = """
            (function(){
              try {
                if (!navigator || !navigator.storage) {
                  return JSON.stringify({supported:false});
                }
                window.__pedigreeDevStorageProbe = null;
                Promise.all([
                  navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(null),
                  navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null)
                ]).then(function(res){
                  window.__pedigreeDevStorageProbe = JSON.stringify({
                    supported: true,
                    persisted: res[0],
                    usage: res[1] && typeof res[1].usage === 'number' ? res[1].usage : null,
                    quota: res[1] && typeof res[1].quota === 'number' ? res[1].quota : null
                  });
                }).catch(function(){
                  window.__pedigreeDevStorageProbe = JSON.stringify({supported:false});
                });
                return "PENDING";
              } catch (e) {
                return JSON.stringify({supported:false});
              }
            })();
        """.trimIndent()

        fun pollResult(attempt: Int) {
            if (settled || activeDialog?.isShowing != true) return
            val activeWv = webViewProvider() ?: run {
                settled = true
                mainHandler.removeCallbacks(timeoutRunnable)
                onResult(null, null, null, "WebView unmounted")
                return
            }
            activeWv.evaluateJavascript(
                "(function(){var r=window.__pedigreeDevStorageProbe; if(r){try{delete window.__pedigreeDevStorageProbe;}catch(e){}} return r;})();"
            ) { raw ->
                if (settled || activeDialog?.isShowing != true) return@evaluateJavascript
                val parsedJson = decodeJsStringResult(raw)
                if (parsedJson != null) {
                    settled = true
                    mainHandler.removeCallbacks(timeoutRunnable)
                    applyStorageProbeJson(parsedJson, onResult)
                } else if (attempt < 3) {
                    mainHandler.postDelayed({ pollResult(attempt + 1) }, 120L)
                }
            }
        }

        try {
            wv.evaluateJavascript(triggerScript) { raw ->
                if (settled || activeDialog?.isShowing != true) return@evaluateJavascript
                val value = decodeJsStringResult(raw)
                if (value == null || value == "PENDING") {
                    mainHandler.postDelayed({ pollResult(1) }, 100L)
                } else {
                    settled = true
                    mainHandler.removeCallbacks(timeoutRunnable)
                    applyStorageProbeJson(value, onResult)
                }
            }
        } catch (_: Exception) {
            if (!settled) {
                settled = true
                mainHandler.removeCallbacks(timeoutRunnable)
                onResult(null, null, null, "Probe failed")
            }
        }
    }

    private fun applyStorageProbeJson(
        jsonString: String,
        onResult: (persisted: Boolean?, usage: Long?, quota: Long?, statusNote: String) -> Unit
    ) {
        try {
            val obj = JSONObject(jsonString)
            if (!obj.optBoolean("supported", false)) {
                onResult(null, null, null, "navigator.storage unsupported")
                return
            }
            val persisted = if (obj.isNull("persisted")) null else obj.optBoolean("persisted")
            val usage = if (obj.isNull("usage")) null else obj.optLong("usage")
            val quota = if (obj.isNull("quota")) null else obj.optLong("quota")
            onResult(persisted, usage, quota, "OK")
        } catch (_: Exception) {
            onResult(null, null, null, "Parse error")
        }
    }

    /**
     * Builds a compact diagnostic JSON payload omitting null/empty fields and excluding all user
     * records or PII, ready to copy to clipboard for support or AI triage.
     */
    private fun buildCompactDiagnosticJson(
        webViewPkg: String,
        webViewVer: String,
        webViewMajor: Int?,
        activeOrigin: String,
        vaultState: NativeBackupVault.VaultState,
        appWebViewBytes: Long
    ): String {
        val root = JSONObject()

        val appObj = JSONObject().apply {
            if (BuildConfig.VERSION_NAME.isNotEmpty()) put("ver", BuildConfig.VERSION_NAME)
            put("build", if (BuildConfig.DEBUG) "debug" else "release")
            put("sdk", Build.VERSION.SDK_INT)
            if (lastTriggerSource.isNotEmpty()) put("trigger", lastTriggerSource)
        }
        root.put("app", appObj)

        val wvObj = JSONObject().apply {
            if (webViewPkg.isNotEmpty()) put("pkg", webViewPkg)
            if (webViewVer.isNotEmpty()) put("ver", webViewVer)
            if (webViewMajor != null) {
                put("major", webViewMajor)
                put("opfs", webViewMajor >= 109)
            }
            if (activeOrigin.isNotEmpty()) put("origin", activeOrigin)
        }
        root.put("wv", wvObj)

        val storageObj = JSONObject().apply {
            cachedPersisted?.let { put("persisted", it) }
            cachedQuotaUsageBytes?.let { put("jsUsage", it) }
            cachedQuotaTotalBytes?.let { put("jsQuota", it) }
            if (appWebViewBytes >= 0L) put("appWebViewB", appWebViewBytes)
            put("vaultCount", vaultState.snapshotCount)
            put("vaultB", vaultState.totalBytes)
            val lastAt = vaultState.latestTimestampIso
            if (!lastAt.isNullOrEmpty()) put("lastVaultAt", lastAt)
        }
        root.put("storage", storageObj)

        val eventsArr = diagnosticBuffer.toCompactJsonArray()
        if (eventsArr.length() > 0) {
            root.put("events", eventsArr)
        }
        return root.toString()
    }

    private fun formatStorageTruthText(
        persistedText: String,
        quotaText: String,
        appWebViewBytes: Long,
        vaultState: NativeBackupVault.VaultState
    ): String {
        val appWebViewText = if (appWebViewBytes >= 0L) formatBytes(appWebViewBytes) else "Measuring..."
        val vaultText = "${vaultState.snapshotCount} snapshot(s) · ${formatBytes(vaultState.totalBytes)}"
        val lastBackup = vaultState.latestTimestampIso ?: "None yet"
        return buildString {
            appendLine("navigator.storage.persisted(): $persistedText")
            appendLine("JS storage estimate: $quotaText")
            appendLine("app_webview (read-only): $appWebViewText")
            appendLine("filesDir/pedigree-vault/: $vaultText")
            append("Last native backup: $lastBackup")
        }
    }

    private fun buildSectionHeader(title: String): TextView {
        return TextView(activity).apply {
            text = title
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setTypeface(null, Typeface.BOLD)
            setPadding(0, dp(10), 0, dp(4))
        }
    }

    private fun buildMonospaceBox(content: String): TextView {
        return TextView(activity).apply {
            text = content
            typeface = Typeface.MONOSPACE
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
            setTextIsSelectable(true)
            val pad = dp(8)
            setPadding(pad, pad, pad, pad)
            setBackgroundColor(0x14888888)
        }
    }

    private fun buildActionButton(label: String, onClick: () -> Unit): Button {
        return Button(activity).apply {
            text = label
            isAllCaps = false
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setOnClickListener { onClick() }
        }
    }

    private fun extractOrigin(rawUrl: String?): String? {
        if (rawUrl.isNullOrBlank()) return null
        val uri = try {
            Uri.parse(rawUrl)
        } catch (_: Exception) {
            return null
        }
        val scheme = uri.scheme?.lowercase(Locale.US) ?: return null
        val host = uri.host?.lowercase(Locale.US) ?: return null
        return "$scheme://$host" + if (uri.port != -1) ":${uri.port}" else ""
    }

    private fun decodeJsStringResult(raw: String?): String? {
        if (raw.isNullOrBlank() || raw == "null") return null
        return try {
            org.json.JSONTokener(raw).nextValue() as? String
        } catch (_: Exception) {
            null
        }
    }

    private fun isAllowedDebugHttpsUrl(candidate: String): Boolean {
        if (!BuildConfig.DEBUG) return false
        val uri = try {
            Uri.parse(candidate)
        } catch (_: Exception) {
            return false
        }
        return uri.scheme?.lowercase(Locale.US) == "https" &&
            uri.host?.lowercase(Locale.US) == DEBUG_ALLOWED_HOST
    }

    private fun formatBytes(bytes: Long): String {
        if (bytes < 0L) return "0 B"
        if (bytes < 1024L) return "$bytes B"
        val kib = bytes / 1024.0
        if (kib < 1024.0) return String.format(Locale.US, "%.1f KiB", kib)
        val mib = kib / 1024.0
        return String.format(Locale.US, "%.2f MiB", mib)
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            activity.resources.displayMetrics
        ).toInt()
    }

    companion object {
        private const val STORAGE_PROBE_TIMEOUT_MS = 500L
        private const val DEBUG_ALLOWED_HOST = "askkim.github.io"
    }
}
