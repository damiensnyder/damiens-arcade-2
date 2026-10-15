// Decisions for teams run by bots (and for people who get force-readied).
//
// Everything is judged by team value (see valuation.ts): each fighter's output times how long
// they last with the gear they'd get, added up. A purchase is worth how much it raises
// log(team value), which is about how much better the team's odds get, times the seasons it
// lasts. Bots buy whatever is worth the most per dollar until the money runs out or nothing helps.

import { FA_CONTRACT_YEARS, NEW_EQUIPMENT_YEARS, SHOP_SIZE, REPAIR_YEARS, RESIGN_CONTRACT_YEARS, canWearTogether, freeAgentPrices, isMaxed } from '../../../lib/games/mayhem-manager/rules.js';
import { EQUIPMENT, EQUIPMENT_KEYS } from '../../../lib/games/mayhem-manager/catalog.js';
import { STAT_NAMES, type Equipment, type Fighter, type FreeAgent, type TrainingPlan } from '../../../lib/games/mayhem-manager/types.js';
import type { TeamState } from './state.js';
import { projectedFighter, teamValue } from './valuation.js';

type Gear = { id: number; key: string };

/** Who wears what: one list of gear per fighter. */
type Worn = Gear[][];

function logValue(fighters: Fighter[], worn: Worn): number {
	return Math.log(Math.max(teamValue(fighters.map((fighter, i) => ({ fighter, equipment: worn[i].map((g) => g.key) }))), 1e-9));
}

/** `worn` with `item` put on fighter `i`, taking off whatever it doesn't fit with. */
function puttingOn(worn: Worn, i: number, item: Gear): Worn {
	const kept = [item];
	for (const g of worn[i]) if (canWearTogether([...kept, g].map((x) => x.key))) kept.push(g);
	return worn.map((w, j) => (j === i ? kept : w.filter((g) => g !== item)));
}

/** The best place for one more item, without rearranging anything else: [log value, lineup]. */
function placeItem(fighters: Fighter[], worn: Worn, item: Gear, current = logValue(fighters, worn)): [number, Worn] {
	let best: [number, Worn] = [current, worn];
	for (let i = 0; i < fighters.length; i++) {
		const option = puttingOn(worn, i, item);
		const value = logValue(fighters, option);
		if (value > best[0]) best = [value, option];
	}
	return best;
}

/**
 * Hands out equipment to make the team as strong as possible: gives out items one at a time, each
 * to whoever it helps most, then tries moving each item to someone else until nothing improves.
 */
function arrange(fighters: Fighter[], gear: Gear[], start?: Worn): Worn {
	let worn: Worn = start ?? fighters.map(() => []);
	let value = logValue(fighters, worn);
	for (const item of gear) if (!worn.some((w) => w.includes(item))) [value, worn] = placeItem(fighters, worn, item, value);
	for (let pass = 0; pass < 3; pass++) {
		let improved = false;
		for (const item of gear) {
			const [v, w] = placeItem(fighters, worn, item, value);
			if (v > value + 1e-9) {
				[value, worn] = [v, w];
				improved = true;
			}
		}
		if (!improved) break;
	}
	return worn;
}

export function assignLineup(fighters: Fighter[], gear: Gear[]): Record<number, number[]> {
	const worn = arrange(fighters, gear);
	return Object.fromEntries(fighters.map((f, i) => [f.id, worn[i].map((g) => g.id)]));
}

/** What a team has and how it would line up, kept up to date as a bot buys things. */
interface Plan {
	fighters: Fighter[];
	gear: Gear[];
	worn: Worn;
	value: number;
}

function planFor(fighters: Fighter[], gear: Gear[]): Plan {
	const worn = arrange(fighters, gear);
	return { fighters, gear, worn, value: logValue(fighters, worn) };
}

/** log(team value) with a new fighter: they start bare and can take any one item from a teammate. */
function withFighter(plan: Plan, f: Fighter): number {
	const fighters = [...plan.fighters, f];
	const worn = [...plan.worn, []];
	let best = logValue(fighters, worn);
	for (const item of plan.gear) best = Math.max(best, logValue(fighters, puttingOn(worn, fighters.length - 1, item)));
	return best;
}

/**
 * Something a bot could buy. `chance` is for shop items it hasn't seen yet: it counts as that share
 * of the item, at that share of its price.
 */
