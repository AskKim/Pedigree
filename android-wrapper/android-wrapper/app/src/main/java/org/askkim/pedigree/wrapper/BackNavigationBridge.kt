/*
 * Community Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.JavaScriptReplyProxy
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicLong

/**
 * Coordinates Android system Back gestures/buttons with the PWA's in-app modal and route stack
 * via `pedigreeBridge`.
 *
 * Flow on every Back press:
 * 1. Sends `{"type":"NATIVE_BACK","requestId":"back_N"}` to the PWA and starts a 250ms timer.
 * 2. The PWA evaluates registered Back handlers (modals at priority >= 5 first, then routes at
 *    priority 0 in LIFO order) and replies with `NATIVE_BACK_RESULT { handled: true|false }`.
 * 3. If `handled == true`, native code does nothing (the PWA closed a modal or stepped back).
 * 4. If `handled == false` or the 250ms timer expires, [performNativeFallback] steps through
 *    `webView.canGoBack()` or shows a 2-second "Press Back again to exit" toast before exiting.
 */
class BackNavigationBridge(
    private val activity: AppCompatActivity,
    private val webViewProvider: () -> WebView?,
    private val replyProxyProvider: () -> JavaScriptReplyProxy?,
    private val activeOriginProvider: () -> String,
    private val onExitRequested: () -> Unit = { activity.finish() },
    private val diagnosticBuffer: DiagnosticRingBuffer? = null
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val sequence = AtomicLong(0L)

    private var pendingRequestId: String? = null
    private var pendingDispatchElapsedMs: Long = 0L
    private var pendingTimeoutRunnable: Runnable? = null
    private var lastExitPromptTimestampMs: Long = 0L
    private var activeExitToast: Toast? = null
    private var destroyed = false

    private val backPressedCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            onSystemBackPressed()
        }
    }

    /** Registers the AndroidX [OnBackPressedCallback] on the Activity dispatcher. */
    fun attach() {
        activity.onBackPressedDispatcher.addCallback(activity, backPressedCallback)
    }

    /**
     * Processes `NATIVE_BACK_RESULT` replies from JS, ignoring stale or mismatched `requestId`s
     * after a timeout has already fired.
     */
    fun handleNativeBackResult(requestId: String, payload: JSONObject?) {
        if (destroyed) return
        val handled = payload?.optBoolean("handled", false) ?: false

        val applyResult = Runnable {
            if (destroyed) return@Runnable
            val currentPending = pendingRequestId
            if (currentPending == null || (requestId.isNotEmpty() && requestId != currentPending)) {
                return@Runnable
            }
            val latencyMs = (SystemClock.elapsedRealtime() - pendingDispatchElapsedMs).coerceAtLeast(0L)
            clearPendingTimeout()
            diagnosticBuffer?.record(
                DiagnosticRingBuffer.LEVEL_INFO,
                "BACK_RESULT",
                "handled=$handled in ${latencyMs}ms"
            )
            if (!handled) {
                performNativeFallback()
            }
        }

        if (Looper.myLooper() == Looper.getMainLooper()) {
            applyResult.run()
        } else {
            mainHandler.post(applyResult)
        }
    }

    /** Clears any in-flight Back request (called when the WebView is torn down or remounted). */
    fun resetPendingRequest() {
        clearPendingTimeout()
    }

    /** Unregisters the Back callback and cancels timers/toasts on Activity destruction. */
    fun destroy() {
        destroyed = true
        backPressedCallback.remove()
        clearPendingTimeout()
        activeExitToast?.cancel()
        activeExitToast = null
    }

    private fun onSystemBackPressed() {
        if (destroyed || pendingRequestId != null) return

        val wv = webViewProvider()
        if (wv == null) {
            performNativeFallback()
            return
        }

        val requestId = "back_${sequence.incrementAndGet()}"
        pendingRequestId = requestId
        pendingDispatchElapsedMs = SystemClock.elapsedRealtime()

        val timeoutRunnable = Runnable {
            if (destroyed) return@Runnable
            if (pendingRequestId == requestId) {
                val latencyMs = (SystemClock.elapsedRealtime() - pendingDispatchElapsedMs).coerceAtLeast(0L)
                pendingRequestId = null
                pendingTimeoutRunnable = null
                diagnosticBuffer?.record(
                    DiagnosticRingBuffer.LEVEL_WARN,
                    "BACK_TIMEOUT",
                    "JS back reply timed out after ${latencyMs}ms; falling back"
                )
                performNativeFallback()
            }
        }
        pendingTimeoutRunnable = timeoutRunnable
        mainHandler.postDelayed(timeoutRunnable, BACK_REPLY_TIMEOUT_MS)

        val envelopeJson = JSONObject().apply {
            put("type", "NATIVE_BACK")
            put("requestId", requestId)
        }.toString()

        val dispatched = dispatchBackEnvelope(wv, envelopeJson)
        if (!dispatched) {
            clearPendingTimeout()
            diagnosticBuffer?.record(
                DiagnosticRingBuffer.LEVEL_INFO,
                "BACK_DISPATCH_SKIP",
                "JS bridge unavailable; using native fallback"
            )
            performNativeFallback()
        }
    }

    /**
     * Sends `NATIVE_BACK` via the active `JavaScriptReplyProxy` when available.
     *
     * Note on `JavaScriptReplyProxy` availability: Android `WebViewCompat.addWebMessageListener`
     * only provides a `replyProxy` after JS sends its first message to native. If the user presses
     * Back before JS has posted anything, we fall back to `window.__pedigreeBridgeReceive(...)`—
     * but ONLY after verifying that `webView.url`'s origin strictly matches [activeOriginProvider].
     */
    private fun dispatchBackEnvelope(webView: WebView, envelopeJson: String): Boolean {
        val proxy = replyProxyProvider()
        if (proxy != null) {
            return try {
                proxy.postMessage(envelopeJson)
                true
            } catch (_: Exception) {
                false
            }
        }

        // Fallback before JS sends its first message: invoke the bridge receiver only if current origin matches
        val currentUrl = webView.url ?: return false
        val uri = try {
            Uri.parse(currentUrl)
        } catch (_: Exception) {
            return false
        }
        val scheme = uri.scheme?.lowercase() ?: return false
        val host = uri.host?.lowercase() ?: return false
        val currentOrigin = "$scheme://$host" + if (uri.port != -1) ":${uri.port}" else ""
        if (currentOrigin != activeOriginProvider()) {
            return false
        }

        val quotedEnvelope = JSONObject.quote(envelopeJson)
        webView.evaluateJavascript(
            "window.__pedigreeBridgeReceive && window.__pedigreeBridgeReceive($quotedEnvelope);",
            null
        )
        return true
    }

    /** Executes native WebView history back or the 2-second double-back-to-exit confirmation. */
    private fun performNativeFallback() {
        if (destroyed) return

        val wv = webViewProvider()
        if (wv != null && wv.canGoBack()) {
            wv.goBack()
            return
        }

        val now = SystemClock.elapsedRealtime()
        if (now - lastExitPromptTimestampMs <= DOUBLE_BACK_EXIT_WINDOW_MS) {
            activeExitToast?.cancel()
            activeExitToast = null
            onExitRequested()
        } else {
            lastExitPromptTimestampMs = now
            activeExitToast?.cancel()
            activeExitToast = Toast.makeText(
                activity,
                R.string.press_back_again_to_exit,
                Toast.LENGTH_SHORT
            ).also { it.show() }
        }
    }

    private fun clearPendingTimeout() {
        pendingTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        pendingTimeoutRunnable = null
        pendingRequestId = null
    }

    companion object {
        private const val BACK_REPLY_TIMEOUT_MS = 250L
        private const val DOUBLE_BACK_EXIT_WINDOW_MS = 2_000L
    }
}
