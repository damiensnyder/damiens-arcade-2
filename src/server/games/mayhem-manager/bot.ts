// Decisions for teams run by bots (and for people who get force-readied).
// Everything is judged in "value dollars": powerToDollars() of each fighter's best loadout.

import { MAX_STAT, canWearTogether } from '../../../lib/games/mayhem-manager/rules.js';
import { EQUIPMENT } from '../../../lib/games/mayhem-manager/catalog.js';
import { STAT_NAMES, type Equipment, type Fighter, type FreeAgent, type TrainingPlan } from '../../../lib/games/mayhem-manager/types.js';
import type { TeamState } from './state.js';
import { contractWorth, fighterPower, powerToDollars } from './valuation.js';

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

/** How many fighters bots try to have. There's no limit, but bigger rosters get expensive. */
const ROSTER_TARGET = 4;
/** Roughly what a decent free agent costs, for budgeting. */
const TYPICAL_SIGNING = 30;

/**
 * Re-sign fighters and repair equipment that are worth it. Fighters come first: equipment
 * is no use without someone to wear it, so repairs only use money not needed to fill the roster.
 * Only touches undecided items.
 */
export function decideOffseason(team: TeamState): void {
	const pending = team.expiring
		.filter((c) => c.decision === 'pending')
		.sort((a, b) => contractWorth(b.fighter) / b.ask - contractWorth(a.fighter) / a.ask);
	for (const c of pending) {
		const rosterAfter = team.fighters.length + team.expiring.filter((x) => x.decision === 'keep').length;
		// re-signing a known fighter at a fair price beats gambling on free agency
		const fair = contractWorth(c.fighter) >= c.ask * (rosterAfter < ROSTER_TARGET ? 0.75 : 0.95);
		if (fair && c.ask <= team.money && rosterAfter < ROSTER_TARGET + 2) {
			c.decision = 'keep';
			team.money -= c.ask;
		} else {
			c.decision = 'drop';
		}
	}

	const keptFighters = [...team.fighters, ...team.expiring.filter((c) => c.decision === 'keep').map((c) => c.fighter)];
	const rosterBudget = Math.max(0, ROSTER_TARGET - keptFighters.length) * TYPICAL_SIGNING;
	const repairs = team.repairs
		.filter((r) => r.decision === 'pending')
		.map((r) => {
			const gear = team.equipment;
			return { r, gain: teamValue(keptFighters, [...gear, r.equipment]) - teamValue(keptFighters, gear) };
		})
		.sort((a, b) => b.gain / b.r.price - a.gain / a.r.price);
	for (const { r, gain } of repairs) {
		if (gain >= r.price && r.price <= team.money - rosterBudget) {
			r.decision = 'keep';
			team.money -= r.price;
		} else {
			r.decision = 'drop';
		}
	}
}

/** Which free agents to sign at today's prices, best value first. */
export function chooseSignings(team: TeamState, agents: FreeAgent[], day: number, lastDay: number): FreeAgent[] {
	const priceToday = (a: FreeAgent) => a.prices[day - 1];
	const target = team.money > 260 ? ROSTER_TARGET + 1 : ROSTER_TARGET;
	const threshold = day === 1 ? 0.8 : day === lastDay ? 1.3 : 1.0;
	let money = team.money;
	let roster = team.fighters.length;
	const picks: FreeAgent[] = [];
	const candidates = agents
		.filter((a) => a.signedBy === null)
		.sort((a, b) => contractWorth(b.fighter) / priceToday(b) - contractWorth(a.fighter) / priceToday(a));
	for (const a of candidates) {
		if (roster >= target) break;
		const price = priceToday(a);
		const desperate = day === lastDay && roster < 3;
		// keep some money for equipment in training camp, once there are enough fighters to wear it
		const reserve = roster >= 2 ? 35 : 0;
		if (price > money || (!desperate && money - price < reserve)) continue;
		if (!desperate && price > contractWorth(a.fighter) * threshold) continue;
		picks.push(a);
		money -= price;
		roster++;
	}
	return picks;
}

/** Buys shop items that are worth their price. Saved money halves next season, so the bar is low. */
export function chooseShopping(team: TeamState): void {
	const owned = (): Gear[] => [
		...team.equipment,
		...team.shop.filter((s) => s.bought).map((s) => ({ id: s.id, key: s.key }))
	];
	for (;;) {
		const base = teamValue(team.fighters, owned());
		let best: (typeof team.shop)[number] | null = null;
		let bestRatio = 1;
		for (const item of team.shop) {
			if (item.bought || item.price > team.money) continue;
			const gain = teamValue(team.fighters, [...owned(), { id: item.id, key: item.key }]) - base;
			if (gain / Math.max(item.price, 1) > bestRatio) {
				best = item;
				bestRatio = gain / Math.max(item.price, 1);
			}
		}
		if (!best) return;
		best.bought = true;
		team.money -= best.price;
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
		if (f.stats[stat] >= MAX_STAT) continue;
		const gain = fighterValue({ ...f, stats: { ...f.stats, [stat]: f.stats[stat] + 1 } }, keys) - base;
		if (gain > bestGain) {
			best = { kind: 'stat', stat };
			bestGain = gain;
		}
	}
	const candidates = f.ability === 'refusesUnattuned' ? owned : keys;
	for (const key of new Set(candidates)) {
		if (f.attunements.includes(key) || f.ability === 'cantAttune') continue;
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
