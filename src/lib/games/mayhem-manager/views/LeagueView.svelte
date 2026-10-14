<script lang="ts">
	import { getContext } from 'svelte';
	import AbilityText from '../components/AbilityText.svelte';
	import BotIcon from '../components/BotIcon.svelte';
	import FighterName from '../components/FighterName.svelte';
	import FighterSprite from '../components/FighterSprite.svelte';
	import ResultButtons from '../components/ResultButtons.svelte';
	import StatRows from '../components/StatRows.svelte';
	import TeamLogo from '../components/TeamLogo.svelte';
	import { playoffSize } from '../rules.js';
	import type { MMState } from '../state.svelte.js';
	import { freeAgentOrigin } from '../summaries.js';
	import { TEAMS, teamShortName } from '../teams.js';
	import type { Fighter, Match, TeamId } from '../types.js';

	const mm = getContext<MMState>('mm');
	const vp = $derived(mm.vp!);
	const inSeason = $derived(['regularSeason', 'playoffs', 'seasonOver'].includes(vp.phase.kind));
	const canReplace = $derived(vp.myTeam === null);

	// ---- in season ----
	const standings = $derived(mm.standings());
	const cut = $derived(playoffSize(mm.teamCount));
	const weeks = $derived(
		Array.from({ length: mm.weeks }, (_, w) => vp.matches.filter((m) => m.season === vp.season && m.week === w))
	);
	const currentWeek = $derived(vp.phase.kind === 'regularSeason' ? vp.phase.week : mm.weeks);

	const leaders = $derived.by(() => {
		const totals = new Map<number, { id: number; name: string; team: TeamId; kos: number; dmg: number }>();
		for (const l of mm.visibleStatLines) {
			if (l.season !== vp.season) continue;
			const t = totals.get(l.fighterId) ?? { id: l.fighterId, name: l.name, team: l.team, kos: 0, dmg: 0 };
			t.kos += l.kos;
			t.dmg += l.dmgDealt;
			t.team = l.team;
			totals.set(l.fighterId, t);
		}
		const all = [...totals.values()];
		return [
			{ title: 'most KOs', rows: all.sort((a, b) => b.kos - a.kos).slice(0, 3).map((r) => ({ ...r, v: r.kos })) },
			{ title: 'most damage dealt', rows: all.sort((a, b) => b.dmg - a.dmg).slice(0, 3).map((r) => ({ ...r, v: Math.round(r.dmg) })) }
		];
	});

	function sideClass(m: Match, t: TeamId): string {
		const mine = t === vp.myTeam ? 'own ' : '';
		if (!m.result || !mm.isRevealed(m)) return mine;
		return mine + (m.result.winner === t ? 'w' : 'l');
	}

	// ---- offseason ----
	type Upcoming = { fighter: Fighter; team: TeamId | null; status: string; pending: boolean };
	const upcoming = $derived.by((): Upcoming[] => {
		const list: Upcoming[] = [];
		for (const t of vp.teams) {
			for (const c of t.expiring) {
				if (c.decision === 'keep') continue;
				list.push({
					fighter: c.fighter,
					team: t.id,
					status: c.decision === 'drop' ? `not re-signed by the ${TEAMS[t.id].last}` : `contract up · ${TEAMS[t.id].last} may re-sign`,
					pending: c.decision === 'pending'
				});
			}
		}
		for (const a of vp.freeAgents) list.push({ fighter: a.fighter, team: null, status: freeAgentOrigin(a), pending: false });
		return list;
	});
	const sortedTeams = $derived([...vp.teams].sort((a, b) => mm.titlesOf(b.id) - mm.titlesOf(a.id) || a.id - b.id));
</script>

