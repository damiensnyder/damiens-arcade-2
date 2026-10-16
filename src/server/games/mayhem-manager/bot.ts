// Decisions for teams run by bots (and for people who get force-readied).
//
// Everything is judged by team value (see valuation.ts): each fighter's output times how long
// they last with the gear they'd get, added up. A purchase is worth how much it raises
// log(team value), which is about how much better the team's odds get, times the seasons it
// lasts. Bots buy whatever is worth the most per dollar until the money runs out or nothing helps.
// Teams are valued with the money they'd have left, which matters for gear like the Money Sword.

import { FA_CONTRACT_YEARS, NEW_EQUIPMENT_YEARS, SHOP_SIZE, REPAIR_YEARS, RESIGN_CONTRACT_YEARS, canWearTogether, freeAgentPrices, isMaxed } from '../../../lib/games/mayhem-manager/rules.js';
import { EQUIPMENT, EQUIPMENT_KEYS } from '../../../lib/games/mayhem-manager/catalog.js';
import { STAT_NAMES, type Equipment, type Fighter, type FreeAgent, type TrainingPlan } from '../../../lib/games/mayhem-manager/types.js';
import type { TeamState } from './state.js';
import { EQUIPMENT_BEHAVIORS } from './sim/behaviors.js';
import { TYPICAL_MONEY, projectedFighter, teamValue } from './valuation.js';

type Gear = { id: number; key: string };

/** Who wears what: one list of gear per fighter. */
type Worn = Gear[][];

/** log(team value), with `money` left for the team's fights. */
function logValue(fighters: Fighter[], worn: Worn, money: number): number {
	return Math.log(Math.max(teamValue(fighters.map((fighter, i) => ({ fighter, equipment: worn[i].map((g) => g.key) })), money), 1e-9));
}

/** Whether any of this gear is worth more or less depending on the team's money. */
function usesMoney(gear: Gear[]): boolean {
	return gear.some((g) => EQUIPMENT_BEHAVIORS[g.key]?.attack?.planDamage);
}

/** `worn` with `item` put on fighter `i`, taking off whatever it doesn't fit with. */
function puttingOn(worn: Worn, i: number, item: Gear): Worn {
	const kept = [item];
	for (const g of worn[i]) if (canWearTogether([...kept, g].map((x) => x.key))) kept.push(g);
	return worn.map((w, j) => (j === i ? kept : w.filter((g) => g !== item)));
}

/** The best place for one more item, without rearranging anything else: [log value, lineup]. */
function placeItem(fighters: Fighter[], worn: Worn, item: Gear, money: number, current = logValue(fighters, worn, money)): [number, Worn] {
	let best: [number, Worn] = [current, worn];
	for (let i = 0; i < fighters.length; i++) {
		const option = puttingOn(worn, i, item);
		const value = logValue(fighters, option, money);
		if (value > best[0]) best = [value, option];
	}
	return best;
}

/**
 * Hands out equipment to make the team as strong as possible: gives out items one at a time, each
 * to whoever it helps most, then tries moving each item to someone else until nothing improves.
 */
function arrange(fighters: Fighter[], gear: Gear[], money: number, start?: Worn): Worn {
	let worn: Worn = start ?? fighters.map(() => []);
	let value = logValue(fighters, worn, money);
	for (const item of gear) if (!worn.some((w) => w.includes(item))) [value, worn] = placeItem(fighters, worn, item, money, value);
	for (let pass = 0; pass < 3; pass++) {
		let improved = false;
		for (const item of gear) {
			const [v, w] = placeItem(fighters, worn, item, money, value);
			if (v > value + 1e-9) {
				[value, worn] = [v, w];
				improved = true;
			}
		}
		if (!improved) break;
	}
	return worn;
}

export function assignLineup(fighters: Fighter[], gear: Gear[], money = TYPICAL_MONEY): Record<number, number[]> {
	const worn = arrange(fighters, gear, money);
	return Object.fromEntries(fighters.map((f, i) => [f.id, worn[i].map((g) => g.id)]));
}

/** What a team has and how it would line up, kept up to date as a bot buys things. */
interface Plan {
	fighters: Fighter[];
	gear: Gear[];
	worn: Worn;
	/** With the money the plan leaves. */
	value: number;
}

function planFor(fighters: Fighter[], gear: Gear[], money: number): Plan {
	const worn = arrange(fighters, gear, money);
	return { fighters, gear, worn, value: logValue(fighters, worn, money) };
}

