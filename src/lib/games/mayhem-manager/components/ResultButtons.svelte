<script lang="ts">
	// "watch" and "see result" for a finished match, or the score once revealed.
	import { getContext } from 'svelte';
	import type { MMState } from '../state.svelte.js';
	import type { Match } from '../types.js';

	let { match, mini = false }: { match: Match; mini?: boolean } = $props();
	const mm = getContext<MMState>('mm');
	const revealed = $derived(mm.isRevealed(match));
	// listed in the same order as the teams: left team's fighters standing, then right team's
	const score = $derived(match.result ? `${match.result.standingA}–${match.result.standingB}` : '');
</script>

{#if match.result}
	<span class="btns">
		<button type="button" class="go" class:mini onclick={() => mm.watch(match.id)}>watch</button>
		{#if revealed}
			<span class="score">{score}</span>
		{:else}
			<button type="button" class:mini onclick={() => mm.reveal(match.id)}>see result</button>
		{/if}
	</span>
{/if}

<style>
	.btns {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
	}

	.score {
		font-size: 0.95rem;
	}
</style>
