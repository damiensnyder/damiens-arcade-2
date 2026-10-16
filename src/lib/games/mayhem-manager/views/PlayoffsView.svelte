<script lang="ts">
	// The playoff bracket, and the end-of-season screen. Results stay hidden (including who
	// advanced) until the viewer chooses to see them.
	import { getContext } from 'svelte';
	import ActionBar from '../components/ActionBar.svelte';
	import ReadyButton from '../components/ReadyButton.svelte';
	import ResultButtons from '../components/ResultButtons.svelte';
	import TeamLogo from '../components/TeamLogo.svelte';
	import WaitingOn from '../components/WaitingOn.svelte';
	import { roundName } from '../rules.js';
	import type { MMState } from '../state.svelte.js';
	import { TEAMS, teamShortName } from '../teams.js';
	import type { Match, PlayoffPairing, PlayoffSlot, TeamId } from '../types.js';

	const mm = getContext<MMState>('mm');
	const vp = $derived(mm.vp!);
	const bracket = $derived(vp.bracket);
	const rounds = $derived(bracket?.rounds ?? []);
	// teams in the bracket move on round by round themselves, so the season isn't over for them
	// (and nor is their run) until they've moved past every round
	const held = $derived(mm.heldPlayoffRound());
	const seasonOver = $derived(vp.phase.kind === 'seasonOver' && held === null);

	const matchOf = (p: PlayoffPairing): Match | undefined => vp.matches.find((m) => m.id === p.matchId);
	const revealed = (p: PlayoffPairing) => {
		if (p.bye) return true;
		const m = matchOf(p);
		return !!m && mm.isRevealed(m);
	};

	type Shown = { team: TeamId | null; seed: number | null; label: string };

	/** What to show in a slot, without spoiling earlier results the viewer hasn't seen. */
	function shown(round: number, index: number, side: 'a' | 'b'): Shown {
		const pairing = rounds[round][index];
		const slot: PlayoffSlot = pairing[side];
		if (round === 0) return { ...slot, label: slot.team !== null ? TEAMS[slot.team].name : pairing.bye ? 'bye' : '?' };
		const source = rounds[round - 1][index * 2 + (side === 'a' ? 0 : 1)];
		if (slot.team !== null && revealed(source)) return { ...slot, label: TEAMS[slot.team].name };
		const a = shown(round - 1, index * 2 + (side === 'a' ? 0 : 1), 'a');
		const b = shown(round - 1, index * 2 + (side === 'a' ? 0 : 1), 'b');
		const label =
			a.team !== null && b.team !== null
				? `${teamShortName(a.team)} or ${teamShortName(b.team)}`
				: `${roundName(round - 1, rounds.length)} winner`;
		return { team: null, seed: null, label };
	}

	/** A later-round match only becomes visible once the matches feeding it are revealed. */
	function visible(round: number, index: number): boolean {
		if (round === 0) return true;
		return revealed(rounds[round - 1][index * 2]) && revealed(rounds[round - 1][index * 2 + 1]) && visible(round - 1, index * 2) && visible(round - 1, index * 2 + 1);
	}

	const final = $derived(rounds.at(-1)?.[0]);
	const champion = $derived(final && final.winner !== null && revealed(final) && visible(rounds.length - 1, 0) ? final.winner : null);

	function sub(t: TeamId | null, pairing: PlayoffPairing): string {
		if (t === null) return '';
		const m = matchOf(pairing);
		const status = m?.result ? '' : mm.team(t)?.ready ? ' · ready' : ' · not ready';
		return mm.recordOf(t) + (m ? status : '');
	}

	function waitingOn(p: PlayoffPairing): string {
		const m = matchOf(p);
		if (!m || m.result) return '';
		const names = [m.a, m.b].filter((t) => !mm.team(t)?.ready).map((t) => (t === vp.myTeam ? 'you' : teamShortName(t)));
		return names.length ? `waiting for ${names.join(' and ')}` : '';
	}

	const isLoser = (p: PlayoffPairing, t: TeamId | null) => t !== null && p.winner !== null && p.winner !== t && revealed(p);
</script>

