#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "Usage: $0 <PROJECT_ID> <REGION> <API_BASE_URL> <INTERNAL_JOB_TOKEN>"
  exit 1
fi

PROJECT_ID="$1"
REGION="$2"
API_BASE_URL="$3"
INTERNAL_JOB_TOKEN="$4"

JOB_SA="xauto-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"

create_job() {
  local name="$1"
  local schedule="$2"
  local endpoint="$3"

  gcloud scheduler jobs create http "$name" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --schedule "$schedule" \
    --time-zone "Asia/Shanghai" \
    --uri "${API_BASE_URL}${endpoint}" \
    --http-method POST \
    --headers "X-Internal-Job-Token=${INTERNAL_JOB_TOKEN}" \
    --oidc-service-account-email "$JOB_SA" \
    --oidc-token-audience "$API_BASE_URL" || \
  gcloud scheduler jobs update http "$name" \
    --project "$PROJECT_ID" \
    --location "$REGION" \
    --schedule "$schedule" \
    --time-zone "Asia/Shanghai" \
    --uri "${API_BASE_URL}${endpoint}" \
    --http-method POST \
    --headers "X-Internal-Job-Token=${INTERNAL_JOB_TOKEN}" \
    --oidc-service-account-email "$JOB_SA" \
    --oidc-token-audience "$API_BASE_URL"
}

create_job "xauto-sync" "*/30 * * * *" "/v1/internal/jobs/sync"
create_job "xauto-digest-daily" "30 8,21 * * *" "/v1/internal/jobs/digest/daily"
create_job "xauto-digest-weekly" "0 9 * * 1" "/v1/internal/jobs/digest/weekly"

echo "Scheduler jobs configured."
