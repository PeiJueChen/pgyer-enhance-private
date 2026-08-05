---
type: Architecture
title: Firebase Cloud Functions
description: The appdownload Cloud Function — an Express app proxying requests to the Pgyer API and Aigens device-config API. Route reference, caching behavior, and CORS/security.
tags: [cloud-functions, firebase, backend, architecture]
---

# Firebase Cloud Functions

The backend is a single HTTPS Cloud Function named `appdownload` that wraps an Express application. Source lives in `functions/`.

## Deployment Target

Functions deploy to the **`aigensstoretest`** Firebase project (not `pgyer-enhance`, which hosts the Angular app). See [Deployment](../operations/deployment.md).

## Runtime

| Property | Value |
|----------|-------|
| Runtime | Node.js 20 |
| Entry point | `functions/index.js` |
| Framework | Express 4 |
| Key deps | `firebase-functions` ^4.3.1, `firebase-admin` ^11.8.0, `cors` ^2.8.5 |

## Express Routes

`functions/index.js` defines the Express app with these routes:

| Method | Route | Handler | Purpose |
|--------|-------|---------|---------|
| `GET` | `/init` | `http.getDeviceConfig()` | Fetches store/app config from Aigens API, returns base64-encoded config as a JS snippet for `index.html` to inject as `window['deviceData']` |
| `GET` | `/versions` | `http.getAllVersions()` | Lists app builds from Pgyer API, filtered by platform/env/app |
| `GET` | `/iosInternalDownloadUrl` | `http.getIosInternalDownloadUrl()` | Fetches iOS `.plist` from Pgyer, extracts the `software-package` download URL |
| `POST` | `/deleteversions` | `http.deleteVersion()` | Deletes one or more builds from Pgyer by `buildKey`, returns updated list |
| `POST` | `/updateAppInfo` | `http.updateAppInfo()` | Updates a Pgyer build's `buildUpdateDescription` |

These routes are consumed by the Angular frontend's [`DataService`](frontend.md#dataservice).

## http.js — Upstream API Helpers

`functions/http.js` exports the functions that each Express route delegates to:

| Function | Upstream API | Purpose |
|----------|-------------|---------|
| `getDeviceConfig()` | `aigensstoretest.aigens.com/api/v1/store/config.json` | Fetches store/app config (API keys, project mappings) |
| `getAllVersions(apiKey, appKey, page, env)` | `pgyer.com/apiv2/app/builds` | Paginated fetch of all builds; filters by env (`uat`/`prd`) |
| `deleteVersion(apiKey, buildKey)` | `pgyer.com/apiv2/app/buildDelete` | Deletes a build |
| `updateAppInfo(apiKey, userKey, buildKey, desc)` | `pgyer.com/apiv2/app/updateApp` | Updates build metadata |
| `getIosInternalDownloadUrl(buildKey)` | `pgyer.com/app/plist/.../s.plist` | Scrapes plist XML for IPA download URL |

Low-level HTTP wrappers (`get()`, `getOriginal()`, `post()`, `post2()`) use Node's `https` module with JSON parsing.

## Module-Level Caching

`_deviceData` is a **module-level variable** — the device config is fetched once and reused across invocations within the same Cloud Function instance lifetime. This avoids repeated calls to the Aigens config API.

## Security

### CORS

The CORS whitelist allows only `https://pgyer-enhance.web.app`. In development mode (`NODE_ENV=development`), all origins are permitted.

### Referer Check

In production (`NODE_ENV != 'development'`), a middleware validates the `Referer` header hostname against the CORS whitelist. Requests with mismatched referers are rejected.

## Internal Data Flow

```
Cloud Function instance
  ├─ GET /init
  │    └─ http.getDeviceConfig() → Aigens API
  │    └─ Caches result in _deviceData
  │    └─ Returns base64 JS snippet
  │
  ├─ GET /versions?apiKey=...&appKey=...&env=...&platform=...
  │    └─ http.getAllVersions() → Pgyer /apiv2/app/builds
  │    └─ Recursive pagination (page 1, 2, ...)
  │    └─ Filters by environment
  │    └─ Returns JSON array
  │
  ├─ POST /deleteversions { buildKey, apiKey, appKey }
  │    └─ http.deleteVersion() → Pgyer /apiv2/app/buildDelete
  │    └─ Re-fetches updated version list
  │
  └─ POST /updateAppInfo { apiKey, userKey, buildKey, buildUpdateDescription }
       └─ http.updateAppInfo() → Pgyer /apiv2/app/updateApp
```

## Quirks

- **URL obfuscation:** Some upstream API URLs in `http.js` use string concatenation with `_` characters that are stripped via `.replace(/_/g, "")` — a light obfuscation pattern.
- **Recursive pagination:** `getAllVersions` uses a mutable module-level array (`allVersions`) that is reset at the start of each call, then populated by a recursive helper `_getAllVerions`.
- **Orphaned functions warning:** `deploy_functins.sh` warns about 8 functions that exist on the server but not in local code. The script says to **answer "NO"** when Firebase asks to delete them. See [Deployment](../operations/deployment.md).
