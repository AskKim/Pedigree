/*
 * Community Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * Main host Activity for the Community Pedigree Android Wrapper (`org.askkim.pedigree.wrapper`).
 *
 * Architecture & Security Responsibilities:
 * 1. **Offline Asset Hosting**: Serves bundled Vite `dist/` assets from `assets/www/` at virtual
 *    origin `https://appassets.androidplatform.net/` via [WebViewAssetLoader] and intercepts
 *    Service Worker requests via [ServiceWorkerControllerCompat].
 * 2. **Origin-Locked IPC Bridge**: Exposes `window.pedigreeNative` via `WebViewCompat.addWebMessageListener`
 *    (strictly rejecting `addJavascriptInterface`), verifying `isMainFrame && sourceOrigin == activeOrigin`.
 * 3. **Two-Frame Binary Routing**: Coordinates [PendingBinaryTarget] (`NONE`, `EXPORT`, `VAULT`) so
 *    JSON metadata headers (`BEGIN_BINARY_TRANSFER`, `SYNC_BACKUP_SNAPSHOT`) pair safely with the
 *    trailing `TYPE_ARRAY_BUFFER` frame.
 * 4. **OWASP Hardening**: Disables file/content URL access, mixed content, and JS popups; ties
 *    remote WebView debugging and staging URL overrides strictly to `BuildConfig.DEBUG`.
 * 5. **Resilient Lifecycle**: Recovers from Chromium renderer crashes (`onRenderProcessGone`) with
 *    a foreground-deferred remount and 3-crash circuit breaker, and never calls `pauseTimers()`.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var rootContainer: FrameLayout
    private lateinit var assetLoader: WebViewAssetLoader
    private lateinit var backNavigationBridge: BackNavigationBridge
    private lateinit var fileAndExportBridge: FileAndExportBridge
    private lateinit var printBridge: PrintBridge
    private lateinit var externalNavigationBridge: ExternalNavigationBridge
    private lateinit var nativeBackupVault: NativeBackupVault

    private val diagnosticBuffer = DiagnosticRingBuffer()
    private var developerPanelDialog: DeveloperPanelDialog? = null
    private var pendingBinaryTarget: PendingBinaryTarget = PendingBinaryTarget.NONE

    private var webView: WebView? = null
    private var activeOrigin: String = ASSET_ORIGIN
    private var activeStartUrl: String = ASSET_START_URL
    private var currentReplyProxy: JavaScriptReplyProxy? = null

    private var lastRenderCrashTimestampMs: Long = 0L
    private var consecutiveRenderCrashCount: Int = 0
    private var isActivityResumed: Boolean = false
    private var pendingRendererRemount: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        rootContainer = DevTriggerRootContainer(this) {
            openDeveloperPanel("corner_5tap")
        }.apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        ViewCompat.setOnApplyWindowInsetsListener(rootContainer) { view, windowInsets ->
            val insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom)
            WindowInsetsCompat.CONSUMED
        }
        setContentView(rootContainer)

        assetLoader = WebViewAssetLoader.Builder()
            .setDomain(ASSET_HOST)
            .addPathHandler("/", PedigreeAssetPathHandler(applicationContext))
            .build()

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        configureServiceWorkerAssetInterceptor()
        resolveTargetUrlAndOrigin()

        nativeBackupVault = NativeBackupVault(applicationContext, diagnosticBuffer)
        fileAndExportBridge = FileAndExportBridge(this)
        printBridge = PrintBridge(
            activity = this,
            webViewProvider = { webView }
        )
        externalNavigationBridge = ExternalNavigationBridge(this, diagnosticBuffer)
        backNavigationBridge = BackNavigationBridge(
            activity = this,
            webViewProvider = { webView },
            replyProxyProvider = { currentReplyProxy },
            activeOriginProvider = { activeOrigin },
            diagnosticBuffer = diagnosticBuffer
        )
        backNavigationBridge.attach()

        mountWebView(savedInstanceState)
        if (savedInstanceState == null) {
            handleDiagnosticsShortcutIntent(intent)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        externalNavigationBridge.onOAuthRedirectIntent(intent)
        handleDiagnosticsShortcutIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        isActivityResumed = true
        if (pendingRendererRemount) {
            pendingRendererRemount = false
            mountWebView(null)
        } else {
            webView?.onResume()
        }
    }

    override fun onPause() {
        isActivityResumed = false
        webView?.onPause()
        // Never call webView.pauseTimers() — it pauses timers process-wide across WebViews.
        super.onPause()
    }

    override fun onDestroy() {
        ViewCompat.setOnApplyWindowInsetsListener(rootContainer, null)
        developerPanelDialog?.dismiss()
        developerPanelDialog = null
        backNavigationBridge.destroy()
        fileAndExportBridge.destroy()
        printBridge.destroy()
        nativeBackupVault.destroy()
        teardownWebView()
        super.onDestroy()
    }

    /**
     * Connects [ServiceWorkerControllerCompat] to [WebViewAssetLoader] so Service Worker fetches
     * for `https://appassets.androidplatform.net/*` resolve from bundled APK assets offline.
     */
    private fun configureServiceWorkerAssetInterceptor() {
        if (
            WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE) &&
            WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)
        ) {
            val swController = ServiceWorkerControllerCompat.getInstance()
            // Top-level/static helper avoids capturing Activity reference inside process-wide singleton.
            swController.setServiceWorkerClient(PedigreeServiceWorkerClient(assetLoader))
        }
    }

    private fun resolveTargetUrlAndOrigin() {
        activeStartUrl = ASSET_START_URL
        activeOrigin = ASSET_ORIGIN

        if (!BuildConfig.DEBUG) {
            return
        }

        val prefs = getSharedPreferences(DEBUG_PREFS_NAME, Context.MODE_PRIVATE)
        val overrideUrl = prefs.getString(KEY_DEBUG_TARGET_URL, null)?.trim()
        if (!overrideUrl.isNullOrEmpty() && isAllowedDebugTargetUrl(overrideUrl)) {
            val uri = Uri.parse(overrideUrl)
            val host = uri.host?.lowercase() ?: return
            activeStartUrl = overrideUrl
            activeOrigin = "https://$host" + if (uri.port != -1) ":${uri.port}" else ""
        }
    }

    private fun isAllowedDebugTargetUrl(candidate: String): Boolean {
        if (!BuildConfig.DEBUG) return false
        val uri = try {
            Uri.parse(candidate)
        } catch (_: Exception) {
            return false
        }
        return uri.scheme?.lowercase() == "https" && uri.host?.lowercase() == DEBUG_PAGES_HOST
    }

    /**
     * Creates, configures, and attaches a hardened [WebView] instance to [rootContainer].
     * Called on initial launch, debug URL switches, and renderer crash recovery.
     */
    @SuppressLint("SetJavaScriptEnabled")
    private fun mountWebView(
        savedInstanceState: Bundle? = null,
        initialUrl: String = activeStartUrl
    ) {
        teardownWebView()
        rootContainer.removeAllViews()

        val wv = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        applyOwaspWebViewSettings(wv.settings)
        attachOriginLockedWebMessageListener(wv)

        wv.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                val uri = request.url
                if (uri.scheme?.lowercase() == "https" && uri.host?.lowercase() == ASSET_HOST) {
                    return assetLoader.shouldInterceptRequest(uri)
                }
                return super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                return externalNavigationBridge.handleWebViewNavigation(
                    uri = request.url,
                    isForMainFrame = request.isForMainFrame,
                    activeOrigin = activeOrigin
                )
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                val url = DiagnosticRingBuffer.sanitizeUrl(request?.url?.toString())
                val code = error?.errorCode ?: -1
                val desc = error?.description?.toString() ?: "error"
                val frame = if (request?.isForMainFrame == true) "main" else "sub"
                diagnosticBuffer.record(
                    DiagnosticRingBuffer.LEVEL_ERROR,
                    "WV_ERROR",
                    "[$frame] $code $desc ($url)"
                )
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: WebResourceResponse?
            ) {
                super.onReceivedHttpError(view, request, errorResponse)
                val status = errorResponse?.statusCode ?: 0
                val url = DiagnosticRingBuffer.sanitizeUrl(request?.url?.toString())
                val frame = if (request?.isForMainFrame == true) "main" else "sub"
                val level = if (status >= 500) DiagnosticRingBuffer.LEVEL_ERROR else DiagnosticRingBuffer.LEVEL_WARN
                diagnosticBuffer.record(
                    level,
                    "WV_HTTP_ERROR",
                    "[$frame] HTTP $status ($url)"
                )
            }

            override fun onRenderProcessGone(
                view: WebView,
                detail: RenderProcessGoneDetail
            ): Boolean {
                diagnosticBuffer.record(
                    DiagnosticRingBuffer.LEVEL_ERROR,
                    "WV_RENDER_GONE",
                    "didCrash=${detail.didCrash()} prio=${detail.rendererPriorityAtExit()} fg=$isActivityResumed"
                )
                handleRendererProcessGone(view, didCrash = detail.didCrash())
                return true
            }
        }

        wv.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                return fileAndExportBridge.onShowFileChooser(
                    webView = webView,
                    filePathCallback = filePathCallback,
                    fileChooserParams = fileChooserParams
                )
            }

            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                if (consoleMessage != null) {
                    val msgLevel = consoleMessage.messageLevel()
                    if (msgLevel == ConsoleMessage.MessageLevel.ERROR ||
                        msgLevel == ConsoleMessage.MessageLevel.WARNING
                    ) {
                        val level = if (msgLevel == ConsoleMessage.MessageLevel.ERROR) {
                            DiagnosticRingBuffer.LEVEL_ERROR
                        } else {
                            DiagnosticRingBuffer.LEVEL_WARN
                        }
                        val src = DiagnosticRingBuffer.sanitizeUrl(consoleMessage.sourceId())
                        val line = consoleMessage.lineNumber()
                        val text = consoleMessage.message().orEmpty()
                        diagnosticBuffer.record(
                            level,
                            "JS_CONSOLE",
                            "$src:$line $text"
                        )
                    }
                }
                return super.onConsoleMessage(consoleMessage)
            }
        }

        webView = wv
        rootContainer.addView(wv)

        if (savedInstanceState != null) {
            val restored = wv.restoreState(savedInstanceState)
            if (restored == null) {
                wv.loadUrl(initialUrl)
            }
        } else {
            wv.loadUrl(initialUrl)
        }
    }

    /**
     * Applies OWASP Mobile WebView hardening defaults:
     * - Blocks `file://` and `content://` reads so untrusted web content cannot read local files.
     * - Blocks `http://` mixed content and automatic `window.open()` popups.
     * - Enables Safe Browsing when supported by the installed Android System WebView.
     */
    @SuppressLint("SetJavaScriptEnabled")
    private fun applyOwaspWebViewSettings(settings: WebSettings) {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        @Suppress("DEPRECATION")
        settings.allowFileAccessFromFileURLs = false
        @Suppress("DEPRECATION")
        settings.allowUniversalAccessFromFileURLs = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.setSupportMultipleWindows(false)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.mediaPlaybackRequiresUserGesture = false

        if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
            WebSettingsCompat.setSafeBrowsingEnabled(settings, true)
        }
    }

    /**
     * Attaches the origin-locked `window.pedigreeNative` WebMessageListener and routes incoming
     * JSON control envelopes (`TYPE_STRING`) and trailing binary payloads (`TYPE_ARRAY_BUFFER`).
     */
    private fun attachOriginLockedWebMessageListener(wv: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            return
        }

        // Strict origin lock — never use addJavascriptInterface
        WebViewCompat.addWebMessageListener(
            wv,
            BRIDGE_OBJECT_NAME,
            setOf(activeOrigin)
        ) { _, message, sourceOrigin, isMainFrame, replyProxy ->
            if (!isMainFrame || sourceOrigin.toString() != activeOrigin) {
                return@addWebMessageListener
            }
            currentReplyProxy = replyProxy
            when (message.type) {
                WebMessageCompat.TYPE_STRING -> {
                    val raw = message.data ?: return@addWebMessageListener
                    handleIncomingControlEnvelope(raw, replyProxy)
                }

                WebMessageCompat.TYPE_ARRAY_BUFFER -> {
                    val target = pendingBinaryTarget
                    pendingBinaryTarget = PendingBinaryTarget.NONE
                    if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER)) {
                        val bytes = message.arrayBuffer
                        when (target) {
                            PendingBinaryTarget.EXPORT -> {
                                fileAndExportBridge.handleIncomingBinaryPayload(bytes)
                            }
                            PendingBinaryTarget.VAULT -> {
                                nativeBackupVault.handleIncomingSnapshotBytes(bytes)
                            }
                            PendingBinaryTarget.NONE -> {
                                diagnosticBuffer.record(
                                    DiagnosticRingBuffer.LEVEL_WARN,
                                    "BINARY_FRAME_UNEXPECTED",
                                    "Dropped unexpected ArrayBuffer (${bytes.size} B)"
                                )
                            }
                        }
                    } else {
                        fileAndExportBridge.clearPendingTransfer()
                        nativeBackupVault.clearPendingSnapshot()
                    }
                }
            }
        }
    }

    /**
     * Parses a `TYPE_STRING` control envelope from `pedigreeBridge` and dispatches it to the
     * matching native subsystem, enforcing the two-frame [PendingBinaryTarget] invariant.
     */
    private fun handleIncomingControlEnvelope(rawJson: String, replyProxy: JavaScriptReplyProxy) {
        val envelope = try {
            JSONObject(rawJson)
        } catch (_: Exception) {
            return
        }
        val type = envelope.optNonNullString("type")
        val requestId = envelope.optNonNullString("requestId")
        val payload = envelope.optJSONObject("payload")

        if (pendingBinaryTarget != PendingBinaryTarget.NONE &&
            type != "BEGIN_BINARY_TRANSFER" &&
            type != "SYNC_BACKUP_SNAPSHOT"
        ) {
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_WARN,
                "BINARY_FRAME_MISMATCH",
                "Cleared pending $pendingBinaryTarget before $type"
            )
            pendingBinaryTarget = PendingBinaryTarget.NONE
            fileAndExportBridge.clearPendingTransfer()
            nativeBackupVault.clearPendingSnapshot()
        }

        when (type) {
            "NATIVE_BACK_RESULT" -> {
                backNavigationBridge.handleNativeBackResult(requestId, payload)
            }

            "BEGIN_BINARY_TRANSFER" -> {
                nativeBackupVault.clearPendingSnapshot()
                fileAndExportBridge.beginBinaryTransfer(requestId, payload)
                val hasInlineBase64 = payload != null &&
                    !payload.isNull("base64Data") &&
                    payload.optString("base64Data", "").isNotEmpty()
                pendingBinaryTarget = if (hasInlineBase64) {
                    PendingBinaryTarget.NONE
                } else {
                    PendingBinaryTarget.EXPORT
                }
            }

            "SYNC_BACKUP_SNAPSHOT" -> {
                fileAndExportBridge.clearPendingTransfer()
                val expectsBinaryFrame = nativeBackupVault.beginSnapshotSync(requestId, payload)
                pendingBinaryTarget = if (expectsBinaryFrame) {
                    PendingBinaryTarget.VAULT
                } else {
                    PendingBinaryTarget.NONE
                }
            }

            "REQUEST_PRINT" -> {
                printBridge.printCurrentPage()
            }

            "OPEN_EXTERNAL_URL" -> {
                externalNavigationBridge.handleBridgeRequest(payload)
            }

            "OPEN_DEV_PANEL" -> {
                openDeveloperPanel("bridge")
            }

            "GET_CONTAINER_INFO" -> {
                val pkgInfo = WebViewCompat.getCurrentWebViewPackage(this)
                val versionName = pkgInfo?.versionName ?: "unknown"
                val majorVersion = versionName.substringBefore('.').trim().toIntOrNull()
                val vaultInfo = nativeBackupVault.getVaultInfo()
                val appWebViewBytes = nativeBackupVault.getAppWebViewBytes()
                val resultPayload = JSONObject().apply {
                    put("platform", "android")
                    put("appVersion", BuildConfig.VERSION_NAME)
                    put("webViewPackage", pkgInfo?.packageName ?: "unknown")
                    put("webViewVersion", versionName)
                    if (majorVersion != null) {
                        put("webViewMajorVersion", majorVersion)
                        put("opfsSupportedInWebView", majorVersion >= 109)
                    }
                    put("origin", activeOrigin)
                    put("isDebugBuild", BuildConfig.DEBUG)
                    put("vaultSnapshotCount", vaultInfo.snapshotCount)
                    put("vaultTotalBytes", vaultInfo.totalBytes)
                    put("lastVaultBackupAt", vaultInfo.latestTimestampIso ?: JSONObject.NULL)
                    if (appWebViewBytes >= 0L) {
                        put("appWebViewBytes", appWebViewBytes)
                    }
                }
                val reply = JSONObject().apply {
                    put("type", "CONTAINER_INFO_RESULT")
                    put("requestId", requestId)
                    put("payload", resultPayload)
                }
                replyProxy.postMessage(reply.toString())
            }
        }
    }

    /**
     * Handles Chromium renderer process termination (`onRenderProcessGone`) without crashing the
     * Android app. Defers remount if the Activity is backgrounded, and stops after
     * [MAX_CONSECUTIVE_RENDER_CRASHES] crashes within [RENDER_CRASH_WINDOW_MS] to show a manual
     * recovery screen instead of looping.
     */
    private fun handleRendererProcessGone(crashedView: WebView, didCrash: Boolean) {
        if (webView === crashedView) {
            teardownWebView()
        } else {
            (crashedView.parent as? ViewGroup)?.removeView(crashedView)
            crashedView.destroy()
        }

        if (!isActivityResumed) {
            // Defer WebView recreation until user returns to foreground so LMKD doesn't kill a hidden renderer.
            pendingRendererRemount = true
            if (!didCrash) {
                consecutiveRenderCrashCount = 0
            }
            return
        }

        val now = SystemClock.elapsedRealtime()
        if (now - lastRenderCrashTimestampMs <= RENDER_CRASH_WINDOW_MS) {
            consecutiveRenderCrashCount += 1
        } else {
            consecutiveRenderCrashCount = 1
        }
        lastRenderCrashTimestampMs = now

        if (consecutiveRenderCrashCount > MAX_CONSECUTIVE_RENDER_CRASHES) {
            showRenderRecoveryFallback()
            return
        }

        mountWebView(null)
    }

    private fun showRenderRecoveryFallback() {
        rootContainer.removeAllViews()
        val fgColor = getColor(R.color.pedigree_launcher_fg)
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(getColor(R.color.pedigree_splash_bg))
            setPadding(64, 64, 64, 64)
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        val title = TextView(this).apply {
            text = getString(R.string.render_crash_title)
            textSize = 18f
            setTextColor(fgColor)
        }
        val body = TextView(this).apply {
            text = getString(R.string.render_crash_body)
            textSize = 14f
            setTextColor(fgColor)
            alpha = 0.85f
            setPadding(0, 16, 0, 32)
        }
        val retryBtn = Button(this).apply {
            text = getString(R.string.render_crash_retry)
            setOnClickListener {
                consecutiveRenderCrashCount = 0
                mountWebView(null)
            }
        }
        panel.addView(title)
        panel.addView(body)
        panel.addView(retryBtn)
        rootContainer.addView(panel)
    }

    private fun teardownWebView() {
        currentReplyProxy = null
        pendingBinaryTarget = PendingBinaryTarget.NONE
        pendingRendererRemount = false
        backNavigationBridge.resetPendingRequest()
        fileAndExportBridge.clearPendingTransfer()
        nativeBackupVault.clearPendingSnapshot()
        val wv = webView ?: return
        webView = null
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.removeWebMessageListener(wv, BRIDGE_OBJECT_NAME)
        }
        (wv.parent as? ViewGroup)?.removeView(wv)
        wv.stopLoading()
        wv.webChromeClient = null
        wv.webViewClient = WebViewClient()
        wv.destroy()
    }

    private fun handleDiagnosticsShortcutIntent(shortcutIntent: Intent?) {
        if (shortcutIntent?.action != ACTION_OPEN_DIAGNOSTICS) return
        rootContainer.post {
            if (!isFinishing && !isDestroyed) {
                openDeveloperPanel("shortcut")
            }
        }
    }

    private fun openDeveloperPanel(triggerSource: String) {
        if (isFinishing || isDestroyed) return
        val panel = developerPanelDialog ?: DeveloperPanelDialog(
            activity = this,
            diagnosticBuffer = diagnosticBuffer,
            nativeBackupVault = nativeBackupVault,
            webViewProvider = { webView },
            activeOriginProvider = { activeOrigin },
            activeStartUrlProvider = { activeStartUrl },
            onReloadApp = {
                val wv = webView
                if (wv != null) {
                    wv.reload()
                } else {
                    consecutiveRenderCrashCount = 0
                    mountWebView(null)
                }
            },
            onSoftCacheReset = {
                performSoftCacheReset()
            },
            onDebugTargetUrlChanged = { nextUrl ->
                updateDebugTargetUrl(nextUrl)
            }
        ).also { developerPanelDialog = it }
        panel.show(triggerSource)
    }

    private fun performSoftCacheReset() {
        val resetUrl = buildEmergencyResetUrl(activeStartUrl)
        diagnosticBuffer.record(
            DiagnosticRingBuffer.LEVEL_INFO,
            "SOFT_CACHE_RESET",
            "Clearing HTTP cache and reloading with ?emergency_reset=true"
        )
        val wv = webView
        if (wv != null) {
            // clearCache(false) clears RAM/HTTP cache only, preserving SQLite/IDB/OPFS & app_webview
            wv.clearCache(false)
            wv.loadUrl(resetUrl)
        } else {
            consecutiveRenderCrashCount = 0
            mountWebView(null, initialUrl = resetUrl)
        }
    }

    private fun buildEmergencyResetUrl(baseUrl: String): String {
        val uri = Uri.parse(baseUrl)
        if (uri.getQueryParameter("emergency_reset") == "true") {
            return baseUrl
        }
        return uri.buildUpon()
            .appendQueryParameter("emergency_reset", "true")
            .build()
            .toString()
    }

    private fun updateDebugTargetUrl(candidate: String?) {
        if (!BuildConfig.DEBUG) return
        val prefs = getSharedPreferences(DEBUG_PREFS_NAME, Context.MODE_PRIVATE)
        if (candidate.isNullOrBlank()) {
            prefs.edit().remove(KEY_DEBUG_TARGET_URL).apply()
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_INFO,
                "DEBUG_URL_RESET",
                "Switched back to bundled assets"
            )
        } else if (isAllowedDebugTargetUrl(candidate)) {
            prefs.edit().putString(KEY_DEBUG_TARGET_URL, candidate.trim()).apply()
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_INFO,
                "DEBUG_URL_SET",
                "Switched target to ${DiagnosticRingBuffer.sanitizeUrl(candidate)}"
            )
        } else {
            return
        }
        resolveTargetUrlAndOrigin()
        consecutiveRenderCrashCount = 0
        mountWebView(null)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView?.saveState(outState)
    }

    private fun JSONObject.optNonNullString(key: String): String {
        return if (isNull(key)) "" else optString(key, "")
    }

    private enum class PendingBinaryTarget {
        NONE,
        EXPORT,
        VAULT
    }

    /**
     * Lightweight wrapper around [rootContainer] that detects 5 taps within 2.5s inside the
     * top-right 80dp corner without consuming touches or adding invisible overlay views.
     */
    private class DevTriggerRootContainer(
        context: Context,
        private val onFiveTapTriggered: () -> Unit
    ) : FrameLayout(context) {
        private val cornerSizePx: Float = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            DEV_CORNER_DP,
            resources.displayMetrics
        )
        private var tapCount = 0
        private var firstTapElapsedMs = 0L

        override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
            if (ev.actionMasked == MotionEvent.ACTION_DOWN && width > 0 && height > 0) {
                val inTopRightCorner =
                    ev.x >= (width - paddingRight - cornerSizePx) &&
                    ev.y <= (paddingTop + cornerSizePx)
                if (inTopRightCorner) {
                    val now = SystemClock.elapsedRealtime()
                    if (tapCount == 0 || now - firstTapElapsedMs > DEV_TAP_WINDOW_MS) {
                        tapCount = 1
                        firstTapElapsedMs = now
                    } else {
                        tapCount += 1
                    }
                    if (tapCount >= DEV_TAP_THRESHOLD) {
                        tapCount = 0
                        firstTapElapsedMs = 0L
                        onFiveTapTriggered()
                    }
                } else {
                    tapCount = 0
                    firstTapElapsedMs = 0L
                }
            }
            return super.onInterceptTouchEvent(ev)
        }
    }

    /**
     * Static/top-level [ServiceWorkerClientCompat] implementation so the process-wide
     * [ServiceWorkerControllerCompat] singleton never retains a reference to [MainActivity].
     */
    private class PedigreeServiceWorkerClient(
        private val loader: WebViewAssetLoader
    ) : ServiceWorkerClientCompat() {
        override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? {
            val url = request.url
            if (url.scheme?.lowercase() == "https" && url.host?.lowercase() == ASSET_HOST) {
                return loader.shouldInterceptRequest(url)
            }
            return null
        }
    }

    companion object {
        private const val ASSET_HOST = "appassets.androidplatform.net"
        private const val ASSET_ORIGIN = "https://$ASSET_HOST"
        private const val ASSET_START_URL = "$ASSET_ORIGIN/index.html"
        private const val DEBUG_PAGES_HOST = "askkim.github.io"
        private const val DEBUG_PREFS_NAME = "pedigree_wrapper_debug_prefs"
        private const val KEY_DEBUG_TARGET_URL = "debug_target_url"
        private const val BRIDGE_OBJECT_NAME = "pedigreeNative"
        private const val ACTION_OPEN_DIAGNOSTICS = "org.askkim.pedigree.wrapper.action.OPEN_DIAGNOSTICS"
        private const val DEV_CORNER_DP = 80f
        private const val DEV_TAP_WINDOW_MS = 2_500L
        private const val DEV_TAP_THRESHOLD = 5
        private const val RENDER_CRASH_WINDOW_MS = 15_000L
        private const val MAX_CONSECUTIVE_RENDER_CRASHES = 3
    }
}
