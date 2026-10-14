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
	const canForceReady = $derived(isHost && vp.phase.kind !== 'pregame' && anyoneWaiting);
	// with nobody running a team, the league only moves on when the host says so (bots are always ready)
	const hostMustContinue = $derived(isHost && vp.phase.kind !== 'pregame' && vp.teams.every((t) => t.controller === 'bot'));
	let copied = $state(false);
	// the room menu opens on hover, or on tap for touch screens
	let roomOpen = $state(false);
	let roomEl: HTMLElement | undefined = $state();

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
		{#if hostMustContinue}
			<button type="button" class="go" title="nobody's running a team, so the league moves on when you say so" onclick={() => mm.act({ type: 'forceReady' })}>continue</button>
		{/if}
		{#if !mine && vp.phase.kind === 'offseason' && !mm.choosingTeam}
			<button type="button" class="go" onclick={() => (mm.choosingTeam = true)}>join a team</button>
		{/if}
		<div class="room" class:open={roomOpen} bind:this={roomEl} onpointerleave={(e) => e.pointerType === 'mouse' && (roomOpen = false)}>
			<button type="button" class="tab" aria-haspopup="true" aria-expanded={roomOpen} onclick={() => (roomOpen = !roomOpen)}>room: {room.roomCode}</button>
			<div class="room-menu">
				{#if canForceReady}
					<button type="button" class="tab" title="bots make picks for anyone who isn't ready yet" onclick={() => mm.act({ type: 'forceReady' })}>force ready</button>
				{/if}
				<button type="button" class="tab" onclick={copyInvite}>{copied ? 'copied!' : 'copy invite'}</button>
				<a class="btn tab" href="/mayhem-manager">leave game</a>
			</div>
		</div>
	</div>
</header>

<svelte:window onclick={(e) => roomOpen && !roomEl?.contains(e.target as Node) && (roomOpen = false)} />

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
		background: #422 !important;
		border: 2px solid var(--mm-bg) !important;
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

	.room {
		position: relative;
	}

	.room-menu {
		display: none;
		position: absolute;
		top: 100%;
		right: 0;
		z-index: 100;
		flex-direction: column;
		gap: 0.3rem;
		/* padding instead of margin, so the pointer can cross the gap without closing the menu */
		padding-top: 0.3rem;
	}

	.room-menu .tab {
		width: 100%;
	}

	.room:hover .room-menu,
	.room:focus-within .room-menu,
	.room.open .room-menu {
		display: flex;
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
