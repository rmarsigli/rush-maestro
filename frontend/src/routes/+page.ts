import { getTenants } from '$lib/api/tenants'
import { redirect, isRedirect } from '@sveltejs/kit'
import type { PageLoad } from './$types'

export const ssr = false

export const load: PageLoad = async ({ fetch }) => {
	try {
		const tenants = await getTenants(fetch)
		if (tenants.length > 0) {
			redirect(302, `/${tenants[0].id}/social`)
		}
		// authenticated but no tenants yet — show empty state
		return {}
	} catch (err: unknown) {
		if (isRedirect(err)) throw err
		const status = (err as { status?: number })?.status
		if (!status || status === 401 || status === 403) {
			redirect(302, '/login')
		}
		redirect(302, '/login')
	}
}
