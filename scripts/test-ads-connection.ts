import { ads } from './lib/ads.ts';

try {
  const campaigns = await ads.portico.query(`SELECT campaign.id, campaign.name FROM campaign LIMIT 1`);
  console.log('✅ Connected to Google Ads API.');
  console.log(`📡 Found ${campaigns.length} campaign (test query).`);
} catch (err: any) {
  console.error('❌ Connection failed:', err.message || err);
  process.exit(1);
}
