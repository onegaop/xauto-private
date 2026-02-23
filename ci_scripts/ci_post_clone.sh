#!/bin/sh
set -euo pipefail

echo "==> XAuto ci_post_clone: start"
echo "==> repo path: ${CI_PRIMARY_REPOSITORY_PATH:-$(pwd)}"

REPO_PATH="${CI_PRIMARY_REPOSITORY_PATH:-$(pwd)}"
IOS_PATH="$REPO_PATH/apps/ios"

if [ ! -d "$IOS_PATH" ]; then
  echo "error: iOS directory not found at $IOS_PATH" >&2
  exit 1
fi

if ! command -v xcodegen >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "==> xcodegen not found; installing via Homebrew"
    brew install xcodegen
  else
    echo "error: xcodegen is required but not found, and Homebrew is unavailable" >&2
    exit 1
  fi
fi

echo "==> generating Xcode project"
cd "$IOS_PATH"
xcodegen

if [ ! -d "$IOS_PATH/XAuto.xcodeproj" ]; then
  echo "error: XAuto.xcodeproj was not generated" >&2
  exit 1
fi

echo "==> XAuto ci_post_clone: done"
