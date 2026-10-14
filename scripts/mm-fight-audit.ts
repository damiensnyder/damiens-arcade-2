// Tests in-fight decision making: real bot rosters fight exact copies of themselves, with one side
// using a variant policy. If a variant wins clearly more than 50%, the current policy is leaving
// something on the table.
//
//   npx tsx scripts/mm-fight-audit.ts [--snapshots 300] [--fights 20] [variant ...]

import { canWearTogether, sanitizeLineup } from '../src/lib/games/mayhem-manager/rules.js';
import type { Fighter } from '../src/lib/games/mayhem-manager/types.js';
import MayhemManager from '../src/server/games/mayhem-manager/index.js';
import { Rng } from '../src/server/games/mayhem-manager/rng.js';
import type { LeagueState } from '../src/server/games/mayhem-manager/state.js';
import { Fight, simulateFight, type Combatant } from '../src/server/games/mayhem-manager/sim/fight.js';
import { BattleFighter } from '../src/server/games/mayhem-manager/sim/fighter.js';
import { MELEE_RANGE, TICK_LENGTH } from '../src/server/games/mayhem-manager/sim/constants.js';
import { EQUIPMENT_BEHAVIORS } from '../src/server/games/mayhem-manager/sim/behaviors.js';
import { EQUIPMENT_KEYS } from '../src/lib/games/mayhem-manager/catalog.js';
import { assignLineup } from '../src/server/games/mayhem-manager/bot.js';

interface Member {
	fighter: Fighter;
	keys: string[];
}

const args = process.argv.slice(2);
const arg = (name: string, fallback: number) => {
	const i = args.indexOf('--' + name);
	return i >= 0 ? Number(args[i + 1]) : fallback;
};
const SNAPSHOTS = arg('snapshots', 300);
/** Replace each roster's gear with this many random catalog items per fighter, handed out by the bots. */
const GEAR = arg('gear', 0);
const FIGHTS = arg('fights', 20);
/** Put this item on one random fighter in every roster (dropping whatever it conflicts with). */
const GIVE = args.includes('--give') ? args[args.indexOf('--give') + 1] : null;
const chosen = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));

function collectSnapshots(count: number): Member[][] {
	const out: Member[][] = [];
	let leagueNo = 0;
	while (out.length < count) {
		const league = new MayhemManager();
		league.emitEventTo = () => {};
		// seeded, so every run (and every variant) sees the same rosters
		const internals = league as unknown as { rng: Rng; s: LeagueState };
		internals.rng = new Rng([leagueNo + 1, 2, 3, 4]);
		internals.s.rng = internals.rng.state;
		leagueNo++;
		const teams = [4, 8, 12, 16][leagueNo % 4];
		for (let i = 0; i < teams; i++) league.handleAction(1, { type: 'addBot' }, true);
		const s = () => (league as unknown as { s: LeagueState }).s;
		let captured = 0;
		for (let step = 0; step < 12 * 30; step++) {
			league.handleAction(1, { type: 'forceReady' }, true);
			const st = s();
			if (st.phase.kind !== 'regularSeason' || st.phase.week !== 0 || st.season <= captured) continue;
			captured = st.season;
			if (st.season < 4) continue;
			for (const team of st.teams) {
				if (team.fighters.some((f) => f.isOwner) || team.fighters.length === 0) continue;
				const keyOf = new Map(team.equipment.map((e) => [e.id, e.key]));
				const lineup = sanitizeLineup(team.fighters, team.equipment, team.lineup);
				out.push(team.fighters.map((f) => ({ fighter: structuredClone(f), keys: (lineup[f.id] ?? []).map((id) => keyOf.get(id)!) })));
			}
			if (st.season >= 10) break;
		}
	}
	const result = out.slice(0, count);
	if (GEAR > 0) {
		const rng = new Rng([9, 9, 9, 9]);
		for (const snap of result) {
			const gear = Array.from({ length: Math.round(GEAR * snap.length) }, (_, i) => ({ id: i, key: rng.pick(EQUIPMENT_KEYS) }));
			const lineup = assignLineup(snap.map((m) => m.fighter), gear);
			for (const m of snap) m.keys = lineup[m.fighter.id].map((id) => gear[id].key);
		}
	}
	if (GIVE) {
		const rng = new Rng([7, 7, 7, 7]);
		for (const snap of result) {
			const m = snap[rng.int(0, snap.length - 1)];
			const keys = [GIVE];
			for (const k of m.keys) if (canWearTogether([...keys, k])) keys.push(k);
			m.keys = keys;
		}
	}
	return result;
}

