import { ads } from './lib/ads.ts';

const res = await ads.portico.query(`
  SELECT
    ad_group.id,
    ad_group.name,
    ad_group.status,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions,
    metrics.ctr
  FROM ad_group
  WHERE campaign.id = CAMPAIGN_ID_REDACTED
`);

console.log(JSON.stringify(res, null, 2));
