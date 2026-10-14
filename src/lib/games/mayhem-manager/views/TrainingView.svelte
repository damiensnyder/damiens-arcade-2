<script lang="ts">
	import { getContext } from 'svelte';
	import AbilityText from '../components/AbilityText.svelte';
	import ActionBar from '../components/ActionBar.svelte';
	import EquipmentCard from '../components/EquipmentCard.svelte';
	import FighterSprite from '../components/FighterSprite.svelte';
	import GearCard from '../components/GearCard.svelte';
	import LeagueSidebar from '../components/LeagueSidebar.svelte';
	import ReadyButton from '../components/ReadyButton.svelte';
	import StatRows from '../components/StatRows.svelte';
	import WaitingOn from '../components/WaitingOn.svelte';
	import { EQUIPMENT } from '../catalog.js';
	import { MAX_STAT, NEW_EQUIPMENT_YEARS } from '../rules.js';
	import type { MMState } from '../state.svelte.js';
	import { yearsLeft } from '../summaries.js';
	import type { Fighter, StatName } from '../types.js';

	const mm = getContext<MMState>('mm');
	const mine = $derived(mm.myTeam!);
	const priv = $derived(mm.vp!.private!);
	/** Owned equipment that can be attuned to. */
	const ownedKeys = $derived(
		[...new Set([...mine.equipment.map((e) => e.key), ...priv.shop.filter((s) => s.bought).map((s) => s.key)])].filter(
			(k) => EQUIPMENT[k]?.attunable
		)
	);
	/** Which equipment each fighter's attune dropdown has selected. */
	let attuneChoice = $state<Record<number, string>>({});

	function planLabel(f: Fighter): string {
		const plan = priv.training[f.id];
		if (!plan) return 'select a stat or attunement';
		return plan.kind === 'stat' ? `training ${plan.stat}` : `attuning to ${EQUIPMENT[plan.key]?.name ?? plan.key}`;
	}

	function trainStat(f: Fighter, stat: StatName) {
		const plan = priv.training[f.id];
		const already = plan?.kind === 'stat' && plan.stat === stat;
		mm.act({ type: 'train', fighter: f.id, plan: already ? null : { kind: 'stat', stat } });
	}

	function selectedAttune(f: Fighter): string {
		const plan = priv.training[f.id];
		if (plan?.kind === 'attune') return plan.key;
		const choice = attuneChoice[f.id];
		if (choice && ownedKeys.includes(choice) && !f.attunements.includes(choice)) return choice;
		return ownedKeys.find((k) => !f.attunements.includes(k)) ?? '';
	}

	function attune(f: Fighter) {
		const plan = priv.training[f.id];
		const key = selectedAttune(f);
		if (plan?.kind === 'attune' && plan.key === key) mm.act({ type: 'train', fighter: f.id, plan: null });
		else if (key) mm.act({ type: 'train', fighter: f.id, plan: { kind: 'attune', key } });
	}

	function chooseAttune(f: Fighter, key: string) {
		attuneChoice = { ...attuneChoice, [f.id]: key };
		const plan = priv.training[f.id];
		if (plan?.kind === 'attune' && key !== plan.key) mm.act({ type: 'train', fighter: f.id, plan: { kind: 'attune', key } });
	}
</script>

