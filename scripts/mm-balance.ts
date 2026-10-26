// Measures an all-bot league against the balance goals: re-signing and repair rates, roster sizes,
// how often each item gets bought, repeat champions, undefeated champions, free-agent depth,
// signing days, career arcs and how many teams have a star.
//
//   npx tsx scripts/mm-balance.ts run --teams 8 --leagues 10 --seasons 20 --out /tmp/a.json
//   npx tsx scripts/mm-balance.ts report /tmp/a.json /tmp/b.json ...
//
// Only seasons from --from (default 4) on are counted, since the first few are unusual.

import { readFileSync, writeFileSync } from 'node:fs';
import MayhemManager from '../src/server/games/mayhem-manager/index.js';
import type { LeagueState } from '../src/server/games/mayhem-manager/state.js';
import { contractWorth, fighterWorth } from '../src/server/games/mayhem-manager/valuation.js';
import { EQUIPMENT_BEHAVIORS, FISTS, ABILITY_BEHAVIORS } from '../src/server/games/mayhem-manager/sim/behaviors.js';
import type { Fighter, Stats } from '../src/lib/games/mayhem-manager/types.js';
import { Fight } from '../src/server/games/mayhem-manager/sim/fight.js';
import { TICK_LENGTH } from '../src/server/games/mayhem-manager/sim/constants.js';
import { STAT_NAMES } from '../src/lib/games/mayhem-manager/types.js';

type Counts = Record<string, number>;
interface Data {
	teams: number[];
	seasonsCounted: number;
	resign: [number, number];
	repair: [number, number];
	rosterSizes: Counts;
	equipmentCounts: Counts;
	moneyAtFA: number[];
	offered: Counts;
	bought: Counts;
	/** By league size: [repeats, chances]. */
	repeat: Record<string, [number, number]>;
	undefeatedChamp: [number, number];
	/** Best unsigned free agent less valuable than the average rostered fighter: [yes, total], by contractWorth and fighterWorth. */
	faDepthContract: [number, number];
	faDepthNow: [number, number];
	signDays: [number, number, number, number];
	/** Age → [count, sum of stat points, sum of best stat]. Everyone in the league (rostered or free agent). */
	byAge: Record<string, [number, number, number]>;
	/** Age → rostered fighters of that age. */
	rosteredAges: Counts;
	entryAges: Counts;
	/** Age at which fighters were last seen (left the league). */
	exitAges: Counts;
	/** Teams with a fighter whose primary stat is ≥ 7 / ≥ 9.5 points, out of team-seasons. */
	star35: [number, number];
	star475: [number, number];
	/** Primary stat of each team's best fighter. */
	bestPrimary: Counts;
	/** Primary attack kinds on rosters. */
	primaryKinds: Counts;
	/** Fight length in seconds (rounded down to 5s), not counting the spawn-in. */
	fightSeconds: Counts;
}

// count fight ticks after the spawn-in
let fightTicks = 0;
let recordFight: ((seconds: number) => void) | null = null;
const proto = Fight.prototype as unknown as { doTick: () => void; simulate: () => void };
const doTick = proto.doTick;
proto.doTick = function (this: unknown) {
	fightTicks++;
	doTick.call(this);
};
const simulate = proto.simulate;
proto.simulate = function (this: unknown) {
	fightTicks = 0;
	simulate.call(this);
	recordFight?.(fightTicks * TICK_LENGTH);
};

function emptyData(): Data {
	return {
		teams: [],
		seasonsCounted: 0,
		resign: [0, 0],
		repair: [0, 0],
		rosterSizes: {},
		equipmentCounts: {},
		moneyAtFA: [],
		offered: {},
		bought: {},
		repeat: {},
		undefeatedChamp: [0, 0],
		faDepthContract: [0, 0],
		faDepthNow: [0, 0],
		signDays: [0, 0, 0, 0],
		byAge: {},
		rosteredAges: {},
		entryAges: {},
		exitAges: {},
		star35: [0, 0],
		star475: [0, 0],
		bestPrimary: {},
		primaryKinds: {},
		fightSeconds: {}
	};
}

