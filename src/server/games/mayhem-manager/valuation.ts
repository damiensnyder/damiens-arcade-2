// Estimates how strong a team is without simulating fights.
//
// A fighter's contribution is their output (damage or healing per second) times how long they
// last. How long they last is their own effective HP plus the HP of every teammate the enemy
// knocks out first, since the enemy is busy with those. A team's value adds that up:
//
//   value = Σᵢ outputᵢ × (hpᵢ + Σⱼ hpⱼ × chance j goes down before i)
//
// The chance is wⱼ / (wᵢ + wⱼ), where w is how much enemies want to target someone (a frilly
// skirt makes it tiny, so its wearer lasts longest). With n identical fighters this gives the
// n² of Lanchester's square law. Two teams' values compare like their odds of winning.
//
// Output and HP come from the same formulas the battle sim uses (see sim/fighter.ts) and the
// attack and stat data each behavior declares. Effects that can't be read that way say what they
// amount to in these terms with `value` hints: extra damage per second, extra HP, a share of
// hits blocked, stats gained on average, hype given to teammates, or a support action.

import { MAX_STAT, averageIncrease } from '../../../lib/games/mayhem-manager/rules.js';
import { STAT_NAMES, type Fighter, type Stats } from '../../../lib/games/mayhem-manager/types.js';
import { ABILITY_BEHAVIORS, EQUIPMENT_BEHAVIORS, FISTS, HYPE_MODS, attackStats, type Behavior, type ValueContext } from './sim/behaviors.js';
import { ARENA_SIZE, INITIAL_COOLDOWN, MELEE_RANGE, START_INSET, TICK_LENGTH, TYPICAL_FIGHT_SECONDS, TYPICAL_HIT } from './sim/constants.js';

/** Global constants, fitted to simulated fights. Exported so the fitting script can vary them. */
export const TUNING = {
	/** How much each point of speed (away from 5) adds to how long a fighter lasts, by dodging and running. */
	speedSurvival: 0.04,
	/** Each fighter counts (output × time survived) to this power: doubling either more than doubles nothing. */
	exponent: 0.85,
	/** Area attacks count extra targets at this share: spread-out damage knocks nobody out sooner. */
	aoeSpread: 0.5,
	/** Fighters who attack from range last this much longer, since they back away from melee. */
	rangedKiting: 1.8
};

interface Part {
	key: string;
	behavior: Behavior;
	attuned: boolean;
}

function partsOf(fighter: Fighter, equipment: string[]): Part[] {
	const parts: Part[] = [{ key: 'fists', behavior: FISTS, attuned: false }];
	const ability = ABILITY_BEHAVIORS[fighter.ability];
	if (ability) parts.push({ key: fighter.ability, behavior: ability, attuned: false });
	for (const key of new Set(equipment)) {
		const behavior = EQUIPMENT_BEHAVIORS[key];
		if (fighter.ability === 'refusesUnattuned' && !fighter.attunements.includes(key)) continue;
		if (behavior) parts.push({ key, behavior, attuned: fighter.attunements.includes(key) });
	}
	return parts;
}

function addStats(stats: Stats, mods: Partial<Stats>, times = 1): void {
	for (const stat of STAT_NAMES) stats[stat] += (mods[stat] ?? 0) * times;
}

export function effectiveStats(fighter: Fighter, equipment: string[]): Stats {
	const stats = { ...fighter.stats };
	for (const part of partsOf(fighter, equipment)) addStats(stats, part.behavior.statMods?.(part.attuned) ?? {});
	return stats;
}

/** One fighter's numbers for the team formula. */
export interface Estimate {
	/** Damage (or healing) per second. */
	output: number;
	/** Damage it takes to knock them out (before toughness). */
	hp: number;
	/** How much enemies want to target them, relative to 1. */
	weight: number;
	/** Share of the fight teammates spend hyped thanks to this fighter. */
	hype: number;
	/** Share of HP the first teammate to go down comes back with, thanks to this fighter. */
	revive: number;
	/** Whether they have a support action (like healing) that could replace attacking. */
	canSupport: boolean;
}

