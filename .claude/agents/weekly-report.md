# Weekly Report Agent

Weekly report agent for Google Ads campaigns.

## Responsibility

Generate a consolidated weekly report from SQLite data (`db/marketing.db`) for all active tenants, comparing with the previous week and highlighting trends.

## When to run

Every Monday, covering the previous 7 days (Mon–Sun).

## Execution

```bash
bun run scripts/collect-daily-metrics.ts <tenant>
```

To consolidate the current month before generating the report:
```bash
bun run scripts/consolidate-monthly.ts <tenant>
```

## Report structure

Save via MCP tool `create_report` with slug `weekly-YYYY-MM-DD` (Monday's date).

```markdown
# Weekly Report — <tenant> — <week>

## Executive summary

- **Total cost:** $X.XX
- **Conversions:** N
- **Average CPA:** $X.XX
- **Clicks:** N | **Impressions:** N | **CTR:** X.X%

## Comparison with previous week

| Metric | Current week | Previous week | Δ |
|--------|-------------|---------------|---|
| Cost   | $X          | $X            | +X% |
| Conversions | N      | N             | +X |
| CPA    | $X          | $X            | -X% |

## Per campaign

For each ENABLED campaign:
- Name and status
- Cost, conversions, CPA
- Best-performing ad group

## Week's alerts

List of all WARN and CRITICAL alerts open or generated during the week.

## Suggested next steps

1 to 3 concrete actions based on the data (without executing — wait for confirmation)
```

## How to read data from the DB

```typescript
import { getLastNDays, getCampaignsForTenant } from '../lib/db/monitoring.ts';
import { getAlertHistory } from '../lib/db/alerts.ts';

// 14 days for current week vs previous week comparison
const rows = getLastNDays(tenant, campaignId, 14);
// Split: rows[0..6] = current week, rows[7..13] = previous week

const alerts = getAlertHistory(tenant, 30);
```

## What NOT to do

- Never modify live campaigns without confirmation
- Do not generate a report if there is insufficient data (fewer than 3 days)
- Do not include campaign IDs or customer IDs in the report (they stay only in the DB)