<main class="panel">
	{#if inSeason}
		<section class="col half">
			<div class="card">
				<h3>Standings</h3>
				<div class="tr st head"><span></span><span>team</span><span class="num">W–L</span><span class="num" title="own fighters still standing at the end of fights">PF</span><span class="num" title="opponents' fighters still standing">PA</span><span></span></div>
				{#each standings as r, i (r.team)}
					<div class="tr st" class:me={r.team === vp.myTeam} class:cut={i === cut - 1 && cut < standings.length}>
						<span class="muted small">{i + 1}</span>
						<span class="tn">
							<TeamLogo team={r.team} />{TEAMS[r.team].name}
							{#if mm.team(r.team)?.controller === 'bot'}<BotIcon size={16} />{/if}
							{#if canReplace && mm.team(r.team)?.controller === 'bot'}<button type="button" class="mini" onclick={() => mm.act({ type: 'replace', team: r.team })}>replace</button>{/if}
						</span>
						<span class="num">{r.wins}–{r.losses}</span>
						<span class="num">{r.pf}</span>
						<span class="num">{r.pa}</span>
						<span class="acts"><button type="button" class="mini" onclick={() => mm.viewTeam(r.team)}>view</button></span>
					</div>
				{/each}
				<span class="muted small">PF: the number of prevailing fighters you have at the end of a fight. PA: opponents' prevailing fighters.</span>
			</div>

			<div class="card">
				<div class="row between"><h3>Leaders</h3><span class="muted small">this season</span></div>
				{#each leaders as board (board.title)}
					<span class="muted small" style="margin-top: 0.35rem">{board.title}</span>
					{#if board.rows.length === 0}<span class="muted small">no fights yet</span>{/if}
					{#each board.rows as x (x.id)}
						<div class="tr ld">
							<span><FighterName id={x.id} name={x.name} /></span>
							<TeamLogo team={x.team} />
							<span class="num">{x.v}</span>
						</div>
					{/each}
				{/each}
			</div>
		</section>

		<section class="col half">
			{#each weeks as games, w (w)}
				<div class="card">
					<div class="row between"><h3>Week {w + 1}</h3><span class="muted small">{w === currentWeek ? 'in progress' : ''}</span></div>
					{#each games as g (g.id)}
						<div class="g">
							<span class="row"><TeamLogo team={g.a} /><span class={sideClass(g, g.a)}>{teamShortName(g.a)}</span></span>
							<span class="res">
								{#if g.result}
									<ResultButtons match={g} mini />
								{:else}
									<span class="muted">{w === currentWeek ? 'not played yet' : 'vs'}</span>
								{/if}
							</span>
							<span class="row r"><span class={sideClass(g, g.b)}>{teamShortName(g.b)}</span><TeamLogo team={g.b} /></span>
						</div>
					{/each}
				</div>
			{/each}
		</section>
	{:else}
		<section class="col teams-col">
			<div class="card">
				<h3>Teams</h3>
				<div class="tr tl head"><span>team</span><span class="num">titles</span><span></span></div>
				{#each sortedTeams as t (t.id)}
					<div class="tr tl" class:me={t.isMine}>
						<span class="tn">
							<TeamLogo team={t.id} />{TEAMS[t.id].name}
							{#if t.controller === 'bot'}<BotIcon size={16} />{/if}
							{#if canReplace && t.controller === 'bot'}<button type="button" class="mini" onclick={() => mm.act({ type: 'replace', team: t.id })}>replace</button>{/if}
						</span>
						<span class="num">{mm.titlesOf(t.id)}</span>
						<span class="acts"><button type="button" class="mini" onclick={() => mm.viewTeam(t.id)}>view</button></span>
					</div>
				{/each}
			</div>
		</section>

		{#if vp.phase.kind === 'offseason'}
			<section class="col fa-col">
				<div class="row between wrap">
					<h3>Upcoming free agents</h3>
					<span class="muted small">only the best are offered in free agency. the rest leave the league.</span>
				</div>
				<div class="fa-grid">
					{#each upcoming as u (u.fighter.id)}
						<article class="card fa">
							<div class="row between">
								<span style="font-weight: 500"><FighterName id={u.fighter.id} name={u.fighter.name} /></span>
								<span class="muted small">age {u.fighter.age}</span>
							</div>
							<div class="row" style="align-items: flex-start">
								<span style="margin-top: -0.3rem"><FighterSprite look={u.fighter.look} team={null} size={72} /></span>
								<div style="flex: 1; min-width: 0"><StatRows stats={u.fighter.stats} size={14} /></div>
							</div>
							<AbilityText ability={u.fighter.ability} small />
							<span class="row small" style="gap: 0.4rem">
								{#if u.team !== null}<TeamLogo team={u.team} size="xs" />{/if}
								<span class:muted={u.pending}>{u.status}</span>
							</span>
						</article>
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</main>

<style>
	.half {
		flex: 1 1 440px;
	}

	.teams-col {
		flex: 1 1 400px;
	}

	.fa-col {
		flex: 2 1 560px;
	}

	.st {
		grid-template-columns: 1.4rem minmax(0, 1fr) 3rem 2.6rem 2.6rem 3.4rem;
	}

	.tr.cut {
		border-bottom: 2px dashed #e8c;
	}

	.tl {
		grid-template-columns: minmax(0, 1fr) 3rem 3.4rem;
	}

	.ld {
		grid-template-columns: minmax(0, 1fr) auto 3rem;
	}

	.acts {
		display: flex;
		justify-content: flex-end;
	}

	.g {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0;
		font-size: 0.95rem;
	}

	.g .r {
		justify-content: flex-end;
		text-align: right;
	}

	.g :global(.w) {
		font-weight: 600;
	}

	.g :global(.l) {
		color: #aaa;
	}

	.res {
		font-size: 0.8rem;
		color: #aaa;
		text-align: center;
		min-width: 7.5rem;
	}

	.fa-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.fa {
		padding: 0.6rem 0.75rem !important;
		gap: 0.4rem !important;
	}

	@media (max-width: 720px) {
		.fa-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.st {
			grid-template-columns: 1.2rem minmax(0, 1fr) 2.6rem 2rem 2rem;
		}

		.st .acts,
		.st.head span:last-child {
			display: none;
		}
	}
</style>
