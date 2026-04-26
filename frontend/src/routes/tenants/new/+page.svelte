<script lang="ts">
	import { goto } from '$app/navigation'
	import { auth } from '$lib/stores/auth.svelte'
	import { apiFetch } from '$lib/api/client'

	let name    = $state('')
	let id      = $state('')
	let error   = $state<string | null>(null)
	let loading = $state(false)

	function slugify(v: string) {
		return v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
	}

	function onNameInput() {
		if (!id || id === slugify(name.slice(0, -1))) {
			id = slugify(name)
		}
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault()
		error = null
		loading = true
		try {
			await apiFetch('/admin/tenants', {
				method: 'POST',
				body: JSON.stringify({ id, name, language: 'pt_BR' }),
			})
			// Refresh token: now the user has role_owner on the new tenant.
			await auth.restoreSession()
			goto('/')
		} catch (err: unknown) {
			error = (err as { message?: string })?.message ?? 'Failed to create client'
		} finally {
			loading = false
		}
	}
</script>

<div class="flex h-full items-center justify-center">
	<div class="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
		<h1 class="mb-2 text-xl font-bold text-slate-900 dark:text-white">Create your first client</h1>
		<p class="mb-6 text-sm text-slate-500 dark:text-slate-400">Add a client to start managing content and campaigns.</p>
		<form onsubmit={submit} class="flex flex-col gap-4">
			<label class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
				Client name
				<input
					type="text"
					bind:value={name}
					oninput={onNameInput}
					required
					placeholder="Grupo Pórtico"
					class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
				/>
			</label>
			<label class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
				Identifier <span class="font-normal text-slate-400">(URL slug, cannot be changed)</span>
				<input
					type="text"
					bind:value={id}
					required
					pattern="[a-z0-9-]+"
					placeholder="grupo-portico"
					class="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white"
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
				{loading ? 'Creating…' : 'Create client'}
			</button>
		</form>
	</div>
</div>
