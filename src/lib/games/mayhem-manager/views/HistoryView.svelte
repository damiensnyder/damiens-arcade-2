<script lang="ts">
	import { getContext } from 'svelte';
	import type { RoomState } from '../../room.svelte.js';
	import FighterName from '../components/FighterName.svelte';
	import TeamLogo from '../components/TeamLogo.svelte';
	import { roundName } from '../rules.js';
	import type { MMState } from '../state.svelte.js';
	import { TEAMS, teamShortName } from '../teams.js';
	import type { StatTotal, TeamId } from '../types.js';

	const PAGE_SIZE = 20;

	const mm = getContext<MMState>('mm');
	const room = getContext<RoomState>('room');
	const vp = $derived(mm.vp!);
	const isHost = $derived(room.host !== null && room.host === room.pov);

	// finished seasons are only fetched when someone looks at them
	$effect(() => {
		mm.ensureHistory();
		if (typeof span === 'number') mm.ensureSeasonTotals(span);
	});

	const titles = $derived([...vp.teams].sort((a, b) => mm.titlesOf(b.id) - mm.titlesOf(a.id) || a.id - b.id));

	// ---- past playoffs ----
	let bracketSeason = $state<number | null>(null);
	const finished = $derived([...mm.finishedSeasons].reverse());
	const record = $derived(finished.find((s) => s.season === bracketSeason) ?? finished[0]);

	// ---- fighter stats ----
	let span = $state<'career' | number>('career');
	let games = $state<'both' | 'rs' | 'po'>('both');
	type SortKey = 'name' | 'team' | 'fights' | 'prevailed' | 'kos' | 'kod' | 'dmgDealt' | 'dmgTaken' | 'dpf';
	let sortKey = $state<SortKey>('kos');
	let sortDesc = $state(true);
	let page = $state(0);
	const seasonsWithStats = $derived(Array.from({ length: vp.season }, (_, i) => vp.season - i));
	const loadingStats = $derived(
		(span === 'career' && !mm.history && vp.season > 1) || (typeof span === 'number' && span < vp.season && !mm.seasonTotals.has(span))
	);

	/** Box-score lines for the chosen span: finished seasons come from the history, this one from what's been seen. */
	const sourceLines = $derived.by((): StatTotal[] => {
		if (span === vp.season) return mm.visibleStatLines;
		if (typeof span === 'number') return mm.seasonTotals.get(span) ?? [];
		const past = (mm.history?.careers ?? []).flatMap((c) => [
			{ ...c.regularSeason, fighterId: c.fighterId, name: c.name, team: c.team, season: 0, playoffs: false },
			{ ...c.playoffs, fighterId: c.fighterId, name: c.name, team: c.team, season: 0, playoffs: true }
		]);
		return [...past, ...mm.visibleStatLines];
	});

	type Row = { id: number; name: string; team: TeamId; fights: number; prevailed: number; kos: number; kod: number; dmgDealt: number; dmgTaken: number; dpf: number; lastSeason: number };
	const rows = $derived.by(() => {
		const byFighter = new Map<number, Row>();
		for (const l of sourceLines) {
			if (l.fights === 0) continue;
			if (games === 'rs' && l.playoffs) continue;
			if (games === 'po' && !l.playoffs) continue;
			const r = byFighter.get(l.fighterId) ?? { id: l.fighterId, name: l.name, team: l.team, fights: 0, prevailed: 0, kos: 0, kod: 0, dmgDealt: 0, dmgTaken: 0, dpf: 0, lastSeason: 0 };
			r.fights += l.fights;
			r.prevailed += l.prevailed;
			r.kos += l.kos;
			r.kod += l.kod;
			r.dmgDealt += l.dmgDealt;
			r.dmgTaken += l.dmgTaken;
			if (l.season >= r.lastSeason) {
				r.lastSeason = l.season;
				r.team = l.team;
			}
			byFighter.set(l.fighterId, r);
		}
		const list = [...byFighter.values()].map((r) => ({ ...r, dpf: r.fights ? r.dmgDealt / r.fights : 0 }));
		const dir = sortDesc ? -1 : 1;
		list.sort((a, b) => {
			if (sortKey === 'name') return dir * a.name.localeCompare(b.name);
			if (sortKey === 'team') return dir * TEAMS[a.team].last.localeCompare(TEAMS[b.team].last);
			return dir * (a[sortKey] - b[sortKey]) || b.kos - a.kos;
		});
		return list;
	});
	const pages = $derived(Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
	const pageRows = $derived(rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));

	function sortBy(key: SortKey) {
		if (sortKey === key) sortDesc = !sortDesc;
		else {
			sortKey = key;
			sortDesc = key !== 'name' && key !== 'team';
		}
		page = 0;
	}

	const columns: { key: SortKey; label: string; num: boolean; title?: string }[] = [
		{ key: 'name', label: 'fighter', num: false },
		{ key: 'team', label: 'team', num: false },
		{ key: 'fights', label: 'fights', num: true },
		{ key: 'prevailed', label: 'prevailed', num: true, title: 'still standing at the end of the fight' },
		{ key: 'kos', label: 'KOs', num: true },
		{ key: 'kod', label: 'KO’d', num: true },
		{ key: 'dmgDealt', label: 'dmg dealt', num: true },
		{ key: 'dmgTaken', label: 'dmg taken', num: true },
		{ key: 'dpf', label: 'dmg / fight', num: true }
	];

	// ---- league file ----
	let importText = $state('');

	function download() {
		if (!mm.leagueExport) return;
		const blob = new Blob([mm.leagueExport], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `mayhem-manager-season-${vp.season}.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	async function loadFile(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (file) importText = await file.text();
	}

	function importLeague() {
		try {
			mm.act({ type: 'importLeague', league: JSON.parse(importText) });
		} catch {
			mm.notice = "That isn't a valid league file.";
		}
	}

	$effect(() => {
		// a fresh export is ready to save
		if (mm.leagueExport) {
			download();
			mm.leagueExport = null;
		}
	});
</script>

<main class="panel history">
	<div class="cols">
		<section class="col titles-col">
			<div class="card">
				<h3>Titles</h3>
				<div class="tr tt head"><span>team</span><span class="num">titles</span></div>
				{#each titles as t (t.id)}
					<div class="tr tt" class:me={t.isMine}>
						<span class="tn"><TeamLogo team={t.id} />{TEAMS[t.id].name}</span>
						<span class="num">{mm.titlesOf(t.id)}</span>
					</div>
				{/each}
			</div>
		</section>

		<section class="col bracket-col">
			<div class="card">
				<div class="row between">
					<h3>Playoffs</h3>
					{#if finished.length > 0}
						<select aria-label="Season" value={String(record?.season)} onchange={(e) => (bracketSeason = Number(e.currentTarget.value))}>
							{#each finished as s (s.season)}<option value={String(s.season)}>season {s.season}</option>{/each}
						</select>
					{/if}
				</div>
				{#if !record}
					<span class="muted small">no finished seasons yet</span>
				{:else}
					<div class="bk" style:--rounds={record.bracket.rounds.length}>
						{#each record.bracket.rounds as round, r (r)}
							<div class="bk-round">
								<span class="muted small round-title">{roundName(r, record.bracket.rounds.length)}</span>
								{#each round as p, i (i)}
									<div class="bk-m">
										{#each [p.a, p.b] as s, j (j)}
											<span class="bk-t" class:l={p.winner !== null && p.winner !== s.team} class:me={s.team !== null && s.team === vp.myTeam}
												><span class="muted small">{s.seed ?? ''}</span>{#if s.team !== null || !p.bye}<TeamLogo team={s.team} />{/if}{s.team !== null ? teamShortName(s.team) : p.bye ? 'bye' : '?'}</span
											>
										{/each}
									</div>
								{/each}
							</div>
						{/each}
						<div class="bk-round">
							<span class="muted small round-title">champion</span>
							<div class="bk-m champ">
								<TeamLogo team={record.champion} size="md" />
								<span>{record.champion !== null ? teamShortName(record.champion) : '?'}</span>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</section>
	</div>

	<div class="card">
		<div class="row between wrap">
			<h3>Fighter stats</h3>
			<div class="row wrap">
				<select aria-label="Time span" value={String(span)} onchange={(e) => { const v = e.currentTarget.value; span = v === 'career' ? 'career' : Number(v); page = 0; }}>
					<option value="career">career</option>
					{#each seasonsWithStats as s (s)}<option value={String(s)}>season {s}</option>{/each}
				</select>
				<select aria-label="Games included" value={games} onchange={(e) => { games = e.currentTarget.value as typeof games; page = 0; }}>
					<option value="both">regular season + playoffs</option>
					<option value="rs">regular season</option>
					<option value="po">playoffs</option>
				</select>
			</div>
		</div>
		<div class="table-scroll">
			<div class="tr ps head">
				<span>#</span>
				{#each columns as c (c.key)}
					<button type="button" class="sort" class:num={c.num} class:on-sort={sortKey === c.key} title={c.title} onclick={() => sortBy(c.key)}
						>{c.label}{sortKey === c.key ? (sortDesc ? ' ▼' : ' ▲') : ''}</button
					>
				{/each}
			</div>
			{#if pageRows.length === 0}<p class="muted small" style="padding: 0.5rem 0">{loadingStats ? 'loading…' : 'no fights yet'}</p>{/if}
			{#each pageRows as r, i (r.id)}
				<div class="tr ps" class:me={r.team === vp.myTeam}>
					<span class="muted small">{page * PAGE_SIZE + i + 1}</span>
					<span class="pn"><FighterName id={r.id} name={r.name} /></span>
					<span class="tn"><TeamLogo team={r.team} />{teamShortName(r.team)}</span>
					<span class="num">{r.fights}</span>
					<span class="num">{r.prevailed}</span>
					<span class="num">{r.kos}</span>
					<span class="num">{r.kod}</span>
					<span class="num">{Math.round(r.dmgDealt)}</span>
					<span class="num">{Math.round(r.dmgTaken)}</span>
					<span class="num">{Math.round(r.dpf)}</span>
				</div>
			{/each}
		</div>
		{#if rows.length > PAGE_SIZE}
			<div class="row between wrap" style="margin-top: 0.35rem">
				<span class="muted small">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of {rows.length} fighters</span>
				<div class="row" style="gap: 0.35rem">
					<button type="button" disabled={page === 0} onclick={() => page--}>prev</button>
					{#each Array(pages) as _, p (p)}
						<button type="button" class:on={p === page} onclick={() => (page = p)}>{p + 1}</button>
					{/each}
					<button type="button" disabled={page >= pages - 1} onclick={() => page++}>next</button>
				</div>
			</div>
		{/if}
	</div>

	<div class="card">
		<h3>League file</h3>
		<p class="small muted">Rooms close after an hour with nobody in them. Save the league to pick it up again later in a new room.</p>
		<div class="row wrap">
			<button type="button" onclick={() => mm.act({ type: 'exportLeague' })}>save league file</button>
		</div>
		{#if isHost}
			<p class="small muted">Load a saved league (this replaces the current one). People keep their teams if those teams are in it.</p>
			<div class="row wrap">
				<input type="file" accept="application/json,.json" onchange={loadFile} />
				<button type="button" disabled={!importText} onclick={importLeague}>load league</button>
			</div>
		{/if}
	</div>
</main>

<style>
	.history {
		flex-direction: column;
		flex-wrap: nowrap;
		align-items: stretch;
	}

	.cols {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem 2rem;
		align-items: flex-start;
	}

	.titles-col {
		flex: 1 1 300px;
	}

	.bracket-col {
		flex: 2 1 560px;
	}

	.tt {
		grid-template-columns: minmax(0, 1fr) 3.5rem;
	}

	.ps {
		grid-template-columns: 1.6rem minmax(7rem, 1.4fr) minmax(6rem, 1fr) 3.2rem 4.4rem 3rem 3rem 5rem 5rem 5rem;
		min-width: 46rem;
	}

	.table-scroll {
		overflow-x: auto;
	}

	.pn {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.sort {
		all: unset;
		cursor: pointer;
		color: #aaa;
		font-size: 0.85rem;
	}

	.sort.num {
		text-align: right;
	}

	.sort:hover,
	.sort:focus-visible,
	.sort.on-sort {
		color: #eeb;
	}

	.bk {
		display: grid;
		grid-template-columns: repeat(var(--rounds), minmax(0, 1fr)) minmax(0, 0.8fr);
		gap: 0.75rem;
		align-items: stretch;
		min-height: 200px;
		overflow-x: auto;
	}

	.bk-round {
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		gap: 0.75rem;
		min-width: 7rem;
	}

	.round-title {
		text-align: center;
	}

	.bk-m {
		background: #632;
		border: 2px solid #755;
		border-radius: 0.75rem;
		padding: 0.35rem 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.9rem;
	}

	.bk-m.champ {
		align-items: center;
		text-align: center;
		padding: 0.6rem;
	}

	.bk-t {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		white-space: nowrap;
		overflow: hidden;
	}

	.bk-t.l {
		opacity: 0.5;
	}

	.bk-t.me {
		color: #eeb;
	}
</style>
