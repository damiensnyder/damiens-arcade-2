<script lang="ts">
	// Pick a team: before the first season, or when a spectator joins during the offseason.
	import { getContext } from 'svelte';
	import type { RoomState } from '../../room.svelte.js';
	import ActionBar from '../components/ActionBar.svelte';
	import BotIcon from '../components/BotIcon.svelte';
	import TeamLogo from '../components/TeamLogo.svelte';
	import { MAX_TEAMS } from '../rules.js';
	import type { MMState } from '../state.svelte.js';
	import { TEAMS } from '../teams.js';

	const mm = getContext<MMState>('mm');
	const room = getContext<RoomState>('room');
	const vp = $derived(mm.vp!);
	const mine = $derived(mm.myTeam);
	const isHost = $derived(room.host !== null && room.host === room.pov);
	const pregame = $derived(vp.phase.kind === 'pregame');
	const canAdd = $derived((pregame || vp.phase.kind === 'offseason') && vp.teams.length < MAX_TEAMS);

	const cards = $derived(
		TEAMS.map((identity, id) => {
			const team = vp.teams.find((t) => t.id === id);
			return {
				id,
				identity,
				status: !team ? 'open' : team.controller === 'bot' ? 'bot' : team.isMine ? 'mine' : 'human'
			};
		})
	);
</script>

<main class="panel join">
	<section class="col teams-col">
		{#if !pregame}
			<div class="row between wrap">
				<h3>Join a team</h3>
				<button type="button" onclick={() => (mm.choosingTeam = false)}>back to the league</button>
			</div>
		{/if}
		<div class="teams">
			{#each cards as c (c.id)}
				<div class="tc" class:taken={c.status === 'human'} class:mine={c.status === 'mine'}>
					{#if c.status === 'bot'}<span class="tc-icon"><BotIcon size={20} /></span>{/if}
					{#if c.status === 'human' || c.status === 'mine'}<span class="tc-icon"><BotIcon kind="human" size={20} /></span>{/if}
					<TeamLogo team={c.id} size="md" />
					<div class="tc-body">
						<span class="tc-name">{c.identity.first}<br />{c.identity.last}</span>
						{#if c.status === 'open' && !mine && canAdd}
							<button type="button" class="go" onclick={() => mm.act({ type: 'join', team: c.id })}>join</button>
						{:else if c.status === 'bot' && !mine}
							<button type="button" onclick={() => mm.act({ type: 'replace', team: c.id })}>replace</button>
						{:else if c.status === 'bot' && isHost && pregame}
							<button type="button" class="mini" onclick={() => mm.act({ type: 'removeBot', team: c.id })}>remove</button>
						{:else if c.status === 'mine'}
							<span class="own small">your team</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</section>

	<aside class="col side-col">
		<div class="card">
			<h3>Players</h3>
			{#if vp.teams.length === 0}
				<span class="muted small">nobody has picked a team yet.</span>
			{/if}
			{#each vp.teams as t (t.id)}
				<div class="row between">
					<span class="row"><TeamLogo team={t.id} />{TEAMS[t.id].name}</span>
					<span class="muted small">{t.controller === 'bot' ? 'bot' : t.isMine ? (t.ready ? 'you · ready' : 'you') : t.ready ? 'ready' : 'not ready'}</span>
				</div>
			{/each}
			{#if pregame && vp.teams.length % 2 === 1}
				<span class="muted small note">odd number of teams – a bot will be added to make it even.</span>
			{/if}
		</div>

		<div class="side-actions desktop-only">
			{#if mine && pregame}
				<button type="button" onclick={() => mm.act({ type: 'leave' })}>leave team</button>
				<button type="button" class:go={!mine.ready} onclick={() => mm.act({ type: mine.ready ? 'unready' : 'ready' })}>{mine.ready ? 'unready' : 'ready'}</button>
			{/if}
			{#if isHost && canAdd}
				<button type="button" onclick={() => mm.act({ type: 'addBot' })}>add a bot</button>
			{/if}
			{#if isHost && pregame}
				<button type="button" class="go" disabled={vp.teams.length === 0} onclick={() => mm.act({ type: 'forceReady' })}>start season</button>
			{/if}
		</div>
		{#if !mine && pregame}
			<p class="muted small">pick a team to play, or just watch.</p>
		{/if}
	</aside>
</main>

<ActionBar>
	{#if mine && pregame}
		<button type="button" onclick={() => mm.act({ type: 'leave' })}>leave team</button>
		<button type="button" class:go={!mine.ready} onclick={() => mm.act({ type: mine.ready ? 'unready' : 'ready' })}>{mine.ready ? 'unready' : 'ready'}</button>
	{/if}
	{#if isHost && canAdd}
		<button type="button" onclick={() => mm.act({ type: 'addBot' })}>add a bot</button>
	{/if}
	{#if isHost && pregame}
		<button type="button" class="go" disabled={vp.teams.length === 0} onclick={() => mm.act({ type: 'forceReady' })}>start season</button>
	{/if}
</ActionBar>

<style>
	.teams-col {
		flex: 3 1 560px;
	}

	.side-col {
		flex: 1 1 300px;
	}

	.teams {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.6rem;
	}

	.tc {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		background: #521;
		border: 3px solid #755;
		border-radius: 1rem;
		padding: 0.5rem 1.6rem 0.5rem 0.6rem;
		min-width: 0;
	}

	.tc.taken {
		opacity: 0.6;
	}

	.tc.mine {
		border-color: #eeb;
	}

	.tc-icon {
		position: absolute;
		top: 0.35rem;
		right: 0.4rem;
		display: inline-flex;
	}

	.tc-body {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.3rem;
		min-width: 0;
	}

	.tc-name {
		font-size: 0.95rem;
		line-height: 1.15;
		font-weight: 400;
	}

	.note {
		border-top: 2px solid #755;
		padding-top: 0.5rem;
	}

	.side-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		justify-content: center;
	}

	@media (max-width: 900px) {
		.tc {
			flex-direction: column;
			text-align: center;
			padding: 0.5rem 0.3rem;
		}

		.tc-body {
			align-items: center;
		}

		.tc-name {
			font-size: 0.75rem;
		}

		.tc :global(button) {
			font-size: 0.8rem;
			min-height: 1.8rem;
			padding: 0.1rem 0.4rem;
		}
	}

	@media (max-width: 480px) {
		.teams {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
