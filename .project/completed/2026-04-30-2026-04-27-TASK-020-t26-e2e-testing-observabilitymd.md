---
title: "E2E Testing & Observability"
created: 2026-04-27T02:00:00-03:00
last_updated: 2026-04-27T02:00:00-03:00
priority: P3
estimated_hours: 32
actual_hours: 0
status: backlog
type: tech-debt
value: medium
effort: large
blockers: []
tags: [testing, observability, sentry, quality]
depends_on: [T14, T15]
blocks: []
dependency_type: hard
related_files: [backend/testutil, frontend, backend/internal/middleware, backend/internal/repository]
---

# Task: E2E Testing & Observability

## Objective

Establish automated confidence for critical flows and production-grade monitoring.

**Success:**
- [ ] Critical UI and API flows are covered by automated tests.
- [ ] Errors/performance are observable through integrated monitoring.

## Context

**Why:**
As the system grows, regressions in core flows (login, post workflow, Google Ads sync) must be detected early, and runtime issues must be visible in production.

**Dependencies:**
- [ ] T14 completed
- [ ] T15 completed

## Implementation

### Phase 1 (Est: 12h)
- [ ] Setup Testcontainers for PostgreSQL integration tests.
- [ ] Add base integration test harness and fixtures.

### Phase 2 (Est: 10h)
- [ ] Implement Playwright E2E suite for critical UI flows.
- [ ] Add CI execution strategy for E2E and integration tests.

### Phase 3 (Est: 10h)
- [ ] Integrate Sentry in Go backend and Svelte frontend.
- [ ] Add N+1 query detection logging/reporting.

## Definition of Done

### Functionality
- [ ] Testcontainers integration tests run reliably.
- [ ] Playwright suite covers critical flows.
- [ ] Sentry captures frontend and backend exceptions.
- [ ] N+1 detection logging is active and actionable.
