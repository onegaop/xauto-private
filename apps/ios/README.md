# XAuto iOS App

SwiftUI + WidgetKit iOS client for XAuto V1.

## Includes

1. Today digest view (themes, top items, synced bookmarks)
2. Week digest view (themes, risks, action list)
3. Item detail view (summary + open original X post)
4. Settings (API base URL + PAT pairing + connection test)
5. Home widget (Small / Medium) with App Group cache fallback

## Project Generation

```bash
cd /Users/eagleone/Documents/projects/XAuto/apps/ios
xcodegen
open XAuto.xcodeproj
```

## Required Xcode Setup

1. Set your Apple Team in both targets:
   - `XAutoApp`
   - `XAutoWidget`
2. Enable App Group `group.com.xauto.shared` for both targets.
3. Build and run on iOS 17+ device/simulator.

## First Run

1. Open **Settings** tab in app.
2. Fill:
   - `API Base URL` (default points to Cloud Run prod)
   - `PAT` from Admin dashboard
3. Tap **Save & Test**.
4. Pull to refresh in Today/Week.
