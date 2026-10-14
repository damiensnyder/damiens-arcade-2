<script lang="ts">
	import { getContext } from 'svelte';
	import AbilityText from '../components/AbilityText.svelte';
	import ActionBar from '../components/ActionBar.svelte';
	import EquipmentCard from '../components/EquipmentCard.svelte';
	import FighterSprite from '../components/FighterSprite.svelte';
	import MatchupHeader from '../components/MatchupHeader.svelte';
	import StatRows from '../components/StatRows.svelte';
	import type { MMState } from '../state.svelte.js';
	import { TEAMS } from '../teams.js';

	const mm = getContext<MMState>('mm');
	const mine = $derived(mm.myTeam!);
	const match = $derived(mm.myCurrentMatch()!);
	const opponentId = $derived(match.a === mine.id ? match.b : match.a);
	const opponent = $derived(mm.team(opponentId)!);
</script>

<main class="panel scout">
	<div class="full">
		<MatchupHeader a={mine.id} b={opponentId}>
			{#snippet actions()}
				<button type="button" onclick={() => (mm.scouting = false)}>back to my team</button>
				<button type="button" class="go" onclick={() => mm.act({ type: 'ready' })}>ready</button>
			{/snippet}
		</MatchupHeader>
	</div>

	<section class="col fighters">
		<h3>{TEAMS[opponentId].last} fighters</h3>
		{#each opponent.fighters as f (f.id)}
			<article class="card">
				<div class="row between wrap">
					<div class="row"><h3>{f.name}</h3><span class="muted">age {f.age}</span></div>
					<span class="muted small">{mm.seasonLine(f.id) ? 'this season: ' + mm.seasonLine(f.id) : ''}</span>
				</div>
				<div class="fbody">
					<span class="big-sprite"><FighterSprite look={f.look} team={opponentId} size={100} /></span>
					<div class="ability"><AbilityText ability={f.ability} /></div>
					<div class="stats-col"><StatRows stats={f.stats} /></div>
				</div>
			</article>
		{/each}
	</section>

	<section class="col gear">
		<h3>{TEAMS[opponentId].last} equipment</h3>
		{#if opponent.equipment.length === 0}
			<p class="muted">No equipment at all.</p>
		{/if}
		{#each opponent.equipment as e (e.id)}
			<EquipmentCard itemKey={e.key} imgSize={72} />
		{/each}
	</section>
</main>

<ActionBar>
	<button type="button" onclick={() => (mm.scouting = false)}>back to my team</button>
	<button type="button" class="go" onclick={() => mm.act({ type: 'ready' })}>ready</button>
</ActionBar>

<style>
	.full {
		flex: 1 1 100%;
		display: block;
	}

	.fighters {
		flex: 3 1 520px;
	}

	.gear {
		flex: 2 1 340px;
	}

	.fbody {
		display: flex;
		align-items: flex-start;
		gap: 1.25rem;
		flex-wrap: wrap;
	}

	.big-sprite {
		margin-top: -0.6rem;
		display: inline-flex;
	}

	.ability {
		flex: 1 1 8rem;
		min-width: 0;
		font-size: 0.95rem;
	}

	.stats-col {
		flex: 0 0 15rem;
		margin-left: auto;
	}
</style>