<main class="panel playoffs">
	{#if seasonOver}
		<div class="card banner">
			<div>
				<h3>Season {vp.season} is over</h3>
				{#if champion !== null}
					<p>The {TEAMS[champion].name} are the champions!</p>
				{:else}
					<p class="muted">Watch the final, or see the result, to find out who won.</p>
				{/if}
			</div>
			{#if mm.myTeam}
				<div class="row wrap desktop-only"><WaitingOn /><ReadyButton label="on to the offseason" /></div>
			{/if}
		</div>
	{/if}

	{#if held !== null}
		{@const name = roundName(held, rounds.length)}
		<div class="card banner">
			<p>{mm.playedInRound(held) ? `Your ${name} fight is` : `The ${name} ${name.endsWith('s') ? 'are' : 'is'}`} over.</p>
			<button type="button" class="go" onclick={() => mm.moveOnFromPlayoffRound()}>on to the {roundName(held + 1, rounds.length)}</button>
		</div>
	{/if}

	{#if rounds.length === 0}
		<p class="muted">No playoffs yet.</p>
	{:else}
		<div class="bracket-wrap">
			<div class="bracket" style:--rounds={rounds.length} style:min-height="{Math.max(rounds[0].length * 220, 300)}px">
				{#each rounds as round, r (r)}
					<div class="round">
						<span class="round-title">{roundName(r, rounds.length)}</span>
						<div class="matches">
							{#each round as pairing, i (i)}
								{@const a = shown(r, i, 'a')}
								{@const b = shown(r, i, 'b')}
								{@const show = visible(r, i)}
								{@const m = matchOf(pairing)}
								<article class="card match" class:mine={a.team === vp.myTeam || b.team === vp.myTeam}>
									{#each [a, b] as s, side (side)}
										{#if side === 1}
											<div class="mid">
												<span class="vs">{pairing.bye ? 'advances' : 'vs'}</span>
												{#if m && show}
													{#if m.result}
														<ResultButtons match={m} />
													{:else}
														{#if (m.a === vp.myTeam || m.b === vp.myTeam) && mm.myTeam?.ready}
															<button type="button" onclick={() => mm.act({ type: 'unready' })}>unready</button>
														{/if}
														<span class="muted small">{waitingOn(pairing)}</span>
													{/if}
												{/if}
											</div>
										{/if}
										<div class="team" class:lost={isLoser(pairing, s.team)}>
											<span class="muted small">{s.seed ?? ''}</span>
											{#if pairing.bye && s.team === null}<span></span>{:else}<TeamLogo team={s.team} size="sm" />{/if}
											<div class="lines">
												<span class="tn" class:own={s.team !== null && s.team === vp.myTeam} class:muted={s.team === null}>{s.label}</span>
												{#if show}<span class="muted small">{sub(s.team, pairing)}</span>{/if}
											</div>
										</div>
									{/each}
								</article>
							{/each}
						</div>
					</div>
					<div class="conn" aria-hidden="true">
						{#if r < rounds.length - 1}
							{#each Array(round.length / 2) as _, j (j)}<span style:height="{100 / round.length}%"></span>{/each}
						{:else}
							<span class="flat"></span>
						{/if}
					</div>
				{/each}
				<div class="round">
					<span class="round-title">champion</span>
					<div class="matches">
						<div class="card champ">
							<TeamLogo team={champion} size="xl" />
							<span class:muted={champion === null}>{champion !== null ? TEAMS[champion].name : 'champion'}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</main>

{#if seasonOver && mm.myTeam}
	<ActionBar>
		<WaitingOn />
		<ReadyButton label="on to the offseason" />
	</ActionBar>
{/if}

<style>
	.playoffs {
		flex-direction: column;
		flex-wrap: nowrap;
		align-items: stretch;
	}

	.banner {
		flex-direction: row !important;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem !important;
	}

	.bracket-wrap {
		overflow-x: auto;
	}

	.bracket {
		display: grid;
		grid-template-columns: repeat(var(--rounds), minmax(13rem, 1fr) 1.75rem) minmax(9rem, 0.7fr);
	}

	.round {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.round-title {
		color: #aaa;
		font-size: 0.9rem;
		text-align: center;
		margin-bottom: 0.5rem;
	}

	.matches {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		gap: 0.75rem;
	}

	.conn {
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		padding-top: 1.75rem;
	}

	.conn > span {
		display: block;
		width: 100%;
		border: 2px solid #755;
		border-left: 0;
		border-radius: 0 0.75rem 0.75rem 0;
	}

	.conn > span.flat {
		height: 0;
		border-width: 2px 0 0 0;
		border-radius: 0;
		margin: auto 0;
	}

	.match {
		gap: 0.35rem !important;
	}

	.team {
		display: grid;
		grid-template-columns: 1rem auto minmax(0, 1fr);
		align-items: center;
		gap: 0.5rem;
	}

	.team.lost {
		opacity: 0.5;
	}

	.lines {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.tn {
		font-size: 0.95rem;
		line-height: 1.15;
	}

	.mid {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		text-align: center;
	}

	.vs {
		font-size: 0.9rem;
		font-weight: 700;
		color: #aaa;
	}

	.champ {
		align-items: center;
		text-align: center;
	}

	@media (max-width: 720px) {
		.bracket {
			display: flex;
			flex-direction: column;
			gap: 1rem;
			min-height: 0 !important;
		}

		.conn {
			display: none;
		}

		.round-title {
			text-align: left;
			font-size: 1rem;
			color: #ddd;
		}
	}
</style>
