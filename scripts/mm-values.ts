// Estimates what stats, abilities, equipment and extra fighters are worth in a fight, for pricing.
//
// Method: play all-bot leagues and snapshot every team at the start of each regular season (real
// rosters, gear, lineups and money). Each snapshot fights an exact copy of itself, so the baseline
// win rate is 50%; then one thing is changed on one side and we see how far the win rate moves.
// Value is reported in log-odds ("logit") of winning, which adds up better than win percentages,
// and converted to dollars so that the equipment catalog as a whole is fairly priced.
//
// Equipment goes to whichever fighter it helps most (dropping anything it conflicts with), picked
// with one set of fights and measured with a fresh set so lucky picks don't inflate the value.
//
// Usage: npx tsx scripts/mm-values.ts [--snapshots 400] [--fights 16] [--workers 8] [--json out.json]

import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ABILITY_KEYS, EQUIPMENT, EQUIPMENT_KEYS } from '../src/lib/games/mayhem-manager/catalog.js';
import { canWearTogether, sanitizeLineup } from '../src/lib/games/mayhem-manager/rules.js';
import { STAT_NAMES, type Fighter, type StatName } from '../src/lib/games/mayhem-manager/types.js';
import { generateFighter } from '../src/server/games/mayhem-manager/generate.js';
import MayhemManager from '../src/server/games/mayhem-manager/index.js';
import { Rng } from '../src/server/games/mayhem-manager/rng.js';
import { EQUIPMENT_BEHAVIORS } from '../src/server/games/mayhem-manager/sim/behaviors.js';
import { simulateFight, type Combatant } from '../src/server/games/mayhem-manager/sim/fight.js';
import type { LeagueState } from '../src/server/games/mayhem-manager/state.js';
import { contractWorth } from '../src/server/games/mayhem-manager/valuation.js';

// ---- setup ----

interface Member {
	fighter: Fighter;
	keys: string[];
}

interface Snapshot {
	season: number;
	members: Member[];
	money: number;
}

type Experiment =
	| { kind: 'control' }
	| { kind: 'stat'; stat: StatName }
	| { kind: 'ability'; key: string }
	| { kind: 'item'; key: string; attuned: boolean }
	| { kind: 'body'; body: 'zero' | 'rookie' }
	| { kind: 'fighter' };

/** Context for one measurement, for breaking results down afterwards. */
interface Meta {
	season: number;
	teamSize: number;
	/** What the fighter the change was made to (if any) attacks with. */
	attacks?: string;
}

interface Result {
	/** Win fraction per snapshot (for averages and standard errors). */
	winRates: number[];
	meta?: Meta[];
	/** For 'fighter': one row per fighter measured. */
	samples?: { worth: number; statTotal: number; stats: Fighter['stats']; ability: string; age: number; teamSize: number; attacks: string; winRate: number }[];
	/** For 'item': how often each placement was chosen. */
	placedOnNobody?: number;
}

const args = process.argv.slice(2);
const arg = (name: string, fallback: number) => {
	const i = args.indexOf('--' + name);
	return i >= 0 ? Number(args[i + 1]) : fallback;
};
const SNAPSHOTS = arg('snapshots', 400);
const FIGHTS = arg('fights', 16);
const SELECT_FIGHTS = 4;

function seedFor(...parts: (string | number)[]): Rng {
	// FNV-1a, four ways, so each experiment and snapshot gets its own reproducible stream
	const text = parts.join('|');
	const state = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((h) => {
		for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
		return h;
	});
	return new Rng(state as [number, number, number, number]);
}

// ---- snapshots from bot leagues ----

