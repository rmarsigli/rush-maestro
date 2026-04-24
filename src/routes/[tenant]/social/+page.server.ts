import { listPosts } from '$lib/server/posts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const scheduled = listPosts(params.tenant, 'scheduled').map((p) => ({
		...p,
		client_id: p.tenant_id,
		filename: p.id + '.json',
		media_files: p.media_path ? [p.media_path] : [],
		scheduled_date: p.scheduled_date ?? p.id.slice(0, 10),
	}));

	return { tenant: params.tenant, scheduled };
};
