#!/usr/bin/env bash
set -euo pipefail

REPO_NAME="${1:-xauto-private}"
CURRENT_BRANCH="$(git branch --show-current)"

if [[ "$CURRENT_BRANCH" == "master" ]]; then
  echo "Do not commit on master. Switch to main or codex/* branch first."
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install it and run: gh auth login"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Current directory is not a git repository."
  exit 1
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "Remote origin already exists: $(git remote get-url origin)"
else
  gh repo create "$REPO_NAME" --private --source=. --remote=origin
fi

git push -u origin "$CURRENT_BRANCH"

echo "Private repo is connected and branch is pushed."
