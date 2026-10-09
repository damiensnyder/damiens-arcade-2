<script lang="ts">
	import { getContext } from 'svelte';
	import type { MMState } from '../state.svelte.js';

	let { label = 'ready' }: { label?: string } = $props();
	const mm = getContext<MMState>('mm');
	const mine = $derived(mm.myTeam);
</script>

{#if mine}
	{#if mine.ready}
		<button type="button" onclick={() => mm.act({ type: 'unready' })}>unready</button>
	{:else}
		<button type="button" class="go" onclick={() => mm.act({ type: 'ready' })}>{label}</button>
	{/if}
{/if}
