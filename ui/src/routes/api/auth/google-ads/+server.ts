import { redirect, error } from '@sveltejs/kit';
import { getIntegration } from '$lib/server/integrations';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	const integrationId = url.searchParams.get('integration_id');

	if (!integrationId) {
		return new Response('integration_id is required', { status: 400 });
	}

	const integration = getIntegration(integrationId);

	if (!integration) {
		error(404, 'Integration not found');
	}

	if (!integration.oauth_client_id || !integration.oauth_client_secret) {
		return new Response('Integration credentials (Client ID and Secret) are not configured', { status: 400 });
	}

	const state = Buffer.from(JSON.stringify({ integration_id: integrationId })).toString('base64url');

	const params = new URLSearchParams({
		client_id: integration.oauth_client_id,
		redirect_uri: `${url.origin}/api/auth/google-ads/callback`,
		response_type: 'code',
		scope: 'https://www.googleapis.com/auth/adwords',
		access_type: 'offline',
		prompt: 'consent',
		state,
	});

	redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};