const inc = (c: Counts, k: string | number, n = 1) => (c[k] = (c[k] ?? 0) + n);

/** The stat that drives a fighter's main attack with this gear (by the same DPS ranking the sim uses). */
export function primaryStat(f: Fighter, keys: string[]): { stat: keyof Stats; kind: string } {
	const behaviors = [FISTS, ABILITY_BEHAVIORS[f.ability] ?? {}, ...keys.map((k) => EQUIPMENT_BEHAVIORS[k] ?? {})];
	let best = { dps: -1, stat: 'strength' as keyof Stats, kind: 'fists' };
	for (const b of behaviors) {
		const a = b.attack;
		if (!a || a.singleUse) continue;
		const attuned = false;
		const damage = a.damage[attuned ? 1 : 0];
		const cooldown = Math.max(a.cooldown[attuned ? 1 : 0], a.aim ?? 0);
		const charges = a.charges?.[0] ?? 0;
		const dps = (a.kind === 'aoe' ? damage * 2 : a.kind === 'ranged' ? damage * 0.5 : damage) / (cooldown + charges * 4);
		if (dps > best.dps) {
			const stat: keyof Stats = charges > 0 ? 'energy' : a.kind === 'ranged' ? 'accuracy' : a.kind === 'aoe' ? 'energy' : (a.scalesWith ?? 'strength');
			best = { dps, stat, kind: b === FISTS ? 'fists' : charges > 0 ? 'charged' : a.kind };
		}
	}
	return { stat: best.stat, kind: best.kind };
}

