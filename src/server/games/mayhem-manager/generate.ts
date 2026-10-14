import { ABILITY_KEYS, EQUIPMENT, EQUIPMENT_KEYS } from '../../../lib/games/mayhem-manager/catalog.js';
import { HAIR_COLORS, SKIN_TONES } from '../../../lib/games/mayhem-manager/appearance.js';
import type { Fighter, Look, ShopItem } from '../../../lib/games/mayhem-manager/types.js';
import names from './data/names.json';
import { developFighter, trainRandomly } from './development.js';
import type { Rng } from './rng.js';

const SHOP_SIZE = 6;
/** Rookies start at this age. */
export const ROOKIE_AGE = 19;
/** A rookie's stats are random()³ × this, so most are low and a few are high. */
const ROOKIE_STAT_SCALE = 7;
/** Chance a stand-in training camp (see earlierClasses) trains a stat. */
const PAST_TRAINING_CHANCE = 0.5;

/** A rookie (or a fighter of the given age with rookie-like stats), as they look after a development update. */
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
		age,
		stats: { strength: stat(), accuracy: stat(), energy: stat(), speed: stat(), toughness: stat() },
		look,
		ability: rng.real() < 0.4 ? 'noAbilities' : rng.pick(ABILITY_KEYS.filter((k) => k !== 'noAbilities')),
		attunements: [],
		contractYears: 0
	};
	developFighter(rng, fighter);
	return fighter;
}

/**
 * Fighters for a new league besides this season's rookies: earlier rookie classes, each put
 * through the training camps and development they'd have had, so there's a spread of ages.
 */
export function earlierClasses(rng: Rng, nextId: () => number, classSize: number, classes: number): Fighter[] {
	const pool: Fighter[] = [];
	for (let year = 0; year < classes; year++) {
		for (let i = 0; i < classSize; i++) pool.push(generateFighter(rng, nextId()));
		for (const f of pool) {
			// a stand-in for training camp, then the next year's development
			if (rng.real() < PAST_TRAINING_CHANCE) trainRandomly(rng, f);
			f.age++;
			developFighter(rng, f);
		}
	}
	return pool;
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
