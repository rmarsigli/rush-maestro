<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<div class="h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 flex flex-col overflow-hidden print:h-auto print:overflow-visible print:block">
	{@render children()}
</div>
