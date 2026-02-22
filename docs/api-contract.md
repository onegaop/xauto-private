# API contract (V1)

## Public auth

- `GET /v1/auth/x/start`
- `GET /v1/auth/x/callback?code=...&state=...`

## Internal jobs (Cloud Scheduler)

- `POST /v1/internal/jobs/sync`
- `POST /v1/internal/jobs/digest/daily`
- `POST /v1/internal/jobs/digest/weekly`

Header:

- `Authorization: Bearer <INTERNAL_JOB_TOKEN>`

## Mobile read APIs (PAT)

- `GET /v1/mobile/digest/today`
- `GET /v1/mobile/digest/week`
- `GET /v1/mobile/items?limit=20&cursor=...`
- `GET /v1/mobile/items/:tweetId`

Header:

- `Authorization: Bearer <PAT>`

## Admin APIs (Google + internal token)

- `GET /v1/admin/providers`
- `POST /v1/admin/providers`
- `GET /v1/admin/jobs?limit=30`
- `POST /v1/admin/jobs/:name/run`
- `POST /v1/admin/pat`
- `DELETE /v1/admin/pat/:id`

Headers:

- `x-admin-email: you@example.com`
- `x-admin-internal-token: <ADMIN_INTERNAL_TOKEN>`

