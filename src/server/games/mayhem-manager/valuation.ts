// Estimates how strong fighters and loadouts are without simulating fights.
//
// Power ≈ damage per second × effective HP, computed from the same formulas the battle sim
// uses (see sim/fighter.ts) and the attack/stat data each behavior declares. Effects that
// can't be read that way supply rough `value` hints. Adding an item whose effect is damage,
// cooldowns or stats needs no new tuning; unusual items need one hint, not one coefficient
// per pairing with every other item.

import { MAX_STAT, averageIncrease } from '../../../lib/games/mayhem-manager/rules.js';
import { STAT_NAMES, type Fighter, type Stats } from '../../../lib/games/mayhem-manager/types.js';
import { ABILITY_BEHAVIORS, EQUIPMENT_BEHAVIORS, FISTS, attackStats, type Behavior } from './sim/behaviors.js';
import { TICK_LENGTH } from './sim/constants.js';

/** How many enemies an area attack is assumed to hit. */
const AOE_TARGETS = 2;
// Fit to simulated fights between random teams: melee fighters lose time walking and being kited,
// ranged ones get free shots. (Without these, ranged weapons were badly undervalued.)
const MELEE_EFF = 0.65;
const RANGED_EFF = 1.3;
/**
 * A fighter's body is worth a lot by itself: in simulated fights, each extra fighter, however
 * weak, adds about as much as a typical fighter's skill does. So the zero point of fighter value
 * sits near a fighter with no skill at all (√power ≈ 6), not far below it. (Valuing bodies more
 * than this made bots hire extra fighters instead of buying gear, and they won less.)
 */
const BODY_OFFSET = 6;

interface Part {
	key: string;
	behavior: Behavior;
	attuned: boolean;
}

function partsOf(fighter: Fighter, equipment: string[]): Part[] {
	const parts: Part[] = [{ key: 'fists', behavior: FISTS, attuned: false }];
	const ability = ABILITY_BEHAVIORS[fighter.ability];
	if (ability) parts.push({ key: fighter.ability, behavior: ability, attuned: false });
	for (const key of equipment) {
		const behavior = EQUIPMENT_BEHAVIORS[key];
		if (fighter.ability === 'refusesUnattuned' && !fighter.attunements.includes(key)) continue;
		if (behavior) parts.push({ key, behavior, attuned: fighter.attunements.includes(key) });
	}
	return parts;
}

export function effectiveStats(fighter: Fighter, equipment: string[]): Stats {
	const stats = { ...fighter.stats };
	for (const part of partsOf(fighter, equipment)) {
		const mods = part.behavior.statMods?.(part.attuned) ?? {};
		for (const [stat, amount] of Object.entries(mods) as [keyof Stats, number][]) stats[stat] += amount;
	}
	return stats;
}

export interface PowerEstimate {
	dps: number;
	ehp: number;
	power: number;
}

/** Strength of one fighter wearing the given equipment keys. */
export function fighterPower(fighter: Fighter, equipment: string[]): PowerEstimate {
	const parts = partsOf(fighter, equipment);
	const s = effectiveStats(fighter, equipment);
	const meleeMult = (stat: keyof Stats = 'strength') => Math.max(0.5 + 0.1 * s[stat], 0.25);
	const hitChance = Math.max(0, Math.min(0.25 + 0.05 * s.accuracy, 1));
	const timeToCharge = Math.max(4.8 - 0.32 * s.energy, 0.8);
	const damageTaken = Math.max(1.25 - 0.05 * s.toughness, 0.5);
	const cooldownReduction = parts.reduce((sum, p) => sum + (p.behavior.cooldownReduction ?? 0), 0);

	let dps = 0;
	let attacksPerSecond = 0;
	let bestKind: 'melee' | 'ranged' | 'aoe' = 'melee';
	for (const part of parts) {
		const spec = part.behavior.attack;
		if (!spec) continue;
		const { damage, cooldown, charges } = attackStats(spec, part.attuned);
		const cycle = Math.max(cooldown - cooldownReduction, TICK_LENGTH) + charges * timeToCharge;
		const perUse =
			spec.kind === 'melee'
				? damage * (spec.fixed ? 1 : meleeMult(spec.scalesWith)) * MELEE_EFF
				: spec.kind === 'ranged' ? damage * hitChance * RANGED_EFF : damage * AOE_TARGETS;
		if (perUse / cycle > dps) {
			dps = perUse / cycle;
			attacksPerSecond = 1 / cycle;
			bestKind = spec.kind;
		}
	}

	let ehp = 100 / damageTaken;
	for (const part of parts) {
		const hints = part.behavior.value;
		if (!hints) continue;
		dps += hints.bonusDps?.(part.attuned, attacksPerSecond) ?? 0;
		dps *= hints.dpsMultiplier?.(part.attuned) ?? 1;
		ehp *= hints.ehpMultiplier?.(part.attuned) ?? 1;
	}

	// speed helps melee fighters close in and everyone else stay out of reach
	const mobility = Math.max(0.7, Math.min(1.3, 1 + 0.03 * (s.speed - 5)));
	if (bestKind === 'melee') dps *= mobility;
	else ehp *= mobility;

	return { dps, ehp, power: dps * ehp };
}

/** Converts power to dollars. Square root because a team's strength adds up roughly like √power. */
export function powerToDollars(power: number): number {
	return 4.2 * (Math.sqrt(Math.max(power, 0)) - BODY_OFFSET);
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
const REPLACEMENT_LEVEL = ARCHETYPES.map((loadout) => powerToDollars(fighterPower(REPLACEMENT_FIGHTER, loadout).power));
/** Scales worth so a typical rookie costs a sensible share of a team's budget. */
const WORTH_SCALE = 0.5;

/** How much a fighter is worth this season, in dollars, regardless of equipment. */
export function fighterWorth(fighter: Fighter): number {
	if (fighter.isOwner) return 0;
	// measured against a replacement-level fighter, since bad fighters are nearly free
	const values = ARCHETYPES.map(
		(loadout, i) => powerToDollars(fighterPower(fighter, loadout).power) - REPLACEMENT_LEVEL[i]
	);
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
