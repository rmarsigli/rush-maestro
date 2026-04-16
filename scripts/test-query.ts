import { getCustomer } from './lib/ads.ts';

const [customerId, campaignId] = process.argv.slice(2);
if (!customerId || !campaignId) {
  console.error('Usage: bun run scripts/test-query.ts <customer-id> <campaign-id>');
  process.exit(1);
}

const res = await getCustomer(customerId).query(`
  SELECT
    campaign.id, campaign.name, campaign.status,
    campaign.bidding_strategy_type,
    metrics.impressions, metrics.clicks, metrics.cost_micros,
    metrics.conversions, metrics.cost_per_conversion,
    metrics.ctr, metrics.search_impression_share
  FROM campaign
  WHERE campaign.id = ${campaignId}
`);

console.log(JSON.stringify(res, null, 2));
