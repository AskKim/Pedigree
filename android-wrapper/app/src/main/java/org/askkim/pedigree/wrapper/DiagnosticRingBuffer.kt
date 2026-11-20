/*
 * Community Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Fixed-capacity (100-entry) synchronized circular ring buffer for native wrapper diagnostics.
 *
 * Design goals for low-RAM Android 8+ phones and privacy:
 * - **Zero heap churn**: backed by a single pre-allocated `Array<DiagnosticEvent?>(100)`—no
 *   `LinkedList` node allocations, no `removeAt(0)` array shifts, and zero disk log files.
 * - **60s burst deduplication**: identical consecutive `(level, code, message)` events within
 *   60 seconds increment `repeatCount` in place instead of flooding the buffer.
 * - **PII & secret stripping**: [sanitizeUrl] strips query parameters, fragments, and `user:pass@`
 *   userinfo, and [sanitizeMessage] bounds messages to 240 chars at insert time.
 */
class DiagnosticRingBuffer {

    data class DiagnosticEvent(
        val timestampMs: Long,
        val level: String,
        val code: String,
        val message: String,
        val repeatCount: Int = 1
    )

    private val lock = Any()
    private val buffer = arrayOfNulls<DiagnosticEvent>(CAPACITY)
    private var startIndex = 0
    private var count = 0

    /**
     * Records a sanitized diagnostic event in O(1) time. Thread-safe across WebView, I/O, and UI threads.
     */
    fun record(level: String, code: String, message: String) {
        val normalizedLevel = when (level.trim().lowercase(Locale.US)) {
            LEVEL_ERROR -> LEVEL_ERROR
            LEVEL_WARN -> LEVEL_WARN
            else -> LEVEL_INFO
        }
        val normalizedCode = code.trim()
            .ifEmpty { "EVENT" }
            .take(MAX_CODE_CHARS)
        val sanitizedMessage = sanitizeMessage(message)
        val nowMs = System.currentTimeMillis()

        synchronized(lock) {
            if (count > 0) {
                val lastIndex = (startIndex + count - 1) % CAPACITY
                val last = buffer[lastIndex]
                if (last != null &&
                    last.level == normalizedLevel &&
                    last.code == normalizedCode &&
                    last.message == sanitizedMessage &&
                    (nowMs - last.timestampMs) <= DEDUP_WINDOW_MS
                ) {
                    buffer[lastIndex] = last.copy(
                        timestampMs = nowMs,
                        repeatCount = (last.repeatCount + 1).coerceAtMost(9999)
                    )
                    return
                }
            }

            val event = DiagnosticEvent(
                timestampMs = nowMs,
                level = normalizedLevel,
                code = normalizedCode,
                message = sanitizedMessage,
                repeatCount = 1
            )
            if (count < CAPACITY) {
                val writeIndex = (startIndex + count) % CAPACITY
                buffer[writeIndex] = event
                count += 1
            } else {
                buffer[startIndex] = event
                startIndex = (startIndex + 1) % CAPACITY
            }
        }
    }

    /** Returns an ordered chronological copy (oldest -> newest) of buffered events. */
    fun snapshot(): List<DiagnosticEvent> {
        synchronized(lock) {
            if (count == 0) return emptyList()
            val result = ArrayList<DiagnosticEvent>(count)
            for (i in 0 until count) {
                val item = buffer[(startIndex + i) % CAPACITY]
                if (item != null) {
                    result.add(item)
                }
            }
            return result
        }
    }

    /** Returns the current number of buffered events (`0..100`). */
    fun count(): Int {
        synchronized(lock) {
            return count
        }
    }

    /**
     * Serializes buffered events into a compact JSON array (short keys `ts`, `lvl`, `code`, `msg`,
     * optional `n` when `repeatCount > 1`) to minimize clipboard and AI-triage token size.
     */
    fun toCompactJsonArray(): JSONArray {
        val events = snapshot()
        val array = JSONArray()
        for (event in events) {
            val obj = JSONObject()
            obj.put("ts", formatTimestampUtc(event.timestampMs))
            if (event.level.isNotEmpty()) obj.put("lvl", event.level)
            if (event.code.isNotEmpty()) obj.put("code", event.code)
            if (event.message.isNotEmpty()) obj.put("msg", event.message)
            if (event.repeatCount > 1) obj.put("n", event.repeatCount)
            array.put(obj)
        }
        return array
    }

    companion object {
        const val CAPACITY = 100
        const val MAX_MESSAGE_CHARS = 240
        const val MAX_CODE_CHARS = 48
        private const val DEDUP_WINDOW_MS = 60_000L

        const val LEVEL_INFO = "info"
        const val LEVEL_WARN = "warn"
        const val LEVEL_ERROR = "error"

        private val EMBEDDED_URL_REGEX = Regex("https?://[^\\s\"'<>]+", RegexOption.IGNORE_CASE)
        private val LOCAL_TIME_FORMATTER: DateTimeFormatter =
            DateTimeFormatter.ofPattern("HH:mm:ss", Locale.US).withZone(ZoneId.systemDefault())

        /**
         * Strips `?query`, `#fragment`, and `user:pass@` authority credentials from a URL so tokens,
         * OAuth codes, and sensitive parameters can never enter diagnostics.
         */
        fun sanitizeUrl(rawUrl: String?): String {
            if (rawUrl.isNullOrBlank()) return ""
            val trimmed = rawUrl.trim()
            val qIdx = trimmed.indexOf('?')
            val hIdx = trimmed.indexOf('#')
            val cutIdx = when {
                qIdx >= 0 && hIdx >= 0 -> minOf(qIdx, hIdx)
                qIdx >= 0 -> qIdx
                hIdx >= 0 -> hIdx
                else -> trimmed.length
            }
            var base = trimmed.substring(0, cutIdx)
            val schemeSep = base.indexOf("://")
            if (schemeSep >= 0) {
                val authStart = schemeSep + 3
                val pathStart = base.indexOf('/', authStart).let { if (it < 0) base.length else it }
                val atIdx = base.indexOf('@', authStart)
                if (atIdx in authStart until pathStart) {
                    base = base.substring(0, authStart) + base.substring(atIdx + 1)
                }
            }
            return if (base.length > 160) base.substring(0, 157) + "..." else base
        }

        fun sanitizeMessage(rawMessage: String?): String {
            if (rawMessage.isNullOrBlank()) return ""
            val collapsed = rawMessage.replace('\r', ' ').replace('\n', ' ').trim()
            val stripped = EMBEDDED_URL_REGEX.replace(collapsed) { match ->
                sanitizeUrl(match.value)
            }
            return if (stripped.length > MAX_MESSAGE_CHARS) {
                stripped.substring(0, MAX_MESSAGE_CHARS - 3) + "..."
            } else {
                stripped
            }
        }

        fun formatTimestampUtc(timestampMs: Long): String {
            return DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(timestampMs))
        }

        fun formatLocalTimeShort(timestampMs: Long): String {
            return LOCAL_TIME_FORMATTER.format(Instant.ofEpochMilli(timestampMs))
        }
    }
}
