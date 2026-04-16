<script lang="ts">
	import { ArrowLeft, FileText, Calendar } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();
</script>

<div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">

	<!-- Back + meta -->
	<div class="mb-6">
		<a
			href="/{data.tenant}/reports"
			class="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-4"
		>
			<ArrowLeft class="w-4 h-4" /> Todos os relatórios
		</a>

		<div class="flex items-start gap-3">
			<div class="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
				<FileText class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
			</div>
			<div>
				<h1 class="text-xl font-bold text-slate-900 dark:text-white leading-snug">{data.slug}</h1>
				{#if data.date}
					<div class="flex items-center gap-1.5 mt-1 text-xs text-slate-400 dark:text-slate-500">
						<Calendar class="w-3.5 h-3.5" />
						<time>{data.date}</time>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Divider -->
	<div class="border-t border-slate-200 dark:border-slate-800 mb-8"></div>

	<!-- Report prose -->
	<article class="prose prose-slate dark:prose-invert max-w-none
		prose-headings:font-bold
		prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
		prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
		prose-code:bg-slate-100 dark:prose-code:bg-slate-800 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em]
		prose-pre:bg-slate-900 dark:prose-pre:bg-slate-950
		prose-blockquote:border-indigo-300 dark:prose-blockquote:border-indigo-700
		prose-th:text-left prose-th:font-semibold
		prose-table:text-sm
	">
		{@html data.html}
	</article>
</div>
