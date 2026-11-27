# Apple Wrapper Bridge Contract (iOS & macOS `WKWebView`)

Content-agnostic IPC contract between the React/TypeScript PWA (`@engine/bridge/platformBridge.ts`, `@engine/storage/nativeBridgeStorageAdapter.ts`) and a native Swift `WKWebView` host container.

## 1. Script Message Handler Registration
Register a `WKScriptMessageHandler` on `WKUserContentController` matching the host's configured `nativeBridgeKey` (default fallback: `"nativeStorage"` or `"appBridge"`):

```swift
contentController.add(bridgeHandler, name: configuredBridgeChannelName)
```

## 2. Request Envelope (`JS -> Swift`)
All storage operations post a structured dictionary to `window.webkit.messageHandlers.<channel>.postMessage(...)`:

```json
{
  "type": "NATIVE_STORAGE_OP",
  "requestId": "ios_storage_<timestamp>_<rand>",
  "replyGlobal": "__platformBridgeStorageReceive",
  "payload": {
    "action": "read | write | delete | list | vaultSnapshot",
    "key": "<namespace>:<key>",
    "data": "<utf8 or JSON-encoded base64 envelope>",
    "options": { "prefix": "<namespace>:", "dataEncoding": "base64" }
  }
}
```

## 3. Correlated Reply Dispatch (`Swift -> JS`)
Swift executes each operation asynchronously off the main thread, then dispatches the correlated reply on the main thread via `WKWebView.evaluateJavaScript(...)`:

```swift
window.__platformBridgeStorageReceive({
  requestId: "<matching requestId>",
  ok: true,
  data: <string | string[] | null>,
  error: <optional string>
})
```

- **Timeout ceiling:** Client defaults to `5000ms` (`iosStorageTimeoutMs`). Timed-out requests resolve `{ ok: false, requestId, error }` and log `IOS_STORAGE_BRIDGE_TIMEOUT`.
- **Origin guard:** Swift must reject messages whose `frameInfo.securityOrigin` does not match the bundled local app origin.
- **Zero domain coupling:** Swift handles only opaque string keys, string/binary payloads, print HTML, and file export bytes.
