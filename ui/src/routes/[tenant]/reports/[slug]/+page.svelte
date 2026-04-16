<script lang="ts">
	import { ArrowLeft, FileText, Calendar, Download } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();
</script>

<div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full print:px-0 print:py-0 print:max-w-none">

	<!-- Back + Download (hidden on print) -->
	<div class="flex items-center justify-between mb-6 print:hidden">
		<a
			href="/{data.tenant}/reports"
			class="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
		>
			<ArrowLeft class="w-4 h-4" /> All reports
		</a>

		<button
			onclick={() => window.print()}
			class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
				bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300
				hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
		>
			<Download class="w-4 h-4" /> Download PDF
		</button>
	</div>

	<!-- Report title (visible in print too) -->
	<div class="flex items-start gap-3 mb-6 print:mb-8">
		<div class="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0 print:hidden">
			<FileText class="w-5 h-5 text-indigo-600" />
		</div>
		<div>
			<h1 class="text-xl font-bold text-slate-900 leading-snug print:text-2xl">{data.slug}</h1>
			{#if data.date}
				<div class="flex items-center gap-1.5 mt-1 text-xs text-slate-400">
					<Calendar class="w-3.5 h-3.5 print:hidden" />
					<time>{data.date}</time>
				</div>
			{/if}
		</div>
	</div>

	<!-- Divider -->
	<div class="border-t border-slate-200 mb-8"></div>

	<!-- Report prose -->
	<article class="prose prose-slate max-w-none
		prose-headings:font-bold
		prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
		prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline
		prose-code:bg-slate-100 prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em]
		prose-pre:bg-slate-900
		prose-blockquote:border-indigo-300
		prose-th:text-left prose-th:font-semibold
		prose-table:text-sm
		print:prose-sm
	">
		{@html data.html}
	</article>
</div>
