import { listPosts } from '$lib/server/posts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const scheduled = listPosts(params.tenant, 'scheduled').map((p) => ({
		...p,
		client_id: p.tenant_id,
		filename: p.id + '.json',
		media_files: p.media_path ? [p.media_path] : [],
	}));

	return { tenant: params.tenant, scheduled };
};