function runLeague(teamCount: number, seasons: number, from: number, d: Data): void {
	const league = new MayhemManager();
	league.emitEventTo = () => {};
	for (let i = 0; i < teamCount; i++) league.handleAction(1, { type: 'addBot' }, true);
	const s = () => (league as unknown as { s: LeagueState }).s;

	let lastPhase = '';
	let offered = new Map<number, number>(); // fighter id → day signed (0 = not yet)
	let faDay = 0;
	const seen = new Map<number, number>(); // fighter id → last age seen
	const seasonOf = new Map<number, number>(); // fighter id → last season seen
	let prevChampion: number | null = null;
	let lastRecorded = 0;
	recordFight = (seconds) => {
		if (s().season >= from) inc(d.fightSeconds, Math.floor(seconds / 5) * 5);
	};

	for (let step = 0; step < seasons * 30; step++) {
		const st = s();
		const phase = st.phase;
		const key = phase.kind + ('day' in phase ? phase.day : '') + ('week' in phase ? 'w' + phase.week : '') + ('round' in phase ? 'r' + phase.round : '');
		const counting = st.season >= from;
		if (key !== lastPhase) {
			lastPhase = key;
			if (phase.kind === 'offseason' && counting) {
				// bots have already decided
				for (const t of st.teams) {
					for (const c of t.expiring) {
						d.resign[1]++;
						if (c.decision === 'keep') d.resign[0]++;
					}
					for (const r of t.repairs) {
						d.repair[1]++;
						if (r.decision === 'keep') d.repair[0]++;
					}
				}
			}
			if (phase.kind === 'freeAgency') {
				if (phase.day === 1) {
					offered = new Map(st.freeAgents.map((a) => [a.fighter.id, 0]));
					if (counting) for (const t of st.teams) d.moneyAtFA.push(t.money);
				}
				faDay = phase.day;
				// signings from the end of the previous day
				for (const a of st.freeAgents) {
					if (a.signedBy !== null && offered.get(a.fighter.id) === 0) offered.set(a.fighter.id, phase.day - 1);
				}
			}
			if (phase.kind === 'training') {
				const unsigned = new Set(st.freeAgents.map((a) => a.fighter.id));
				if (counting) {
					for (const [id, day] of offered) {
						if (day > 0) d.signDays[day - 1]++;
						else if (unsigned.has(id)) d.signDays[3]++;
						else d.signDays[2]++;
					}
					// depth: best unsigned vs average rostered
					const rostered = st.teams.flatMap((t) => t.fighters.filter((f) => !f.isOwner));
					const offeredUnsigned = st.freeAgents.filter((a) => offered.has(a.fighter.id)).map((a) => a.fighter);
					if (rostered.length > 0 && offeredUnsigned.length > 0) {
						for (const [measure, slot] of [[contractWorth, d.faDepthContract], [fighterWorth, d.faDepthNow]] as const) {
							const avg = rostered.reduce((sum, f) => sum + measure(f), 0) / rostered.length;
							const best = Math.max(...offeredUnsigned.map((f) => measure(f)));
							slot[1]++;
							if (best < avg) slot[0]++;
						}
					}
					// shop: bots have already bought
					for (const t of st.teams) {
						for (const item of t.shop) {
							inc(d.offered, item.key);
							if (item.bought) inc(d.bought, item.key);
						}
					}
				}
			}
			if (phase.kind === 'regularSeason' && phase.week === 0) {
				// rosters have settled; record once per season
				if (st.season > lastRecorded) {
					lastRecorded = st.season;
					const everyone = [...st.teams.flatMap((t) => t.fighters.filter((f) => !f.isOwner)), ...st.freeAgents.map((a) => a.fighter)];
					for (const f of everyone) {
						if (!seen.has(f.id) && counting) inc(d.entryAges, f.age);
						seen.set(f.id, f.age);
						seasonOf.set(f.id, st.season);
					}
					if (counting) {
						d.seasonsCounted++;
						for (const f of everyone) {
							const total = STAT_NAMES.reduce((sum, k) => sum + f.stats[k], 0);
							const best = Math.max(...STAT_NAMES.map((k) => f.stats[k]));
							const row = (d.byAge[f.age] ??= [0, 0, 0]);
							row[0]++;
							row[1] += total;
							row[2] += best;
						}
						for (const t of st.teams) {
							const fighters = t.fighters.filter((f) => !f.isOwner);
							inc(d.rosterSizes, fighters.length);
							inc(d.equipmentCounts, t.equipment.length);
							const keyOf = new Map(t.equipment.map((e) => [e.id, e.key]));
							let bestPrimary = 0;
							for (const f of fighters) {
								inc(d.rosteredAges, f.age);
								const keys = (t.lineup[f.id] ?? []).map((id) => keyOf.get(id)!).filter(Boolean);
								const p = primaryStat(f, keys);
								inc(d.primaryKinds, p.kind);
								bestPrimary = Math.max(bestPrimary, f.stats[p.stat]);
							}
							inc(d.bestPrimary, Math.round(bestPrimary));
							d.star35[1]++;
							d.star475[1]++;
							if (bestPrimary >= 7) d.star35[0]++;
							if (bestPrimary >= 9.5) d.star475[0]++;
						}
					}
				}
			}
			if (phase.kind === 'seasonOver') {
				const record = st.seasons[st.seasons.length - 1];
				if (record && counting && record.champion !== null) {
					if (prevChampion !== null) {
						const r = (d.repeat[teamCount] ??= [0, 0]);
						r[1]++;
						if (record.champion === prevChampion) r[0]++;
					}
					const row = record.standings.find((r) => r.team === record.champion);
					d.undefeatedChamp[1]++;
					if (row && row.losses === 0) d.undefeatedChamp[0]++;
				}
				prevChampion = record?.champion ?? null;
				if (st.season >= seasons) break;
			}
		}
		league.handleAction(1, { type: 'forceReady' }, true);
	}
	// fighters who left before the last season
	const finalSeason = s().season;
	for (const [id, age] of seen) {
		const last = seasonOf.get(id)!;
		if (last < finalSeason && last >= from) inc(d.exitAges, age);
	}
	void faDay;
}

// ---- reporting ----

