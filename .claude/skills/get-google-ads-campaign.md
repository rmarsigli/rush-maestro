---
name: get-google-ads-campaign
description: Gets detailed Google Ads campaign metrics (impressions, clicks, cost, conversions, CPA, CTR, impression share) for a specific campaign ID.
---
# Get Google Ads Campaign Details

When the user asks for metrics or a report for a specific campaign:

1. Identify the client and the `campaign_id`.
2. Create a temp script at the project root:
   ```typescript
   import { ads, fromMicros } from './scripts/lib/ads.ts';
   const res = await ads['your-client'].query(`
     SELECT
       campaign.id, campaign.name, campaign.status,
       metrics.impressions, metrics.clicks, metrics.cost_micros,
       metrics.conversions, metrics.cost_per_conversion,
       metrics.ctr, metrics.search_impression_share
     FROM campaign
     WHERE campaign.id = CAMPAIGN_ID
   `);
   console.log(JSON.stringify(res, null, 2));
   ```
3. Run with `bun run <tempfile>.ts` from the project root. Delete after.
4. Analyze the output and provide strategic insights — trends, CPA viability, impression share gaps.
