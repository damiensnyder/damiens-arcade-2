import type { Kit } from './appearance.js';

export interface TeamIdentity {
	first: string;
	last: string;
	name: string;
	abbr: string;
	/** Logo fill. */
	color1: string;
	/** Logo border and letters. */
	color2: string;
	/** Fighter uniform filters, solved to roughly match color1 (shirt) and color2 (shorts). */
	kit: Kit;
}

function team(
	first: string,
	last: string,
	abbr: string,
	color1: string,
	color2: string,
	shirt: [number, number, number],
	shorts: [number, number, number]
): TeamIdentity {
	return { first, last, name: `${first} ${last}`, abbr, color1, color2, kit: { shirt, shorts } };
}

/** The 16 teams a league can use. A team's ID is its index here. */
export const TEAMS: TeamIdentity[] = [
	team('Humongous', 'Melonheads', 'HM', '#2f7a3a', '#f08a8a', [153, 1.4, 0.5], [0, 2.2, 0.6]),
	team('Fabulous', 'Bashers', 'FB', '#a8457f', '#eeb', [282, 4.85, 0.3], [60, 5.4, 0.2]),
	team('Marvelous', 'Mastodons', 'MM', '#7a5a3c', '#e6d3b0', [60, 1.75, 0.4], [54, 5.5, 0.2]),
	team('Eccentric', 'Parakeets', 'EP', '#1f7f74', '#ec6', [177, 1.45, 0.7], [66, 4.05, 0.5]),
	team('Smashin’', 'Marigolds', 'SM', '#c77a14', '#421', [60, 2.35, 0.8], [51, 0.8, 0.6]),
	team('Swarthy', 'Whirlwinds', 'SW', '#3d5a99', '#ddd', [243, 2.25, 0.4], [78, 5.35, 0]),
	team('Rugged', 'Yaks', 'RY', '#5b3d2e', '#e99', [48, 1.2, 0.3], [0, 3, 0.5]),
	team('Rootin’ Tootin’', 'Specters', 'RT', '#574a7d', '#eeb', [258, 1.95, 0.3], [60, 5.4, 0.2]),
	team('Sprightly', 'Monocles', 'SP', '#97782a', '#311', [66, 2.2, 0.7], [0, 0.55, 0.3]),
	team('Ludicrous', 'Manatees', 'LM', '#4a7896', '#e8c', [198, 1.65, 0.3], [258, 5.2, 0.6]),
	team('Courageous', 'Bakers', 'CB', '#a8703f', '#fff3d6', [57, 2.15, 0.5], [57, 5.85, 0.1]),
	team('Worrisome', 'Wallabies', 'WW', '#80523f', '#ec6', [45, 1.65, 0.3], [66, 4.05, 0.5]),
	team('Flippin’', 'Pickles', 'FP', '#55801f', '#eeb', [78, 2, 0.7], [60, 5.4, 0.2]),
	team('Nefarious', 'Pandas', 'NP', '#1d1d1d', '#ddd', [9, 0.6, 0], [78, 5.35, 0]),
	team('Lovely', 'Wombats', 'LW', '#8f4a5b', '#eeb', [21, 4.4, 0.2], [60, 5.4, 0.2]),
	team('Unusual', 'Sprites', 'US', '#6a32a0', '#9ee', [267, 1.7, 0.5], [165, 5.9, 0.3])
];

export function teamShortName(id: number): string {
	return TEAMS[id]?.last ?? '???';
}
