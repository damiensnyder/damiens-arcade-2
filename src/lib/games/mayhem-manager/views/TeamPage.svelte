<script lang="ts">
	import { getContext } from 'svelte';
	import FighterSprite from '../components/FighterSprite.svelte';
	import StatRows from '../components/StatRows.svelte';
	import TeamLogo from '../components/TeamLogo.svelte';
	import { ABILITIES, EQUIPMENT, equipmentIcon, slotsToString } from '../catalog.js';
	import { ordinal, roundName } from '../rules.js';
	import type { MMState } from '../state.svelte.js';
	import { playoffResult, yearsLeft } from '../summaries.js';
	import { TEAMS, teamShortName } from '../teams.js';
	import type { Fighter, TeamId } from '../types.js';

	const mm = getContext<MMState>('mm');
	const vp = $derived(mm.vp!);
	const teamId = $derived<TeamId | null>(mm.viewingTeam ?? vp.myTeam ?? vp.teams[0]?.id ?? null);
	const team = $derived(teamId !== null ? mm.team(teamId) : undefined);
	const isMine = $derived(team?.isMine ?? false);
	const inSeason = $derived(['regularSeason', 'playoffs', 'seasonOver'].includes(vp.phase.kind));

	$effect(() => mm.ensureHistory());

	/** Regular-season record over finished seasons (from the history) plus what's been seen this season. */
	const allTime = $derived.by(() => {
		if (teamId === null) return '0–0';
		let w = 0;
		let l = 0;
		for (const s of mm.history?.seasons ?? []) {
			const row = s.standings.find((r) => r.team === teamId);
			w += row?.wins ?? 0;
			l += row?.losses ?? 0;
		}
		const current = mm.standings().find((r) => r.team === teamId);
		return `${w + (current?.wins ?? 0)}–${l + (current?.losses ?? 0)}`;
	});

	const pastSeasons = $derived(mm.finishedSeasons.filter((s) => s.standings.some((r) => r.team === teamId)).reverse());
	const madePlayoffs = $derived(
		pastSeasons.filter((s) => s.bracket.rounds[0]?.some((p) => p.a.team === teamId || p.b.team === teamId)).length
	);

	const schedule = $derived(
		vp.matches.filter((m) => m.season === vp.season && (m.a === teamId || m.b === teamId))
	);

	/** Roster plus anyone whose contract is up and might still be re-signed. */
	const fighters = $derived.by((): { fighter: Fighter; contract: string }[] => {
		if (!team) return [];
		const list = team.fighters.map((f) => ({ fighter: f, contract: f.isOwner ? "this season only · can't be re-signed" : yearsLeft(f.contractYears) }));
		for (const c of team.expiring) {
			if (c.decision !== 'drop') list.push({ fighter: c.fighter, contract: c.decision === 'keep' ? 're-signing' : 'contract up' });
		}
		return list;
	});

	function attunedTo(key: string): string {
		return (team?.fighters ?? []).filter((f) => f.attunements.includes(key)).map((f) => f.name).join(', ');
	}

</script>

