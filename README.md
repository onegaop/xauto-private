# XAuto

XAuto is a personal X bookmarks external-brain system.

## Monorepo layout

- `apps/api`: NestJS + Fastify backend.
- `apps/admin`: Next.js admin panel with Google login.
- `apps/ios`: SwiftUI + WidgetKit skeleton.
- `packages/shared-types`: shared contracts.
- `infra/cloud-run`: deployment and scheduler scripts.

## Core capabilities in this V1 scaffold

- X OAuth PKCE endpoints.
- Internal sync/digest jobs.
- MongoDB collections and indexes.
- PAT-based mobile read APIs.
- Provider config management with encrypted API keys.
- Budget gate (70% degrade, 100% block digest model).
- CI/CD workflows for GitHub private repo -> Cloud Run.

## Quick start

1. Install Node.js 20+ and npm 10+.
2. Fill local secrets in `secrets.local.json`.
3. Create app env files from `apps/api/.env.example` and `apps/admin/.env.example`.
4. Install dependencies:

```bash
npm install
```

5. Run backend and admin:

```bash
npm run dev:api
npm run dev:admin
```

## Git rules

- Do not commit on `master`.
- Use feature branches: `codex/<feature-name>`.
- Remove added `console.log` before commit.
- Push every local commit to remote branch.

## Additional docs

- API contract: `docs/api-contract.md`
- GitHub private setup: `docs/github-private-setup.md`
- Runbook: `docs/runbook.md`
- Updated plan: `docs/implementation-plan-v2.md`