type Option = {
	price: number;
	years: number;
	fighter?: Fighter;
	gear?: Gear;
	chance?: number;
	decide?: () => void;
};

/** Fighters examined in full each round; the rest are screened on their value alone (for speed). */
const SHORTLIST = 6;

/**
 * Buys the option with the most gain per dollar, again and again, until nothing affordable helps.
 * Each purchase changes what the rest are worth (a fifth fighter adds less than a fourth, and a
 * sword adds more once there's someone to hold it), so gains are worked out again every round.
 */
function spend(options: Option[], fighters: Fighter[], gear: Gear[], budget: number): Option[] {
	const bought: Option[] = [];
	const remaining = options.slice();
	let plan = planFor(fighters, gear);
	// fighters count as they're expected to develop over the contract
	const projected = new Map(options.filter((o) => o.fighter).map((o) => [o, projectedFighter(o.fighter!, o.years)]));
	const alone = new Map([...projected].map(([o, f]) => [o, logValue([f], [[]]) - Math.log(o.price)]));
	// what each option would add to the current plan; only recomputed once the plan changes
	let gains = new Map<Option, number>();
	const gainOf = (o: Option): number => {
		let gain = gains.get(o);
		if (gain === undefined) {
			const after = o.fighter ? withFighter(plan, projected.get(o)!) : placeItem(plan.fighters, plan.worn, o.gear!, plan.value)[0];
			gain = (after - plan.value) * o.years * (o.chance ?? 1);
			gains.set(o, gain);
		}
		return gain;
	};
	for (;;) {
		const affordable = remaining.filter((o) => o.price <= budget);
		const candidates = affordable
			.filter((o) => o.fighter)
			.sort((a, b) => alone.get(b)! - alone.get(a)!)
			.slice(0, SHORTLIST);
		let best: Option | null = null;
		let bestReturn = 0;
		for (const o of [...candidates, ...affordable.filter((o) => o.gear)]) {
			const r = gainOf(o) / Math.max(o.price, 1);
			if (r > bestReturn) {
				best = o;
				bestReturn = r;
			}
		}
		if (!best) return bought;
		bought.push(best);
		remaining.splice(remaining.indexOf(best), 1);
		budget -= best.price;
		if (best.fighter) plan = planFor([...plan.fighters, best.fighter], plan.gear);
		else if (!best.chance) plan = planFor(plan.fighters, [...plan.gear, best.gear!]);
		if (!best.chance) gains = new Map();
	}
}

/**
 * The shop will offer a random few of the catalog's items. Until it does, bots count each item as
 * a possible purchase, scaled by its chance of being offered, so they keep money for gear their
 * fighters would use instead of spending it all on fighters.
 */
function expectedShop(): Option[] {
	const chance = SHOP_SIZE / EQUIPMENT_KEYS.length;
	return EQUIPMENT_KEYS.map((key) => ({ gear: { id: -1, key }, price: EQUIPMENT[key].price * chance, years: NEW_EQUIPMENT_YEARS, chance }));
}

/**
 * At the start of the offseason a bot lists everything it could buy this season: re-signs, repairs,
 * the free agents it can already see (at day-1 prices) and the shop to come. It funds that list
 * best first, then acts on the re-signs and repairs it funded and lets the rest go.
 */
export function decideOffseason(team: TeamState, visibleFreeAgents: FreeAgent[] = []): void {
	const pendingContracts = team.expiring.filter((c) => c.decision === 'pending');
	const pendingRepairs = team.repairs.filter((r) => r.decision === 'pending');
	const options: Option[] = [
		...pendingContracts.map((c): Option => ({ fighter: c.fighter, price: c.ask, years: RESIGN_CONTRACT_YEARS, decide: () => {
			c.decision = 'keep';
			team.money -= c.ask;
		} })),
		...pendingRepairs.map((r): Option => ({ gear: { id: r.equipment.id, key: r.equipment.key }, price: r.price, years: REPAIR_YEARS, decide: () => {
			r.decision = 'keep';
			team.money -= r.price;
		} })),
		...visibleFreeAgents.filter((a) => a.signedBy === null).map((a): Option => ({ fighter: a.fighter, price: a.prices[0] ?? freeAgentPrices(a.fighter)[0], years: FA_CONTRACT_YEARS })),
		...expectedShop()
	];
	for (const o of spend(options, team.fighters, team.equipment, team.money)) o.decide?.();
	for (const c of pendingContracts) if (c.decision === 'pending') c.decision = 'drop';
	for (const r of pendingRepairs) if (r.decision === 'pending') r.decision = 'drop';
}

