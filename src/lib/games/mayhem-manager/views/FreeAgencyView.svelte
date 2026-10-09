<script lang="ts">
	import { getContext } from 'svelte';
	import ActionBar from '../components/ActionBar.svelte';
	import FighterSprite from '../components/FighterSprite.svelte';
	import GearCard from '../components/GearCard.svelte';
	import LeagueSidebar from '../components/LeagueSidebar.svelte';
	import ReadyButton from '../components/ReadyButton.svelte';
	import RosterCard from '../components/RosterCard.svelte';
	import StatRows from '../components/StatRows.svelte';
	import TeamLogo from '../components/TeamLogo.svelte';
	import WaitingOn from '../components/WaitingOn.svelte';
	import { ABILITIES } from '../catalog.js';
	import { FA_CONTRACT_YEARS } from '../rules.js';
	import type { MMState } from '../state.svelte.js';
	import { yearsLeft } from '../summaries.js';
	import { TEAMS } from '../teams.js';

	const mm = getContext<MMState>('mm');
	const vp = $derived(mm.vp!);
	const mine = $derived(mm.myTeam);
	$effect(() => mm.ensureSeasonTotals(vp.season - 1));
	const day = $derived(vp.phase.kind === 'freeAgency' ? vp.phase.day : 1);
</script>

<main class="panel">
	<section class="col main">
		<div class="row between wrap">
			<h3>Free agents</h3>
			<span class="muted small">sign free agents for {FA_CONTRACT_YEARS} seasons. prices drop each day.</span>
		</div>
		{#if vp.freeAgents.length === 0}
			<p class="muted">Nobody's left.</p>
		{/if}
		<div class="fa-grid">
			{#each vp.freeAgents as a (a.fighter.id)}
				{@const f = a.fighter}
				{@const price = a.prices[day - 1]}
				{@const signedByMe = a.signedBy !== null && a.signedBy === vp.myTeam}
				<article class="card" class:mine={signedByMe} class:gone={a.signedBy !== null && !signedByMe}>
					<div class="row between wrap">
						<div class="row"><h3>{f.name}</h3><span class="muted">age {f.age}</span></div>
						<div class="prices" aria-label="price by day">
							{#each a.prices as p, i (i)}
								{#if i > 0}<span aria-hidden="true">›</span>{/if}
								<span class:past={i < day - 1} class:today={i === day - 1}>${p}</span>
							{/each}
						</div>
					</div>
					<div class="fbody">
						<span class="big-sprite"><FighterSprite look={f.look} team={a.signedBy} size={120} /></span>
						<StatRows stats={f.stats} />
						<div class="desc">
							<p>{ABILITIES[f.ability]?.description}</p>
							{#if mm.seasonLine(f.id, vp.season - 1)}
								<p class="muted small">Last season: {mm.seasonLine(f.id, vp.season - 1, true)}</p>
							{/if}
							{#if a.formerTeam !== null}
								<p class="muted small">formerly of the {TEAMS[a.formerTeam].last}</p>
							{:else}
								<p class="muted small">rookie</p>
							{/if}
						</div>
					</div>
					<div class="row foot">
						{#if a.signedBy !== null}
							<span class="row signed" class:own={signedByMe}>
								<TeamLogo team={a.signedBy} />signed by {signedByMe ? 'you' : TEAMS[a.signedBy].name} · ${a.signedPrice}
							</span>
						{:else if mine}
							<button
								type="button"
								class="go"
								disabled={mine.ready || price > mine.money}
								title={price > mine.money ? 'not enough money' : mine.ready ? 'unready to sign more' : undefined}
								onclick={() => mm.act({ type: 'sign', fighter: f.id })}>sign · ${price}</button
							>
						{/if}
					</div>
				</article>
			{/each}
		</div>
	</section>

	<aside class="col side">
		{#if mine}
			<RosterCard fighters={mine.fighters} team={mine.id} />
			<GearCard items={mine.equipment.map((e) => ({ id: e.id, key: e.key, note: yearsLeft(e.yearsLeft) }))} />
		{/if}
		<LeagueSidebar />
	</aside>
</main>

{#if mine}
	<ActionBar>
		<WaitingOn />
		<ReadyButton />
	</ActionBar>
{/if}

<style>
	.main {
		flex: 3 1 560px;
	}

	.side {
		flex: 1 1 300px;
	}

	.fa-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
		gap: 0.75rem;
	}

	.prices {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		font-size: 0.9rem;
		color: #aaa;
	}

	.past {
		text-decoration: line-through;
	}

	.today {
		font-size: 1.3rem;
		color: #ddd;
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
		flex: 1 1 10rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.foot {
		justify-content: flex-end;
	}

	.signed {
		font-size: 0.95rem;
	}

	@media (max-width: 720px) {
		.fa-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
