---
name: optimize-roas
description: Analyzes a live Google Ads campaign and proposes pausing underperforming Ad Groups. Always requires explicit user confirmation before mutating anything.
---
# Optimize ROAS Workflow

When the user asks to optimize ROAS or fix a bleeding campaign:

1. Identify `client_id` and `campaign_id`.
2. Fetch live ad group metrics via temp script at project root:
   ```typescript
   import { ads, fromMicros } from './scripts/lib/ads.ts';
   const res = await ads['your-client'].query(`
     SELECT
       ad_group.id, ad_group.name, ad_group.status,
       metrics.impressions, metrics.clicks,
       metrics.cost_micros, metrics.conversions,
       metrics.cost_per_conversion, metrics.ctr
     FROM ad_group
     WHERE campaign.id = CAMPAIGN_ID
   `);
   console.log(JSON.stringify(res, null, 2));
   ```
3. Run with `bun run <tempfile>.ts`. Delete after.
4. Analyze:
   - **High performer:** conversions > 0 and viable CPA
   - **Bleeding:** high spend + clicks, 0 conversions
5. Present findings and proposed action to the user. Wait for explicit confirmation.
6. Only after confirmed: create another temp script that calls `ads['your-client'].adGroups.update([{ resource_name: '...', status: enums.AdGroupStatus.PAUSED }])`. Run and confirm.
7. Log the change in the client's report file under `clients/<client_id>/reports/`.