function collectSnapshots(count: number): Snapshot[] {
	const snapshots: Snapshot[] = [];
	for (let leagueNo = 0; snapshots.length < count; leagueNo++) {
		const league = new MayhemManager();
		league.emitEventTo = () => {};
		for (let i = 0; i < 8; i++) league.handleAction(1, { type: 'addBot' }, true);
		const state = () => (league as unknown as { s: LeagueState }).s;
		let captured = 0;
		for (let step = 0; step < 6 * 25 && captured < 6; step++) {
			league.handleAction(1, { type: 'forceReady' }, true);
			const s = state();
			if (s.phase.kind !== 'regularSeason' || s.phase.week !== 0 || captured >= s.season) continue;
			captured = s.season;
			for (const team of s.teams) {
				if (team.fighters.some((f) => f.isOwner) || team.fighters.length === 0) continue;
				const keyOf = new Map(team.equipment.map((e) => [e.id, e.key]));
				const lineup = sanitizeLineup(team.fighters, team.equipment, team.lineup);
				snapshots.push({
					season: s.season,
					money: team.money,
					members: team.fighters.map((f) => ({
						fighter: structuredClone(f),
						keys: (lineup[f.id] ?? []).map((id) => keyOf.get(id)!)
					}))
				});
			}
		}
	}
	return snapshots.slice(0, count);
}

// ---- fights ----

function fight(a: Member[], b: Member[], money: number, rng: Rng): { aWon: boolean; margin: number } {
	const side = (members: Member[], team: number, idOffset: number): Combatant[] =>
		members.map((m) => ({ fighter: { ...m.fighter, id: m.fighter.id + idOffset }, equipment: m.keys, team }));
	const ca = side(a, 0, 0);
	const cb = side(b, 1, 1_000_000);
	// either side might spawn (and act) first
	const combatants = rng.real() < 0.5 ? [...ca, ...cb] : [...cb, ...ca];
	const out = simulateFight(rng, combatants, false, new Map([[0, money], [1, money]]));
	let margin = 0;
	for (const f of out.fighters) margin += (f.team === 0 ? 1 : -1) * (Number(f.standing) + f.hp / 100);
	return { aWon: out.winner === 0, margin };
}

function winRate(a: Member[], b: Member[], money: number, rng: Rng, n: number): number {
	let wins = 0;
	for (let i = 0; i < n; i++) if (fight(a, b, money, rng).aWon) wins++;
	return wins / n;
}

function meanMargin(a: Member[], b: Member[], money: number, rng: Rng, n: number): number {
	let total = 0;
	for (let i = 0; i < n; i++) total += fight(a, b, money, rng).margin;
	return total / n;
}

const copy = (members: Member[]): Member[] =>
	members.map((m) => ({ fighter: structuredClone(m.fighter), keys: m.keys.slice() }));

/** `key` on this fighter, keeping whatever else they wear that still fits. */
function wearing(keys: string[], key: string): string[] {
	const result = [key];
	for (const k of keys) if (canWearTogether([...result, k])) result.push(k);
	return result;
}

/** How a fighter mostly attacks with this gear: 'melee', 'ranged' or 'charged' (needs charges). */
function attackStyle(keys: string[]): string {
	const styles = keys.map((k) => EQUIPMENT_BEHAVIORS[k]?.attack).filter((a) => a !== undefined);
	if (styles.some((a) => a.charges)) return 'charged';
	if (styles.some((a) => a.kind === 'ranged')) return 'ranged';
	return 'melee';
}

function runExperiment(exp: Experiment, snap: Snapshot, index: number): Result {
	const result = runExperimentInner(exp, snap, index);
	const rng = seedFor(JSON.stringify(exp), index);
	const pick = rng.int(0, snap.members.length - 1);
	result.meta = result.winRates.map(() => ({ season: snap.season, teamSize: snap.members.length, attacks: attackStyle(snap.members[pick].keys) }));
	return result;
}

