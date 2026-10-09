<script lang="ts">
	import { getContext, type Snippet } from 'svelte';
	import { ordinal } from '../rules.js';
	import type { MMState } from '../state.svelte.js';
	import { TEAMS } from '../teams.js';
	import type { TeamId } from '../types.js';
	import TeamLogo from './TeamLogo.svelte';

	let { a, b, actions }: { a: TeamId; b: TeamId; actions?: Snippet } = $props();
	const mm = getContext<MMState>('mm');
	const sub = (t: TeamId) => `${mm.recordOf(t)} · ${ordinal(mm.rankOf(t))}`;
</script>

<div class="card">
	<div class="matchup">
		<div class="versus">
			{#each [a, b] as t, i (t)}
				{#if i === 1}<span class="vs">vs</span>{/if}
				<div class="side">
					<TeamLogo team={t} size="lg" />
					<div class="lines">
						<span class="tname" class:own={mm.vp?.myTeam === t}>{TEAMS[t].name}</span>
						<span class="muted small">{sub(t)}</span>
					</div>
				</div>
			{/each}
		</div>
		{#if actions}<div class="actions desktop-only">{@render actions()}</div>{/if}
	</div>
</div>

<style>
	.matchup {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem 2rem;
		flex-wrap: wrap;
	}

	.versus {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		flex-wrap: wrap;
	}

	.side {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.lines {
		display: flex;
		flex-direction: column;
	}

	.tname {
		font-size: 1.2rem;
	}

	.vs {
		font-size: 1.5rem;
		font-weight: 700;
		color: #aaa;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
</style>
