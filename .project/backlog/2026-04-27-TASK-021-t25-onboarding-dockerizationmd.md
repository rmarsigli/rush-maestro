---
title: "Onboarding & Dockerization"
created: 2026-04-27T02:00:00-03:00
last_updated: 2026-04-27T02:00:00-03:00
priority: P2
estimated_hours: 16
actual_hours: 0
status: backlog
type: enhancement
value: medium
effort: small
blockers: []
tags: [onboarding, docker, deploy]
depends_on: [T11, T14]
blocks: []
dependency_type: hard
related_files: [backend/internal/api/setup.go, backend/internal/api/health.go, Dockerfile]
---

# Task: Onboarding & Dockerization

## Objective

Deliver a first-run setup flow and production-ready container image for self-hosted use.

**Success:**
- [ ] First-run `/setup` flow creates initial admin when system is empty.
- [ ] Docker image ships Go binary with embedded SPA.

## Context

**Why:**
To onboard self-hosted users, the product needs guided setup and reproducible production packaging.

**Dependencies:**
- [ ] T11 completed
- [ ] T14 completed

## Implementation

### Phase 1 (Est: 6h)
- [ ] Add `setup_required` behavior to `/health` when users table is empty.
- [ ] Implement `/setup` route for initial admin creation.

### Phase 2 (Est: 10h)
- [ ] Create multi-stage `Dockerfile` (build UI, build Go, final runtime image).
- [ ] Embed SPA dist into Go binary through `embed.FS`.
- [ ] Validate startup and setup flow in containerized environment.

## Definition of Done

### Functionality
- [ ] `/health` reflects setup-required state correctly.
- [ ] `/setup` creates initial admin successfully.
- [ ] Docker image runs full app with embedded SPA.
