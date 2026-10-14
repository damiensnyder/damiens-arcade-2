// Decisions for teams run by bots (and for people who get force-readied).
// Everything is judged in "value dollars": powerToDollars() of each fighter's best loadout.

import { FA_CONTRACT_YEARS, NEW_EQUIPMENT_YEARS, SHOP_SIZE, REPAIR_YEARS, RESIGN_CONTRACT_YEARS, canWearTogether, freeAgentPrices, isMaxed } from '../../../lib/games/mayhem-manager/rules.js';
import { EQUIPMENT, EQUIPMENT_KEYS } from '../../../lib/games/mayhem-manager/catalog.js';
import { STAT_NAMES, type Equipment, type Fighter, type FreeAgent, type TrainingPlan } from '../../../lib/games/mayhem-manager/types.js';
import type { TeamState } from './state.js';
import { fighterPower, powerToDollars, projectedFighter } from './valuation.js';

type Gear = { id: number; key: string };

function fighterValue(f: Fighter, keys: string[]): number {
	return powerToDollars(fighterPower(f, keys).power);
}

/**
 * Hands out equipment greedily: each item, most expensive first, goes to whichever fighter
 * it helps most (if it helps anyone and fits).
 */
export function assignLineup(fighters: Fighter[], gear: Gear[]): Record<number, number[]> {
	const lineup: Record<number, number[]> = Object.fromEntries(fighters.map((f) => [f.id, []]));
	const keysOf = (f: Fighter) => lineup[f.id].map((id) => gear.find((g) => g.id === id)!.key);
	const sorted = gear.slice().sort((a, b) => (EQUIPMENT[b.key]?.price ?? 0) - (EQUIPMENT[a.key]?.price ?? 0));
	for (const item of sorted) {
		let best: Fighter | null = null;
		let bestGain = 0;
		for (const f of fighters) {
			const keys = keysOf(f);
			if (!canWearTogether([...keys, item.key])) continue;
			const gain = fighterValue(f, [...keys, item.key]) - fighterValue(f, keys);
			if (gain > bestGain) {
				best = f;
				bestGain = gain;
			}
		}
		if (best) lineup[best.id].push(item.id);
	}
	return lineup;
}

export function teamValue(fighters: Fighter[], gear: Gear[]): number {
	const lineup = assignLineup(fighters, gear);
	return fighters.reduce(
		(sum, f) => sum + fighterValue(f, lineup[f.id].map((id) => gear.find((g) => g.id === id)!.key)),
		0
	);
}

/**
 * A purchase's return is what it adds to the team over the years it lasts (in value dollars),
 * divided by its price. Money saved is worth half as much next season, and the last things a team
 * can afford return about 1x, so saving only beats spending on things returning under about 0.5x.
 * Bots buy anything above that, best return first, and so spend nearly all their money each season.
 * (Head-to-head, bots that spend this freely beat ones that hold out for 1x or 2x; below 0.5x
 * makes no difference.)
 */
const CARRY_RETURN = 0.5;
/** Candidates examined in full each round; the rest are screened on their value alone (for speed). */
const SHORTLIST = 5;

/** What a fighter adds to the team over `years` seasons, given the gear it has. */
export function fighterGain(roster: Fighter[], gear: Gear[], f: Fighter, years: number): number {
	return (teamValue([...roster, projectedFighter(f, years)], gear) - teamValue(roster, gear)) * years;
}

/** What an item adds to the team over `years` seasons, given the fighters it would go to. */
export function itemGain(roster: Fighter[], gear: Gear[], item: Gear, years: number): number {
	return (teamValue(roster, [...gear, item]) - teamValue(roster, gear)) * years;
}

/** Something a bot could buy: what it costs, how long it lasts and what it would do. */
type Option =
	| { kind: 'fighter'; fighter: Fighter; price: number; years: number; decide?: () => void }
	| { kind: 'item'; gear: Gear; price: number; years: number; decide?: () => void; expected?: { gain: number } };

