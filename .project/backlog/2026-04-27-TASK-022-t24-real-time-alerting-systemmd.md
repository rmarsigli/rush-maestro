---
title: "Real-time Alerting System"
created: 2026-04-27T02:00:00-03:00
last_updated: 2026-04-27T02:00:00-03:00
priority: P3
estimated_hours: 16
actual_hours: 0
status: backlog
type: feature
value: medium
effort: small
blockers: []
tags: [alerts, ui, monitoring]
depends_on: [T14]
blocks: []
dependency_type: hard
related_files: [backend/internal/api/admin_alerts.go, frontend/src/routes, frontend/src/lib/components]
---

# Task: Real-time Alerting System

## Objective

Turn alert records into an actionable inbox experience in UI with badge and quick actions.

**Success:**
- [ ] Alert badge updates with unread/open count.
- [ ] Users can resolve/ignore alerts from lateral drawer.

## Context

**Why:**
Monitoring alerts exist as DB records but lack a fast, visible interaction layer for day-to-day operations.

**Dependencies:**
- [ ] T14 completed

## Implementation

### Phase 1 (Est: 5h)
- [ ] Implement `GET /admin/alerts/count` endpoint.
- [ ] Add navigation bar numeric badge.

### Phase 2 (Est: 6h)
- [ ] Implement Svelte lateral drawer component for quick alert management.
- [ ] Add mark as read / read-all actions.

### Phase 3 (Est: 5h)
- [ ] Polling or lightweight refresh strategy for near real-time behavior.
- [ ] UX polish and state consistency checks.

## Definition of Done

### Functionality
- [ ] `GET /admin/alerts/count` works and feeds navbar badge.
- [ ] Drawer supports resolve/ignore/read operations.
- [ ] Read-all behavior updates list and count correctly.