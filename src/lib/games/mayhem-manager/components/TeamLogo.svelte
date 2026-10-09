<script lang="ts">
	import { TEAMS } from '../teams.js';
	import type { TeamId } from '../types.js';

	let { team, size = 'sm' }: { team: TeamId | null; size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' } = $props();
	const identity = $derived(team === null ? null : TEAMS[team]);
</script>

{#if identity}
	<span
		class="logo {size}"
		style:background={identity.color1}
		style:border-color={identity.color2}
		style:color={identity.color2}
		title={identity.name}>{identity.abbr}</span
	>
{:else}
	<span class="logo {size} tbd" aria-label="to be decided">?</span>
{/if}

<style>
	.logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		font-weight: 700;
		border: 3px solid;
		border-radius: 50% 50% 46% 46% / 38% 38% 62% 62%;
		line-height: 1;
	}

	.xs {
		width: 1.5rem;
		height: 1.65rem;
		font-size: 0.5rem;
		border-width: 2px;
	}

	.sm {
		width: 1.9rem;
		height: 2.1rem;
		font-size: 0.65rem;
		border-width: 2px;
	}

	.md {
		width: 2.8rem;
		height: 3.1rem;
		font-size: 0.95rem;
	}

	.lg {
		width: 3.4rem;
		height: 3.75rem;
		font-size: 1.1rem;
		border-width: 4px;
	}

	.xl {
		width: 5rem;
		height: 5.5rem;
		font-size: 1.7rem;
		border-width: 5px;
	}

	.tbd {
		background: #311;
		border-color: #755;
		border-style: dashed;
		color: #aaa;
	}
</style>