/**
 * Buys the best-returning option again and again until nothing left returns `CARRY_RETURN` or fits
 * the budget. Returns what was bought. Each purchase changes what the rest are worth (a fifth
 * fighter adds less than a fourth), so returns are recalculated every round.
 */
function spend(options: Option[], roster: Fighter[], gear: Gear[], budget: number): { bought: Option[]; left: number } {
	const bought: Option[] = [];
	const remaining = options.slice();
	for (;;) {
		const affordable = remaining.filter((o) => o.price <= budget);
		const gain = (o: Option) =>
			o.kind === 'fighter' ? fighterGain(roster, gear, o.fighter, o.years) : o.expected ? o.expected.gain : itemGain(roster, gear, o.gear, o.years);
		// fighters are screened by standalone value, since there are many; items are all examined
		const fighters = affordable
			.filter((o) => o.kind === 'fighter')
			.map((o) => ({ o, r: o.kind === 'fighter' ? (fighterValue(projectedFighter(o.fighter, o.years), []) * o.years) / o.price : 0 }))
			.sort((a, b) => b.r - a.r)
			.slice(0, SHORTLIST)
			.map((x) => x.o);
		let best: Option | null = null;
		let bestReturn = CARRY_RETURN;
		for (const o of [...fighters, ...affordable.filter((o) => o.kind === 'item')]) {
			const r = gain(o) / Math.max(o.price, 1);
			if (r > bestReturn) {
				best = o;
				bestReturn = r;
			}
		}
		if (!best) return { bought, left: budget };
		bought.push(best);
		remaining.splice(remaining.indexOf(best), 1);
		budget -= best.price;
		if (best.kind === 'fighter') roster = [...roster, best.fighter];
		else if (!best.expected) gear = [...gear, best.gear];
	}
}

/**
 * The shop will offer a random few of the catalog's items, so each one has a small chance of being
 * there. Bots count every item as a possible purchase scaled by that chance (the return is the same,
 * but it only claims its share of the budget), which keeps money in reserve for gear that would
 * help their fighters instead of spending it all on fighters.
 */
function expectedShop(roster: Fighter[], gear: Gear[]): Option[] {
	const chance = SHOP_SIZE / EQUIPMENT_KEYS.length;
	return EQUIPMENT_KEYS.map((key): Option => {
		const item = { id: -1, key };
		const gain = itemGain(roster, gear, item, NEW_EQUIPMENT_YEARS);
		return { kind: 'item', gear: item, price: EQUIPMENT[key].price * chance, years: NEW_EQUIPMENT_YEARS, expected: { gain: gain * chance } };
	}).filter((o) => o.kind === 'item' && o.expected!.gain > 0);
}

/**
 * At the start of the offseason a bot lists everything it could buy this season: re-signs, repairs
 * and the free agents it can already see (at their day-1 prices). It funds that list best return
 * first until the money runs out, then acts on the re-signs and repairs it funded. Anything it
 * didn't fund is let go. Only touches undecided items.
 */
export function decideOffseason(team: TeamState, visibleFreeAgents: FreeAgent[] = []): void {
	const pendingContracts = team.expiring.filter((c) => c.decision === 'pending');
	const pendingRepairs = team.repairs.filter((r) => r.decision === 'pending');
	const options: Option[] = [
		...pendingContracts.map((c): Option => ({ kind: 'fighter', fighter: c.fighter, price: c.ask, years: RESIGN_CONTRACT_YEARS, decide: () => {
			c.decision = 'keep';
			team.money -= c.ask;
		} })),
		...pendingRepairs.map((r): Option => ({ kind: 'item', gear: { id: r.equipment.id, key: r.equipment.key }, price: r.price, years: REPAIR_YEARS, decide: () => {
			r.decision = 'keep';
			team.money -= r.price;
		} })),
		...visibleFreeAgents.filter((a) => a.signedBy === null).map((a): Option => ({ kind: 'fighter', fighter: a.fighter, price: a.prices[0] ?? freeAgentPrices(a.fighter)[0], years: FA_CONTRACT_YEARS }))
	];
	const plan = spend([...options, ...expectedShop(team.fighters, team.equipment)], team.fighters, team.equipment, team.money);
	for (const o of plan.bought) o.decide?.();
	for (const c of pendingContracts) if (c.decision === 'pending') c.decision = 'drop';
	for (const r of pendingRepairs) if (r.decision === 'pending') r.decision = 'drop';
}

