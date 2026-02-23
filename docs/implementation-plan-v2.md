# XAuto V2 Plan (Updated)

## Goals

- Keep current single-user architecture, but shift sync to **admin-configurable cadence**.
- Default sync cadence is **once per day** (`24h`), editable in Admin.
- Extend iOS roadmap with **on-device Apple Intelligence** integration via `Foundation Models` framework.

## Scope Changes vs Previous Plan

1. Sync cadence is no longer fixed operationally.
2. Admin now owns sync interval policy (`1..168` hours).
3. Internal scheduler calls may return `SKIPPED` before next due time.
4. iOS roadmap adds local LLM mode for generation/summarization/extraction.

## Current Architecture Additions

### Backend

- New admin endpoints:
  - `GET /v1/admin/sync-settings`
  - `POST /v1/admin/sync-settings`
- Sync runtime behavior:
  - Internal `/v1/internal/jobs/sync` respects interval policy.
  - Manual admin `Run Sync` forces execution regardless of interval.
- Default policy:
  - `syncIntervalHours = 24`

### Admin

- New `Sync Schedule` panel:
  - edit interval hours
  - display `lastRunAt` / `nextRunAt` / `updatedAt`

## iOS Roadmap Update

### Phase A (Current V1 stability)

- Keep remote-summary flow through backend.
- Complete App + Widget read-only experience.

### Phase B (Foundation Models integration)

- Add iOS-side AI mode selector:
  - `server` (current)
  - `on_device` (Foundation Models)
  - `hybrid` (fallback strategy)
- Add local tasks:
  - per-item re-summary
  - action extraction
  - quick digest rewrite for widget-friendly text
- Keep privacy-first behavior:
  - on-device first when capability is available
  - fallback to server model when unavailable

### Phase C (Operational hardening)

- Track per-mode quality and latency.
- Add telemetry for failure reasons and fallback rates.
- Tune prompts separately for server and on-device models.

## Milestones (New)

1. Week 1: Sync settings in Admin + backend gating + deploy.
2. Week 2: iOS App/Widget V1 polish + TestFlight stability.
3. Week 3-4: Foundation Models prototype path (`on_device` mode).
4. Week 5: Hybrid routing and quality comparison.
5. Week 6: Cost/performance tuning and release candidate.

