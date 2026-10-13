<script lang="ts">
	import { getContext } from 'svelte';
	import AbilityText from '../components/AbilityText.svelte';
	import ActionBar from '../components/ActionBar.svelte';
	import EquipmentCard from '../components/EquipmentCard.svelte';
	import FighterSprite from '../components/FighterSprite.svelte';
	import GearCard from '../components/GearCard.svelte';
	import LeagueSidebar from '../components/LeagueSidebar.svelte';
	import ReadyButton from '../components/ReadyButton.svelte';
	import RosterCard from '../components/RosterCard.svelte';
	import StatRows from '../components/StatRows.svelte';
	import WaitingOn from '../components/WaitingOn.svelte';
	import { REPAIR_YEARS, RESIGN_CONTRACT_YEARS } from '../rules.js';
	import type { MMState } from '../state.svelte.js';
	import { seasonRecap, yearsLeft } from '../summaries.js';

	const mm = getContext<MMState>('mm');
	const vp = $derived(mm.vp!);
	const mine = $derived(mm.myTeam!);
	$effect(() => {
		mm.ensureHistory();
		mm.ensureSeasonTotals(vp.season - 1);
	});
	const lastSeason = $derived(mm.history?.seasons.find((s) => s.season === vp.season - 1));
</script>

<main class="panel">
	<section class="col main">
		{#if lastSeason}
			<div class="card">
				<span class="muted small">Season {lastSeason.season} recap</span>
				<p>{seasonRecap(lastSeason, mine.id)}</p>
			</div>
		{/if}

		<div class="row between wrap">
			<h3>Re-sign fighters</h3>
			<span class="muted small">re-sign for {RESIGN_CONTRACT_YEARS} seasons. the rest become free agents, if they're among the best available.</span>
		</div>
		{#if mine.expiring.length === 0}
			<p class="muted">Nobody's contract is up this year.</p>
		{/if}
		{#each mine.expiring as c (c.fighter.id)}
			{@const f = c.fighter}
			<article class="card" class:mine={c.decision === 'keep'} class:gone={c.decision === 'drop'}>
				<div class="row between wrap">
					<div class="row"><h3>{f.name}</h3><span class="muted">age {f.age}</span></div>
					<div class="row">
						{#if c.decision === 'pending'}
							<button type="button" disabled={mine.ready} onclick={() => mm.act({ type: 'contract', fighter: f.id, decision: 'drop' })}>decline</button>
							<button
								type="button"
								class="go"
								disabled={mine.ready || c.ask > mine.money}
								title={c.ask > mine.money ? 'not enough money' : undefined}
								onclick={() => mm.act({ type: 'contract', fighter: f.id, decision: 'keep' })}>re-sign · ${c.ask}</button
							>
						{:else}
							<span class:own={c.decision === 'keep'}>{c.decision === 'keep' ? `re-signed · $${c.ask}` : 'declined'}</span>
							<button type="button" disabled={mine.ready} onclick={() => mm.act({ type: 'contract', fighter: f.id, decision: 'pending' })}>undo</button>
						{/if}
					</div>
				</div>
				<div class="fbody">
					<span class="big-sprite"><FighterSprite look={f.look} team={mine.id} size={130} /></span>
					<StatRows stats={f.stats} />
					<div class="desc">
						<AbilityText ability={f.ability} />
						{#if mm.seasonLine(f.id, vp.season - 1)}
							<p class="muted small">Last season: {mm.seasonLine(f.id, vp.season - 1, true)}</p>
						{/if}
					</div>
				</div>
			</article>
		{/each}

		<div class="row between wrap" style="margin-top: 0.5rem">
			<h3>Repair equipment</h3>
			<span class="muted small">repaired items last {REPAIR_YEARS} more seasons. each repair costs more than the last. un-repaired items break.</span>
		</div>
		{#if mine.repairs.length === 0}
			<p class="muted">Nothing needs repairs this year.</p>
		{/if}
		<div class="repairs">
			{#each mine.repairs as r (r.equipment.id)}
				<EquipmentCard
					itemKey={r.equipment.key}
					cls={r.decision === 'keep' ? 'mine' : r.decision === 'drop' ? 'gone' : ''}
					note="owned {r.equipment.yearsOwned} yr{r.equipment.yearsOwned === 1 ? '' : 's'}{r.equipment.timesRepaired > 0 ? ` · repaired ${r.equipment.timesRepaired}x` : ''}"
					imgSize={88}
				>
					{#snippet actions()}
						{#if r.decision === 'pending'}
							<button type="button" disabled={mine.ready} onclick={() => mm.act({ type: 'repair', equipment: r.equipment.id, decision: 'drop' })}>discard</button>
							<button type="button" class="go" disabled={mine.ready || r.price > mine.money} onclick={() => mm.act({ type: 'repair', equipment: r.equipment.id, decision: 'keep' })}>repair · ${r.price}</button>
						{:else}
							<span class:own={r.decision === 'keep'}>{r.decision === 'keep' ? `repaired · $${r.price}` : 'discarded'}</span>
							<button type="button" disabled={mine.ready} onclick={() => mm.act({ type: 'repair', equipment: r.equipment.id, decision: 'pending' })}>undo</button>
						{/if}
					{/snippet}
				</EquipmentCard>
			{/each}
		</div>
	</section>

	<aside class="col side">
		<RosterCard fighters={mine.fighters} team={mine.id} />
		<GearCard items={mine.equipment.map((e) => ({ id: e.id, key: e.key, note: yearsLeft(e.yearsLeft) }))} />
		<LeagueSidebar />
	</aside>
</main>

<ActionBar>
	<WaitingOn />
	<ReadyButton />
</ActionBar>

<style>
	.main {
		flex: 3 1 560px;
	}

	.side {
		flex: 1 1 300px;
	}

	.fbody {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
		align-items: flex-start;
	}

	.big-sprite {
		margin-top: -0.75rem;
		display: inline-flex;
	}

	.desc {
		flex: 1 1 12rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.repairs {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 0.75rem;
	}
</style>