function runExperimentInner(exp: Experiment, snap: Snapshot, index: number): Result {
	const rng = seedFor(JSON.stringify(exp), index);
	const base = snap.members;
	const pick = rng.int(0, base.length - 1);
	switch (exp.kind) {
		case 'control':
			return { winRates: [winRate(base, base, snap.money, rng, FIGHTS)] };
		case 'stat': {
			const a = copy(base);
			a[pick].fighter.stats[exp.stat] += 2;
			return { winRates: [winRate(a, base, snap.money, rng, FIGHTS)] };
		}
		case 'ability': {
			const b = copy(base);
			b[pick].fighter.ability = 'noAbilities';
			const a = copy(b);
			a[pick].fighter.ability = exp.key;
			return { winRates: [winRate(a, b, snap.money, rng, FIGHTS)] };
		}
		case 'body': {
			const extra: Fighter =
				exp.body === 'zero'
					? { ...generateFighter(rng, -1, 25), stats: { strength: 0, accuracy: 0, energy: 0, speed: 0, toughness: 0 } }
					: generateFighter(rng, -1);
			extra.ability = 'noAbilities';
			return { winRates: [winRate([...base, { fighter: extra, keys: [] }], base, snap.money, rng, FIGHTS)] };
		}
		case 'fighter': {
			// each fighter, without gear, against the same team without them
			const stripped = base.map((m) => ({ fighter: m.fighter, keys: [] as string[] }));
			const samples: Result['samples'] = [];
			const rates: number[] = [];
			for (let i = 0; i < base.length; i++) {
				if (base.length < 2) break;
				const withGear = base.map((m, j) => (j === i ? stripped[j] : m));
				const without = withGear.filter((_, j) => j !== i);
				const rate = winRate(withGear, without, snap.money, rng, FIGHTS);
				const f = base[i].fighter;
				rates.push(rate);
				samples.push({
					worth: contractWorth(f),
					statTotal: STAT_NAMES.reduce((s, k) => s + f.stats[k], 0),
					stats: f.stats,
					ability: f.ability,
					age: f.age,
					teamSize: base.length,
					attacks: attackStyle(base[i].keys),
					winRate: rate
				});
			}
			return { winRates: rates, samples };
		}
		case 'item': {
			const options: Member[][] = base.map((_, j) => {
				const a = copy(base);
				const m = a[j];
				m.keys = wearing(m.keys, exp.key);
				m.fighter.attunements = m.fighter.attunements.filter((k) => k !== exp.key);
				if (exp.attuned) m.fighter.attunements.push(exp.key);
				return a;
			});
			let best: Member[] | null = null;
			let bestScore = 0;
			for (const option of options) {
				const score = meanMargin(option, base, snap.money, rng, SELECT_FIGHTS);
				if (score > bestScore) {
					best = option;
					bestScore = score;
				}
			}
			// nobody wants it: same as not having it
			if (!best) return { winRates: [0.5], placedOnNobody: 1 };
			return { winRates: [winRate(best, base, snap.money, rng, FIGHTS)], placedOnNobody: 0 };
		}
	}
}

// ---- workers ----

type Task = { id: number; exp: Experiment; from: number; to: number };

if (process.env.MM_VALUES_WORKER) {
	let snapshots: Snapshot[] = [];
	process.on('message', (msg: { snapshots?: Snapshot[]; task?: Task }) => {
		if (msg.snapshots) snapshots = msg.snapshots;
		if (msg.task) {
			const { id, exp, from, to } = msg.task;
			const merged: Result = { winRates: [], meta: [], samples: [], placedOnNobody: 0 };
			for (let i = from; i < to; i++) {
				const r = runExperiment(exp, snapshots[i], i);
				merged.winRates.push(...r.winRates);
				merged.meta!.push(...(r.meta ?? []));
				merged.samples!.push(...(r.samples ?? []));
				merged.placedOnNobody! += r.placedOnNobody ?? 0;
			}
			process.send!({ id, result: merged });
		}
	});
} else {
	await main();
}

