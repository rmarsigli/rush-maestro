<script lang="ts">
	import { page } from '$app/stores';

	const status = $derived($page.status);
	const message = $derived($page.error?.message ?? '');
	const is5xx = $derived(status >= 500);

	const labels: Record<number, { title: string; hint: string }> = {
		404: { title: 'Page not found',        hint: 'The page or resource you requested doesn\'t exist.' },
		403: { title: 'Access denied',          hint: 'You don\'t have permission to view this.' },
		401: { title: 'Not authenticated',      hint: 'Sign in to continue.' },
		500: { title: 'Internal server error',  hint: 'Something broke on our end.' },
		502: { title: 'Bad gateway',            hint: 'An upstream service didn\'t respond.' },
		503: { title: 'Service unavailable',    hint: 'The server is temporarily down.' },
	};

	const label = $derived(labels[status] ?? {
		title: is5xx ? 'Server error' : 'Something went wrong',
		hint:  is5xx ? 'An unexpected error occurred.' : 'Check the URL and try again.',
	});
</script>

<div class="flex-1 flex items-center justify-center p-8">
	<div class="w-full max-w-md space-y-6">

		<!-- Status number -->
		<div class="flex items-end gap-3">
			<span class="text-8xl font-black tabular-nums leading-none tracking-tighter
				{is5xx ? 'text-red-500 dark:text-red-400' : 'text-amber-500 dark:text-amber-400'}">
				{status}
			</span>
			<div class="pb-2 border-l-2 pl-3
				{is5xx ? 'border-red-200 dark:border-red-800' : 'border-amber-200 dark:border-amber-800'}">
				<p class="text-lg font-bold text-slate-800 dark:text-slate-100 leading-snug">
					{label.title}
				</p>
				<p class="text-sm text-slate-500 dark:text-slate-400">
					{label.hint}
				</p>
			</div>
		</div>

		<!-- Error detail -->
		{#if message}
			<div class="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4">
				<p class="text-[11px] font-mono text-slate-500 dark:text-slate-400 break-words leading-relaxed whitespace-pre-wrap">
					{message}
				</p>
			</div>
		{/if}

		<!-- Actions -->
		<div class="flex gap-2 pt-1">
			<a
				href="/"
				class="flex-1 text-center py-2.5 px-4 rounded-lg text-sm font-semibold
					bg-slate-900 dark:bg-white text-white dark:text-slate-900
					hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors"
			>
				Home
			</a>
			<button
				onclick={() => history.back()}
				class="flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold
					bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300
					hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
			>
				Go back
			</button>
		</div>

	</div>
</div>
