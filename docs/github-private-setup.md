# GitHub private repository setup

## 1. Ensure current branch is not master

```bash
git branch --show-current
```

Use a feature branch for development:

```bash
git checkout -b codex/bootstrap-v1
```

## 2. Enable pre-commit hook for console.log checks

```bash
bash scripts/setup-git-hooks.sh
```

## 3. Create private repo with GitHub CLI

```bash
bash scripts/create-private-repo.sh xauto-private
```

This command will:

- Create a GitHub private repo
- Add `origin` remote
- Push local branch and set upstream

## 4. If remote already exists

```bash
git remote -v
git push -u origin codex/bootstrap-v1
```

## 5. Merge policy

- Open PR from `codex/*` to `main`
- Keep `main` protected in GitHub settings
- Avoid direct commit to `master`