function merge(a: Data, b: Data): Data {
	const out = emptyData();
	const addCounts = (x: Counts, y: Counts, z: Counts) => {
		for (const [k, v] of Object.entries(x)) inc(z, k, v);
		for (const [k, v] of Object.entries(y)) inc(z, k, v);
	};
	out.teams = [...a.teams, ...b.teams];
	out.seasonsCounted = a.seasonsCounted + b.seasonsCounted;
	for (const k of ['resign', 'repair', 'undefeatedChamp', 'faDepthContract', 'faDepthNow', 'star35', 'star475'] as const) {
		out[k] = [a[k][0] + b[k][0], a[k][1] + b[k][1]];
	}
	out.signDays = a.signDays.map((x, i) => x + b.signDays[i]) as Data['signDays'];
	for (const k of ['rosterSizes', 'equipmentCounts', 'offered', 'bought', 'rosteredAges', 'entryAges', 'exitAges', 'bestPrimary', 'primaryKinds', 'fightSeconds'] as const) {
		addCounts(a[k], b[k], out[k]);
	}
	out.moneyAtFA = [...a.moneyAtFA, ...b.moneyAtFA];
	for (const src of [a, b]) {
		for (const [k, v] of Object.entries(src.repeat)) {
			const r = (out.repeat[k] ??= [0, 0]);
			r[0] += v[0];
			r[1] += v[1];
		}
		for (const [k, v] of Object.entries(src.byAge)) {
			const r = (out.byAge[k] ??= [0, 0, 0]);
			r[0] += v[0];
			r[1] += v[1];
			r[2] += v[2];
		}
	}
	return out;
}

const pct = ([a, b]: [number, number]) => (b === 0 ? '-' : `${((100 * a) / b).toFixed(0)}% (n=${b})`);

function distribution(c: Counts): string {
	const total = Object.values(c).reduce((a, b) => a + b, 0);
	const keys = Object.keys(c).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
	return keys.map((k) => `${k}:${((100 * c[k]) / total).toFixed(0)}%`).join(' ');
}

function mean(c: Counts): number {
	let n = 0;
	let sum = 0;
	for (const [k, v] of Object.entries(c)) {
		n += v;
		sum += Number(k) * v;
	}
	return sum / Math.max(n, 1);
}

