import { getCustomer } from './lib/ads.ts';

const [customerId, campaignId] = process.argv.slice(2);
if (!customerId || !campaignId) {
  console.error('Usage: bun run scripts/test-query-ag.ts <customer-id> <campaign-id>');
  process.exit(1);
}

const res = await getCustomer(customerId).query(`
  SELECT
    ad_group.id, ad_group.name, ad_group.status,
    metrics.impressions, metrics.clicks, metrics.cost_micros,
    metrics.conversions, metrics.ctr
  FROM ad_group
  WHERE campaign.id = ${campaignId}
`);

console.log(JSON.stringify(res, null, 2));