/** Which free agents to sign at today's prices, keeping money for the shop to come. */
export function chooseSignings(team: TeamState, agents: FreeAgent[], day: number, _lastDay: number): FreeAgent[] {
	const picks: FreeAgent[] = [];
	const options: Option[] = agents
		.filter((a) => a.signedBy === null)
		.map((a) => ({ fighter: a.fighter, price: a.prices[day - 1], years: FA_CONTRACT_YEARS, decide: () => picks.push(a) }));
	for (const o of spend([...options, ...expectedShop()], team.fighters, team.equipment, team.money)) o.decide?.();
	return picks;
}

/** Buys whichever shop items help, best value first. */
export function chooseShopping(team: TeamState): void {
	const already: Gear[] = [...team.equipment, ...team.shop.filter((s) => s.bought).map((s) => ({ id: s.id, key: s.key }))];
	const options: Option[] = team.shop
		.filter((s) => !s.bought)
		.map((s) => ({ gear: { id: s.id, key: s.key }, price: s.price, years: NEW_EQUIPMENT_YEARS, decide: () => {
			s.bought = true;
			team.money -= s.price;
		} }));
	for (const o of spend(options, team.fighters, already, team.money)) o.decide?.();
}

/**
 * The stat or attunement that most raises team value, given the gear this fighter will likely wear.
 * `owned` is all the team's gear, for fighters who won't use gear until they're attuned to it.
 */
export function chooseTrainingPlan(f: Fighter, keys: string[], owned: string[] = keys, team: Fighter[] = [f], worn: string[][] = [keys]): TrainingPlan {
	const at = Math.max(team.indexOf(f), 0);
	const score = (g: Fighter, k: string[]) =>
		Math.log(Math.max(teamValue(team.map((t, i) => (i === at ? { fighter: g, equipment: k } : { fighter: t, equipment: worn[i] }))), 1e-9));
	const base = score(f, keys);
	let best: TrainingPlan = { kind: 'stat', stat: 'toughness' };
	let bestGain = -Infinity;
	for (const stat of STAT_NAMES) {
		if (isMaxed(f.stats[stat])) continue;
		const gain = score({ ...f, stats: { ...f.stats, [stat]: f.stats[stat] + 1 } }, keys) - base;
		if (gain > bestGain) {
			best = { kind: 'stat', stat };
			bestGain = gain;
		}
	}
	const candidates = f.ability === 'refusesUnattuned' ? owned : keys;
	for (const key of new Set(candidates)) {
		if (f.attunements.includes(key) || f.ability === 'cantAttune' || !EQUIPMENT[key]?.attunable) continue;
		const wearing = keys.includes(key) || !canWearTogether([...keys, key]) ? keys : [...keys, key];
		const gain = score({ ...f, attunements: [...f.attunements, key] }, wearing) - base;
		if (gain > bestGain) {
			best = { kind: 'attune', key };
			bestGain = gain;
		}
	}
	return best;
}

/** Fills in training plans for fighters who don't have one, based on the lineup they'd get. */
export function chooseTraining(team: TeamState): void {
	const gear: Gear[] = [...team.equipment, ...team.shop.filter((s) => s.bought).map((s) => ({ id: s.id, key: s.key }))];
	const worn = arrange(team.fighters, gear).map((w) => w.map((g) => g.key));
	team.fighters.forEach((f, i) => {
		if (!team.training[f.id]) team.training[f.id] = chooseTrainingPlan(f, worn[i], gear.map((g) => g.key), team.fighters, worn);
	});
}

export function chooseLineup(fighters: Fighter[], equipment: Equipment[]): Record<number, number[]> {
	return assignLineup(fighters, equipment);
}

export interface BotPolicy {
	decideOffseason: (team: TeamState, visibleFreeAgents: FreeAgent[]) => void;
	chooseSignings: (team: TeamState, agents: FreeAgent[], day: number, lastDay: number) => FreeAgent[];
	chooseShopping: (team: TeamState) => void;
	chooseTraining: (team: TeamState) => void;
	chooseLineup: (fighters: Fighter[], equipment: Equipment[]) => Record<number, number[]>;
}

export const BOT: BotPolicy = { decideOffseason, chooseSignings, chooseShopping, chooseTraining, chooseLineup };
