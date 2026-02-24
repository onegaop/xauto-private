# GitHub 私有仓库配置

## 1. 确认当前分支不是 master

```bash
git branch --show-current
```

开发请使用功能分支：

```bash
git checkout -b codex/bootstrap-v1
```

## 2. 启用 pre-commit（检查 console.log）

```bash
bash scripts/setup-git-hooks.sh
```

## 3. 使用 GitHub CLI 创建私有仓库

```bash
bash scripts/create-private-repo.sh xauto-private
```

该命令会自动：

- 创建 GitHub 私有仓库
- 添加 `origin` 远端
- 推送本地分支并设置 upstream

## 4. 若远端已存在

```bash
git remote -v
git push -u origin codex/bootstrap-v1
```

## 5. 合并策略

- 从 `codex/*` 提 PR 到 `main`
- 在 GitHub 设置里保护 `main`
- required checks 建议至少包含：
  - Xcode Cloud `PR-Smoke`
  - GitHub Actions `validate`
- `ios-observe` 建议保留为非阻断观察轨
- 避免直接在 `master` 提交
