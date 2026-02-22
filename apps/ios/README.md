# XAuto iOS Skeleton

This folder contains SwiftUI + WidgetKit source skeleton for V1.

## Suggested Xcode targets

1. `XAutoApp` (iOS app, SwiftUI)
2. `XAutoWidget` (Widget extension)

If you use XcodeGen:

```bash
cd apps/ios
xcodegen
```

Project spec is in `project.yml`.

## Required runtime setup

- Add App Group: `group.com.xauto.shared`
- Store PAT token in Keychain after first pairing
- API base URL and PAT can be injected through app settings in debug builds

## Screens

- Today digest
- Week digest
- Item detail
- Settings (PAT pairing)
