# XAuto

XAuto 是一个个人 X 书签外脑系统。

## Monorepo 结构

- `apps/api`：NestJS + Fastify 后端服务
- `apps/admin`：Next.js 管理后台（Google 登录）
- `apps/ios`：SwiftUI + WidgetKit 客户端
- `packages/shared-types`：共享类型与契约
- `infra/cloud-run`：部署与调度脚本

## 当前核心能力

- X OAuth PKCE 接入
- 内部 sync/digest 任务链路
- MongoDB 集合与索引
- 基于 PAT 的移动端读取 API
- Provider 配置与 API Key 加密存储
- 预算闸门（70% 降级，100% 阻断 digest 模型）
- GitHub 私有仓库到 Cloud Run 的 CI/CD 工作流
- iOS 离线测试计划（`XAutoPR` / `XAutoFull`）与非阻断 `ios-observe` 观察轨

## 快速开始

1. 安装 Node.js 20+ 与 npm 10+。
2. 创建环境变量文件：

```bash
cp apps/api/.env.example apps/api/.env
cp apps/admin/.env.example apps/admin/.env
```

3. 至少配置 API 的 `MONGODB_URI` 与 `ENCRYPTION_MASTER_KEY`。
4. 安装依赖：

```bash
npm install
```

5. 启动 API 与 Admin：

```bash
npm run dev:api
npm run dev:admin
```

6. 详细接手步骤见：`docs/public-onboarding.md`

## Git 规则

- 不要在 `master` 上提交
- 使用功能分支：`codex/<feature-name>`
- 提交前移除新增的 `console.log`
- 本地有提交就必须推送到远端

## 文档索引

- 外部接手指南（推荐先读）：`docs/public-onboarding.md`
- API 契约：`docs/api-contract.md`
- GitHub 私有仓库配置：`docs/github-private-setup.md`
- 运行手册：`docs/runbook.md`
- V2 计划：`docs/implementation-plan-v2.md`
- 业务全景图：`docs/business-map-v2.md`
