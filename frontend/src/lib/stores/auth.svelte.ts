import { setToken, clearToken, tryRefresh, getToken } from '$lib/api/client'

export interface AuthUser {
	id: string
	name: string
	email: string
	tenant_id: string
	permissions: string[]
}

let _token = $state<string | null>(null)
let _user  = $state<AuthUser | null>(null)

export const auth = {
	get token()           { return _token },
	get user()            { return _user },
	get isAuthenticated() { return _token !== null },

	setToken(t: string) {
		_token = t
		setToken(t)
	},

	setUser(u: AuthUser) {
		_user = u
	},

	clear() {
		_token = null
		_user = null
		clearToken()
	},

	async restoreSession(): Promise<boolean> {
		const ok = await tryRefresh()
		if (!ok) return false
		_token = getToken()
		try {
			const res = await fetch('/auth/me', {
				credentials: 'include',
				headers: _token ? { Authorization: `Bearer ${_token}` } : {},
			})
			if (!res.ok) return false
			const data = await res.json()
			_user = data.user ?? data.data ?? data
			return true
		} catch {
			return false
		}
	},
}
