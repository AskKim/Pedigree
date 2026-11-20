/*
 * Community Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

/**
 * Handles `REQUEST_PRINT` messages from `pedigreeBridge` using Android's [PrintManager]
 * and `webView.createPrintDocumentAdapter("Community Pedigree")`.
 *
 * Why is this bridge needed?
 * Inside Android `WebView`, calling JavaScript `window.print()` directly is a silent no-op.
 * Bridging `REQUEST_PRINT` to Android's native [PrintManager] lets users print pedigree
 * certificates, cage cards, and Barn Binders or export them via Android's built-in "Save as PDF".
 */
class PrintBridge(
    private val activity: AppCompatActivity,
    private val webViewProvider: () -> WebView?
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var destroyed = false

    /**
     * Opens the Android system print/PDF preview for the currently loaded WebView page.
     * Safe to invoke from any thread; marshals automatically onto the Android main thread because
     * `WebView.createPrintDocumentAdapter` must be called on the UI thread.
     */
    fun printCurrentPage() {
        val runPrint = Runnable {
            if (destroyed || activity.isFinishing || activity.isDestroyed) return@Runnable
            val wv = webViewProvider() ?: return@Runnable
            val printManager = activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager
            if (printManager == null) {
                Toast.makeText(activity, R.string.print_unavailable, Toast.LENGTH_SHORT).show()
                return@Runnable
            }

            try {
                val adapter = wv.createPrintDocumentAdapter(PRINT_DOCUMENT_NAME)
                val attributes = PrintAttributes.Builder().build()
                printManager.print(PRINT_DOCUMENT_NAME, adapter, attributes)
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

    /** Cancels pending main-thread print callbacks when the hosting Activity is destroyed. */
    fun destroy() {
        destroyed = true
        mainHandler.removeCallbacksAndMessages(null)
    }

    companion object {
        private const val PRINT_DOCUMENT_NAME = "Community Pedigree"
    }
}
