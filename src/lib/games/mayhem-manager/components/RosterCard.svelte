<script lang="ts">
	import { yearsLeft } from '../summaries.js';
	import type { Fighter, TeamId } from '../types.js';
	import FighterName from './FighterName.svelte';
	import FighterSprite from './FighterSprite.svelte';

	let { fighters, team, title = 'Roster', note = null }: { fighters: Fighter[]; team: TeamId; title?: string; note?: ((f: Fighter) => string) | null } = $props();
</script>

<div class="card">
	<h3>{title}</h3>
	{#if fighters.length === 0}
		<span class="muted small">no fighters</span>
	{/if}
	{#each fighters as f (f.id)}
		<div class="row between">
			<span class="row">
				<span class="mini-sprite"><FighterSprite look={f.look} {team} size={44} /></span>
				<FighterName id={f.id} name={f.name} />
			</span>
			<span class="muted small">{note ? note(f) : f.isOwner ? 'this season only' : yearsLeft(f.contractYears)}</span>
		</div>
	{/each}
</div>

<style>
	.mini-sprite {
		margin-top: -0.4rem;
		display: inline-flex;
	}
</style>
