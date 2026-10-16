<script lang="ts">
	// League card with each team's roster size, money and ready status.
	import { getContext } from 'svelte';
	import type { RoomState } from '../../room.svelte.js';
	import { MAX_TEAMS } from '../rules.js';
	import type { MMState } from '../state.svelte.js';
	import type { TeamView } from '../types.js';
	import { TEAMS } from '../teams.js';
	import BotIcon from './BotIcon.svelte';
	import ReadyButton from './ReadyButton.svelte';
	import TeamLogo from './TeamLogo.svelte';

	const mm = getContext<MMState>('mm');
	const room = getContext<RoomState>('room');
	const vp = $derived(mm.vp!);
	const isHost = $derived(room.host !== null && room.host === room.pov);
	// during the offseason, re-signed fighters and repaired equipment count as kept
	const fighterCount = (t: TeamView) => t.fighters.length + t.expiring.filter((c) => c.decision === 'keep').length;
	const equipmentCount = (t: TeamView) => t.equipment.length + t.repairs.filter((r) => r.decision === 'keep').length;
</script>

<div class="card">
	<!-- add a bot sits up here so it doesn't move down as the list grows -->
	<div class="row between">
		<h3>League</h3>
		{#if isHost && vp.phase.kind === 'offseason' && vp.teams.length < MAX_TEAMS}
			<button type="button" class="mini" onclick={() => mm.act({ type: 'addBot' })}>add a bot</button>
		{/if}
	</div>
	{#each vp.teams as t (t.id)}
		<div class="lg-row" class:me={t.isMine}>
			<TeamLogo team={t.id} />
			<div class="who">
				<button type="button" class="link lg-name" onclick={() => mm.viewTeam(t.id)}>{TEAMS[t.id].name}</button>
				<span class="muted small">{fighterCount(t)} fighters · {equipmentCount(t)} equipment · ${t.money}</span>
			</div>
			{#if t.isMine}
				<ReadyButton />
			{:else}
				<span class="status">
					{#if t.controller === 'bot'}<BotIcon size={14} />{/if}
					{t.ready ? 'ready' : 'not ready'}
				</span>
			{/if}
		</div>
	{/each}
</div>

<style>
	.lg-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.6rem;
	}

	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
		align-items: flex-start;
	}

	.lg-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}

	.lg-row.me .lg-name {
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

	.status {
		font-size: 0.85rem;
		color: #aaa;
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
</style>
