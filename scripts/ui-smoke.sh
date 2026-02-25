#!/usr/bin/env bash
set -u

SKILL_SCRIPTS_DIR="${SKILL_SCRIPTS_DIR:-$HOME/.codex/skills/ios-simulator-skill/scripts}"
APP_BUNDLE_ID="${APP_BUNDLE_ID:-com.xauto.ai}"
SIMULATOR_NAME="${SIMULATOR_NAME:-iPhone 17 Pro}"
RESET_SIMULATOR="${RESET_SIMULATOR:-1}"
ARTIFACTS_ROOT="${ARTIFACTS_ROOT:-/tmp/xauto-ui-smoke}"
IOS_PROJECT_PATH="${IOS_PROJECT_PATH:-$(cd "$(dirname "$0")/../apps/ios" && pwd)/XAuto.xcodeproj}"
IOS_SCHEME="${IOS_SCHEME:-XAutoApp}"
IOS_APP_NAME="${IOS_APP_NAME:-XAutoApp.app}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARTIFACTS_DIR="${ARTIFACTS_ROOT}/${STAMP}"
LOG_FILE="${ARTIFACTS_DIR}/run.log"

PASS_COUNT=0
FAIL_COUNT=0
FAILED_STEPS=()
STATE_DIRS=()

mkdir -p "${ARTIFACTS_DIR}"
touch "${LOG_FILE}"

log() {
  printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "${LOG_FILE}"
}

run_step() {
  local name="$1"
  shift
  log "STEP: ${name}"
  if "$@" >>"${LOG_FILE}" 2>&1; then
    PASS_COUNT=$((PASS_COUNT + 1))
    log "PASS: ${name}"
    return 0
  fi
  FAIL_COUNT=$((FAIL_COUNT + 1))
  FAILED_STEPS+=("${name}")
  log "FAIL: ${name}"
  return 1
}

run_optional_step() {
  local name="$1"
  shift
  log "STEP (optional): ${name}"
  if "$@" >>"${LOG_FILE}" 2>&1; then
    log "PASS (optional): ${name}"
    return 0
  fi
  log "WARN (optional): ${name}"
  return 1
}

capture_state() {
  local label="$1"
  local out_dir="${ARTIFACTS_DIR}/state-${label}"
  mkdir -p "${out_dir}"
  python3 "${SKILL_SCRIPTS_DIR}/app_state_capture.py" \
    --app-bundle-id "${APP_BUNDLE_ID}" \
    --output "${out_dir}" >>"${LOG_FILE}" 2>&1 || true
  STATE_DIRS+=("${out_dir}")
  log "STATE: ${out_dir}"
}

build_and_install_app() {
  local dd="${ARTIFACTS_DIR}/DerivedData"
  local app_path

  log "ACTION: build app for simulator install"
  if ! xcodebuild -project "${IOS_PROJECT_PATH}" \
    -scheme "${IOS_SCHEME}" \
    -configuration Debug \
    -destination "platform=iOS Simulator,name=${SIMULATOR_NAME}" \
    -derivedDataPath "${dd}" \
    build >>"${LOG_FILE}" 2>&1; then
    log "FAIL: build for install"
    return 1
  fi

  app_path="$(find "${dd}/Build/Products" -type d -name "${IOS_APP_NAME}" | head -n 1)"
  if [[ -z "${app_path}" ]]; then
    log "FAIL: cannot find built app (${IOS_APP_NAME})"
    return 1
  fi

  log "ACTION: install app to booted simulator (${app_path})"
  if ! xcrun simctl install booted "${app_path}" >>"${LOG_FILE}" 2>&1; then
    log "FAIL: simctl install"
    return 1
  fi

  log "PASS: build+install"
  return 0
}

try_tap() {
  local step_name="$1"
  shift
  local labels=("$@")
  local label
  for label in "${labels[@]}"; do
    if python3 "${SKILL_SCRIPTS_DIR}/navigator.py" --find-text "${label}" --tap >>"${LOG_FILE}" 2>&1; then
      PASS_COUNT=$((PASS_COUNT + 1))
      log "PASS: ${step_name} (matched: ${label})"
      return 0
    fi
  done
  FAIL_COUNT=$((FAIL_COUNT + 1))
  FAILED_STEPS+=("${step_name}")
  log "FAIL: ${step_name} (labels tried: ${labels[*]})"
  return 1
}