/** Which free agents to sign at today's prices, best return first. */
export function chooseSignings(team: TeamState, agents: FreeAgent[], day: number, _lastDay: number): FreeAgent[] {
	const options: Option[] = agents
		.filter((a) => a.signedBy === null)
		.map((a): Option => ({ kind: 'fighter', fighter: a.fighter, price: a.prices[day - 1], years: FA_CONTRACT_YEARS, decide: () => picks.push(a) }));
	const picks: FreeAgent[] = [];
	const gear: Gear[] = team.equipment;
	for (const o of spend([...options, ...expectedShop(team.fighters, gear)], team.fighters, gear, team.money).bought) o.decide?.();
	return picks;
}

/** Buys shop items that are worth their price with whatever money is left. */
export function chooseShopping(team: TeamState): void {
	const bought = new Map<number, (typeof team.shop)[number]>();
	const options: Option[] = team.shop
		.filter((s) => !s.bought)
		.map((s): Option => ({ kind: 'item', gear: { id: s.id, key: s.key }, price: s.price, years: NEW_EQUIPMENT_YEARS, decide: () => bought.set(s.id, s) }));
	const already: Gear[] = [...team.equipment, ...team.shop.filter((s) => s.bought).map((s) => ({ id: s.id, key: s.key }))];
	for (const o of spend(options, team.fighters, already, team.money).bought) o.decide?.();
	for (const item of bought.values()) {
		item.bought = true;
		team.money -= item.price;
	}
}

/**
 * The single stat or attunement that most helps this fighter with the gear they'll likely wear.
 * `owned` is all the team's gear, for fighters who won't use gear until they're attuned to it.
 */
export function chooseTrainingPlan(f: Fighter, keys: string[], owned: string[] = keys): TrainingPlan {
	const base = fighterValue(f, keys);
	let best: TrainingPlan = { kind: 'stat', stat: 'toughness' };
	let bestGain = -Infinity;
	for (const stat of STAT_NAMES) {
		if (isMaxed(f.stats[stat])) continue;
		const gain = fighterValue({ ...f, stats: { ...f.stats, [stat]: f.stats[stat] + 1 } }, keys) - base;
		if (gain > bestGain) {
			best = { kind: 'stat', stat };
			bestGain = gain;
		}
	}
	const candidates = f.ability === 'refusesUnattuned' ? owned : keys;
	for (const key of new Set(candidates)) {
		if (f.attunements.includes(key) || f.ability === 'cantAttune' || !EQUIPMENT[key]?.attunable) continue;
		const wearing = keys.includes(key) || !canWearTogether([...keys, key]) ? keys : [...keys, key];
		const gain = fighterValue({ ...f, attunements: [...f.attunements, key] }, wearing) - base;
		if (gain > bestGain) {
			best = { kind: 'attune', key };
			bestGain = gain;
		}
	}
	return best;
}

/** Fills in training plans for fighters who don't have one, based on the lineup they'd get. */
export function chooseTraining(team: TeamState): void {
	const gear: Gear[] = [
		...team.equipment,
		...team.shop.filter((s) => s.bought).map((s) => ({ id: s.id, key: s.key }))
	];
	const lineup = assignLineup(team.fighters, gear);
	for (const f of team.fighters) {
		if (team.training[f.id]) continue;
		const keys = lineup[f.id].map((id) => gear.find((g) => g.id === id)!.key);
		team.training[f.id] = chooseTrainingPlan(f, keys, gear.map((g) => g.key));
	}
}

export function chooseLineup(fighters: Fighter[], equipment: Equipment[]): Record<number, number[]> {
	return assignLineup(fighters, equipment);
}
