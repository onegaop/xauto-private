# Cloud Run / Scheduler setup

## Required Google Cloud resources

- Cloud Run service: API
- Cloud Run service: Admin
- Artifact Registry repository
- Workload Identity Federation for GitHub Actions
- Secret Manager entries:
  - `MONGODB_URI`
  - `ENCRYPTION_MASTER_KEY`
  - `X_CLIENT_SECRET`
  - `DEEPSEEK_API_KEY`
  - `DASHSCOPE_API_KEY`
  - `NEXTAUTH_SECRET`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `ADMIN_INTERNAL_TOKEN`

## Scheduler bootstrap

Use the helper script after API deployment:

```bash
./infra/cloud-run/bootstrap-scheduler.sh <PROJECT_ID> <REGION> <API_BASE_URL> <INTERNAL_JOB_TOKEN>
```