<main class="panel">
	<section class="col main">
		<div class="row between wrap">
			<h3>Equipment shop</h3>
			<span class="muted small">new equipment lasts {NEW_EQUIPMENT_YEARS} seasons before it needs repair.</span>
		</div>
		<div class="shop">
			{#each priv.shop as item (item.id)}
				<EquipmentCard itemKey={item.key} cls={item.bought ? 'mine' : ''}>
					{#snippet actions()}
						{#if item.bought}
							<span class="own small">bought</span>
							<button type="button" disabled={mine.ready} onclick={() => mm.act({ type: 'buy', item: item.id, bought: false })}>undo</button>
						{:else}
							<button type="button" class="go" disabled={mine.ready || item.price > mine.money} onclick={() => mm.act({ type: 'buy', item: item.id, bought: true })}>buy · ${item.price}</button>
						{/if}
					{/snippet}
				</EquipmentCard>
			{/each}
		</div>

		<div class="row between wrap" style="margin-top: 0.5rem">
			<h3>Training</h3>
			<span class="muted small">each fighter trains one stat or attunes to one piece of equipment.</span>
		</div>
		{#if mine.fighters.length === 0}
			<p class="muted">You don't have any fighters. Your team's owner is getting nervous.</p>
		{/if}
		{#each mine.fighters as f (f.id)}
			{@const plan = priv.training[f.id]}
			<article class="card">
				<div class="row between wrap">
					<div class="row"><h3>{f.name}</h3><span class="muted">age {f.age}</span></div>
					<span class="small" class:own={!!plan} class:muted={!plan}>{planLabel(f)}</span>
				</div>
				<div class="row wrap trainee">
					<span class="big-sprite"><FighterSprite look={f.look} team={mine.id} size={96} /></span>
					<div class="ability">
						<AbilityText ability={f.ability} />
						{#if f.attunements.length > 0}
							<p class="muted small">attuned: {f.attunements.map((k) => EQUIPMENT[k]?.name ?? k).join(', ')}</p>
						{/if}
					</div>
					<div class="plan">
						<StatRows stats={f.stats} preview={plan?.kind === 'stat' ? plan.stat : null}>
							{#snippet after(stat)}
								{@const on = plan?.kind === 'stat' && plan.stat === stat}
								<button
									type="button"
									class="mini"
									class:on
									disabled={mine.ready || f.stats[stat] >= MAX_STAT}
									onclick={() => trainStat(f, stat)}>{f.stats[stat] >= MAX_STAT ? 'maxed' : on ? 'training' : 'train'}</button
								>
							{/snippet}
						</StatRows>
						{#if f.ability === 'cantAttune'}
							<p class="muted small">can't attune to equipment</p>
						{:else}
							<div class="attune">
								<select
									aria-label="Equipment for {f.name} to attune to"
									disabled={mine.ready || ownedKeys.every((k) => f.attunements.includes(k))}
									value={selectedAttune(f)}
									onchange={(e) => chooseAttune(f, e.currentTarget.value)}
								>
									{#if ownedKeys.length === 0}<option value="">no equipment to attune to</option>{/if}
									{#each ownedKeys as key (key)}
										<option value={key} disabled={f.attunements.includes(key)}>{EQUIPMENT[key]?.name}{f.attunements.includes(key) ? ' (attuned)' : ''}</option>
									{/each}
								</select>
								<button
									type="button"
									class="mini"
									class:on={plan?.kind === 'attune'}
									disabled={mine.ready || !selectedAttune(f)}
									onclick={() => attune(f)}>{plan?.kind === 'attune' ? 'attuning' : 'attune'}</button
								>
							</div>
						{/if}
					</div>
				</div>
			</article>
		{/each}
	</section>

	<aside class="col side">
		<GearCard
			items={[
				...mine.equipment.map((e) => ({ id: e.id, key: e.key, note: yearsLeft(e.yearsLeft) })),
				...priv.shop.filter((s) => s.bought).map((s) => ({ id: s.id, key: s.key, note: `new · ${NEW_EQUIPMENT_YEARS} yrs`, isNew: true }))
			]}
		/>
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

	.shop {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.trainee {
		align-items: flex-start !important;
		gap: 1rem 1.5rem !important;
	}

	.big-sprite {
		margin-top: -0.5rem;
		display: inline-flex;
	}

	.ability {
		flex: 1 1 8rem;
		min-width: 0;
		font-size: 0.95rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.plan {
		flex: 0 1 19rem;
		min-width: 15rem;
	}

	.attune {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 5.2rem;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.35rem;
		padding-top: 0.45rem;
		border-top: 2px solid #755;
	}

	.attune select {
		width: 100%;
	}

	.attune button {
		justify-self: end;
	}

	@media (max-width: 1100px) {
		.shop {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 480px) {
		.shop {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
