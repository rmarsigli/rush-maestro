import { redirect } from '@sveltejs/kit';
import { getIntegration, updateIntegration } from '$lib/server/integrations';
import type { RequestHandler } from './$types';

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const GET: RequestHandler = async ({ url }) => {
	const code = url.searchParams.get('code');
	const oauthError = url.searchParams.get('error');
	const stateParam = url.searchParams.get('state');

	if (oauthError || !code) {
		return html(`<h1>❌ Auth Error</h1><p>${esc(oauthError ?? 'No code received from Google.')}</p>`);
	}

	let integrationId = '';

	try {
		const decoded = JSON.parse(Buffer.from(stateParam ?? '', 'base64url').toString()) as {
			integration_id?: string;
		};
		integrationId = decoded.integration_id ?? '';
	} catch {
		return html('<h1>❌ Invalid State</h1><p>Could not parse OAuth state parameter.</p>');
	}

	if (!integrationId) {
		return html('<h1>❌ Missing integration_id</h1><p>No integration_id found in OAuth state.</p>');
	}

	const integration = getIntegration(integrationId);
	if (!integration?.oauth_client_id || !integration?.oauth_client_secret) {
		return html('<h1>❌ Integration not found</h1><p>The integration was deleted or credentials are missing.</p>');
	}

	const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			code,
			client_id: integration.oauth_client_id,
			client_secret: integration.oauth_client_secret,
			redirect_uri: `${url.origin}/api/auth/google-ads/callback`,
			grant_type: 'authorization_code',
		}),
	});

	const tokens = (await tokenRes.json()) as {
		refresh_token?: string;
		error?: string;
		error_description?: string;
	};

	if (!tokens.refresh_token) {
		const detail = tokens.error_description ?? tokens.error ?? 'unknown error';
		updateIntegration(integrationId, { status: 'error', error_message: detail });
		return html(`
			<h1>❌ No Refresh Token</h1>
			<p>Google did not return a refresh token (${esc(detail)}). If the account was already authorized, revoke access first at
			<a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a> and try again.</p>
		`);
	}

	updateIntegration(integrationId, {
		refresh_token: tokens.refresh_token,
		status: 'connected',
		error_message: null,
	});

	redirect(302, '/settings/integrations?connected=1');
};

function html(body: string): Response {
	return new Response(
		`<!doctype html><html><head><meta charset="utf-8"><title>Google Ads Auth</title>
		<style>body{font-family:sans-serif;max-width:640px;margin:60px auto;padding:20px;line-height:1.6}
		code{background:#f0f0f0;padding:2px 6px;border-radius:4px}</style>
		</head><body>${body}</body></html>`,
		{ headers: { 'content-type': 'text/html; charset=utf-8' } },
	);
}
