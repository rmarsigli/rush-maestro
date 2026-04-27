---
title: "Unified LLM Connectors"
created: 2026-04-27T02:00:00-03:00
last_updated: 2026-04-27T02:00:00-03:00
priority: P1
estimated_hours: 24
actual_hours: 0
status: backlog
type: feature
value: high
effort: medium
blockers: []
tags: [ai, llm, backend, mcp]
depends_on: [T15]
blocks: []
dependency_type: hard
related_files: [backend/internal/connector/interface.go, backend/internal/connector/llm, backend/internal/api/ai_stream.go, backend/internal/mcp/tools]
---

# Task: Unified LLM Connectors

## Objective

Build a server-side LLM orchestration layer with multi-provider support and UI streaming.

**Success:**
- [ ] MCP tool `generate_content` invokes the registry correctly.
- [ ] `POST /ai/generate` streams chunks via SSE without buffering.

## Context

**Why:**
The system currently depends on Claude Code CLI for generation. To become standalone, Rush Maestro must own its LLM orchestration with Anthropic, OpenAI, Groq, and Gemini support.

**Strategic Alignment:**
- [x] Core product value (AI-assisted content is the main selling point)
- [ ] Nice-to-have enhancement
- [x] Technical foundation for future features (automated reporting)

**Dependencies:**
- [ ] T15 completed

## Implementation

### Phase 1 (Est: 6h)
- [ ] Define domain structs: `LLMRequest`, `LLMResponse`, `LLMChunk`.
- [ ] Define `LLMProvider` contract in `internal/connector/interface.go`.
- [ ] Implement provider registry and model-to-task mapping.

### Phase 2 (Est: 10h)
- [ ] Implement Anthropic Go SDK connector with prompt caching support.
- [ ] Implement OpenAI connector.
- [ ] Implement Gemini connector.
- [ ] Implement Groq connector through OpenAI-compatible interface.

### Phase 3 (Est: 8h)
- [ ] Implement `POST /ai/generate` SSE endpoint.
- [ ] Integrate MCP tool `generate_content` with registry.
- [ ] Implement provider fallback when primary is configured but fails.
- [ ] Add i18n messages for LLM-related errors.
- [ ] Add unit tests for registry logic.

## Definition of Done

### Functionality
- [ ] MCP tool `generate_content` successfully invokes the LLM registry.
- [ ] SSE endpoint streams chunks to frontend without buffering.
- [ ] System falls back to secondary provider if primary fails.

### Quality
- [ ] No hardcoded API keys in code (must use `integrations` table).
- [ ] Unit tests for registry logic.

## Technical Notes

Implement `LLMProvider` in `internal/connector/interface.go` and concrete providers in `internal/connector/llm/`. Use registry selection by `tenant_id` and task type.
