<script lang="ts">
	import { getContext } from 'svelte';
	import ResultButtons from '../components/ResultButtons.svelte';
	import StandingsCard from '../components/StandingsCard.svelte';
	import TeamLogo from '../components/TeamLogo.svelte';
	import type { MMState } from '../state.svelte.js';
	import { TEAMS, teamShortName } from '../teams.js';
	import type { Match, TeamId } from '../types.js';

	const mm = getContext<MMState>('mm');
	const vp = $derived(mm.vp!);
	// after your fight, its week stays up until you move on, even if the next one has started
	const held = $derived(mm.heldMatch());
	const matches = $derived(held ? vp.matches.filter((m) => m.season === vp.season && m.week === held.week) : mm.currentMatches());
	const week = $derived(held ? held.week! + 1 : vp.phase.kind === 'regularSeason' ? vp.phase.week + 1 : 1);
	const nextLabel = $derived(vp.phase.kind === 'regularSeason' ? `on to week ${vp.phase.week + 1}` : 'on to the playoffs');

	const isReady = (t: TeamId) => mm.team(t)?.ready ?? false;

	function waitingOn(m: Match): string {
		const names = [m.a, m.b].filter((t) => !isReady(t)).map((t) => (t === vp.myTeam ? 'you' : teamShortName(t)));
		return names.length ? `waiting for ${names.join(' and ')}` : '';
	}
</script>

<main class="panel">
	<section class="col main">
		<div class="row between">
			<h3>Week {week} matchups</h3>
			{#if held}<button type="button" class="go" onclick={() => (mm.playedMatchId = null)}>{nextLabel}</button>{/if}
		</div>
		{#each matches as m (m.id)}
			{@const mineHere = m.a === vp.myTeam || m.b === vp.myTeam}
			<article class="card game-card" class:mine={mineHere}>
				<div class="game">
					{#each [m.a, m.b] as t, side (t)}
						{#if side === 1}
							<div class="center">
								<span class="vs">vs</span>
								{#if m.result}
									<ResultButtons match={m} />
								{:else}
									{#if mineHere && mm.myTeam?.ready}
										<button type="button" onclick={() => mm.act({ type: 'unready' })}>unready</button>
									{/if}
									<span class="muted small">{waitingOn(m)}</span>
								{/if}
							</div>
						{/if}
						<div class="side" class:right={side === 1}>
							<TeamLogo team={t} size="lg" />
							<div class="lines">
								<span class="tn" class:own={t === vp.myTeam}>{TEAMS[t].name}</span>
								<span class="muted small">{mm.recordOf(t)} · {m.result ? 'done' : isReady(t) ? 'ready' : 'not ready'}</span>
							</div>
						</div>
					{/each}
				</div>
			</article>
		{/each}
	</section>

	<aside class="col side-col">
		<StandingsCard />
	</aside>
</main>

<style>
	.main {
		flex: 3 1 560px;
	}

	.side-col {
		flex: 1 1 280px;
	}

	.game-card {
		padding: 0.9rem 1.25rem !important;
	}

	.game {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 11rem minmax(0, 1fr);
		align-items: center;
		gap: 1rem;
	}

	.side {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}

	.side.right {
		flex-direction: row-reverse;
		text-align: right;
	}

	.lines {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.tn {
		font-size: 1.1rem;
	}

	.center {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		text-align: center;
	}

	.vs {
		font-size: 1.2rem;
		font-weight: 700;
		color: #aaa;
	}

	@media (max-width: 720px) {
		.game {
			grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
			gap: 0.5rem;
		}

		.side {
			flex-direction: column !important;
			text-align: center !important;
		}

		.tn {
			font-size: 0.9rem;
		}
	}
</style>
