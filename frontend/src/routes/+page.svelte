<script lang="ts">
	import { Building2, Plus } from 'lucide-svelte';
</script>

<div class="flex h-full flex-col items-center justify-center gap-6 p-12 text-center">
	<div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-900/30">
		<Building2 class="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
	</div>
	<div>
		<h2 class="text-xl font-bold text-slate-900 dark:text-white">No clients yet</h2>
		<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
			Create your first client to get started.
		</p>
	</div>
	<a
		href="/tenants/new"
		class="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
	>
		<Plus class="h-4 w-4" /> New Client
	</a>
</div>
