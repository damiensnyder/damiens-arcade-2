<script lang="ts">
	import type { Snippet } from 'svelte';
	import { STAT_NAMES, type StatName, type Stats } from '../types.js';
	import Stars from './Stars.svelte';

	let {
		stats,
		previous = null,
		preview = null,
		size = 16,
		after
	}: {
		stats: Stats;
		previous?: Stats | null;
		/** Stat to show a +1 preview for. */
		preview?: StatName | null;
		size?: number;
		after?: Snippet<[StatName]>;
	} = $props();

	function tooltip(stat: StatName, value: number): string {
		const v = Math.round(value);
		switch (stat) {
			case 'strength':
				return `Deals ${(0.5 + 0.1 * v).toFixed(1)}x base damage with melee attacks`;
			case 'accuracy':
				return `Hits ${Math.min(25 + 5 * v, 100)}% of ranged attacks`;
			case 'energy':
				return `Takes ${Math.max(6 - 0.4 * v, 1).toFixed(1)}s to charge`;
			case 'speed':
				return `Runs ${Math.max(5 + v, 1)} m/s`;
			case 'toughness':
				return `Takes ${Math.round(Math.max(1.25 - 0.05 * v, 0.5) * 100)}% of incoming damage`;
		}
	}
</script>

<div class="stats" class:with-after={!!after}>
	{#each STAT_NAMES as stat (stat)}
		<div class="stat" title={tooltip(stat, stats[stat])}>
			<span class="name">{stat}</span>
			<Stars
				value={stats[stat]}
				previous={previous ? previous[stat] : null}
				preview={preview === stat ? Math.min(stats[stat] + 1, 10) : null}
				{size}
			/>
			{#if after}{@render after(stat)}{/if}
		</div>
	{/each}
</div>

<style>
	.stats {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 12rem;
	}

	.stat {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.5rem;
		text-transform: capitalize;
	}

	.with-after .stat {
		grid-template-columns: minmax(0, 1fr) auto 5.2rem;
	}

	.stat :global(button) {
		justify-self: end;
		text-transform: none;
	}
</style>