/** log(team value) with a new fighter: they start bare and can take any one item from a teammate. */
function withFighter(plan: Plan, f: Fighter, money: number): number {
	const fighters = [...plan.fighters, f];
	const worn = [...plan.worn, []];
	let best = logValue(fighters, worn, money);
	for (const item of plan.gear) best = Math.max(best, logValue(fighters, puttingOn(worn, fighters.length - 1, item), money));
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
	let plan = planFor(fighters, gear, budget);
	// fighters count as they're expected to develop over the contract
	const projected = new Map(options.filter((o) => o.fighter).map((o) => [o, projectedFighter(o.fighter!, o.years)]));
	const alone = new Map([...projected].map(([o, f]) => [o, logValue([f], [[]], budget) - Math.log(o.price)]));
	// what each option would add to the current plan; only recomputed once the plan changes
	let gains = new Map<Option, number>();
	const gainOf = (o: Option): number => {
		let gain = gains.get(o);
		if (gain === undefined) {
			// valued with the money left after paying for it
			const left = budget - o.price;
			const after = o.fighter ? withFighter(plan, projected.get(o)!, left) : placeItem(plan.fighters, plan.worn, o.gear!, left)[0];
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
		// a share of a shop item doesn't change the plan, except for gear that depends on the money left
		const recount = !best.chance || usesMoney(plan.gear);
		if (best.fighter) plan = planFor([...plan.fighters, best.fighter], plan.gear, budget);
		else if (recount) plan = planFor(plan.fighters, best.chance ? plan.gear : [...plan.gear, best.gear!], budget);
		if (recount) gains = new Map();
	}
}

/**
 * Shop items count this many times over while planning. A share of an item at a share of its
 * price misses that buying an expensive one takes its whole price, saved up, so without this bots
 * arrive at the shop with too little to afford them. Up to about 2.5 the bots are no weaker
 * (scripts/mm-h2h.ts), but every dollar saved is one not spent on fighters, so rosters shrink:
 * at 1.5 they average just over 3 fighters and buy $35+ items about 10% of the times they're offered.
 */
const SHOP_RESERVE = 1.5;

/**
 * The shop will offer a random few of the catalog's items. Until it does, bots count each item as
 * a possible purchase, scaled by its chance of being offered, so they keep money for gear their
 * fighters would use instead of spending it all on fighters.
 */
function expectedShop(): Option[] {
	const chance = SHOP_SIZE / EQUIPMENT_KEYS.length;
	return EQUIPMENT_KEYS.map((key) => ({ gear: { id: -1, key }, price: EQUIPMENT[key].price * chance, years: NEW_EQUIPMENT_YEARS * SHOP_RESERVE, chance }));
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
export function chooseTrainingPlan(f: Fighter, keys: string[], owned: string[] = keys, team: Fighter[] = [f], worn: string[][] = [keys], money = TYPICAL_MONEY): TrainingPlan {
	const at = Math.max(team.indexOf(f), 0);
	const score = (g: Fighter, k: string[]) =>
		Math.log(Math.max(teamValue(team.map((t, i) => (i === at ? { fighter: g, equipment: k } : { fighter: t, equipment: worn[i] })), money), 1e-9));
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
	const worn = arrange(team.fighters, gear, team.money).map((w) => w.map((g) => g.key));
	team.fighters.forEach((f, i) => {
		if (!team.training[f.id]) team.training[f.id] = chooseTrainingPlan(f, worn[i], gear.map((g) => g.key), team.fighters, worn, team.money);
	});
}

export function chooseLineup(fighters: Fighter[], equipment: Equipment[], money = TYPICAL_MONEY): Record<number, number[]> {
	return assignLineup(fighters, equipment, money);
}

export interface BotPolicy {
	decideOffseason: (team: TeamState, visibleFreeAgents: FreeAgent[]) => void;
	chooseSignings: (team: TeamState, agents: FreeAgent[], day: number, lastDay: number) => FreeAgent[];
	chooseShopping: (team: TeamState) => void;
	chooseTraining: (team: TeamState) => void;
	chooseLineup: (fighters: Fighter[], equipment: Equipment[], money?: number) => Record<number, number[]>;
}

export const BOT: BotPolicy = { decideOffseason, chooseSignings, chooseShopping, chooseTraining, chooseLineup };
