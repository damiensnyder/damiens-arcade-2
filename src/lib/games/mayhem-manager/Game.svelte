<script lang="ts">
	import { getContext } from 'svelte';
	import type { RoomState } from '../room.svelte.js';
	import TopBar from './components/TopBar.svelte';
	import type { MMState, Tab } from './state.svelte.js';
	import FreeAgencyView from './views/FreeAgencyView.svelte';
	import HistoryView from './views/HistoryView.svelte';
	import JoinView from './views/JoinView.svelte';
	import LeagueView from './views/LeagueView.svelte';
	import MatchupsView from './views/MatchupsView.svelte';
	import OffseasonView from './views/OffseasonView.svelte';
	import PlayoffsView from './views/PlayoffsView.svelte';
	import PrepView from './views/PrepView.svelte';
	import ScoutView from './views/ScoutView.svelte';
	import TeamPage from './views/TeamPage.svelte';
	import TrainingView from './views/TrainingView.svelte';
	import WatchFight from './views/WatchFight.svelte';

	const mm = getContext<MMState>('mm');
	const room = getContext<RoomState>('room');
	const vp = $derived(mm.vp);
	const mine = $derived(mm.myTeam);

	const PHASE_TAB_LABELS: Record<string, string> = {
		offseason: 'offseason',
		freeAgency: 'free agency',
		training: 'training',
		regularSeason: 'regular season',
		playoffs: 'playoffs',
		seasonOver: 'playoffs'
	};

	/** Spectators skip phase screens that are only about running a team. */
	const hasPhaseTab = $derived(!!vp && (mine !== null || !['offseason', 'training'].includes(vp.phase.kind)));

	const tabs = $derived.by((): { id: Tab; label: string }[] => {
		if (!vp || vp.phase.kind === 'pregame' || mm.choosingTeam) return [];
		const list: { id: Tab; label: string }[] = [];
		if (hasPhaseTab) list.push({ id: 'phase', label: PHASE_TAB_LABELS[vp.phase.kind] });
		list.push({ id: 'league', label: 'league' });
		if (mine) list.push({ id: 'team', label: 'my team' });
		list.push({ id: 'history', label: 'history' });
		return list;
	});

	const activeTab = $derived<Tab>(mm.tab === 'phase' && !hasPhaseTab ? 'league' : mm.tab);
	/** Which phase screen to show for the current viewer. */
	const phaseScreen = $derived.by(() => {
		if (!vp) return null;
		switch (vp.phase.kind) {
			case 'offseason':
				return 'offseason';
			case 'freeAgency':
				return 'freeAgency';
			case 'training':
				return 'training';
			case 'regularSeason':
			case 'playoffs': {
				const match = mm.myCurrentMatch();
				if (mine && match && !match.result && !mine.ready) return mm.scouting ? 'scout' : 'prep';
				return vp.phase.kind === 'regularSeason' ? 'matchups' : 'playoffs';
			}
			case 'seasonOver':
				return 'playoffs';
			default:
				return null;
		}
	});
</script>

<div class="mm">
	{#if room.errorMessage}
		<div class="overlay" role="alert">
			<p>{room.errorMessage}</p>
			<a href="/mayhem-manager">Back to Mayhem Manager</a>
		</div>
	{/if}

	{#if !vp}
		<p class="loading muted">connecting…</p>
	{:else}
		<TopBar tabs={tabs} activeTab={tabs.length ? (mm.watching || (activeTab === 'team' && !mine) ? null : activeTab) : null} />

		{#if mm.notice}
			<div class="notice" role="status">
				<span>{mm.notice}</span>
				<button type="button" class="mini" onclick={() => (mm.notice = null)}>ok</button>
			</div>
		{/if}

		{#if vp.phase.kind === 'pregame' || mm.choosingTeam}
			<JoinView />
		{:else if mm.watching}
			{#if mm.watching.log}
				{#key mm.watching.matchId}
					<WatchFight log={mm.watching.log} />
				{/key}
			{:else}
				<main class="panel"><p class="muted">loading the replay…</p></main>
			{/if}
		{:else if activeTab === 'league'}
			<LeagueView />
		{:else if activeTab === 'team'}
			<TeamPage />
		{:else if activeTab === 'history'}
			<HistoryView />
		{:else if phaseScreen === 'offseason'}
			<OffseasonView />
		{:else if phaseScreen === 'freeAgency'}
			<FreeAgencyView />
		{:else if phaseScreen === 'training'}
			<TrainingView />
		{:else if phaseScreen === 'prep'}
			<PrepView />
		{:else if phaseScreen === 'scout'}
			<ScoutView />
		{:else if phaseScreen === 'matchups'}
			<MatchupsView />
		{:else if phaseScreen === 'playoffs'}
			<PlayoffsView />
		{/if}
	{/if}
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: #311e;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		font-size: 1.1rem;
		color: #f99;
	}

	.loading {
		padding: 2rem;
		text-align: center;
	}

	.notice {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin: 0 1.5rem 0.75rem;
		padding: 0.5rem 1rem;
		border: 2px solid #eeb;
		border-radius: 0.75rem;
		background: #521;
		color: #eeb;
	}

	@media (max-width: 720px) {
		.notice {
			margin: 0 0.5rem 0.5rem;
		}
	}
</style>
