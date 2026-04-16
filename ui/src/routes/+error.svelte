<script lang="ts">
	import { page } from '$app/stores';

	const status = $derived($page.status);
	const message = $derived($page.error?.message ?? 'An unexpected error occurred.');

	const is4xx = $derived(status >= 400 && status < 500);
	const is5xx = $derived(status >= 500);

	const titles: Record<number, string> = {
		400: 'Bad Request',
		401: 'Unauthorized',
		403: 'Forbidden',
		404: 'Page Not Found',
		405: 'Method Not Allowed',
		500: 'Internal Server Error',
		502: 'Bad Gateway',
		503: 'Service Unavailable',
	};

	const title = $derived(titles[status] ?? (is4xx ? 'Client Error' : 'Server Error'));
</script>

<svelte:head>
	<title>{status} — {title}</title>
</svelte:head>

<div class="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
	<div class="w-full max-w-lg">

		<!-- Status badge -->
		<div class="flex justify-center mb-8">
			<span class="font-mono text-7xl font-black tracking-tighter
				{is5xx ? 'text-red-500 dark:text-red-400' : 'text-amber-500 dark:text-amber-400'}">
				{status}
			</span>
		</div>

		<!-- Card -->
		<div class="bg-white dark:bg-slate-900 rounded-2xl border
			{is5xx ? 'border-red-200 dark:border-red-900/50' : 'border-amber-200 dark:border-amber-900/50'}
			shadow-sm overflow-hidden">

			<!-- Top accent bar -->
			<div class="h-1 w-full {is5xx ? 'bg-red-500' : 'bg-amber-500'}"></div>

			<div class="p-8">
				<h1 class="text-2xl font-bold text-slate-900 dark:text-white mb-2">
					{title}
				</h1>

				<p class="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-6">
					{#if is5xx}
						Something went wrong on our end.
					{:else if status === 404}
						The page or resource you're looking for doesn't exist.
					{:else}
						There was a problem with your request.
					{/if}
				</p>

				<!-- Error detail (dev-friendly) -->
				{#if message && message !== 'An unexpected error occurred.'}
					<div class="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4 mb-6 border border-slate-200 dark:border-slate-700">
						<p class="text-xs font-mono text-slate-600 dark:text-slate-300 break-words leading-relaxed">
							{message}
						</p>
					</div>
				{/if}

				<!-- Actions -->
				<div class="flex items-center gap-3">
					<a
						href="/"
						class="flex-1 text-center bg-slate-900 dark:bg-white hover:bg-slate-700 dark:hover:bg-slate-100
							text-white dark:text-slate-900 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors"
					>
						Go home
					</a>
					<button
						onclick={() => history.back()}
						class="flex-1 text-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700
							text-slate-700 dark:text-slate-300 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors"
					>
						Go back
					</button>
				</div>
			</div>
		</div>

		<!-- Footer hint for 5xx -->
		{#if is5xx}
			<p class="text-center text-xs text-slate-400 dark:text-slate-600 mt-6">
				If this keeps happening, check the server logs.
			</p>
		{/if}

	</div>
</div>
