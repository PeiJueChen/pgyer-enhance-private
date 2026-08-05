---
type: Workflow
title: Version Display Workflow
description: Core runtime flow — how the app loads device config, fetches versions from Pgyer via Cloud Functions, filters by environment, and renders the version list.
tags: [workflow, version-display, runtime]
---

# Version Display Workflow

This is the primary user-facing flow: loading the page, resolving configuration, fetching app versions, and rendering them.

## Step-by-Step Flow

### 1. Device Config Injection

Before Angular starts, `src/index.html` dynamically loads a script from `/appdownload/init` (served by the [Cloud Function](../architecture/cloud-functions.md)). That script:

1. Calls the Aigens device-config API
2. Encodes the result as base64
3. Injects it as `window['deviceData']`
4. Calls `window['bootstrap']()` to start Angular

### 2. URL Parameter Parsing

`AppComponent` (`src/app/app.component.ts`) reads three query params:

| Param | Purpose |
|-------|---------|
| `app` | Project/app identifier — used to look up the Pgyer channel and API key in device config |
| `env` | `uat` or `prd` — determines the Cloud Function base URL and version filtering |
| `platform` | `ios` or `android` — affects version filtering and download URL construction |

### 3. Device Config Resolution

The component decodes `window['deviceData']` from base64 (after stripping a junk-string prefix), then searches the config for a project matching the `app` param. From the matching project it extracts:

- Pgyer API key
- Pgyer app key / channel key
- App icon URL
- Install password (if any)

### 4. Version Fetch

`AppComponent` calls `DataService.getVersionsReal(app, env, platform)`, which sends `GET /versions` to the [Cloud Function](../architecture/cloud-functions.md). The Cloud Function proxies to Pgyer's `/apiv2/app/builds` with recursive pagination.

### 5. Environment Filtering

Versions are filtered by environment using tags embedded in each build's `buildUpdateDescription`. The `buildUpdateDescription` field contains environment markers (e.g., `uat` or `prd`) that `AppDataService.handleVersions()` parses to keep only versions matching the requested `env`.

### 6. Version Splitting

`AppDataService.setVersions()` splits the returned array:

- **First version** → stored as the header item (latest version) → rendered by [`AppHeaderItemComponent`](../architecture/frontend.md#appheaderitemcomponent)
- **Remaining versions** → stored as item versions → rendered by [`AppItemComponent`](../architecture/frontend.md#appitemcomponent)

Optional filtering by URL hash (`#version1,version2`) can further restrict which versions appear.

### 7. Rendering

- **Header card** shows the latest version with app icon, platform badge, QR code, and an install button. The install button opens the Pgyer install URL via `window.open()`.
- **Version list** shows older versions as expandable rows, 6 at a time, with an "All Versions" toggle.

### 8. Password Gate

If the app's device config specifies an install password, `AppComponent` shows a password form instead of the version list. The user must enter the correct password to proceed.

## State Management

All state flows through [`AppDataService`](../architecture/frontend.md#appdataservice), which is a singleton (`providedIn: 'root'`). Components read from it reactively; mutations (delete/edit) are applied directly to its arrays, and `handleVersions()` re-derives the header/list split.

## Key Source Files

| File | Role |
|------|------|
| `src/index.html` | Injects `/init` script, triggers deferred bootstrap |
| `src/main.ts` | Deferred bootstrap logic |
| `src/app/app.component.ts` | Orchestrates the entire flow |
| `src/services/data-service.ts` | HTTP calls to Cloud Function |
| `src/services/app-data.service.ts` | State store, version splitting, filtering |