/** What the team around a fighter looks like, for effects that depend on it. */
export interface Surroundings {
	teammates: number;
	/** Enemies standing, on average over the fight. */
	enemies: number;
	/** Damage per second of a typical enemy. */
	enemyDps: number;
	/** Share of the fight this fighter is hyped by teammates. */
	hyped: number;
}

const ALONE: Surroundings = { teammates: 0, enemies: 1, enemyDps: 10, hyped: 0 };

/**
 * One fighter wearing the given equipment keys. With `support`, they use their support action
 * (healing a teammate, hyping the team) instead of attacking, for as much of the fight as it takes.
 */
export function estimate(fighter: Fighter, equipment: string[], around: Surroundings = ALONE, support = false): Estimate {
	// bots ask about the same fighters and loadouts over and over
	const s = fighter.stats;
	const key = `${s.strength},${s.accuracy},${s.energy},${s.speed},${s.toughness}|${fighter.ability}|${fighter.attunements.join()}|${equipment.join()}|${around.teammates},${around.enemies},${around.enemyDps},${around.hyped}|${support}`;
	let cached = CACHE.get(key);
	if (!cached) {
		if (CACHE.size > 100_000) CACHE.clear();
		cached = estimateUncached(fighter, equipment, around, support);
		CACHE.set(key, cached);
	}
	return cached;
}

const CACHE = new Map<string, Estimate>();

/** For scripts that change TUNING. */
export function clearEstimates(): void {
	CACHE.clear();
}

function estimateUncached(fighter: Fighter, equipment: string[], around: Surroundings, support: boolean): Estimate {
	const parts = partsOf(fighter, equipment);
	const base = effectiveStats(fighter, equipment);
	addStats(base, HYPE_MODS, around.hyped);
	const immune = parts.some((p) => p.behavior.blocksEffect);
	const ctx: ValueContext = { hitsPerSecond: 0, hitsTaken: 0, timeToCharge: 0, startDelay: INITIAL_COOLDOWN, immune, ...around };

	// worked out twice: some effects depend on how often the fighter hits or gets hit
	let result: Estimate = { output: 0, hp: 0, weight: 1, hype: 0, revive: 0, canSupport: false };
	for (let pass = 0; pass < 2; pass++) {
		const s = { ...base };
		if (pass > 0) for (const part of parts) addStats(s, part.behavior.value?.stats?.(part.attuned, ctx) ?? {});
		for (const stat of STAT_NAMES) s[stat] = Math.max(s[stat], 0);
		const timeToCharge = Math.max(4.8 - 0.32 * s.energy, 0.8);
		const damageTaken = Math.max(1.25 - 0.05 * s.toughness, 0.5);
		const cooldownReduction = parts.reduce((sum, p) => sum + (p.behavior.cooldownReduction ?? 0), 0);
		// nobody acts before the initial cooldown; melee fighters also have to cross the arena, and
		// charged attacks need charging first. Attacks only count for the rest of a typical fight.
		const approach = Math.max(ARENA_SIZE - 2 * START_INSET - MELEE_RANGE, 0) / Math.max(5 + s.speed, 1);
		const uptime = (delay: number) => Math.max((TYPICAL_FIGHT_SECONDS - delay) / TYPICAL_FIGHT_SECONDS, 0.1);

		// the primary attack: whichever deals the most damage per second
		let dps = 0;
		let hitsPerSecond = 0;
		let ranged = false;
		for (const part of parts) {
			const spec = part.behavior.attack;
			if (!spec) continue;
			const { damage, cooldown, charges } = attackStats(spec, part.attuned);
			const cycle = Math.max(cooldown - cooldownReduction, TICK_LENGTH) + charges * timeToCharge;
			const strength = Math.max(0.5 + 0.1 * s[spec.scalesWith ?? 'strength'], 0.25);
			const hitChance = Math.max(0, Math.min(0.25 + 0.05 * s.accuracy, 1));
			const share = uptime(Math.max(INITIAL_COOLDOWN, spec.kind === 'melee' ? approach : 0) + charges * timeToCharge);
			const perUse = spec.kind === 'melee' ? damage * (spec.fixed ? 1 : strength) : spec.kind === 'ranged' ? damage * hitChance : damage * (1 + TUNING.aoeSpread * Math.max(around.enemies - 1, 0));
			if ((perUse * share) / cycle > dps) {
				dps = (perUse * share) / cycle;
				hitsPerSecond = ((spec.kind === 'ranged' ? hitChance : 1) * share) / cycle;
				ranged = spec.kind !== 'melee';
			}
		}

		let hp = 100 / damageTaken;
		let blocked = 0;
		let outputFactor = 1;
		let weight = 1;
		let hype = 0;
		let revive = 0;
		let healing = 0;
		let busy = 0;
		let canSupport = false;
		Object.assign(ctx, { hitsPerSecond, timeToCharge });
		for (const part of parts) {
			const v = part.behavior.value;
			weight *= part.behavior.targetWeight ?? 1;
			if (!v) continue;
			dps += v.dps?.(part.attuned, ctx) ?? 0;
			hp += (v.hp?.(part.attuned, ctx) ?? 0) / damageTaken;
			blocked = 1 - (1 - blocked) * (1 - (v.blocked?.(part.attuned) ?? 0));
			outputFactor *= v.output?.(part.attuned, ctx) ?? 1;
			weight *= v.weight ?? 1;
			revive = Math.max(revive, v.revive ?? 0);
			hype = 1 - (1 - hype) * (1 - (v.teamHype?.(part.attuned, ctx) ?? 0));
			const action = v.action?.(part.attuned, ctx);
			if (action) {
				canSupport = true;
				if (support) {
					healing += action.healing ?? 0;
					hype = 1 - (1 - hype) * (1 - (action.hype ?? 0));
					busy = Math.max(busy, action.busy);
				}
			}
		}
		hp /= 1 - blocked;
		if (ranged) hp *= TUNING.rangedKiting;
		hp *= Math.max(0.6, Math.min(1.4, 1 + TUNING.speedSurvival * (s.speed - 5)));
		ctx.hitsTaken = hp / TYPICAL_HIT;
		result = { output: dps * outputFactor * (1 - busy) + healing, hp, weight, hype, revive, canSupport };
	}
	return result;
}

