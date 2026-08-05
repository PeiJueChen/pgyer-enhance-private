---
type: Overview
title: PgyerEnhance — Quickstart
description: Entry point for the pgyer-enhance code wiki. Covers what the project is, how to set it up, and where to find each documentation section.
tags: [quickstart, overview]
---

# PgyerEnhance — Quickstart

## What This Project Is

**PgyerEnhance** is an Angular 14 app-installer/download portal. It fetches app build versions from the [Pgyer](https://www.pgyer.com) API (proxied through Firebase Cloud Functions), displays them as a versioned list with QR-code install links, and provides hidden admin features for version management (delete builds, edit release notes, download IPAs). The app is deployed via Firebase Hosting and has no client-side router — all state is driven by URL query parameters.

**Runtime version:** `1.2.1` (see `src/environments/environment.ts`).

## Quick Start

```bash
# Install dependencies
npm install

# Start Angular dev server (http://localhost:4200)
npm start          # or: ./start.sh

# Build for production
npm run build      # or: ./build.sh

# Deploy to Firebase Hosting (builds first, then deploys)
npm run deploy     # or: ./deploy.sh

# Run Cloud Functions locally (Firebase emulator)
./runfunction.sh
```

> **Note:** The frontend depends on `window['deviceData']` being injected by the Firebase `/init` endpoint before Angular bootstraps. During local dev, you may need to mock this or use the emulator pipeline (`runfunction.sh` + dev server).

## URL Parameters

The app reads its configuration entirely from URL query params:

| Param | Example | Purpose |
|-------|---------|---------|
| `app` | `bksg` | App/project identifier used to look up Pgyer channel and API key |
| `env` | `uat` / `prd` | Environment filter — controls which Cloud Function endpoint and which build versions are shown |
| `platform` | `ios` / `android` | Target platform for version filtering and download URLs |

## Architecture at a Glance

```
Browser
  └─ index.html loads Firebase /init script → sets window['deviceData']
  └─ Angular app bootstraps
       └─ AppComponent reads URL params + deviceData
       └─ DataService calls Firebase Cloud Function /versions
       └─ AppDataService splits versions (latest → header card, rest → list)
       └─ Renders version cards with QR codes + install buttons

Firebase Cloud Function (appdownload)
  └─ Express app proxies to Pgyer API
  └─ /init, /versions, /deleteversions, /updateAppInfo, /iosInternalDownloadUrl
```

For the full picture, see [Architecture Overview](architecture/overview.md).

## Documentation Sections

| Section | Page | What's Covered |
|---------|------|----------------|
| **Architecture** | [Overview](architecture/overview.md) | System topology, frontend/backend split, deployment model |
| | [Frontend](architecture/frontend.md) | Angular components, services, pipes, deferred bootstrap |
| | [Cloud Functions](architecture/cloud-functions.md) | Express API proxy, Pgyer integration, route reference |
| **Workflows** | [Version Display](workflows/version-display.md) | Core flow: URL → config → fetch → render |
| | [Version Management](workflows/version-management.md) | Admin features: delete, edit, IPA download |
| **Operations** | [Deployment](operations/deployment.md) | Build/deploy scripts, Firebase projects, gotchas |
| **Integrations** | [External APIs](integrations/index.md) | Pgyer API, device config API, Firebase services |
| **Testing** | [Testing Guide](testing.md) | Karma/Jasmine setup, coverage status |
| **Source Map** | [Source Map](source-map.md) | File-level navigation map |

## Key Concepts

- **Deferred bootstrap:** Angular does not start until `window['deviceData']` is populated by the `/init` Cloud Function script. See [Frontend Architecture](architecture/frontend.md).
- **Environment-gated versions:** Builds are filtered by `uat`/`prd` tags embedded in `buildUpdateDescription`. See [Version Display Workflow](workflows/version-display.md).
- **Hidden admin mode:** Activated by 6+ rapid clicks on the app name plus password `jason`. Unlocks delete, edit, and IPA-download features. See [Version Management Workflow](workflows/version-management.md).
- **Dual Firebase projects:** Hosting deploys to `pgyer-enhance`; Functions deploy to `aigensstoretest`. See [Deployment](operations/deployment.md).

## Backlog

- **GitHub Actions OpenWiki workflow** (`.github/workflows/openwiki-update.yml`): Scheduled CI for regenerating these docs. Infrastructure-only, not core app behavior.
- **Git sync scripts** (`sync_to_github.sh`, `sync_to_gitlab.sh`): Bidirectional sync tooling between GitLab and GitHub remotes. Not part of the runtime application.
