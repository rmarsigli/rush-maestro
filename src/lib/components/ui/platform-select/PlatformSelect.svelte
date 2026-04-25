<script lang="ts">
	import { SiInstagram, SiFacebook } from '@icons-pack/svelte-simple-icons';
	import { Check, ChevronDown, X } from 'lucide-svelte';
	import type { PostPlatform } from '$lib/server/db';
	import { PLATFORM_CONFIG } from '$lib/social';

	let {
		value = $bindable<PostPlatform[]>([]),
		placeholder = 'Select platforms…',
	}: {
		value: PostPlatform[];
		placeholder?: string;
	} = $props();

	let open = $state(false);
	let container = $state<HTMLDivElement | null>(null);

	const PLATFORM_ORDER: PostPlatform[] = [
		'instagram_feed',
		'instagram_stories',
		'instagram_reels',
		'linkedin',
		'facebook',
	];

	const BRAND_COLOR: Record<PostPlatform, string> = {
		instagram_feed: '#E1306C',
		instagram_stories: '#C13584',
		instagram_reels: '#FF0000',
		linkedin: '#0A66C2',
		facebook: '#1877F2',
	};

	function toggle(val: PostPlatform) {
		value = value.includes(val) ? value.filter((v) => v !== val) : [...value, val];
	}

	function removeChip(val: PostPlatform, e: MouseEvent) {
		e.stopPropagation();
		value = value.filter((v) => v !== val);
	}

	function onOutside(e: MouseEvent) {
		if (container && !container.contains(e.target as Node)) open = false;
	}

	$effect(() => {
		if (open) {
			document.addEventListener('mousedown', onOutside);
			return () => document.removeEventListener('mousedown', onOutside);
		}
	});
</script>

<div bind:this={container} class="relative">
	<!-- Trigger (div to avoid nested-button SSR warning) -->
	<div
		role="button"
		aria-expanded={open}
		aria-haspopup="listbox"
		tabindex="0"
		onclick={() => (open = !open)}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open = !open; } }}
		class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
	>
		<div class="flex min-w-0 flex-1 flex-wrap gap-1.5">
			{#if value.length === 0}
				<span class="text-slate-400">{placeholder}</span>
			{:else}
				{#each value as plt}
					{@const cfg = PLATFORM_CONFIG[plt]}
					<span
						class="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
					>
						{@render PlatformIcon({ platform: plt, size: 11 })}
						{cfg?.label ?? plt}
						<button
							type="button"
							onclick={(e) => removeChip(plt, e)}
							class="-mr-0.5 ml-0.5 rounded text-slate-400 transition-colors hover:text-slate-700 dark:hover:text-slate-200"
							aria-label="Remove {cfg?.label}"
						>
							<X class="h-2.5 w-2.5" />
						</button>
					</span>
				{/each}
			{/if}
		</div>
		<ChevronDown class="h-4 w-4 shrink-0 text-slate-400 transition-transform {open ? 'rotate-180' : ''}" />
	</div>

	<!-- Dropdown -->
	{#if open}
		<div
			class="absolute left-0 top-full z-50 mt-1 w-full min-w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
		>
			{#each PLATFORM_ORDER as plt}
				{@const cfg = PLATFORM_CONFIG[plt]}
				{@const selected = value.includes(plt)}
				<button
					type="button"
					onclick={() => toggle(plt)}
					class="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 {selected ? 'bg-indigo-50/60 dark:bg-indigo-900/20' : ''}"
				>
					<div
						class="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors {selected
							? 'border-indigo-600 bg-indigo-600'
							: 'border-slate-300 dark:border-slate-600'}"
					>
						{#if selected}
							<Check class="h-3 w-3 text-white" />
						{/if}
					</div>
					{@render PlatformIcon({ platform: plt, size: 15, color: BRAND_COLOR[plt] })}
					<span class="text-slate-700 dark:text-slate-300">{cfg?.label ?? plt}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<!-- Inline icon switcher (not a separate component to avoid extra files) -->
{#snippet PlatformIcon(props: { platform: PostPlatform; size: number; color?: string })}
	{@const c = props.color ?? '#6b7280'}
	{@const s = props.size}
	{#if props.platform === 'linkedin'}
		<svg width={s} height={s} viewBox="0 0 24 24" fill={c} aria-hidden="true">
			<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
		</svg>
	{:else if props.platform === 'facebook'}
		<SiFacebook size={s} color={c} />
	{:else}
		<SiInstagram size={s} color={c} />
	{/if}
{/snippet}