export interface Member {
	fighter: Fighter;
	equipment: string[];
}

/**
 * The team formula (see the top of this file) for fighters' estimates. Enemies go after whoever
 * they can do the most about, like the sim's fighters do: more output and less HP draw more
 * attention, scaled by each fighter's weight (a frilly skirt makes it tiny).
 */
function pooledValue(estimates: Estimate[]): number {
	const n = estimates.length;
	const hp = estimates.map((e) => e.hp);
	const attention = estimates.map((e) => (e.weight * (e.output + 0.01)) / e.hp);
	// a halo brings back whoever's likely to go down first
	estimates.forEach((e, i) => {
		if (e.revive <= 0) return;
		let first = -1;
		for (let j = 0; j < n; j++) if (j !== i && (first < 0 || attention[j] > attention[first])) first = j;
		if (first >= 0) hp[first] += e.revive * estimates[first].hp;
	});
	let value = 0;
	for (let i = 0; i < n; i++) {
		let lasts = hp[i];
		for (let j = 0; j < n; j++) if (j !== i) lasts += (hp[j] * attention[j]) / (attention[i] + attention[j]);
		value += Math.pow(estimates[i].output * lasts, TUNING.exponent);
	}
	return value;
}

/**
 * The team formula (see the top of this file) for these fighters and loadouts. Fighters with a
 * support action use it if that makes the team stronger.
 */
