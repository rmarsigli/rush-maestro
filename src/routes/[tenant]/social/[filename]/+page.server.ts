import { getPost } from '$lib/server/posts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const id = params.filename.replace(/\.json$/, '');
	const post = getPost(id);

	if (!post) {
		error(404, 'Post not found');
	}

	return {
		client_id: params.tenant,
		post: {
			...post,
			client_id: post.tenant_id,
			filename: post.id + '.json',
			media_files: post.media_path ? [post.media_path] : [],
		},
	};
};