async function main() {
	const workers = arg('workers', 8);
	const started = Date.now();
	console.error(`collecting ${SNAPSHOTS} team snapshots…`);
	const snapshots = collectSnapshots(SNAPSHOTS);
	const bySeason = new Map<number, number>();
	for (const s of snapshots) bySeason.set(s.season, (bySeason.get(s.season) ?? 0) + 1);

	const experiments: { name: string; exp: Experiment }[] = [
		{ name: 'control', exp: { kind: 'control' } },
		...STAT_NAMES.map((stat) => ({ name: `stat:${stat}`, exp: { kind: 'stat', stat } as Experiment })),
		...ABILITY_KEYS.filter((k) => k !== 'noAbilities').map((key) => ({ name: `ability:${key}`, exp: { kind: 'ability', key } as Experiment })),
		...EQUIPMENT_KEYS.flatMap((key) => [
			{ name: `item:${key}`, exp: { kind: 'item', key, attuned: false } as Experiment },
			{ name: `item:${key}:attuned`, exp: { kind: 'item', key, attuned: true } as Experiment }
		]),
		{ name: 'body:zero', exp: { kind: 'body', body: 'zero' } },
		{ name: 'body:rookie', exp: { kind: 'body', body: 'rookie' } },
		{ name: 'fighter', exp: { kind: 'fighter' } }
	];

	const chunk = Math.ceil(snapshots.length / 8);
	const tasks: Task[] = [];
	experiments.forEach(({ exp }, id) => {
		for (let from = 0; from < snapshots.length; from += chunk) tasks.push({ id, exp, from, to: Math.min(from + chunk, snapshots.length) });
	});
	const results: Result[] = experiments.map(() => ({ winRates: [], meta: [], samples: [], placedOnNobody: 0 }));

	let done = 0;
	await new Promise<void>((resolve) => {
		let next = 0;
		let running = 0;
		const script = fileURLToPath(import.meta.url);
		for (let w = 0; w < workers; w++) {
			const child = fork(script, [], { execArgv: ['--import', 'tsx'], env: { ...process.env, MM_VALUES_WORKER: '1' } });
			child.send({ snapshots });
			const feed = () => {
				if (next >= tasks.length) {
					child.kill();
					if (--running === 0) resolve();
					return;
				}
				child.send({ task: tasks[next++] });
			};
			child.on('message', (msg: { id: number; result: Result }) => {
				const r = results[msg.id];
				r.winRates.push(...msg.result.winRates);
				r.meta!.push(...(msg.result.meta ?? []));
				r.samples!.push(...(msg.result.samples ?? []));
				r.placedOnNobody! += msg.result.placedOnNobody ?? 0;
				if (++done % 50 === 0) console.error(`${done}/${tasks.length} tasks, ${((Date.now() - started) / 1000).toFixed(0)}s`);
				feed();
			});
			running++;
			feed();
		}
	});

	const logit = (p: number) => Math.log(Math.max(p, 1e-4) / Math.max(1 - p, 1e-4));
	const summary = experiments.map(({ name }, i) => {
		const rates = results[i].winRates;
		const p = rates.reduce((a, b) => a + b, 0) / rates.length;
		const sd = Math.sqrt(rates.reduce((a, b) => a + (b - p) ** 2, 0) / Math.max(rates.length - 1, 1));
		const se = sd / Math.sqrt(rates.length);
		return { name, winRate: p, logit: logit(p), logitSe: se / Math.max(p * (1 - p), 0.01), n: rates.length, placedOnNobody: results[i].placedOnNobody };
	});

	// dollars: scale so the whole equipment catalog's value equals its total price
	const items = summary.filter((s) => s.name.startsWith('item:') && !s.name.endsWith(':attuned'));
	const totalPrice = items.reduce((sum, s) => sum + EQUIPMENT[s.name.slice(5)].price, 0);
	const totalValue = items.reduce((sum, s) => sum + Math.max(s.logit, 0), 0);
	const dollarsPerLogit = totalPrice / totalValue;

	const out = {
		snapshots: snapshots.length,
		bySeason: Object.fromEntries(bySeason),
		fightsPerSnapshot: FIGHTS,
		dollarsPerLogit,
		seconds: (Date.now() - started) / 1000,
		summary,
		raw: Object.fromEntries(experiments.map(({ name }, i) => [name, { winRates: results[i].winRates, meta: results[i].meta }])),
		fighterSamples: results[experiments.findIndex((e) => e.name === 'fighter')].samples
	};
	const jsonPath = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
	if (jsonPath) writeFileSync(jsonPath, JSON.stringify(out, null, 1));

	const fmt = (s: (typeof summary)[number]) => {
		const price = s.name.startsWith('item:') ? EQUIPMENT[s.name.split(':')[1]].price : null;
		return [
			s.name.padEnd(34),
			`${(s.winRate * 100).toFixed(1)}%`.padStart(7),
			s.logit.toFixed(3).padStart(7),
			`±${s.logitSe.toFixed(3)}`.padStart(7),
			`$${(s.logit * dollarsPerLogit).toFixed(0)}`.padStart(6),
			price !== null ? `$${price}`.padStart(5) : ''
		].join(' ');
	};
	console.log(`${snapshots.length} snapshots, ${FIGHTS} fights each; $${dollarsPerLogit.toFixed(1)} per logit`);
	console.log('name'.padEnd(34), '   win', '  logit', '     se', ' value', 'price');
	for (const s of summary) console.log(fmt(s));
}
