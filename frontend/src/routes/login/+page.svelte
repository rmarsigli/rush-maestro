<script lang="ts">
	import { goto } from '$app/navigation'
	import { auth } from '$lib/stores/auth.svelte'
	import { setToken } from '$lib/api/client'

	let email    = $state('')
	let password = $state('')
	let error    = $state<string | null>(null)
	let loading  = $state(false)

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		error = null
		loading = true
		try {
			const res = await fetch('/auth/login', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password }),
			})
			const data = await res.json()
			if (!res.ok) {
				error = data.error ?? 'Login failed'
				return
			}
			auth.setToken(data.access_token)
			setToken(data.access_token)
			if (data.user) auth.setUser(data.user)
			goto(data.needs_tenant ? '/tenants/new' : '/')
		} catch {
			error = 'Network error'
		} finally {
			loading = false
		}
	}
</script>

<div class="flex h-full items-center justify-center">
	<div class="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
		<h1 class="mb-6 text-xl font-bold text-slate-900 dark:text-white">Sign in</h1>
		<form onsubmit={submit} class="flex flex-col gap-4">
			<label class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
				Email
				<input
					type="email"
					bind:value={email}
					required
					class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
				/>
			</label>
			<label class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
				Password
				<input
					type="password"
					bind:value={password}
					required
					class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
				/>
			</label>
			{#if error}
				<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</p>
			{/if}
			<button
				type="submit"
				disabled={loading}
				class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
			>
				{loading ? 'Signing in…' : 'Sign in'}
			</button>
		</form>
	</div>
</div>
