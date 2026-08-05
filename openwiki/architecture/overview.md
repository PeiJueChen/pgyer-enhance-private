---
type: Architecture
title: System Architecture Overview
description: High-level architecture of pgyer-enhance — Angular frontend, Firebase Cloud Functions proxy, Pgyer API backend, and Firebase Hosting deployment topology.
tags: [architecture, overview]
---

# System Architecture Overview

## Three-Tier Structure

The system has three tiers connected through Firebase Hosting:

1. **Angular Frontend** (`src/`) — a module-based Angular 14 SPA with no router. State is driven by URL query params. It renders version lists and QR-code install links. See [Frontend Architecture](frontend.md).

2. **Firebase Cloud Functions** (`functions/`) — a single HTTPS function (`appdownload`) wrapping an Express app. It proxies requests to the Pgyer API and the Aigens device-config API. See [Cloud Functions](cloud-functions.md).

3. **External APIs** — primarily the [Pgyer](https://www.pgyer.com) REST API (`apiv2`) for build listing, deletion, and metadata updates, plus the Aigens store-config API for device/project configuration. See [External Integrations](../integrations/index.md).

## Request Flow

```
User browser
  │
  ├─ GET /index.html
  │    └─ index.html dynamically loads /appdownload/init script
  │       └─ Cloud Function fetches device config from Aigens API
  │       └─ Returns base64-encoded config as JS → window['deviceData']
  │       └─ Calls window['bootstrap']() to start Angular
  │
  └─ Angular AppComponent
       └─ Parses URL params (app, env, platform)
       └─ DataService.getVersionsReal() → GET /appdownload/versions
            └─ Cloud Function calls Pgyer /apiv2/app/builds
            └─ Returns filtered version list
       └─ Renders version cards (install buttons, QR codes)
```

## Firebase Hosting Routing

Firebase Hosting (`firebase.json`) serves the built Angular app from `dist/pgyer-enhance` and routes API calls to the Cloud Function:

| URL Pattern | Destination | Purpose |
|-------------|-------------|---------|
| `/appdownload/*` | `appdownload` Cloud Function | All backend API calls |
| `**` (everything else) | `/index.html` (SPA rewrite) | Angular app shell |

All HTML/JS/CSS/JSON responses include `Cache-Control: no-store` headers to ensure users always get the latest build.

## Dual Project Deployment

The project spans **two Firebase projects**:

| Component | Firebase Project | Config Source |
|-----------|-----------------|---------------|
| Hosting (Angular app) | `pgyer-enhance` | `.firebaserc` (default project) |
| Cloud Functions | `aigensstoretest` | `deploy_functins.sh` (`--project aigensstoretest`) |

This means the frontend and backend live in different Firebase projects and communicate over HTTPS. See [Deployment](../operations/deployment.md) for details.

## Component-to-Service Dependencies

The frontend's [service layer](frontend.md#services) bridges Angular components to the Cloud Function API:

- `AppComponent` depends on [`DataService`](frontend.md#dataservice) for HTTP calls and [`AppDataService`](frontend.md#appdataservice) for global state.
- `AppHeaderItemComponent` and `AppItemComponent` both read from `AppDataService` to display versions and trigger mutations (delete/edit) through `DataService`.
- [`SubscribeService`](frontend.md#subscribeservice) provides a `BehaviorSubject` event bus so the header component can notify the list component after a version deletion.

## Key Design Decisions

- **No Angular Router** — the app is single-page, entirely URL-param-driven. There is no `RouterModule` or route configuration.
- **Deferred Bootstrap** — Angular does not initialize until the `/init` Cloud Function populates `window['deviceData']`. See [Frontend Architecture](frontend.md).
- **Base64 Obfuscation** — device config and some API responses are base64-encoded with junk-string prefixes for light obfuscation. This is not security; it discourages casual inspection.
- **Module-level Caching** — the Cloud Function caches `_deviceData` at the module level for reuse across invocations within the same function instance.
