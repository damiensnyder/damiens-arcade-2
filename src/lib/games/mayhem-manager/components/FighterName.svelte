<script lang="ts">
	// A fighter's name that shows their card on hover.
	import { getContext } from 'svelte';
	import { ABILITIES } from '../catalog.js';
	import type { MMState } from '../state.svelte.js';
	import { TEAMS } from '../teams.js';
	import FighterSprite from './FighterSprite.svelte';
	import Hover from './Hover.svelte';
	import StatRows from './StatRows.svelte';
	import TeamLogo from './TeamLogo.svelte';

	let { id, name }: { id: number; name: string } = $props();
	const mm = getContext<MMState>('mm');
	const found = $derived(mm.findFighter(id));
</script>

<Hover>
	{name}
	{#snippet card()}
		{#if found}
			{@const f = found.fighter}
			<div class="row between">
				<h3>{f.name}</h3>
				<span class="muted small">age {f.age}</span>
			</div>
			<div class="row small">
				{#if found.team !== null}
					<TeamLogo team={found.team} size="xs" />{TEAMS[found.team].name}
				{:else}
					<span class="muted">free agent</span>
				{/if}
			</div>
			<div class="row" style="align-items: flex-start; gap: 0.9rem">
				<span style="margin-top: -0.5rem"><FighterSprite look={f.look} team={found.team} size={88} /></span>
				<StatRows stats={f.stats} size={14} />
			</div>
			{#if ABILITIES[f.ability]?.description}<p class="small">{ABILITIES[f.ability].description}</p>{/if}
			{#if f.isOwner}
				<p class="muted small">this season only · can't be re-signed. didn't sign any fighters. uh oh!</p>
			{:else if mm.seasonLine(f.id)}
				<p class="muted small">this season: {mm.seasonLine(f.id)}</p>
			{/if}
		{:else}
			<h3>{name}</h3>
			<p class="muted small">no longer in the league</p>
		{/if}
	{/snippet}
</Hover>
