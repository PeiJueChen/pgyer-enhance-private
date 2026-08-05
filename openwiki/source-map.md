---
type: Reference
title: Source Map
description: File-level navigation map for the pgyer-enhance repository — key source files, their roles, and which wiki pages explain them.
tags: [source-map, reference, navigation]
---

# Source Map

## Root Config & Scripts

| File | Role | Docs |
|------|------|------|
| `package.json` | Angular 14 project config, npm scripts | [Quickstart](quickstart.md) |
| `angular.json` | Angular CLI config, environment file replacements | [Frontend](architecture/frontend.md) |
| `firebase.json` | Firebase Hosting + Functions config, SPA rewrite, `/appdownload/*` routing | [Cloud Functions](architecture/cloud-functions.md), [Deployment](operations/deployment.md) |
| `.firebaserc` | Default Firebase project: `pgyer-enhance` | [Deployment](operations/deployment.md) |
| `karma.conf.js` | Karma test runner config | [Testing](testing.md) |
| `tsconfig.json` / `tsconfig.app.json` / `tsconfig.spec.json` | TypeScript configs | — |
| `start.sh` | `ng serve` — Angular dev server | [Quickstart](quickstart.md) |
| `build.sh` | Production build (`ng build --configuration production`) | [Deployment](operations/deployment.md) |
| `deploy.sh` | Build + deploy hosting to Firebase | [Deployment](operations/deployment.md) |
| `deploy_functins.sh` | Deploy Cloud Functions to `aigensstoretest` | [Deployment](operations/deployment.md) |
| `runfunction.sh` | Start local Firebase functions emulator | [Deployment](operations/deployment.md) |
| `sync_to_github.sh` / `sync_to_gitlab.sh` | GitLab ↔ GitHub sync scripts | [Deployment](operations/deployment.md) |

## Frontend — `src/`

| File | Role | Docs |
|------|------|------|
| `src/index.html` | App shell, injects `/init` script, viewport/browser detection | [Frontend](architecture/frontend.md) |
| `src/main.ts` | Deferred Angular bootstrap | [Frontend](architecture/frontend.md) |
| `src/styles.scss` | Global styles, spinner animation | [Frontend](architecture/frontend.md) |
| `src/app/app.module.ts` | Root NgModule | [Frontend](architecture/frontend.md) |
| `src/app/app.component.ts` | Root component — orchestrates full flow | [Version Display](workflows/version-display.md) |
| `src/app/app.component.html` | Password gate / version list template | [Version Display](workflows/version-display.md) |
| `src/app/app.component.scss` | Root component styles | — |
| `src/app/app.component.spec.ts` | Test stub | [Testing](testing.md) |
| `src/components/app-header-item/` | Latest version card (QR, install, admin delete) | [Version Management](workflows/version-management.md) |
| `src/components/app-item/` | Older versions list (batch delete, drag-to-select) | [Version Management](workflows/version-management.md) |
| `src/components/app-update-text/` | Editable release notes (admin only) | [Version Management](workflows/version-management.md) |
| `src/services/data-service.ts` | HTTP layer — Cloud Function API calls | [Frontend](architecture/frontend.md#dataservice) |
| `src/services/app-data.service.ts` | Global state store — version splitting, filtering | [Frontend](architecture/frontend.md#appdataservice) |
| `src/services/subscribe.service.ts` | Event bus — cross-component refresh | [Frontend](architecture/frontend.md#subscribeservice) |
| `src/pipes/bytes-to-mb.pipe.ts` | Byte → MB pipe | [Frontend](architecture/frontend.md#pipes) |
| `src/pipes/date-format.pipe.ts` | Date extraction pipe | [Frontend](architecture/frontend.md#pipes) |
| `src/environments/environment.ts` | Dev environment config | [Frontend](architecture/frontend.md#environments) |
| `src/environments/environment.prod.ts` | Prod environment config | [Frontend](architecture/frontend.md#environments) |

## Cloud Functions — `functions/`

| File | Role | Docs |
|------|------|------|
| `functions/index.js` | Express app with 5 routes → `appdownload` function | [Cloud Functions](architecture/cloud-functions.md) |
| `functions/http.js` | Pgyer/Aigens API helper functions | [Cloud Functions](architecture/cloud-functions.md#httpjs--upstream-api-helpers) |
| `functions/package.json` | Node 20 runtime, Express/Firebase deps | [Cloud Functions](architecture/cloud-functions.md) |
| `functions/run.sh` | Local emulator start script | [Deployment](operations/deployment.md) |

## CI/Tooling

| File | Role | Docs |
|------|------|------|
| `.github/workflows/openwiki-update.yml` | Scheduled OpenWiki doc regeneration | [Quickstart](quickstart.md) |
| `AGENTS.md` / `CLAUDE.md` | OpenWiki brief for AI agents | — |
