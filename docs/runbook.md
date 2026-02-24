# XAuto V1 运行手册

## 本地启动

1. 安装 Node.js 20+。
2. 填写 `secrets.local.json`。
3. 创建环境变量文件：

```bash
cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env
```

4. 安装依赖并启用 Git Hook：

```bash
npm install
bash scripts/setup-git-hooks.sh
```

5. 启动 API 与 Admin：

```bash
npm run dev:api
npm run dev:admin
```

## 推送到 GitHub 私有仓库

```bash
git checkout -b codex/bootstrap-v1
bash scripts/create-private-repo.sh xauto-private
```

## GitHub Actions 必填 secrets

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL`

## GitHub Actions 必填 vars

- `GCP_PROJECT_ID`
- `GCP_REGION`（例如：`asia-east1`）
- `GAR_REPOSITORY`
- `CLOUD_RUN_API_SERVICE`
- `CLOUD_RUN_ADMIN_SERVICE`
- `API_BASE_URL`
- `ADMIN_BASE_URL`
- `ADMIN_ALLOWED_EMAILS`
- `GOOGLE_ALLOWED_EMAIL`
- `X_CLIENT_ID`
- `X_REDIRECT_URI`

## iOS 自动化测试体系（长期维护）

### 1. Apple 栈统一入口

- iOS 自动化统一使用：`xcodebuild + XCTest/XCUITest + simctl + xcresult`
- 默认测试计划：
  - `apps/ios/XAutoPR.xctestplan`
  - `apps/ios/XAutoFull.xctestplan`
- 两个 plan 都默认注入 `XAUTO_TEST_MODE=ui_offline_smoke`（离线 fixture 模式）

### 2. 防费用硬拦截（测试环境）

- API 环境变量开启：`BLOCK_PAID_EXTERNAL_APIS=true`
- 开启后会明确拒绝以下链路：
  - sync 触发（`/v1/internal/jobs/sync`、`/v1/admin/jobs/sync/run`）
  - X OAuth（`/v1/auth/x/start`、`/v1/auth/x/callback`、refresh token）
  - vocabulary lookup（`/v1/mobile/vocabulary/lookup`）
- 线上默认保持 `false`，行为不变

### 3. Xcode Cloud（主门禁）配置

- `PR-Smoke`（required）
  - 触发：PR -> `main`
  - Test Plan：`XAutoPR`
  - 环境：`XAUTO_TEST_MODE=ui_offline_smoke`
- `Nightly-Full`
  - 触发：每日定时
  - Test Plan：`XAutoFull`
- `Release-Gate`
  - 触发：手动
  - Test Plan：`XAutoFull`
  - 失败阻断发布

### 4. GitHub iOS 观察轨（非阻断）

- 工作流文件：`.github/workflows/ios-observe.yml`
- 执行：`xcodegen + xcodebuild test -testPlan XAutoPR`
- 策略：`continue-on-error: true`
- 产物：上传 `xcresult`（当前保留 21 天）

### 5. Branch Protection

- `main` required checks:
  - Xcode Cloud `PR-Smoke`
  - Node `validate`（现有 CI）
- `ios-observe` 不设 required（仅早反馈）

## Scheduler 初始化

API 部署完成后执行：

```bash
./infra/cloud-run/bootstrap-scheduler.sh <PROJECT_ID> <REGION> <API_BASE_URL> <INTERNAL_JOB_TOKEN>
```

## 同步频率控制

- 默认同步间隔为 `24` 小时（每日一次）。
- 可在 Admin 的 `Sync Schedule` 区块修改。
- 建议 Cloud Scheduler 保持每小时（或每 30 分钟）触发，由后端 interval gating 决定执行或跳过。
