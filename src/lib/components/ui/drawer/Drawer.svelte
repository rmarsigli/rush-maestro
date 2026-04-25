<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		children,
	}: {
		open: boolean;
		children: Snippet;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100"
		/>
		<Dialog.Content
			data-drawer-content
			class="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900 max-md:inset-x-0 max-md:inset-y-auto max-md:bottom-0 max-md:max-h-[90vh] max-md:rounded-t-2xl max-md:max-w-none"
		>
			{@render children()}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
