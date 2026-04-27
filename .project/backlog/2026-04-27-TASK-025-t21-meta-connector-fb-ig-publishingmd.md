---
title: "t21-meta-connector-fb-ig-publishingmd"
created: 2026-04-27T02:00:00-03:00
last_updated: 2026-04-27T02:00:00-03:00
priority: P1
estimated_hours: 32
actual_hours: 0
status: backlog
type: feature
value: high
effort: large
blockers: []
tags: [meta, social, oauth, publishing]
depends_on: [T15, TASK-020]
blocks: []
dependency_type: hard
related_files: [backend/internal/connector/meta, backend/internal/api/oauth_meta.go, frontend/src/routes]
---

# Task: Meta Connector (FB/IG Publishing)

## Objective

Enable direct publishing from Rush Maestro to Facebook Pages and Instagram Business accounts using OAuth 2.0 and async media upload flow.

**Success:**
- [ ] Successful connection saves token to `integrations` table.
- [ ] Post status transitions to `published` only after Meta confirmation.

## Context

**Why:**
Users need direct social publishing from the platform, including robust handling of Meta asynchronous media pipeline.

**Business Value:**
- [x] Competitive feature (essential for a marketing CMS)
- [x] Direct revenue impact (higher stickiness for agency clients)

**Dependencies:**
- [ ] T15 completed
- [ ] TASK-020 completed

## Implementation

### Phase 1 (Est: 10h)
- [ ] Implement OAuth 2.0 endpoints: `/auth/meta/start` and `/auth/meta/callback`.
- [ ] Request scopes: `pages_manage_posts`, `instagram_content_publish`.
- [ ] Persist tokens and connection status into `integrations`.

### Phase 2 (Est: 14h)
- [ ] Implement image flow: upload container, poll container status, publish.
- [ ] Add account discovery endpoint/listing after connection (IG/FB).
- [ ] Add multi-image carousel support.

### Phase 3 (Est: 8h)
- [ ] Integrate publish action with post workflow status transition.
- [ ] Add UI badge "Publish to Meta" on approved posts.
- [ ] Add retries/error mapping and user-friendly messages.

## Definition of Done

### Functionality
- [ ] Successful connection saves token to `integrations` table.
- [ ] Post status changes to `published` after Meta API confirmation.
- [ ] UI shows "Publish to Meta" badge on approved posts.

## Technical Notes

Prerequisite: R2/S3 must be operational because Meta fetches media through public URLs. Implement in `internal/connector/meta/`.
