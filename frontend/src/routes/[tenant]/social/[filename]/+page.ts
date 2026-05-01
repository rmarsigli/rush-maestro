import { getPost } from '$lib/api/posts'
import { getTenant } from '$lib/api/tenants'
import { error } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const ssr = false

export const load: PageLoad = async ({ params, fetch }) => {
	const id = params.filename.replace(/\.json$/, '')
	const [post, brand] = await Promise.all([
		getPost(params.tenant, id).catch(() => null),
		getTenant(params.tenant, fetch).catch(() => null),
	])

	if (!post) {
		error(404, 'Post not found')
	}

	return {
		client_id: params.tenant,
		brand,
		post: {
			...post,
			client_id: post.tenant_id,
			filename: post.id + '.json',
			media_files: post.media_path ? [post.media_path] : [],
		},
	}
}