export function teamValue(members: Member[]): number {
	if (members.length === 0) return 0;
	const n = members.length;
	const support = members.map(() => false);
	const evaluate = (): number => {
		// first without hype from teammates, to see how much each one hands out
		const plain = members.map((m, i) => estimate(m.fighter, m.equipment, { teammates: n - 1, enemies: (n + 1) / 2, enemyDps: 10, hyped: 0 }, support[i]));
		const enemyDps = plain.reduce((sum, e) => sum + e.output, 0) / n;
		const estimates = members.map((m, i) => {
			const hyped = 1 - plain.reduce((p, e, j) => (j === i ? p : p * (1 - e.hype)), 1);
			return estimate(m.fighter, m.equipment, { teammates: n - 1, enemies: (n + 1) / 2, enemyDps, hyped }, support[i]);
		});
		return pooledValue(estimates);
	};
	let best = evaluate();
	members.forEach((m, i) => {
		if (!estimate(m.fighter, m.equipment).canSupport) return;
		support[i] = true;
		const value = evaluate();
		if (value > best) best = value;
		else support[i] = false;
	});
	return best;
}

/** A fighter's value on their own, used to judge free agents' potential regardless of gear. */
function soloValue(fighter: Fighter, equipment: string[]): number {
	return teamValue([{ fighter, equipment }]);
}

/** Loadouts used to judge a fighter's potential, so accuracy and energy count for something. */
const ARCHETYPES: string[][] = [[], ['diamondSword'], ['laserBlaster'], ['wandOfFlames']];

const REPLACEMENT_FIGHTER: Fighter = {
	id: -1,
	name: '',
	age: 25,
	stats: { strength: 0, accuracy: 0, energy: 0, speed: 0, toughness: 0 },
	look: { gender: 'A', hair: 1, face: 1, shirt: 1, skin: 0, hairColor: 0 },
	ability: 'noAbilities',
	attunements: [],
	contractYears: 0
};
const REPLACEMENT_LEVEL = ARCHETYPES.map((loadout) => Math.sqrt(soloValue(REPLACEMENT_FIGHTER, loadout)));
/** Scales worth so a typical rookie costs a sensible share of a team's budget. */
const WORTH_SCALE = 0.5;

/**
 * How much a fighter is worth this season, in dollars, regardless of equipment. Used to rank free
 * agents (which ones are offered), not by the bots.
 */
export function fighterWorth(fighter: Fighter): number {
	if (fighter.isOwner) return 0;
	// measured against a replacement-level fighter, since bad fighters are nearly free
	const values = ARCHETYPES.map((loadout, i) => 4.2 * (Math.sqrt(soloValue(fighter, loadout)) - REPLACEMENT_LEVEL[i]));
	const best = Math.max(...values);
	const typical = values.reduce((a, b) => a + b, 0) / values.length;
	return Math.max(0, WORTH_SCALE * (0.6 * best + 0.4 * typical));
}

/** Young fighters tend to improve and old ones decline, which matters over a multi-year contract. */
export function ageFactor(age: number): number {
	return Math.max(0.6, Math.min(1.2, 1 + 0.035 * (26 - age)));
}

export function contractWorth(fighter: Fighter): number {
	return fighterWorth(fighter) * ageFactor(fighter.age);
}

/** Expected points of training per season: about half of fighters' camps go to a stat. */
const TRAINING_PER_SEASON = 0.5;

/**
 * The fighter as expected over their next `years` seasons: stats averaged over the contract, with
 * each later season one more year of development and some training in their best stat.
 */
export function projectedFighter(fighter: Fighter, years: number): Fighter {
	const stats = { ...fighter.stats };
	const average: Stats = { strength: 0, accuracy: 0, energy: 0, speed: 0, toughness: 0 };
	for (let year = 0; year < years; year++) {
		if (year > 0) {
			const change = averageIncrease(fighter.age + year);
			for (const stat of STAT_NAMES) stats[stat] = Math.min(Math.max(stats[stat] + change, 0), MAX_STAT);
		}
		const best = STAT_NAMES.reduce((a, b) => (stats[b] > stats[a] ? b : a));
		stats[best] = Math.min(stats[best] + TRAINING_PER_SEASON, MAX_STAT);
		for (const stat of STAT_NAMES) average[stat] += stats[stat] / years;
	}
	return { ...fighter, stats: average };
}
