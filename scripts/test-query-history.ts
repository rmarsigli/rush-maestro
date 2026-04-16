import { ads } from './lib/ads.ts';

const res = await ads.portico.query(`
  SELECT
    segments.date,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions,
    metrics.conversions_value
  FROM campaign
  WHERE campaign.id = CAMPAIGN_ID_REDACTED
    AND segments.date DURING LAST_30_DAYS
  ORDER BY segments.date ASC
`);

console.log(JSON.stringify(res, null, 2));
