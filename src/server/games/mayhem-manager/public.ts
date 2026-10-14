// What clients get to see of a fighter. Stats are tracked in fractions on the server but sent in
// whole points, so nobody can tell a 4-star fighter from a 4.2-star one.

import type { Fighter, Stats } from '../../../lib/games/mayhem-manager/types.js';

export function roundStats(stats: Stats): Stats {
	return {
		strength: Math.round(stats.strength),
		accuracy: Math.round(stats.accuracy),
		energy: Math.round(stats.energy),
		speed: Math.round(stats.speed),
		toughness: Math.round(stats.toughness)
	};
}

export function publicFighter(f: Fighter): Fighter {
	return { ...f, stats: roundStats(f.stats), ...(f.prevStats ? { prevStats: roundStats(f.prevStats) } : {}) };
}
