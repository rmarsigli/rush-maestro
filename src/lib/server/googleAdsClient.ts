/**
 * Shared Google Ads customer factory for server-side code (MCP tools, loaders).
 * Reads credentials from the `integrations` table; falls back to env vars.
 *
 * Usage:
 *   const customer = getAdsCustomer(tenantId, customerId)
 *   const rows = await customer.query(`SELECT ...`)
 */

import { GoogleAdsApi, enums, toMicros } from 'google-ads-api';
import { env } from '$env/dynamic/private';
import { getCredentialsForTenant } from '$lib/server/integrations';

export { enums, toMicros };

export const fromMicros = (m: number | bigint) => Number(m) / 1_000_000;
export const micros     = (brl: number) => brl * 1_000_000;

export type AdsCredentials = {
	oauth_client_id: string;
	oauth_client_secret: string;
	developer_token: string;
	login_customer_id: string;
	refresh_token: string;
};

export function resolveCreds(tenantId: string): AdsCredentials | null {
	const db = getCredentialsForTenant(tenantId, 'google_ads');
	if (db) return db as AdsCredentials;

	const clientId       = env.GOOGLE_ADS_CLIENT_ID;
	const clientSecret   = env.GOOGLE_ADS_CLIENT_SECRET;
	const developerToken = env.GOOGLE_ADS_DEVELOPER_TOKEN;
	const refreshToken   = env.GOOGLE_ADS_REFRESH_TOKEN;
	if (!clientId || !clientSecret || !developerToken || !refreshToken) return null;

	return {
		oauth_client_id:     clientId,
		oauth_client_secret: clientSecret,
		developer_token:     developerToken,
		login_customer_id:   env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, '') ?? '',
		refresh_token:       refreshToken,
	};
}

export function getAdsCustomer(tenantId: string, customerId: string) {
	const creds = resolveCreds(tenantId);
	if (!creds) throw new Error(`No Google Ads credentials for tenant "${tenantId}"`);

	const client = new GoogleAdsApi({
		client_id:       creds.oauth_client_id,
		client_secret:   creds.oauth_client_secret,
		developer_token: creds.developer_token,
	});

	const loginId = creds.login_customer_id?.replace(/-/g, '');
	return client.Customer({
		customer_id:   customerId.replace(/-/g, ''),
		refresh_token: creds.refresh_token,
		...(loginId ? { login_customer_id: loginId } : {}),
	});
}
