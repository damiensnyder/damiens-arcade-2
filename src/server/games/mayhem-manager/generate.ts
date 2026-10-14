import { ABILITY_KEYS, EQUIPMENT, EQUIPMENT_KEYS } from '../../../lib/games/mayhem-manager/catalog.js';
import { HAIR_COLORS, SKIN_TONES } from '../../../lib/games/mayhem-manager/appearance.js';
import type { Fighter, Look, ShopItem, Stats } from '../../../lib/games/mayhem-manager/types.js';
import names from './data/names.json';
import { developFighter, trainRandomly } from './development.js';
import type { Rng } from './rng.js';

/** Rookies start at this age, with most stats low and a few high. */
export const ROOKIE_AGE = 19;
/** A rookie's stats are random()³ × this, so most are low and a few are high. */
const ROOKIE_STAT_SCALE = 7;
/** Chance a fighter spent a year's training camp on a stat, for fighters who skip ahead in age. */
const PAST_TRAINING_CHANCE = 0.5;
const SHOP_SIZE = 6;

/**
 * A new fighter, as they look after a development update at their age. Rookies are 19; older ones
 * (for the league's first free agents) have played out the years in between.
 */
export function generateFighter(rng: Rng, id: number, age = ROOKIE_AGE): Fighter {
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
	const stat = () => rng.real() ** 3 * ROOKIE_STAT_SCALE;
	const fighter: Fighter = {
		id,
		name: rng.pick(firstNames) + ' ' + rng.pick(names.lastNames),
		age: ROOKIE_AGE,
		stats: { strength: stat(), accuracy: stat(), energy: stat(), speed: stat(), toughness: stat() },
		look,
		ability: rng.real() < 0.4 ? 'noAbilities' : rng.pick(ABILITY_KEYS.filter((k) => k !== 'noAbilities')),
		attunements: [],
		contractYears: 0
	};
	developFighter(rng, fighter);
	while (fighter.age < age) {
		if (rng.real() < PAST_TRAINING_CHANCE) trainRandomly(rng, fighter);
		fighter.age++;
		developFighter(rng, fighter);
	}
	return fighter;
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
