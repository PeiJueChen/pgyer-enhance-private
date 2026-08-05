---
type: Operations
title: Deployment Guide
description: Build and deploy procedures for pgyer-enhance — scripts, dual Firebase projects, hosting vs functions deployment, and known gotchas.
tags: [deployment, operations, firebase]
---

# Deployment Guide

## Overview

The project deploys to **two Firebase projects**:

| Component | Project | Mechanism |
|-----------|---------|-----------|
| Angular app (Hosting) | `pgyer-enhance` | `firebase deploy --only hosting` |
| Cloud Functions | `aigensstoretest` | `firebase deploy --only functions --project aigensstoretest` |

## Build Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm start` / `start.sh` | `ng serve` | Angular dev server at `http://localhost:4200` |
| `npm run build` / `build.sh` | `rm -rf dist && ng build --configuration production` | Production build to `dist/pgyer-enhance` |
| `npm run deploy` | `ng build && firebase deploy` | Build + deploy everything (hosting + functions) |
| `deploy.sh` | `rm -rf dist && ng build --configuration production && firebase deploy --only hosting` | Deploy hosting only |
| `deploy_functins.sh` | `firebase deploy --only functions --project aigensstoretest` | Deploy functions to aigensstoretest |
| `runfunction.sh` / `functions/run.sh` | `NODE_ENV=development npm run serve` | Local Firebase functions emulator |

## Hosting Configuration

`firebase.json` configures Firebase Hosting:

- **Public directory:** `dist/pgyer-enhance`
- **SPA rewrite:** all paths (`**`) serve `/index.html`, except `/appdownload/*` which routes to the `appdownload` Cloud Function
- **Cache headers:** all HTML/JS/CSS/JSON files use `Cache-Control: no-store, no-cache, must-revalidate` — users always get the latest version

## Cloud Functions Deployment

Functions deploy separately via `deploy_functins.sh` to the `aigensstoretest` project:

```bash
firebase deploy --only functions --project aigensstoretest
```

### ⚠️ Orphaned Functions Warning

The deploy script warns about 8 functions that exist on the `aigensstoretest` server but are not in the local code:

> `applePaySession`, `batchStoresStatus`, `breadtalkApplePaySession`, `eftApplePaySession`, `epsonPoll`, `genkiApplePaySession`, `genkiApplePaySession2`, `starPoll`

Firebase will ask whether to delete these. **You must select "NO"** — these functions belong to other projects sharing the same Firebase project and must not be removed.

## Local Development

For local Cloud Function testing:

```bash
./runfunction.sh    # Starts Firebase emulator at localhost:5001
```

The frontend's `DataService` uses `http://localhost:5001/pgyer-enhance/us-central1/appdownload` as the UAT Cloud Function base URL, so the Angular dev server and the Firebase emulator work together during local development.

## CI/CD

The repository includes a GitHub Actions workflow (`.github/workflows/openwiki-update.yml`) that runs OpenWiki documentation updates on a daily schedule. This is infrastructure for maintaining these docs and does not affect the application deployment.

## Git Sync Scripts

`sync_to_github.sh` and `sync_to_gitlab.sh` are bidirectional sync scripts for mirroring between GitLab and GitHub remotes. They are developer tooling, not part of the deployment pipeline.

- GitHub remote: `git@github.com:PeiJueChen/pgyer-enhance-private.git`
- These scripts push incremental branch changes from one remote to the other.
