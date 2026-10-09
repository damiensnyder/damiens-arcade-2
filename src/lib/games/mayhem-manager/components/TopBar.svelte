<script lang="ts">
	import { getContext } from 'svelte';
	import type { RoomState } from '../../room.svelte.js';
	import { phaseLabel } from '../rules.js';
	import type { MMState, Tab } from '../state.svelte.js';
	import { TEAMS } from '../teams.js';
	import TeamLogo from './TeamLogo.svelte';

	let { tabs, activeTab }: { tabs: { id: Tab; label: string }[]; activeTab: Tab | null } = $props();

	const mm = getContext<MMState>('mm');
	const room = getContext<RoomState>('room');
	const vp = $derived(mm.vp!);
	const mine = $derived(mm.myTeam);
	const isHost = $derived(room.host !== null && room.host === room.pov);
	const label = $derived(phaseLabel(vp.phase, mm.teamCount, mm.playoffRounds));
	const anyoneWaiting = $derived(vp.teams.some((t) => !t.ready));
	let copied = $state(false);

	function copyInvite() {
		navigator.clipboard?.writeText(window.location.href).then(() => {
			copied = true;
			setTimeout(() => (copied = false), 1500);
		});
	}

	function selectTab(id: Tab) {
		mm.tab = id;
		mm.scouting = false;
		mm.watching = null;
		if (id === 'team') mm.viewingTeam = mm.vp?.myTeam ?? mm.viewingTeam;
	}
</script>

<header class="topbar">
	<div class="row ident">
		{#if mine}
			<TeamLogo team={mine.id} size="md" />
			<div class="lines">
				<span class="tname">{TEAMS[mine.id].name}</span>
				<span class="topline">{label} · ${mine.money}</span>
			</div>
		{:else}
			<a class="title" href="/mayhem-manager">Mayhem Manager</a>
			{#if vp.phase.kind !== 'pregame'}<span class="topline">spectating · {label}</span>{/if}
		{/if}
	</div>

	{#if tabs.length > 0}
		<nav class="tabs" aria-label="Views">
			{#each tabs as t (t.id)}
				<button type="button" class="tab" class:on={activeTab === t.id} aria-current={activeTab === t.id ? 'page' : undefined} onclick={() => selectTab(t.id)}>{t.label}</button>
			{/each}
		</nav>
	{/if}

	<div class="row end">
		{#if vp.phase.kind === 'pregame'}
			<button type="button" onclick={copyInvite}>{copied ? 'copied!' : 'copy invite link'}</button>
		{/if}
		{#if !mine && vp.phase.kind === 'offseason' && !mm.choosingTeam}
			<button type="button" class="go" onclick={() => (mm.choosingTeam = true)}>join a team</button>
		{/if}
		{#if isHost && vp.phase.kind !== 'pregame' && anyoneWaiting}
			<button type="button" class="host" title="bots make picks for anyone who isn't ready yet" onclick={() => mm.act({ type: 'forceReady' })}>force ready</button>
		{/if}
		<span class="code muted small" title="room code">{room.roomCode}</span>
	</div>
</header>

<style>
	.topbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1.5rem;
		padding: 0.75rem 1.5rem;
	}

	.ident {
		flex: 1 1 auto;
		min-width: 0;
	}

	.lines {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.tname {
		font-size: 1.15rem;
		font-weight: 600;
		color: #eeb;
	}

	.title {
		font-size: 1.4rem;
		font-weight: 600;
		color: #ddd !important;
		text-decoration: none;
	}

	.topline {
		font-size: 1rem;
		color: #ddd;
	}

	.tabs {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}

	.tab {
		background: none !important;
		border: 2px solid transparent !important;
		padding: 0.3rem 0.8rem !important;
		color: #ddd;
	}

	.tab:hover {
		border-color: #755 !important;
	}

	.tab.on {
		border-color: #aaa !important;
		background: #755 !important;
		color: #ddd !important;
	}

	.end {
		flex-wrap: wrap;
	}

	.code {
		font-family: Menlo, monospace;
	}

	@media (max-width: 720px) {
		.topbar {
			padding: 0.5rem;
			gap: 0.5rem;
		}

		.tabs {
			order: 3;
			width: 100%;
		}

		.tab {
			padding: 0.2rem 0.5rem !important;
			font-size: 0.9rem !important;
		}
	}
</style>
