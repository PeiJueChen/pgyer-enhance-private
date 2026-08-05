---
type: Architecture
title: Frontend Architecture
description: Angular 14 frontend — module structure, components, services, pipes, deferred bootstrap pattern, and key source files.
tags: [frontend, angular, architecture]
---

# Frontend Architecture

The Angular frontend lives under `src/` and is built with Angular CLI 14.2.0. It is a **module-based** (not standalone) Angular 14 application with no router.

## Module Structure

`src/app/app.module.ts` is the root `AppModule`. It declares all components and pipes, and imports:

- `BrowserModule`, `HttpClientModule`, `FormsModule`, `PlatformModule`

There is no `AppRoutingModule` — the app has a single view driven by URL query parameters.

## Deferred Bootstrap

The standard Angular bootstrap is replaced with a deferred pattern in `src/main.ts` and `src/index.html`:

1. `src/index.html` injects a `<script>` tag that fetches `/appdownload/init` from the [Cloud Function](cloud-functions.md).
2. That script populates `window['deviceData']` with base64-encoded project/store configuration.
3. Once `deviceData` is set, `window['bootstrap']()` is called.
4. `main.ts` checks for `window['deviceData']` — if present, it bootstraps immediately; if not, it exposes `window['bootstrap']` for the external script to call.

This ensures the app has device configuration available before any component renders.

## Components

### AppComponent (`src/app/app.component.ts`)

The root component orchestrates the entire application flow:

1. Reads URL params: `app`, `env`, `platform`
2. Reads `window['deviceData']`, decodes the base64 payload, finds the matching project by app name
3. Resolves the Pgyer channel and API key for the platform/env combination
4. Calls `DataService.getVersionsReal()` to fetch versions from the Cloud Function
5. Filters versions by environment (uat/prd) using tags in `buildUpdateDescription`
6. Stores versions in [`AppDataService`](#appdataservice) for child components
7. Manages the password gate (some apps require an install password)
8. Contains a hidden admin unlock: 6+ rapid clicks on the logo + password `"jason"`

Template (`app.component.html`) shows either a **password form** (if the app requires an install password) or a **version list** (`app-app-header-item` + `app-app-item`).

### AppHeaderItemComponent (`src/components/app-header-item/`)

Displays the **latest/primary version** as a card with app icon, platform badge, QR code, and install button. Key behaviors:

- Install triggers `window.open()` to the Pgyer install URL
- Shows an IPA download button for Aigens users on iOS
- Hidden admin: 6+ rapid clicks on the app name → delete-version prompt
- Embeds [`AppUpdateTextComponent`](#appupdatetextcomponent) for editable release notes
- After a deletion, fires `'versionsChanged'` on [`SubscribeService`](#subscribeservice) to refresh the list component

### AppItemComponent (`src/components/app-item/`)

Displays **older versions** (everything after the first). Key behaviors:

- Expandable/collapsible rows with install buttons
- Shows 6 items by default with an "All Versions" toggle
- **Drag-to-select** multi-delete mode: custom mouse event handling for checkbox selection
- Hidden admin: 6+ rapid clicks on the edit icon → enters batch-select + delete mode
- Subscribes to `SubscribeService` `'versionsChanged'` event to refresh after header-triggered deletions

### AppUpdateTextComponent (`src/components/app-update-text/`)

Simple component with an `@Input() item`. Provides a view/edit toggle for `buildUpdateDescription`. On save, calls the Cloud Function `/updateAppInfo` endpoint. Only visible to Aigens users (`isAigensUser` flag).

## Services

All three services use `providedIn: 'root'` (singleton scope).

### DataService (`src/services/data-service.ts`)

The HTTP/API layer. Provides generic `get()`, `post()`, `delete()` methods with `HttpClient`, plus Promise wrappers. Key endpoints:

| Method | Cloud Function Route | Purpose |
|--------|---------------------|---------|
| `getVersionsReal(app, env, platform)` | `GET /versions` | Fetch app builds |
| `deleteVersionReal(...)` | `POST /deleteversions` | Delete one or more builds |
| `updateAppInfoReal(...)` | `POST /updateAppInfo` | Update build description |
| `getIosInternalDownloadUrl(buildKey)` | `GET /iosInternalDownloadUrl` | Get IPA download URL |

It also has legacy methods for direct Pgyer API calls (`getAllVerions`, `getDeviceConfig`) that are bypassed in favor of the Cloud Function path.

The Cloud Function base URL is environment-dependent:
- **UAT:** `http://localhost:5001/pgyer-enhance/us-central1/appdownload`
- **PRD:** `https://us-central1-aigensstoretest.cloudfunctions.net/appdownload`

### AppDataService (`src/services/app-data.service.ts`)

Global mutable state store shared across all components. Holds all runtime state: `deviceConfig`, `currentAppInfo`, `realVerions`, `itemVersions`, `platform`, `env`, `app`, `apiKey`, `pgyerOriginalLink`, `isAigensUser`, `linkVersions`.

Key methods:

- `setVersions()` — splits the fetched versions: first → header item, rest → list items. Also supports filtering by URL hash (`#version1,version2`).
- `handleVersions()` — re-parses the Firebase response after mutations (e.g., after deleting a version).
- `getDownloadUrl(item)` — builds the Pgyer install URL with API key and optional password.
- `canShowIosIpaDownload()` — gate for the IPA download button (Aigens user + iOS platform).
- `setLocal()` / `getLocal()` — LocalStorage helpers that cache the last-known href.

### SubscribeService (`src/services/subscribe.service.ts`)

A simple event bus built on `Map<string, BehaviorSubject<any>>`. Exposes `getObservable(name)` and `next(name, value)`. Used for cross-component communication — primarily the `'versionsChanged'` event that allows `AppHeaderItemComponent` to notify `AppItemComponent` after a version deletion.

## Pipes

| Pipe | File | Transform |
|------|------|-----------|
| `bytesToMB` | `src/pipes/bytes-to-mb.pipe.ts` | Converts byte count → `"XX.XX MB"` string |
| `dateFormat` | `src/pipes/date-format.pipe.ts` | Extracts date portion from `"YYYY-MM-DD HH:mm:ss"` |

## Environments

| File | Values |
|------|--------|
| `src/environments/environment.ts` (dev) | `{ production: false, version: '1.2.1' }` |
| `src/environments/environment.prod.ts` | `{ production: true, version: '1.2.1' }` |

`angular.json` swaps these at build time via `fileReplacements`.

## Index.html Inline Scripts

`src/index.html` contains inline JavaScript for:
- **Viewport detection** — feature-detects `viewport-fit=cover` support
- **Device config injection** — dynamically loads the `/appdownload/init` script
- **Unsupported browser detection** — checks for Chrome ≤83 and shows a fallback UI
