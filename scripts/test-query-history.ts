import { getCustomer } from './lib/ads.ts';

const [customerId, campaignId] = process.argv.slice(2);
if (!customerId || !campaignId) {
  console.error('Usage: bun run scripts/test-query-history.ts <customer-id> <campaign-id>');
  process.exit(1);
}

const res = await getCustomer(customerId).query(`
  SELECT
    segments.date,
    metrics.impressions, metrics.clicks, metrics.cost_micros,
    metrics.conversions, metrics.conversions_value
  FROM campaign
  WHERE campaign.id = ${campaignId}
    AND segments.date DURING LAST_30_DAYS
  ORDER BY segments.date ASC
`);

console.log(JSON.stringify(res, null, 2));
