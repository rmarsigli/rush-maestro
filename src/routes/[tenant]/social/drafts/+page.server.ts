import { listPosts } from '$lib/server/posts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const drafts = listPosts(params.tenant)
		.filter((p) => p.status !== 'scheduled' && p.status !== 'published')
		.map((p) => ({
			...p,
			client_id: p.tenant_id,
			filename: p.id + '.json',
			media_files: p.media_path ? [p.media_path] : [],
			platform: p.platform,
		}));

	return { tenant: params.tenant, drafts };
};
