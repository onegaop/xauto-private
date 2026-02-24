# Cloud Run / Scheduler 配置

## 必需的 Google Cloud 资源

- Cloud Run 服务：API
- Cloud Run 服务：Admin
- Artifact Registry 仓库
- GitHub Actions 的 Workload Identity Federation
- Secret Manager 条目：
  - `MONGODB_URI`
  - `ENCRYPTION_MASTER_KEY`
  - `X_CLIENT_SECRET`
  - `DEEPSEEK_API_KEY`
  - `DASHSCOPE_API_KEY`
  - `NEXTAUTH_SECRET`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `ADMIN_INTERNAL_TOKEN`

## Scheduler 初始化

API 部署完成后，执行以下脚本：

```bash
./infra/cloud-run/bootstrap-scheduler.sh <PROJECT_ID> <REGION> <API_BASE_URL> <INTERNAL_JOB_TOKEN>
```
