# XAuto Workflow Memory

Last Updated: 2026-02-24

## CI/CD Current State

### 1) Xcode Cloud (Apple Stack)

- Workflow: `PR-Smoke`
  - ID: `d3962b78-49c7-472f-9a56-a12d028eec6d`
  - Trigger: Pull Request (source `*` -> destination `main`)
  - Action: `TEST`
  - Scheme/Test Plan: `XAutoApp` + `XAutoPR`
  - Status: Enabled

- Workflow: `Nightly-Full`
  - ID: `d916b4c1-44eb-4861-b65b-618c5b871752`
  - Trigger: Scheduled (`DAILY`, `01:00 UTC`, branch `main`)
  - Action: `TEST`
  - Scheme/Test Plan: `XAutoApp` + `XAutoFull`
  - Status: Enabled

- Workflow: `Release-Gate`
  - ID: `9ac323a2-29d0-4874-b51a-f3c9a3c2e1ff`
  - Trigger: Manual branch trigger (`main`)
  - Action: `TEST`
  - Scheme/Test Plan: `XAutoApp` + `XAutoFull`
  - Status: Enabled

Notes:
- Old workflow `XAuto Main Build` has been removed.
- Temporary validation workflow has been removed.

### 2) GitHub Actions

- Workflow: `.github/workflows/ci.yml`
  - Name: `CI`
  - Trigger: PR to `main`
  - Purpose: Node validate pipeline (`check:console-log`, `typecheck`, `lint`, `test`, `build`)

- Workflow: `.github/workflows/ios-observe.yml`
  - Name: `iOS Observe`
  - Trigger: PR to `main` + `workflow_dispatch`
  - Purpose: non-blocking iOS test observation
  - Behavior:
    - `continue-on-error: true`
    - generates project via `xcodegen`
    - runs `xcodebuild test -testPlan XAutoPR`
    - uploads `ios-observe-xcresult` artifact (retention 21 days)

- Workflow: `.github/workflows/deploy.yml`
  - Name: `Deploy`
  - Trigger: push to `main`
  - Purpose: deploy `api` and `admin` to Cloud Run

## Required Check Constraint (Current)

- GitHub branch protection/rulesets API returns `403` for this private repo:
  - `Upgrade to GitHub Pro or make this repository public to enable this feature.`
- Therefore `PR-Smoke` cannot be set as GitHub required check at this moment.
- After upgrading repo plan, set `PR-Smoke` check as required on `main`.

