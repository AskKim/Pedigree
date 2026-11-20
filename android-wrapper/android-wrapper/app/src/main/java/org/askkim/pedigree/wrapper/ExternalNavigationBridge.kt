/*
 * Community Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import org.json.JSONObject
import java.util.Locale

/**
 * Routes `mailto:`, external `https://` links, and Google Calendar / Firebase OAuth URLs out of
 * the WebView to native email clients or Android Custom Tabs with default-browser fallback.
 *
 * Security model:
 * - Only same-origin `https://` requests (`activeOrigin`) are allowed to stay inside the WebView.
 * - `http://`, `file://`, `content://`, `javascript:`, `data:`, and `blob:` are unconditionally
 *   blocked and recorded in [DiagnosticRingBuffer].
 * - Google/Firebase OAuth hosts (`accounts.google.com`, `*.firebaseapp.com/__/auth`) are never
 *   permitted inside an embedded WebView (`403 disallowed_useragent`); they always launch in
 *   Custom Tabs with sharing disabled (`SHARE_STATE_OFF`) to protect authorization URLs/states.
 */
class ExternalNavigationBridge(
    private val activity: AppCompatActivity,
    private val diagnosticBuffer: DiagnosticRingBuffer? = null
) {
    /**
     * Handles WebView navigation requests. Returns `true` if handled/blocked natively,
     * or `false` if the WebView should proceed loading the same-origin app URL.
     */
    fun handleWebViewNavigation(
        uri: Uri,
        isForMainFrame: Boolean,
        activeOrigin: String
    ): Boolean {
        val scheme = uri.scheme?.lowercase(Locale.US) ?: return true

        if (scheme == "mailto") {
            if (isForMainFrame) {
                openMailtoSafely(uri)
            }
            return true
        }

        if (scheme != "https") {
            // Reject http://, file://, content://, javascript:, data:, blob:, etc.
            diagnosticBuffer?.record(
                DiagnosticRingBuffer.LEVEL_WARN,
                "EXT_BLOCKED_SCHEME",
                "Blocked $scheme URL (${DiagnosticRingBuffer.sanitizeUrl(uri.toString())})"
            )
            return true
        }

        val host = uri.host?.lowercase(Locale.US)
        if (host.isNullOrBlank()) {
            diagnosticBuffer?.record(
                DiagnosticRingBuffer.LEVEL_WARN,
                "EXT_BLOCKED_HOST",
                "Blocked https URL with empty host"
            )
            return true
        }

        // Never open Google / Firebase OAuth flows inside the WebView
        if (isOAuthUri(uri)) {
            if (isForMainFrame) {
                openHttpsExternalSafely(uri, purpose = PURPOSE_OAUTH)
            }
            return true
        }

        val requestOrigin = "https://$host" + if (uri.port != -1) ":${uri.port}" else ""
        if (requestOrigin == activeOrigin) {
            return false
        }

        if (isForMainFrame) {
            openHttpsExternalSafely(uri, purpose = PURPOSE_EXTERNAL)
        }
        return true
    }

    /**
     * Handles `OPEN_EXTERNAL_URL` bridge envelopes sent by `pedigreeBridge.openExternalUrl`.
     */
    fun handleBridgeRequest(payload: JSONObject?) {
        if (payload == null) return
        val urlString = if (payload.isNull("url")) "" else payload.optString("url", "").trim()
        if (urlString.isEmpty()) return

        val purpose = if (payload.isNull("purpose")) {
            PURPOSE_EXTERNAL
        } else {
            payload.optString("purpose", PURPOSE_EXTERNAL).trim().lowercase(Locale.US)
        }

        val uri = try {
            Uri.parse(urlString)
        } catch (_: Exception) {
            return
        }

        when (uri.scheme?.lowercase(Locale.US)) {
            "https" -> if (!uri.host.isNullOrBlank()) {
                openHttpsExternalSafely(uri, purpose)
            }
            "mailto" -> openMailtoSafely(uri)
        }
    }

    /**
     * Extension hook for future public-release Google Calendar / Firebase OAuth redirect intents
     * delivered to `MainActivity.onNewIntent`. Active v1 signing defers Calendar OAuth.
     */
    fun onOAuthRedirectIntent(@Suppress("UNUSED_PARAMETER") intent: Intent?) {
        // Intentionally deferred in v1: future public release can forward verified OAuth redirect
        // results back to the PWA bridge here.
    }

    /**
     * Launches an external `https://` URL in Android Custom Tabs, falling back to `Intent.ACTION_VIEW`
     * if no Custom Tabs provider is installed on the device.
     */
    fun openHttpsExternalSafely(uri: Uri, purpose: String = PURPOSE_EXTERNAL) {
        if (uri.scheme?.lowercase(Locale.US) != "https") return
        val isOAuth = isOAuthPurpose(purpose) || isOAuthUri(uri)
        val sanitized = DiagnosticRingBuffer.sanitizeUrl(uri.toString())
        diagnosticBuffer?.record(
            DiagnosticRingBuffer.LEVEL_INFO,
            if (isOAuth) "EXT_REROUTED_OAUTH" else "EXT_REROUTED_HTTPS",
            "Rerouted $sanitized to Custom Tab"
        )

        try {
            val builder = CustomTabsIntent.Builder()
                .setShowTitle(true)
            if (isOAuth) {
                // Prevent OAuth authorization URLs/states from being shared from the Custom Tab menu
                builder.setShareState(CustomTabsIntent.SHARE_STATE_OFF)
            }
            builder.build().launchUrl(activity, uri)
        } catch (_: Exception) {
            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
            } catch (_: Exception) {
                diagnosticBuffer?.record(
                    DiagnosticRingBuffer.LEVEL_WARN,
                    "EXT_LAUNCH_FAILED",
                    "No handler for $sanitized"
                )
                Toast.makeText(activity, R.string.external_link_unavailable, Toast.LENGTH_SHORT).show()
            }
        }
    }

    /** Opens a `mailto:` URI in the device's email client via `Intent.ACTION_SENDTO`. */
    fun openMailtoSafely(uri: Uri) {
        if (uri.scheme?.lowercase(Locale.US) != "mailto") return
        diagnosticBuffer?.record(
            DiagnosticRingBuffer.LEVEL_INFO,
            "EXT_REROUTED_MAILTO",
            "Rerouted mailto intent"
        )
        try {
            activity.startActivity(Intent(Intent.ACTION_SENDTO, uri))
        } catch (_: Exception) {
            diagnosticBuffer?.record(
                DiagnosticRingBuffer.LEVEL_WARN,
                "EXT_MAILTO_FAILED",
                "No email client available"
            )
            Toast.makeText(activity, R.string.external_link_unavailable, Toast.LENGTH_SHORT).show()
        }
    }

    private fun isOAuthPurpose(purpose: String): Boolean {
        return purpose.contains("oauth") || purpose.contains("calendar-auth") || purpose == "auth"
    }

    private fun isOAuthUri(uri: Uri): Boolean {
        val host = uri.host?.lowercase(Locale.US) ?: return false
        val path = uri.path?.lowercase(Locale.US) ?: ""
        if (host == "accounts.google.com") {
            return true
        }
        if ((host.endsWith(".firebaseapp.com") || host.endsWith(".web.app")) &&
            path.startsWith("/__/auth")
        ) {
            return true
        }
        return false
    }

    companion object {
        private const val PURPOSE_EXTERNAL = "external"
        private const val PURPOSE_OAUTH = "oauth"
    }
}
