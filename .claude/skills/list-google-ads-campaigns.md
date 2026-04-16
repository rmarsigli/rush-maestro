---
name: list-google-ads-campaigns
description: Lists all Google Ads campaigns for a client with status, budget, bidding strategy, and key metrics.
---
# List Google Ads Campaigns

When the user asks to see or list campaigns for a client:

1. Identify the client and read `clients/<client_id>/brand.json` to confirm `google_ads_id`.
2. Create a temp script at the project root:
   ```typescript
   import { ads } from './scripts/lib/ads.ts';
   const res = await ads['your-client'].query(`
     SELECT
       campaign.id, campaign.name, campaign.status,
       campaign.bidding_strategy_type,
       campaign_budget.amount_micros,
       metrics.impressions, metrics.clicks,
       metrics.cost_micros, metrics.conversions,
       metrics.cost_per_conversion
     FROM campaign
     ORDER BY campaign.id
   `);
   console.log(JSON.stringify(res, null, 2));
   ```
3. Run with `bun run <tempfile>.ts` from the project root. Delete after.
4. Summarize clearly: name, status, budget/day, spend, conversions, CPA.