// ---- variants: each patches BattleFighter for fighters on team 0 only ----

type P = Record<string, (...a: never[]) => unknown>;
const proto = BattleFighter.prototype as unknown as P & Record<string, unknown>;
const original: Record<string, (...a: unknown[]) => unknown> = {};
for (const k of Object.getOwnPropertyNames(BattleFighter.prototype)) {
	const v = proto[k];
	if (typeof v === 'function') original[k] = v as (...a: unknown[]) => unknown;
}
type BF = BattleFighter & Record<string, (...a: unknown[]) => unknown>;
function patch(name: string, fn: (this: BF, orig: (...a: unknown[]) => unknown, ...a: unknown[]) => unknown) {
	const orig = original[name];
	proto[name] = function (this: BF, ...a: unknown[]) {
		if (this.team !== 0) return orig.apply(this, a);
		return fn.call(this, (...b: unknown[]) => orig.apply(this, b), ...a);
	} as never;
}
function unpatchAll() {
	for (const [k, v] of Object.entries(original)) proto[k] = v as never;
	for (const b of Object.values(EQUIPMENT_BEHAVIORS)) {
		const orig = (b as { __orig?: NonNullable<typeof b.action>['priority'] }).__orig;
		if (b.action && orig) b.action.priority = orig;
	}
}

const VARIANTS: Record<string, () => void> = {
	control: () => {},
	// target choice
	nearest: () =>
		patch('valueOfAttacking', function (_o, target) {
			return 1 / (1 + this.distanceTo(target as BattleFighter));
		}),
	weakest: () =>
		patch('valueOfAttacking', function (_o, target, dps, t) {
			return 1 / ((t as number) + (target as BattleFighter).effectiveHp() / Math.max(dps as number, 1e-5));
		}),
	mostDangerous: () =>
		patch('valueOfAttacking', function (_o, target) {
			return (target as BattleFighter).danger();
		}),
	ignoreTargetWeight: () =>
		patch('valueOfAttacking', function (_o, target, dps, t) {
			const tg = target as BattleFighter;
			return tg.danger() / ((t as number) + tg.effectiveHp() / Math.max(dps as number, 1e-5));
		}),
	// stick with the current target until it's down (unless it's far worse than the best)
	sticky: () =>
		patch('valueOfAttacking', function (o, target, dps, t) {
			const v = o(target, dps, t) as number;
			const self = this as unknown as { lastTarget?: BattleFighter };
			return self.lastTarget === target && (target as BattleFighter).hp > 0 ? v * 1.5 : v;
		}),
	// movement
	noMeleeBackoff: () =>
		patch('meleeAttack', function (_o, target, option) {
			const t = target as BattleFighter;
			const opt = option as { charges: number; cooldown: number; spec: { fixed?: boolean; scalesWith?: never; damageAt?: (i: unknown, t: unknown) => number }; item: unknown; damage: number; knockback: number };
			if (this.distanceTo(t) > MELEE_RANGE) this.moveTowards(t);
			if (this.distanceTo(t) <= MELEE_RANGE && this.cooldown === 0 && this.charges >= opt.charges) {
				this.charges -= opt.charges;
				this.setCooldown(opt.cooldown);
				this.swing(-11.0001, -11);
				const base = opt.spec.damageAt?.(opt.item, t) ?? opt.damage;
				const damage = opt.spec.fixed ? base : base * this.meleeDamageMultiplier(opt.spec.scalesWith);
				this.hit(t, opt.item, damage, opt.knockback, !opt.spec.fixed);
			} else if (this.charges < opt.charges && this.cooldown === 0) {
				this.charge();
			}
		}),
	backoff03: () => backoffVariant(0.3),
	backoff12: () => backoffVariant(1.2),
	// never use item actions (corn dog, flower, foam finger...)
	noActions: () => {
		for (const b of Object.values(EQUIPMENT_BEHAVIORS)) {
			if (!b.action) continue;
			const orig = (b as { _p?: typeof b.action.priority }).__orig ?? b.action.priority;
			(b as { __orig?: unknown }).__orig = orig;
			b.action.priority = (item) => (item.owner.team === 0 ? 0 : orig(item));
		}
	},
	// everyone on the team attacks whoever the first standing teammate values most
	focusFire: () =>
		patch('valueOfAttacking', function (o, target, dps, t) {
			const lead = this.teammates()[0] as BF;
			if (lead === this) return o(target, dps, t);
			return (target as BattleFighter) === (lead as unknown as { lastTarget?: BattleFighter }).lastTarget ? 1e9 : (o(target, dps, t) as number);
		}),
	noKiting: () => patch('keepAwayFromMelee', function () {}),
	// kite from any melee enemy within 2x melee range, not just ones that would reach before our next action
	moreKiting: () =>
		patch('keepAwayFromMelee', function () {
			let threat: BattleFighter | null = null;
			for (const e of this.enemies()) {
				if (!(e as BF).prefersMelee() || this.distanceTo(e) > MELEE_RANGE * 3) continue;
				if (threat === null || this.distanceTo(e) < this.distanceTo(threat)) threat = e;
			}
			if (threat) this.moveAwayFrom(threat);
		})
};

