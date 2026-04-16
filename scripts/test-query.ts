import { ads } from './lib/ads.ts';

const res = await ads.portico.query(`
  SELECT
    campaign.id,
    campaign.name,
    campaign.status,
    campaign.bidding_strategy_type,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions,
    metrics.cost_per_conversion,
    metrics.ctr,
    metrics.search_impression_share
  FROM campaign
  WHERE campaign.id = CAMPAIGN_ID_REDACTED
`);

console.log(JSON.stringify(res, null, 2));
