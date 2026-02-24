# API 契约（V1.5 / 当前）

## 公共认证接口

- `GET /v1/auth/x/start`
- `GET /v1/auth/x/callback?code=...&state=...`

## 内部任务接口（Cloud Scheduler）

- `POST /v1/internal/jobs/sync`
- `POST /v1/internal/jobs/digest/daily`
- `POST /v1/internal/jobs/digest/weekly`

说明：

- `sync` 支持间隔门控（默认 24 小时）。
- 若调用时间早于下一次可执行时间，返回 `status: "SKIPPED"` 和 `nextRunAt`。
- 当 sync 插入了新条目时，可能自动触发 daily digest（带冷却保护）。
- 当 `BLOCK_PAID_EXTERNAL_APIS=true` 时，`sync` 会直接返回 `503`（测试期禁止付费外部调用）。

请求头：

- `Authorization: Bearer <INTERNAL_JOB_TOKEN>`

## 移动端读取接口（PAT）

- `GET /v1/mobile/digest/today`
- `GET /v1/mobile/digest/week`
- `GET /v1/mobile/digest/history?period=daily|weekly&limit=10&cursor=...`
- `GET /v1/mobile/summary/stats?range=7d|30d|90d`
- `GET /v1/mobile/items?limit=20&cursor=...`
- `GET /v1/mobile/items/:tweetId`
- `POST /v1/mobile/vocabulary/lookup`

请求头：

- `Authorization: Bearer <PAT>`

`/v1/mobile/vocabulary/lookup` 请求体示例：

```json
{
  "term": "vector",
  "context": "This model uses vector search for retrieval.",
  "sourceLangHint": "en",
  "targetLang": "zh-CN"
}
```

测试环境说明：

- 当 `BLOCK_PAID_EXTERNAL_APIS=true` 时，`POST /v1/mobile/vocabulary/lookup` 返回 `503`。
- 当 `BLOCK_PAID_EXTERNAL_APIS=true` 时，`GET /v1/auth/x/start` 与 `GET /v1/auth/x/callback` 返回 `503`。

## Admin 接口（Google + Internal Token）

- `GET /v1/admin/providers`
- `POST /v1/admin/providers`
- `GET /v1/admin/prompts`
- `POST /v1/admin/prompts`
- `GET /v1/admin/sync-settings`
- `POST /v1/admin/sync-settings`
- `GET /v1/admin/jobs?limit=30`
- `POST /v1/admin/jobs/:name/run`
- `POST /v1/admin/pat`
- `DELETE /v1/admin/pat/:id`

请求头：

- `x-admin-email: you@example.com`
- `x-admin-internal-token: <ADMIN_INTERNAL_TOKEN>`

## V2 规划接口（未上线）

- `POST /v1/mobile/search/ask`
- `POST /v1/mobile/search/feedback`
- `GET /v1/admin/search/stats`
- `GET /v1/admin/search/feedback`
