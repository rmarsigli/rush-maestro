import { getCustomer } from './lib/ads.ts';

const customerId = process.argv[2] ?? process.env.GOOGLE_ADS_TEST_CUSTOMER_ID;

if (!customerId) {
  console.error('Usage: bun run scripts/test-ads-connection.ts <customer-id>');
  process.exit(1);
}

try {
  const customer = getCustomer(customerId);
  const campaigns = await customer.query(`SELECT campaign.id, campaign.name FROM campaign LIMIT 1`);
  console.log('✅ Connected to Google Ads API.');
  console.log(`📡 Found ${campaigns.length} campaign (test query).`);
} catch (err) {
  console.error('❌ Connection failed:', err instanceof Error ? err.message : err);
  process.exit(1);
}
