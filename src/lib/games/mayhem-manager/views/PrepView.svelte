<script lang="ts">
	// Before a fight: put equipment on fighters, scout the other team, then ready up.
	import { getContext } from 'svelte';
	import ActionBar from '../components/ActionBar.svelte';
	import EquipmentCard from '../components/EquipmentCard.svelte';
	import FighterSprite from '../components/FighterSprite.svelte';
	import MatchupHeader from '../components/MatchupHeader.svelte';
	import ResultButtons from '../components/ResultButtons.svelte';
	import StatRows from '../components/StatRows.svelte';
	import TeamLogo from '../components/TeamLogo.svelte';
	import { ABILITIES, EQUIPMENT } from '../catalog.js';
	import { canWearTogether, roundName } from '../rules.js';
	import type { MMState } from '../state.svelte.js';
	import { TEAMS } from '../teams.js';
	import type { Equipment, Fighter } from '../types.js';

	const mm = getContext<MMState>('mm');
	const mine = $derived(mm.myTeam!);
	const match = $derived(mm.myCurrentMatch()!);
	const opponent = $derived(match.a === mine.id ? match.b : match.a);
	const lineup = $derived(mm.vp!.private?.lineup ?? {});
	const last = $derived(mm.myLastMatch());

	const keyOf = (id: number) => mine.equipment.find((e) => e.id === id)?.key ?? '';
	const holderOf = (e: Equipment) => mine.fighters.find((f) => (lineup[f.id] ?? []).includes(e.id)) ?? null;
	const wornBy = (f: Fighter) => (lineup[f.id] ?? []).map(keyOf).filter(Boolean);

	function optionFor(e: Equipment, f: Fighter) {
		const others = (lineup[f.id] ?? []).filter((id) => id !== e.id).map(keyOf);
		const fits = canWearTogether([...others, e.key]);
		let note = '';
		if (!fits) {
			const slots = EQUIPMENT[e.key]?.slots ?? [];
			note = slots.includes('hand') ? ' (hands full)' : ` (${slots[0]} taken)`;
		} else if (f.attunements.includes(e.key)) {
			note = ' (attuned)';
		}
		return { disabled: !fits, label: f.name + note };
	}

	function equip(e: Equipment, value: string) {
		mm.act({ type: 'equip', equipment: e.id, fighter: value === '' ? null : Number(value) });
	}

	function lastLabel(): string {
		if (!last) return '';
		const opp = last.a === mine.id ? last.b : last.a;
		const when = last.week !== null ? `Week ${last.week + 1}` : roundName(last.round!, mm.playoffRounds);
		return `${when}: vs the ${TEAMS[opp].last}`;
	}
</script>

<main class="panel prep">
	<div class="full">
		<MatchupHeader a={mine.id} b={opponent}>
			{#snippet actions()}
				<button type="button" onclick={() => (mm.scouting = true)}>scout opponent</button>
				<button type="button" class="go" onclick={() => mm.act({ type: 'ready' })}>ready</button>
			{/snippet}
		</MatchupHeader>
	</div>

	{#if last}
		<div class="full card last">
			<span class="row"><TeamLogo team={last.a === mine.id ? last.b : last.a} />{lastLabel()}</span>
			<ResultButtons match={last} />
		</div>
	{/if}

	<section class="col fighters">
		<h3>Your fighters</h3>
		{#each mine.fighters as f (f.id)}
			<article class="card">
				<div class="row between wrap">
					<div class="row"><h3>{f.name}</h3><span class="muted">age {f.age}</span></div>
					<span class="muted small">{wornBy(f).length === 0 ? 'no equipment' : wornBy(f).map((k) => EQUIPMENT[k]?.name).join(', ')}</span>
				</div>
				<div class="fbody">
					<span class="big-sprite"><FighterSprite look={f.look} team={mine.id} equipment={wornBy(f)} size={100} /></span>
					<div class="ability"><p>{ABILITIES[f.ability]?.description}</p></div>
					<div class="stats-col"><StatRows stats={f.stats} /></div>
				</div>
			</article>
		{/each}
	</section>

	<section class="col gear">
		<h3>Your equipment</h3>
		{#if mine.equipment.length === 0}
			<p class="muted">You don't have any equipment. Fists it is.</p>
		{/if}
		{#each mine.equipment as e (e.id)}
			{@const holder = holderOf(e)}
			<EquipmentCard itemKey={e.key} imgSize={72} cls={holder ? 'mine' : ''}>
				<label class="equip-to"
					>equip to:
					<select aria-label="Fighter to equip {EQUIPMENT[e.key]?.name} to" value={holder ? String(holder.id) : ''} onchange={(ev) => equip(e, ev.currentTarget.value)}>
						<option value="">-- select a fighter --</option>
						{#each mine.fighters as f (f.id)}
							{@const opt = optionFor(e, f)}
							<option value={String(f.id)} disabled={opt.disabled}>{opt.label}</option>
						{/each}
					</select>
				</label>
			</EquipmentCard>
		{/each}
	</section>
</main>

<ActionBar>
	<button type="button" onclick={() => (mm.scouting = true)}>scout opponent</button>
	<button type="button" class="go" onclick={() => mm.act({ type: 'ready' })}>ready</button>
</ActionBar>

<style>
	.prep {
		flex-direction: row;
	}

	.full {
		flex: 1 1 100%;
		display: block;
	}

	.last {
		flex-direction: row !important;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
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

	.equip-to {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
	}

	.equip-to select {
		flex: 1;
		min-width: 0;
	}

	/* on phones, handing out equipment comes first (the fighters are the reference) */
	@media (max-width: 900px) {
		.full {
			order: -2;
		}

		.gear {
			order: -1;
		}
	}
</style>