function backoffVariant(threshold: number) {
	patch('meleeAttack', function (_o, target, option) {
		const t = target as BattleFighter;
		const opt = option as { charges: number; cooldown: number; spec: { fixed?: boolean; scalesWith?: never; damageAt?: (i: unknown, t: unknown) => number }; item: unknown; damage: number; knockback: number };
		const lead = this.timeUntilReady(opt.charges) - this.timeToReach(t);
		if (this.distanceTo(t) > MELEE_RANGE && lead < threshold) this.moveTowards(t);
		else if (lead > threshold && this.distanceTo(t) < MELEE_RANGE * 2) this.moveAwayFrom(t);
		if (this.distanceTo(t) <= MELEE_RANGE && this.cooldown === 0 && this.charges >= opt.charges) {
			this.charges -= opt.charges;
			this.setCooldown(opt.cooldown);
			this.swing(-11.0001, -11);
			const base = opt.spec.damageAt?.(opt.item, t) ?? opt.damage;
			const damage = opt.spec.fixed ? base : base * this.meleeDamageMultiplier(opt.spec.scalesWith);
			this.hit(t, opt.item, damage, opt.knockback, !opt.spec.fixed);
		} else if (this.charges < opt.charges && this.cooldown === 0) {
			this.charge();
		}
	});
}

// remember targets for 'sticky'
const hitOrig = original.hit;
proto.hit = function (this: BF & { lastTarget?: BattleFighter }, ...a: unknown[]) {
	this.lastTarget = a[0] as BattleFighter;
	return hitOrig.apply(this, a);
} as never;
original.hit = proto.hit as never;

// ---- running ----

let ticks = 0;
// meters walked per fighter per second, by side (team 0 plays the variant)
const walked = [0, 0];
let fighterSeconds = 0;
const moveBy = (BattleFighter.prototype as unknown as { moveByVector: (dx: number, dy: number, turn?: boolean) => void }).moveByVector;
(BattleFighter.prototype as unknown as Record<string, unknown>).moveByVector = function (this: BattleFighter, dx: number, dy: number, turn?: boolean) {
	walked[this.team] += Math.hypot(dx, dy);
	return moveBy.call(this, dx, dy, turn);
};
// unpatchAll() restores from `original`, so the counting wrapper has to be what it restores
original.moveByVector = (BattleFighter.prototype as unknown as Record<string, (...a: unknown[]) => unknown>).moveByVector;
const fproto = Fight.prototype as unknown as { doTick: () => void };
const doTick = fproto.doTick;
fproto.doTick = function (this: unknown) {
	ticks++;
	doTick.call(this);
};

function fight(snap: Member[], rng: Rng): { won: boolean; seconds: number } {
	const side = (team: number, offset: number): Combatant[] =>
		snap.map((m) => ({ fighter: { ...structuredClone(m.fighter), id: m.fighter.id + offset }, equipment: m.keys, team }));
	const a = side(0, 0);
	const b = side(1, 1_000_000);
	ticks = 0;
	const out = simulateFight(rng, rng.real() < 0.5 ? [...a, ...b] : [...b, ...a], false, new Map([[0, 15], [1, 15]]));
	fighterSeconds += (ticks * TICK_LENGTH * snap.length);
	return { won: out.winner === 0, seconds: ticks * TICK_LENGTH };
}

