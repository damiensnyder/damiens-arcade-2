<script lang="ts">
	import { getContext } from 'svelte';
	import { playoffSize } from '../rules.js';
	import type { MMState } from '../state.svelte.js';
	import { teamShortName } from '../teams.js';
	import TeamLogo from './TeamLogo.svelte';

	const mm = getContext<MMState>('mm');
	const rows = $derived(mm.standings());
	const cut = $derived(playoffSize(mm.teamCount));
</script>

<div class="card">
	<h3>Standings</h3>
	{#each rows as r, i (r.team)}
		{#if i === cut && cut < rows.length}<div class="cutline" title="playoff cutoff"></div>{/if}
		<div class="st-row" class:me={mm.vp?.myTeam === r.team}>
			<span class="muted small">{i + 1}</span>
			<TeamLogo team={r.team} />
			<button type="button" class="link lg-name" onclick={() => mm.viewTeam(r.team)}>{teamShortName(r.team)}</button>
			<span>{r.wins}–{r.losses}</span>
		</div>
	{/each}
</div>

<style>
	.st-row {
		display: grid;
		grid-template-columns: 1.2rem auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.5rem;
	}

	.lg-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: left;
	}

	.st-row.me .lg-name {
		color: #eeb;
	}

	.link {
		all: unset;
		cursor: pointer;
	}

	.link:hover,
	.link:focus-visible {
		text-decoration: underline;
	}
</style>