function report(d: Data): void {
	console.log(`leagues: ${d.teams.length} (team counts: ${[...new Set(d.teams)].join(', ')}), team-seasons counted: ${Object.values(d.rosterSizes).reduce((a, b) => a + b, 0)}`);
	console.log(`\n1. re-signed: ${pct(d.resign)}   [goal 40-70%]`);
	console.log(`   repaired:  ${pct(d.repair)}   [goal 50-75%]`);
	console.log(`\n2. fighters per team: mean ${mean(d.rosterSizes).toFixed(2)}  ${distribution(d.rosterSizes)}   [goal 3-6]`);
	console.log(`   equipment per team: mean ${mean(d.equipmentCounts).toFixed(2)}  ${distribution(d.equipmentCounts)}   [goal 4-9]`);
	const m = d.moneyAtFA.slice().sort((a, b) => a - b);
	console.log(`   money at start of FA: median ${m[Math.floor(m.length / 2)]}, p10 ${m[Math.floor(m.length * 0.1)]}, p90 ${m[Math.floor(m.length * 0.9)]}`);
	console.log(`\n3. bought when offered   [goal 10-60%]`);
	const rows = Object.keys(d.offered)
		.map((k) => ({ k, rate: (d.bought[k] ?? 0) / d.offered[k], n: d.offered[k] }))
		.sort((a, b) => b.rate - a.rate);
	for (const r of rows) {
		const flag = r.rate < 0.1 || r.rate > 0.6 ? ' *' : '';
		console.log(`   ${r.k.padEnd(24)} ${(100 * r.rate).toFixed(0).padStart(3)}%  (n=${r.n})${flag}`);
	}
	console.log(`\n4. repeat champions:`);
	const goals: Record<string, string> = { '4': '35-50%', '8': '25-40%', '16': '15-30%' };
	for (const [k, v] of Object.entries(d.repeat).sort((a, b) => Number(a[0]) - Number(b[0]))) {
		console.log(`   ${k} teams: ${pct(v)}   [goal ${goals[k] ?? '-'}]`);
	}
	console.log(`\n5. champion undefeated in the regular season: ${pct(d.undefeatedChamp)}   [goal 50-80%]`);
	console.log(`\n6. best unsigned FA < average rostered fighter: by contract worth ${pct(d.faDepthContract)}, by current worth ${pct(d.faDepthNow)}   [goal 90%]`);
	const sd = d.signDays;
	const st = sd.reduce((a, b) => a + b, 0);
	console.log(`\n7. free agents signed on day 1/2/3/never: ${sd.map((x) => ((100 * x) / st).toFixed(0) + '%').join(' / ')}   [goal 15/30/30/25]`);
	console.log(`\n8. careers (everyone in the league; stat points, 2 per star):`);
	console.log(`   age   n     total  best   rostered`);
	for (const age of Object.keys(d.byAge).map(Number).sort((a, b) => a - b)) {
		const [n, total, best] = d.byAge[age];
		console.log(`   ${String(age).padEnd(5)} ${String(n).padEnd(5)} ${(total / n).toFixed(1).padStart(5)}  ${(best / n).toFixed(1).padStart(4)}   ${d.rosteredAges[age] ?? 0}`);
	}
	console.log(`   entry ages: ${distribution(d.entryAges)}`);
	console.log(`   exit ages:  ${distribution(d.exitAges)}`);
	const rostered = Object.values(d.rosteredAges).reduce((a, b) => a + b, 0);
	const over = (age: number) => Object.entries(d.rosteredAges).filter(([k]) => Number(k) >= age).reduce((a, [, v]) => a + v, 0);
	console.log(`   rostered 30+: ${((100 * over(30)) / rostered).toFixed(0)}%, 35+: ${((100 * over(35)) / rostered).toFixed(1)}%, 40+: ${((100 * over(40)) / rostered).toFixed(2)}%`);
	console.log(`\n9. teams with a fighter at 3.5+ stars in their primary stat: ${pct(d.star35)}   [goal 80-95%]`);
	console.log(`   ... at 4.75+ stars: ${pct(d.star475)}   [goal 20-40%]`);
	console.log(`   best primary stat per team: ${distribution(d.bestPrimary)}`);
	console.log(`   primary attacks on rosters: ${distribution(d.primaryKinds)}`);
	const fights = Object.values(d.fightSeconds).reduce((a, b) => a + b, 0);
	const inRange = Object.entries(d.fightSeconds).filter(([k]) => Number(k) >= 15 && Number(k) < 40).reduce((a, [, v]) => a + v, 0);
	console.log(`\n10. fights lasting 15-40s: ${((100 * inRange) / fights).toFixed(0)}% (n=${fights})   [goal 85%+]`);
	console.log(`   by 5s bucket: ${distribution(d.fightSeconds)}`);
}

// ---- main ----

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'run') {
	const arg = (name: string, fallback: number) => {
		const i = rest.indexOf('--' + name);
		return i >= 0 ? Number(rest[i + 1]) : fallback;
	};
	const outIndex = rest.indexOf('--out');
	const out = outIndex >= 0 ? rest[outIndex + 1] : null;
	const teams = arg('teams', 8);
	const leagues = arg('leagues', 4);
	const seasons = arg('seasons', 20);
	const from = arg('from', 4);
	const d = emptyData();
	for (let i = 0; i < leagues; i++) {
		runLeague(teams, seasons, from, d);
		d.teams.push(teams);
	}
	if (out) writeFileSync(out, JSON.stringify(d));
	else report(d);
} else if (mode === 'report') {
	const all = rest.map((f) => JSON.parse(readFileSync(f, 'utf8')) as Data).reduce(merge, emptyData());
	report(all);
} else {
	console.log('usage: mm-balance.ts run [--teams 8] [--leagues 4] [--seasons 20] [--from 4] [--out file] | report files...');
}
