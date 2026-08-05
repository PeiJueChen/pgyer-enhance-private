---
type: Workflow
title: Version Management Workflow
description: Hidden admin features for managing app versions — deleting builds, editing release notes, and downloading iOS IPAs. Covers admin unlock, delete flows, and cross-component refresh.
tags: [workflow, admin, version-management]
---

# Version Management Workflow

Version management features (delete, edit, IPA download) are **hidden admin features** — not visible to regular users. They are unlocked through a specific interaction pattern.

## Admin Unlock

Admin mode is activated by:

1. **6+ rapid clicks** on the app name (in `AppHeaderItemComponent`) or the edit icon (in `AppItemComponent`)
2. A password prompt appears
3. Entering password `"jason"` unlocks admin features

Once unlocked, the `isAigensUser` flag is set to `true` in [`AppDataService`](../architecture/frontend.md#appdataservice), which gates the visibility of admin UI elements.

## Delete Version Flow

### Single Delete (from Header)

1. Admin clicks the app name 6+ times rapidly in `AppHeaderItemComponent`
2. A delete prompt appears for the latest version
3. On confirm, `DataService.deleteVersionReal()` calls `POST /deleteversions` on the [Cloud Function](../architecture/cloud-functions.md)
4. The Cloud Function calls Pgyer's `/apiv2/app/buildDelete` and returns the updated version list
5. `AppDataService.handleVersions()` re-parses the response
6. `SubscribeService.next('versionsChanged', ...)` fires to notify `AppItemComponent` to refresh its list

### Batch Delete (from List)

1. Admin clicks the edit icon 6+ times rapidly in `AppItemComponent`
2. The list enters **batch-select mode** with checkboxes
3. **Drag-to-select** — custom mouse event handlers allow selecting multiple items by dragging across them
4. On confirm, selected build keys are sent to `POST /deleteversions` in a batch
5. The Cloud Function deletes each build and returns the updated list
6. `AppItemComponent` refreshes from `AppDataService`

## Edit Release Notes

1. Admin mode unlocks [`AppUpdateTextComponent`](../architecture/frontend.md#appupdatetextcomponent) (only visible when `isAigensUser` is true)
2. The component provides a view/edit toggle for `buildUpdateDescription`
3. On save, `DataService.updateAppInfoReal()` calls `POST /updateAppInfo` on the Cloud Function
4. The Cloud Function calls Pgyer's `/apiv2/app/updateApp` to persist the change

## iOS IPA Download

Available only when `canShowIosIpaDownload()` returns true (Aigens user + iOS platform):

1. Admin clicks the IPA download button in `AppHeaderItemComponent`
2. `DataService.getIosInternalDownloadUrl(buildKey)` calls `GET /iosInternalDownloadUrl` on the Cloud Function
3. The Cloud Function fetches the `.plist` from Pgyer and scrapes the `software-package` URL
4. The download URL is returned and the browser navigates to it

## Cross-Component Refresh

After any mutation from `AppHeaderItemComponent` (single delete), the `SubscribeService` event bus fires `'versionsChanged'`. `AppItemComponent` subscribes to this event and re-reads from `AppDataService` to refresh its list without a full page reload.

## Key Source Files

| File | Role |
|------|------|
| `src/components/app-header-item/app-header-item.component.ts` | Admin unlock, single delete, IPA download |
| `src/components/app-item/app-item.component.ts` | Batch delete, drag-to-select |
| `src/components/app-update-text/app-update-text.component.ts` | Editable release notes |
| `src/services/data-service.ts` | Delete/update/download API calls |
| `src/services/app-data.service.ts` | State management after mutations |
| `src/services/subscribe.service.ts` | Event bus for cross-component refresh |
