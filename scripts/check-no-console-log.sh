#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if rg -n --glob '!**/*.md' --glob '!**/node_modules/**' --glob '!**/dist/**' 'console\.log\(' apps packages; then
  echo "Found console.log in source files. Remove them before commit."
  exit 1
fi

echo "No console.log statements found in source files."
