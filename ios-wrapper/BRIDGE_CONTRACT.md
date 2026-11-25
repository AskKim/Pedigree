# iOS WKWebView Native SQLite Storage Bridge Contract

## Why Native Storage Routing Is Mandatory on iOS

Under Apple WebKit / WKWebView, browser-managed client storage (`IndexedDB`, `localStorage`, and OPFS inside transient containers) is vulnerable to **7-day Intelligent Tracking Prevention (ITP) eviction** and aggressive OS memory/disk reclamation.

To guarantee zero data loss, `@engine/bridge` (`PlatformBridge`) detects `ios-wkwebview` (`requiresIosStorageBridge === true`) and `@engine/storage` (`createResilientStorageAdapter`) **always routes persistence through `NativeBridgeStorageAdapter`** rather than falling back to WebKit `IndexedDB` or `localStorage`.

## 1. Host Script Message Registration

Register a Swift `WKScriptMessageHandler` named `"nativeStorage"` (or the configured `nativeBridgeKey`, e.g., `"pedigreeNative"`):

```swift
let contentController = WKUserContentController()
contentController.add(storageBridgeHandler, name: "pedigreeNative") // or "nativeStorage"
```

Inject the app SQLite database inside the persistent app sandbox container (never `Caches/` or `tmp/`):
- **Primary path:** `FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first` (with `isExcludedFromBackup` configured per user preference or FileProtection).
- **Schema:** Single durable KV table (`CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`).

## 2. JavaScript -> Swift Request Envelope

`PlatformBridge.invokeStorageBridge` posts:

```json
{
  "type": "NATIVE_STORAGE_OP",
  "requestId": "ios_storage_...",
  "replyGlobal": "__platformBridgeStorageReceive",
  "payload": {
    "action": "read | write | delete | list | vaultSnapshot",
    "key": "namespace:entry-key",
    "data": "{\"encoding\":\"utf8\",\"payload\":\"...\"}",
    "options": {
      "prefix": "namespace:"
    }
  }
}
```

### Supported `action` Values
- `read`: Look up `payload.key` in SQLite `kv_store`; return `data: String | null`.
- `write`: Upsert `(payload.key, payload.data)` atomically (`sqlite3_exec` / transaction).
- `delete`: Remove row matching `payload.key`.
- `list`: Return string array `data: string[]` of keys matching `payload.options.prefix` (if provided).
- `vaultSnapshot`: Mirror an emergency/rolling snapshot file into `Application Support/vault/`.

## 3. Swift -> JavaScript Reply Dispatch

Swift MUST evaluate the reply callback (`replyGlobal`) on the main actor with the matching `requestId`:

```swift
func sendReply(requestId: String, ok: Bool, data: Any? = nil, error: String? = nil) {
    var response: [String: Any] = ["requestId": requestId, "ok": ok]
    if let data = data { response["data"] = data }
    if let error = error { response["error"] = error }
    guard let jsonData = try? JSONSerialization.data(withJSONObject: response),
          let jsonString = String(data: jsonData, encoding: .utf8) else { return }
    DispatchQueue.main.async {
        self.webView.evaluateJavaScript("window.__platformBridgeStorageReceive(\(jsonString));", completionHandler: nil)
    }
}
```

- `PlatformBridge` enforces a configurable timeout (`iosStorageTimeoutMs`, default `5000ms`) and rejects timed-out promises with `{ ok: false, requestId, error }`.
