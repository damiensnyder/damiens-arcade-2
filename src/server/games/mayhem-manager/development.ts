// How fighters change with age. Stats are tracked in fractions and only shown in whole points
// (half-stars), so players can't tell a 4-star from a 4.2-star.

import { MAX_STAT } from '../../../lib/games/mayhem-manager/rules.js';
import { STAT_NAMES, type Fighter } from '../../../lib/games/mayhem-manager/types.js';
import type { Rng } from './rng.js';

/** Expected change in each stat over a year from age alone. Training camp adds on top of this. */
export function averageIncrease(age: number): number {
	return age < 32 ? (26 - age) * 0.1 : (32 - age) * 0.07 - 0.5;
}

/** How much each stat's yearly change varies. Young fighters are the least predictable. */
function volatility(age: number): number {
	return Math.max(0.2, (25 - age) * 0.1);
}

/**
 * Once a year, at the start of the offseason, every fighter's stats drift with their age: up for
 * the young, down for the old. Half of each change is shared by all five stats.
 */
export function developFighter(rng: Rng, f: Fighter): void {
	const half = averageIncrease(f.age) / 2;
	const sd = volatility(f.age);
	const shared = rng.normal(half, sd);
	for (const stat of STAT_NAMES) {
		f.stats[stat] = Math.min(Math.max(f.stats[stat] + shared + rng.normal(half, sd), 0), MAX_STAT);
	}
}

/**
 * A point of training for fighters whose past isn't played out (the league's first free agents).
 * Mostly goes to the best stat that's still short of a random bar; once everything is high, to the worst.
 */
export function trainRandomly(rng: Rng, f: Fighter): void {
	const values = STAT_NAMES.map((s) => f.stats[s]);
	let target: (typeof STAT_NAMES)[number];
	if (Math.min(...values) >= 6) {
		target = STAT_NAMES[values.indexOf(Math.min(...values))];
	} else {
		const bar = rng.int(6, 9);
		const below = STAT_NAMES.filter((s) => f.stats[s] < bar);
		target = below.reduce((best, s) => (f.stats[s] > f.stats[best] ? s : best));
	}
	f.stats[target] = Math.min(f.stats[target] + 1, MAX_STAT);
}