print_summary() {
  log "SUMMARY: pass=${PASS_COUNT}, fail=${FAIL_COUNT}"
  log "ARTIFACTS: ${ARTIFACTS_DIR}"
  if ((${#STATE_DIRS[@]} > 0)); then
    log "STATE_DIRS:"
    local p
    for p in "${STATE_DIRS[@]}"; do
      log "  - ${p}"
    done
  fi
  if ((${#FAILED_STEPS[@]} > 0)); then
    log "FAILED_STEPS:"
    local s
    for s in "${FAILED_STEPS[@]}"; do
      log "  - ${s}"
    done
  fi
}

main() {
  log "ui-smoke start (simulator=${SIMULATOR_NAME}, app=${APP_BUNDLE_ID})"
  log "skill scripts: ${SKILL_SCRIPTS_DIR}"

  run_step "health-check" bash "${SKILL_SCRIPTS_DIR}/sim_health_check.sh"
  if ! command -v idb >/dev/null 2>&1; then
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILED_STEPS+=("require-idb")
    log "FATAL: 'idb' not found. UI semantic navigation in ios-simulator-skill requires idb."
    log "INSTALL: brew tap facebook/fb && brew install idb-companion"
    print_summary
    exit 1
  fi

  if [[ "${RESET_SIMULATOR}" == "1" ]]; then
    run_optional_step "shutdown-sim" python3 "${SKILL_SCRIPTS_DIR}/simctl_shutdown.py" --name "${SIMULATOR_NAME}" --verify
    run_optional_step "erase-sim" python3 "${SKILL_SCRIPTS_DIR}/simctl_erase.py" --name "${SIMULATOR_NAME}" --verify
  fi

  run_step "boot-sim" python3 "${SKILL_SCRIPTS_DIR}/simctl_boot.py" --name "${SIMULATOR_NAME}" --wait-ready --timeout 120 || {
    capture_state "boot-failed"
    print_summary
    exit 1
  }

  if ! run_step "launch-app" python3 "${SKILL_SCRIPTS_DIR}/app_launcher.py" --launch "${APP_BUNDLE_ID}"; then
    log "ACTION: launch failed, trying build+install fallback"
    if build_and_install_app && run_step "launch-app-retry" python3 "${SKILL_SCRIPTS_DIR}/app_launcher.py" --launch "${APP_BUNDLE_ID}"; then
      log "PASS: recovered by build+install fallback"
    else
      capture_state "launch-failed"
      print_summary
      exit 1
    fi
  fi

  run_step "screen-map-initial" python3 "${SKILL_SCRIPTS_DIR}/screen_mapper.py"
  capture_state "initial"

  try_tap "tap-today-tab" "Today" "今日" || capture_state "tap-today-failed"
  capture_state "today"

  try_tap "tap-week-tab" "Week" "周摘要" || capture_state "tap-week-failed"
  run_step "week-refresh" python3 "${SKILL_SCRIPTS_DIR}/gesture.py" --refresh || capture_state "week-refresh-failed"
  capture_state "week"

  try_tap "tap-settings-tab" "Settings" "设置" || capture_state "tap-settings-failed"
  run_step "settings-screen-map" python3 "${SKILL_SCRIPTS_DIR}/screen_mapper.py"
  try_tap "find-save-test-button" "Save & Test" "保存并测试" || true
  capture_state "settings"

  run_step "accessibility-audit" python3 "${SKILL_SCRIPTS_DIR}/accessibility_audit.py" --verbose
  run_step "log-monitor" python3 "${SKILL_SCRIPTS_DIR}/log_monitor.py" --app "${APP_BUNDLE_ID}" --severity warning --duration 8s || true
  run_step "terminate-app" python3 "${SKILL_SCRIPTS_DIR}/app_launcher.py" --terminate "${APP_BUNDLE_ID}" || true

  print_summary
  if ((FAIL_COUNT > 0)); then
    exit 1
  fi
}

main "$@"