<main class="panel team-page">
	{#if !team || teamId === null}
		<p class="muted">No teams yet.</p>
	{:else}
		<div class="card header full">
			<TeamLogo team={teamId} size="xl" />
			<div class="head-text">
				<h2 class:own={isMine}>{TEAMS[teamId].name}</h2>
				<div class="facts">
					{#if inSeason}<span class="fact"><span class="muted small">this season</span><b>{mm.recordOf(teamId)} · {ordinal(mm.rankOf(teamId))}</b></span>{/if}
					<span class="fact"><span class="muted small">all-time</span><b>{allTime}</b></span>
					<span class="fact"><span class="muted small">playoffs</span><b>{madePlayoffs} of {pastSeasons.length} seasons</b></span>
					<span class="fact"><span class="muted small">titles</span><b>{mm.titlesOf(teamId)}</b></span>
					<span class="fact"><span class="muted small">money</span><b>${team.money}</b></span>
				</div>
			</div>
			<label class="row small muted"
				>view team
				<select aria-label="Team to view" value={String(teamId)} onchange={(e) => (mm.viewingTeam = Number(e.currentTarget.value))}>
					{#each vp.teams as t (t.id)}<option value={String(t.id)}>{TEAMS[t.id].name}</option>{/each}
				</select>
			</label>
		</div>

		<section class="col fighters">
			<h3>Fighters</h3>
			{#if fighters.length === 0}<p class="muted">No fighters.</p>{/if}
			{#each fighters as { fighter: f, contract } (f.id)}
				<article class="card">
					<div class="row between wrap">
						<div class="row"><h3>{f.name}</h3><span class="muted">age {f.age}</span></div>
						<span class="muted small">{contract}</span>
					</div>
					<div class="fbody">
						<span class="big-sprite"><FighterSprite look={f.look} team={teamId} size={100} /></span>
						<div class="mid">
							{#if ABILITIES[f.ability]?.description}<p>{ABILITIES[f.ability].description}</p>{/if}
							{#if mm.seasonLine(f.id)}<p class="small">this season: {mm.seasonLine(f.id, vp.season, true)}</p>{/if}
							<p class="muted small">career: {mm.careerLine(f.id)}</p>
							{#if f.attunements.length > 0}<p class="muted small">attuned: {f.attunements.map((k) => EQUIPMENT[k]?.name ?? k).join(', ')}</p>{/if}
						</div>
						<div class="stats-col">
							<StatRows stats={f.stats} previous={isMine && inSeason ? (f.prevStats ?? null) : null} />
						</div>
					</div>
				</article>
			{/each}
			{#if isMine && inSeason && team.fighters.some((f) => f.prevStats)}
				<p class="muted small">red stars: gained in training camp this season.</p>
			{/if}
		</section>

		<section class="col side">
			<div class="card">
				<h3>Equipment</h3>
				{#if team.equipment.length === 0}<span class="muted small">no equipment</span>{/if}
				{#each team.equipment as e (e.id)}
					<div class="tr gear">
						<img src={equipmentIcon(e.key)} alt="" width="56" height="56" />
						<div class="gear-text">
							<div class="row between"><span>{EQUIPMENT[e.key]?.name}</span><span class="muted small">{slotsToString(EQUIPMENT[e.key]?.slots ?? [])} · {yearsLeft(e.yearsLeft)}</span></div>
							<span class="small">{EQUIPMENT[e.key]?.description}</span>
							{#if attunedTo(e.key)}<span class="muted small">attuned: {attunedTo(e.key)}</span>{/if}
						</div>
					</div>
				{/each}
			</div>

			{#if schedule.length > 0}
				<div class="card">
					<h3>Schedule</h3>
					{#each schedule as m (m.id)}
						{@const opp = m.a === teamId ? m.b : m.a}
						{@const shownResult = m.result && mm.isRevealed(m)}
						{@const won = m.result?.winner === teamId}
						<div class="tr sched">
							<span class="muted small">{m.week !== null ? `week ${m.week + 1}` : roundName(m.round!, mm.playoffRounds)}</span>
							<span class="row" style="gap: 0.4rem"><span class="muted small">vs</span><TeamLogo team={opp} />{teamShortName(opp)}</span>
							<span class="small" class:muted={!shownResult}>
								{#if shownResult && m.result}
									{won ? 'W' : 'L'} {m.a === teamId ? m.result.standingA : m.result.standingB}–{m.a === teamId ? m.result.standingB : m.result.standingA}
								{:else if m.result}
									<button type="button" class="mini" onclick={() => mm.reveal(m.id)}>see result</button>
								{:else}
									not played yet
								{/if}
							</span>
						</div>
					{/each}
				</div>
			{/if}

			<div class="card">
				<h3>Team history</h3>
				{#if pastSeasons.length === 0}
					<span class="muted small">no finished seasons yet</span>
				{:else}
					<div class="tr hist head"><span>season</span><span>W–L</span><span>finish</span><span>playoffs</span></div>
					{#each pastSeasons as s (s.season)}
						{@const idx = s.standings.findIndex((r) => r.team === teamId)}
						<div class="tr hist">
							<span>Season {s.season}</span>
							<span>{s.standings[idx].wins}–{s.standings[idx].losses}</span>
							<span>{ordinal(idx + 1)}</span>
							<span>{playoffResult(s, teamId)}</span>
						</div>
					{/each}
				{/if}
			</div>
		</section>
	{/if}
</main>

<style>
	.full {
		flex: 1 1 100%;
	}

	.header {
		flex-direction: row !important;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem 1.5rem !important;
	}

	.head-text {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		flex: 1 1 20rem;
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 2rem;
	}

	.fact {
		display: flex;
		flex-direction: column;
	}

	.fact b {
		font-weight: 600;
		font-size: 1.15rem;
	}

	.fighters {
		flex: 3 1 540px;
	}

	.side {
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

	.mid {
		flex: 1 1 8rem;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.95rem;
	}

	.stats-col {
		flex: 0 0 15rem;
		margin-left: auto;
	}

	.gear {
		grid-template-columns: 56px minmax(0, 1fr);
		align-items: start;
		padding: 0.5rem 0;
	}

	.gear-text {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.sched {
		grid-template-columns: 6rem minmax(0, 1fr) auto;
	}

	.hist {
		grid-template-columns: 5rem 3rem 3rem minmax(0, 1fr);
	}
</style>
