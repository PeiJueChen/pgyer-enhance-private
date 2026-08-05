---
type: Reference
title: Testing Guide
description: Testing setup and coverage status for pgyer-enhance — Karma/Jasmine configuration, existing test stubs, and testing gaps.
tags: [testing, karma, jasmine]
---

# Testing Guide

## Framework

The project uses **Karma** with **Jasmine** for unit testing, as configured during Angular CLI project generation.

## Configuration

| File | Purpose |
|------|---------|
| `karma.conf.js` | Karma configuration — ChromeHeadless browser, ChromeHeadlessCI for CI environments, Istanbul code coverage |
| `tsconfig.spec.json` | TypeScript config for test compilation |
| `package.json` | `"test": "ng test"` script |

## Running Tests

```bash
npm test              # Runs ng test (Karma + Jasmine)
```

Karma is configured to use ChromeHeadless by default, with a `ChromeHeadlessCI` variant for CI environments that includes `--no-sandbox`.

## Existing Tests

Test coverage is minimal. The only spec file in the repository is:

- `src/app/app.component.spec.ts` — a basic test stub for `AppComponent`

No other component, service, or pipe has test coverage.

## Coverage Gaps

The following areas have no tests:

- **Services** — `DataService`, `AppDataService`, `SubscribeService` have no specs
- **Components** — `AppHeaderItemComponent`, `AppItemComponent`, `AppUpdateTextComponent` have no specs
- **Pipes** — `BytesToMBPipe`, `DateFormatPipe` have no specs
- **Cloud Functions** — `functions/http.js` has no test coverage (though `firebase-functions-test` is listed as a devDependency in `functions/package.json`)
- **E2E** — no end-to-end testing framework is configured

## Testing Notes

- The [deferred bootstrap](../architecture/frontend.md#deferred-bootstrap) pattern means components expect `window['deviceData']` to be present. Tests would need to mock this global.
- Cloud Function testing can use the Firebase emulator (`./runfunction.sh`) for integration-level checks.
