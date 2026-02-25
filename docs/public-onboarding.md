# XAuto 外部接手指南（Public）

本文面向第一次接手 XAuto 的开发者，目标是让你在本地尽快跑通。

## 1. 先了解项目组成

- `apps/api`：NestJS + Fastify 后端（端口默认 `8080`）
- `apps/admin`：Next.js 管理后台（端口默认 `3000`）
- `apps/ios`：SwiftUI 客户端（可选）
- `packages/shared-types`：共享类型
- `infra/cloud-run`：Cloud Run 部署脚本

## 2. 前置条件

- Node.js `>=20`
- npm `>=10`
- 可用的 MongoDB（本地或 Atlas）
- 可选：Google OAuth Web 应用（用于 Admin 登录）
- 可选：X Developer 应用与第三方模型 API Key（用于真实业务链路）

## 3. 最小可跑（先把 API 启起来）

在仓库根目录执行：

```bash
npm install
cp apps/api/.env.example apps/api/.env
```

编辑 `apps/api/.env`，至少填这几项：

- `MONGODB_URI`：你的 MongoDB 连接串
- `ENCRYPTION_MASTER_KEY`：必须是 base64 编码的 32 字节密钥

生成 `ENCRYPTION_MASTER_KEY` 示例：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

建议本地先开安全模式（避免触发外部付费接口）：

- `BLOCK_PAID_EXTERNAL_APIS=true`

启动 API：

```bash
npm run dev:api
```

验证：

```bash
curl http://localhost:8080/healthz
```

返回 `{"ok":true,...}` 即表示后端启动成功。

## 4. 启动 Admin（推荐）

在仓库根目录执行：

```bash
cp apps/admin/.env.example apps/admin/.env
```

编辑 `apps/admin/.env`：

- `NEXTAUTH_URL=http://localhost:3000`
- `NEXTAUTH_SECRET`：任意高强度随机串（建议至少 32 字符）
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`：Google OAuth 凭据
- `GOOGLE_ALLOWED_EMAIL`：允许登录后台的邮箱（逗号分隔）
- `API_BASE_URL=http://localhost:8080`
- `ADMIN_INTERNAL_TOKEN`：要和 `apps/api/.env` 中的 `ADMIN_INTERNAL_TOKEN` 一致

同时确认 `apps/api/.env`：

- `ADMIN_ALLOWED_EMAILS` 包含同一个管理员邮箱

启动 Admin：

```bash
npm run dev:admin
```

浏览器打开 `http://localhost:3000`，使用 Google 登录后进入 Dashboard。

## 5. 第一次进入 Dashboard 建议做的事

1. 在 `Providers` 配置至少一个可用模型供应商与 API Key。
2. 在 `PAT` 区域创建一个 token（只会展示一次，立刻保存）。
3. 手动运行 `sync` 作业，确认任务可执行。
4. 用 PAT 调用移动端接口做冒烟检查。

PAT 冒烟示例：

```bash
curl -H "Authorization: Bearer <你的PAT>" \
  "http://localhost:8080/v1/mobile/summary/stats?range=7d"
```

## 6. 常见问题

### `ENCRYPTION_MASTER_KEY must be base64-encoded 32 bytes`

你的密钥格式不对，重新按文档命令生成并替换。

### Admin 接口返回 401

检查 3 件事是否同时成立：

- `x-admin-email` 在 `ADMIN_ALLOWED_EMAILS` 里
- Admin 的登录邮箱在 `GOOGLE_ALLOWED_EMAIL` 里
- `ADMIN_INTERNAL_TOKEN` 在 API/Admin 两边一致

### `/v1/auth/x/start` 返回 503

如果 `BLOCK_PAID_EXTERNAL_APIS=true`，X OAuth 与部分外部调用会被主动阻断，这是预期行为。

### 看得到页面但没有业务数据

通常是还没配置 Provider 或还没成功跑过 `sync`。

## 7. 进一步文档

- 运行手册：`docs/runbook.md`
- API 契约：`docs/api-contract.md`
- Cloud Run 相关：`infra/cloud-run/README.md`