// usage: for each action item, fighters who had it in a fight, and how many of them used it
const equipped: Record<string, number> = {};
const used: Record<string, number> = {};
const uses: Record<string, number> = {};
const usedThisFight = new Set<object>();
for (const [key, b] of Object.entries(EQUIPMENT_BEHAVIORS)) {
	if (!b.action) continue;
	const perform = b.action.perform;
	b.action.perform = (item) => {
		const before = item.owner.charges;
		const cooldownBefore = item.owner.cooldown;
		perform(item);
		const charged = item.owner.charges > before;
		if (!charged && (item.owner.charges < before || !item.owner.items.includes(item) || item.owner.cooldown > cooldownBefore)) {
			usedThisFight.add(item);
			if (item.owner.team === 1) uses[key] = (uses[key] ?? 0) + 1;
		}
	};
	const start = b.onFightStart;
	b.onFightStart = (item) => {
		if (item.owner.team === 1) equipped[key] = (equipped[key] ?? 0) + 1;
		start?.(item);
	};
}
const recordUse = () => {
	for (const item of usedThisFight) {
		const it = item as { key: string; owner: { team: number } };
		if (it.owner.team === 1) used[it.key] = (used[it.key] ?? 0) + 1;
	}
	usedThisFight.clear();
};

const snapshots = collectSnapshots(SNAPSHOTS);
const sizes: Record<number, number> = {};
for (const s of snapshots) sizes[s.length] = (sizes[s.length] ?? 0) + 1;
console.log(`${snapshots.length} snapshots (team sizes ${JSON.stringify(sizes)}), ${FIGHTS} fights each`);
for (const name of chosen.length ? chosen : Object.keys(VARIANTS)) {
	unpatchAll();
	const [base, param] = name.split(':');
	if (base === 'backoff') backoffVariant(Number(param));
	else if (base === 'noAction') {
		const b = EQUIPMENT_BEHAVIORS[param];
		const orig = b.action!.priority;
		(b as { __orig?: unknown }).__orig = orig;
		b.action!.priority = (item) => (item.owner.team === 0 ? 0 : orig(item));
	} else if (base === 'boostAction') {
		// scale an item action's priority by a factor, for team 0
		const [key, factor] = param.split('x');
		const b = EQUIPMENT_BEHAVIORS[key];
		const orig = b.action!.priority;
		(b as { __orig?: unknown }).__orig = orig;
		b.action!.priority = (item) => orig(item) * (item.owner.team === 0 ? Number(factor) : 1);
	} else VARIANTS[name]();
	const rng = new Rng([1, 2, 3, 4]);
	let wins = 0;
	walked[0] = walked[1] = fighterSeconds = 0;
	let n = 0;
	let seconds = 0;
	const lengths: number[] = [];
	for (const snap of snapshots) {
		for (let i = 0; i < FIGHTS; i++) {
			const r = fight(snap, rng);
			recordUse();
			wins += r.won ? 1 : 0;
			seconds += r.seconds;
			lengths.push(r.seconds);
			n++;
		}
	}
	const p = wins / n;
	// fights within a snapshot are correlated, so this understates the error a little
	const se = Math.sqrt((p * (1 - p)) / n);
	lengths.sort((a, b) => a - b);
	const q = (x: number) => lengths[Math.floor(x * (lengths.length - 1))].toFixed(0);
	const inRange = lengths.filter((l) => l >= 15 && l < 40).length / lengths.length;
	console.log(
		`${name.padEnd(20)} ${(100 * p).toFixed(1)}% ±${(100 * se).toFixed(1)}   avg ${(seconds / n).toFixed(1)}s (median ${q(0.5)}, p90 ${q(0.9)}, p99 ${q(0.99)}; ${(100 * inRange).toFixed(0)}% in 15-40s)  walks ${(walked[0] / fighterSeconds).toFixed(1)} vs ${(walked[1] / fighterSeconds).toFixed(1)} m/s`
	);
}
// team 1 always plays the unchanged policy
console.log('action items used (by the unchanged side), share of fights where the holder used it at least once:');
for (const key of Object.keys(equipped)) {
	console.log(`  ${key.padEnd(16)} ${((100 * (used[key] ?? 0)) / equipped[key]).toFixed(0)}% of ${equipped[key]}, ${((uses[key] ?? 0) / Math.max(used[key] ?? 0, 1)).toFixed(1)} uses per fight when used`);
}
