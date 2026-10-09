import { ABILITY_KEYS, EQUIPMENT, EQUIPMENT_KEYS } from '../../../lib/games/mayhem-manager/catalog.js';
import { HAIR_COLORS, SKIN_TONES } from '../../../lib/games/mayhem-manager/appearance.js';
import type { Fighter, Look, ShopItem, Stats } from '../../../lib/games/mayhem-manager/types.js';
import names from './data/names.json';
import type { Rng } from './rng.js';

// Weighted toward low stats; most rookies are good at one or two things.
const INITIAL_STAT_DISTRIBUTION = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 6, 7, 8];
const SHOP_SIZE = 6;

export function generateFighter(rng: Rng, id: number, minAge: number, maxAge: number): Fighter {
	const gender = rng.pick(['M', 'F', 'A'] as const);
	const firstNames =
		gender === 'M' || (gender === 'A' && rng.real() < 0.5) ? names.firstNamesM : names.firstNamesF;
	const look: Look = {
		gender,
		hair: rng.int(1, 4),
		face: rng.int(1, 2),
		shirt: rng.int(1, 2),
		skin: rng.int(0, SKIN_TONES.length - 1),
		hairColor: rng.int(0, HAIR_COLORS.length - 1)
	};
	const stats: Stats = {
		strength: rng.pick(INITIAL_STAT_DISTRIBUTION),
		accuracy: rng.pick(INITIAL_STAT_DISTRIBUTION),
		energy: rng.pick(INITIAL_STAT_DISTRIBUTION),
		speed: rng.pick(INITIAL_STAT_DISTRIBUTION),
		toughness: rng.pick(INITIAL_STAT_DISTRIBUTION)
	};
	// Older rookies have had time to develop a bit.
	const extraYears = rng.int(minAge, maxAge) - minAge;
	for (let i = 0; i < extraYears; i++) {
		const stat = rng.pick(Object.keys(stats) as (keyof Stats)[]);
		stats[stat] = Math.min(stats[stat] + 1, 10);
	}
	return {
		id,
		name: rng.pick(firstNames) + ' ' + rng.pick(names.lastNames),
		age: minAge + extraYears,
		stats,
		look,
		ability: rng.real() < 0.4 ? 'noAbilities' : rng.pick(ABILITY_KEYS.filter((k) => k !== 'noAbilities')),
		attunements: [],
		contractYears: 0
	};
}

/** The stand-in for a team that didn't sign anyone. */
export function concernedOwner(id: number): Fighter {
	return {
		id,
		name: 'Concerned Owner',
		age: 58,
		stats: { strength: 0, accuracy: 0, energy: 0, speed: 0, toughness: 0 },
		look: { gender: 'M', hair: 3, face: 2, shirt: 1, skin: 6, hairColor: 9 },
		ability: 'noAbilities',
		attunements: [],
		contractYears: 1,
		isOwner: true
	};
}

export function generateShop(rng: Rng, nextId: () => number): ShopItem[] {
	const keys = rng.shuffle(EQUIPMENT_KEYS.slice()).slice(0, SHOP_SIZE);
	keys.sort((a, b) => EQUIPMENT[a].name.localeCompare(EQUIPMENT[b].name));
	return keys.map((key) => ({ id: nextId(), key, price: EQUIPMENT[key].price, bought: false }));
}
