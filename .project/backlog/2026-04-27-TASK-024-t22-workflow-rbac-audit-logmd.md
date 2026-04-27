---
title: "Workflow RBAC & Audit Log"
created: 2026-04-27T02:00:00-03:00
last_updated: 2026-04-27T02:00:00-03:00
priority: P2
estimated_hours: 20
actual_hours: 0
status: backlog
type: feature
value: medium
effort: medium
blockers: []
tags: [rbac, audit, security, workflow]
depends_on: [T12, T14]
blocks: []
dependency_type: hard
related_files: [backend/internal/middleware, backend/internal/api/admin_posts.go, backend/migrations]
---

# Task: Workflow RBAC & Audit Log

## Objective

Enforce workflow permissions per role and record all mutations into an audit trail.

**Success:**
- [ ] Unauthorized approval attempt returns 403.
- [ ] Every successful post mutation writes to `audit_log`.

## Context

**Why:**
As a multi-tenant system, user actions must be permission-scoped (for example, creator can draft but cannot approve), and all changes must be auditable for compliance.

**Strategic Alignment:**
- [x] Technical foundation for future features (enterprise readiness)
- [x] Strategic alignment (security/multi-tenancy)

**Dependencies:**
- [ ] T12 completed
- [ ] T14 completed

## Implementation

### Phase 1 (Est: 8h)
- [ ] Map permissions (for example `approve:post`) to API endpoints.
- [ ] Add middleware enforcement for workflow actions.

### Phase 2 (Est: 7h)
- [ ] Create PostgreSQL `audit_log` table and repository.
- [ ] Log `action`, `user_id`, `before`, `after`, `entity_type`, `entity_id`.

### Phase 3 (Est: 5h)
- [ ] Add UI table at `/[tenant]/audit` with filters by user and entity.
- [ ] Add conditional UI action buttons based on active permissions.

## Definition of Done

### Functionality
- [ ] Non-owner user receives 403 when trying to approve post without permission.
- [ ] Every successful `PUT/POST` on post record creates `audit_log` entry.
- [ ] Logs are filterable by user and entity type.
