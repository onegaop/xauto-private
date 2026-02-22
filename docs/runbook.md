# XAuto V1 runbook

## Local bootstrap

1. Install Node.js 20+.
2. Fill `secrets.local.json`.
3. Create env files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env
```

4. Install dependencies and enable hook:

```bash
npm install
bash scripts/setup-git-hooks.sh
```

5. Start API and Admin:

```bash
npm run dev:api
npm run dev:admin
```

## GitHub private repo push

```bash
git checkout -b codex/bootstrap-v1
bash scripts/create-private-repo.sh xauto-private
```

## Required GitHub Actions secrets

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL`

## Required GitHub Actions vars

- `GCP_PROJECT_ID`
- `GCP_REGION` (for example: `asia-east1`)
- `GAR_REPOSITORY`
- `CLOUD_RUN_API_SERVICE`
- `CLOUD_RUN_ADMIN_SERVICE`
- `API_BASE_URL`
- `ADMIN_BASE_URL`
- `ADMIN_ALLOWED_EMAILS`
- `GOOGLE_ALLOWED_EMAIL`
- `X_CLIENT_ID`
- `X_REDIRECT_URI`

## Scheduler setup

After API is deployed:

```bash
./infra/cloud-run/bootstrap-scheduler.sh <PROJECT_ID> <REGION> <API_BASE_URL> <INTERNAL_JOB_TOKEN>
```

## Sync frequency control

- Default sync interval is `24` hours (once per day).
- You can update it in Admin: `Sync Schedule` section.
- Recommended Cloud Scheduler frequency: keep it hourly (or every 30 minutes) and let backend interval gating decide whether to execute or skip.
