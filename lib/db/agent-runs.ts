/**
 * Agent runs domain — execution history for all scripts and agents.
 * Used for debugging, scheduling decisions, and the orchestrator.
 */

import { getDb } from './index';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentRunInput {
  agent: string;
  tenant: string;
  date: string;
  status: 'success' | 'error';
  output?: string;
  error?: string;
}

export interface AgentRunRow extends AgentRunInput {
  id: number;
  created_at: string;
}

// ── Write ──────────────────────────────────────────────────────────────────

export function logAgentRun(run: AgentRunInput): void {
  getDb().prepare(`
    INSERT INTO agent_runs (agent, tenant, date, status, output, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    run.agent, run.tenant, run.date, run.status,
    run.output ?? null, run.error ?? null
  );
}

// ── Read ───────────────────────────────────────────────────────────────────

export function getLastRun(agent: string, tenant: string): AgentRunRow | null {
  return getDb().prepare(`
    SELECT * FROM agent_runs
    WHERE agent = ? AND tenant = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(agent, tenant) as AgentRunRow | null;
}

export function getRecentRuns(agent: string, tenant: string, limit = 7): AgentRunRow[] {
  return getDb().prepare(`
    SELECT * FROM agent_runs
    WHERE agent = ? AND tenant = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(agent, tenant, limit) as AgentRunRow[];
}

export function getAllRecentRuns(tenant: string, limit = 30): AgentRunRow[] {
  return getDb().prepare(`
    SELECT * FROM agent_runs
    WHERE tenant = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(tenant, limit) as AgentRunRow[];
}
