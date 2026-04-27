---
title: "Internal Scheduler & Automations"
created: 2026-04-27T02:00:00-03:00
last_updated: 2026-04-27T02:00:00-03:00
priority: P2
estimated_hours: 24
actual_hours: 0
status: backlog
type: feature
value: high
effort: medium
blockers: []
tags: [scheduler, automation, workers, email]
depends_on: [T14, TASK-020]
blocks: []
dependency_type: hard
related_files: [backend/internal/worker, backend/internal/api/admin_schedule.go, backend/migrations]
---

# Task: Internal Scheduler & Automations

## Objective

Replace manual scripts/crontabs with a UI-driven automation scheduler.

**Success:**
- [ ] Automations can be configured and executed from app-managed schedules.
- [ ] Users can view automation status and logs in UI.

## Context

**Why:**
Metrics collection and report generation currently rely on manual scripts/external cron. This must become native automation inside the platform.

**Dependencies:**
- [ ] T14 completed
- [ ] TASK-020 completed

## Implementation

### Phase 1 (Est: 8h)
- [ ] Implement gocron wrapper reading from `automations` table.
- [ ] Implement automation types: `metrics_collect`, `report_email`, `post_publish`.

### Phase 2 (Est: 8h)
- [ ] Implement execution runtime and run logs.
- [ ] Implement retry/error strategy.

### Phase 3 (Est: 8h)
- [ ] Implement email connector integration (Brevo/Sendible) for report sending.
- [ ] Implement UI to manage automation status and logs.

## Definition of Done

### Functionality
- [ ] Gocron reads active jobs from `automations`.
- [ ] Three automation types execute correctly.
- [ ] UI allows enable/disable and log inspection.
