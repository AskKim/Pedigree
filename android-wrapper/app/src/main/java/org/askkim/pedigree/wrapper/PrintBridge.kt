/*
 * Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.content.Context
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

/**
 * Handles `REQUEST_PRINT` messages from `pedigreeBridge` using Android's [PrintManager].
 *
 * When the PWA provides a self-contained `htmlContent` payload (from `.HTM` / card / binder
 * print preview), it renders into a hardened, JavaScript-disabled ephemeral [WebView] so dark
 * mode classes and app shell chrome never leak onto printed pages and orientation (`landscape` vs
 * `portrait`) is honored automatically via [PrintAttributes].
 */
class PrintBridge(
    private val activity: AppCompatActivity,
    private val webViewProvider: () -> WebView?
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var destroyed = false
    private var pendingPrintWebView: WebView? = null

    /**
     * Opens the Android system print/PDF preview for the current WebView page.
     */
    fun printCurrentPage() {
        printFromBridge(null)
    }

    /**
     * Opens the Android system print/PDF preview using optional `REQUEST_PRINT` payload fields:
     * - `title`: sanitized print job / suggested PDF filename
     * - `orientation`: `"landscape"` or `"portrait"`
     * - `htmlContent`: self-contained HTML document to render cleanly in an offscreen WebView
     */
    fun printFromBridge(payload: JSONObject?) {
        val rawTitle = payload?.optNonNullString("title") ?: ""
        val jobTitle = sanitizePrintJobTitle(rawTitle)
        val orientation = payload?.optNonNullString("orientation") ?: ""
        val htmlContent = payload?.optNonNullString("htmlContent") ?: ""

        val runPrint = Runnable {
            if (destroyed || activity.isFinishing || activity.isDestroyed) return@Runnable
            val printManager = activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager
            if (printManager == null) {
                Toast.makeText(activity, R.string.print_unavailable, Toast.LENGTH_SHORT).show()
                return@Runnable
            }

            val attributes = buildPrintAttributes(orientation)

            if (htmlContent.isNotBlank()) {
                printHtmlDocument(printManager, jobTitle, htmlContent, attributes)
                return@Runnable
            }

            val wv = webViewProvider() ?: return@Runnable
            try {
                val adapter = wv.createPrintDocumentAdapter(jobTitle)
                printManager.print(jobTitle, adapter, attributes)
            } catch (_: Exception) {
                Toast.makeText(activity, R.string.print_unavailable, Toast.LENGTH_SHORT).show()
            }
        }

        if (Looper.myLooper() == Looper.getMainLooper()) {
            runPrint.run()
        } else {
            mainHandler.post(runPrint)
        }
    }

    private fun buildPrintAttributes(orientation: String): PrintAttributes {
        val mediaSize = if (orientation.equals("landscape", ignoreCase = true)) {
            PrintAttributes.MediaSize.NA_LETTER.asLandscape()
        } else {
            PrintAttributes.MediaSize.NA_LETTER.asPortrait()
        }
        return PrintAttributes.Builder()
            .setMediaSize(mediaSize)
            .build()
    }

    private fun sanitizePrintJobTitle(rawTitle: String): String {
        val cleaned = rawTitle
            .replace(Regex("[\\r\\n\\t\\p{Cntrl}]+"), " ")
            .trim()
            .take(120)
        return cleaned.ifEmpty { PRINT_DOCUMENT_NAME }
    }

    private fun JSONObject.optNonNullString(key: String): String {
        return if (isNull(key)) "" else optString(key, "")
    }

    private fun printHtmlDocument(
        printManager: PrintManager,
        jobTitle: String,
        htmlContent: String,
        attributes: PrintAttributes
    ) {
        cleanupPendingPrintWebView()
        try {
            val printWv = WebView(activity).apply {
                setBackgroundColor(Color.WHITE)
                settings.apply {
                    javaScriptEnabled = false
                    allowFileAccess = false
                    allowContentAccess = false
                    mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    loadWithOverviewMode = true
                    useWideViewPort = true
                }
            }
            pendingPrintWebView = printWv

            printWv.webViewClient = object : WebViewClient() {
                private var started = false

                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean {
                    return true
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    if (started || destroyed || activity.isFinishing || activity.isDestroyed) {
                        return
                    }
                    started = true
                    try {
                        val adapter = printWv.createPrintDocumentAdapter(jobTitle)
                        printManager.print(jobTitle, adapter, attributes)
                    } catch (_: Exception) {
                        Toast.makeText(activity, R.string.print_unavailable, Toast.LENGTH_SHORT).show()
                    }
                }
            }

            printWv.loadDataWithBaseURL(
                "https://${BuildConfig.ASSET_HOST}/",
                htmlContent,
                "text/html",
                "UTF-8",
                null
            )
        } catch (_: Exception) {
            cleanupPendingPrintWebView()
            Toast.makeText(activity, R.string.print_unavailable, Toast.LENGTH_SHORT).show()
        }
    }

    private fun cleanupPendingPrintWebView() {
        val existing = pendingPrintWebView ?: return
        pendingPrintWebView = null
        try {
            existing.stopLoading()
            existing.loadUrl("about:blank")
            existing.destroy()
        } catch (_: Exception) {
            // Best-effort teardown of ephemeral print WebView
        }
    }

    /** Cancels pending main-thread print callbacks and releases any offscreen print WebView. */
    fun destroy() {
        destroyed = true
        mainHandler.removeCallbacksAndMessages(null)
        cleanupPendingPrintWebView()
    }

    companion object {
        private val PRINT_DOCUMENT_NAME = BuildConfig.PRINT_DOCUMENT_NAME
    }
}
