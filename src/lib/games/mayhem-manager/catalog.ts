// Display data for equipment and fighter abilities, shared by client and server.
// Battle behavior lives in src/server/games/mayhem-manager/sim/abilities.ts, keyed the same way.
//
// Stat changes in descriptions are in stars; one star is 2 stat points.

import type { Slot } from './types.js';

export interface EquipmentInfo {
	key: string;
	name: string;
	slots: Slot[];
	price: number;
	description: string;
	flavor: string;
}

export interface AbilityInfo {
	key: string;
	description: string;
	flavor: string;
}

function equipment(
	key: string,
	name: string,
	slots: Slot[],
	price: number,
	description: string,
	flavor = ''
): EquipmentInfo {
	return { key, name, slots, price, description, flavor };
}

/** Image file names match the catalog key in kebab case. */
export function equipmentImg(key: string): string {
	return `/mm/equipment/${kebab(key)}.png`;
}

export function equipmentIcon(key: string): string {
	return `/mm/icons/${kebab(key)}.png`;
}

function kebab(key: string): string {
	return key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

const EQUIPMENT_LIST: EquipmentInfo[] = [
	equipment('battleAxe', 'Battle Axe', ['hand', 'hand'], 32, 'Melee. Deals 70 [attuned: 90] damage. Cooldown 4s.', "learn this secret trick lumberjacks DON'T want you to know"),
	equipment('bow', 'Bow', ['hand', 'hand'], 12, 'Ranged. Deals 50 [attuned: 65] damage. Cooldown 5s.'),
	equipment('cornDog', 'Corn Dog', ['hand'], 12, 'Single-use. Heals 40 [attuned: 60] HP.', 'surprisingly nutritious'),
	equipment('devilHorns', 'Devil Horns', ['head'], 20, '-2 toughness, +3 [attuned: +4] to all other stats.'),
	equipment('diamondSword', 'Diamond Sword', ['hand'], 30, 'Melee. Deals 50 [attuned: 65] damage. Cooldown 3s.', 'Durability: 858/1561; Bane of Arthropods IV'),
	equipment('fairyHat', 'Fairy Hat', ['head'], 17, 'On hit dealt: Freeze the target for 2s [attuned: 3s].'),
	equipment('flamingoFloaty', 'Flamingo Floaty', ['legs'], 5, 'On hit taken: Prevent all damage. Remove Flamingo Floaty.', '*pop!*'),
	equipment('frillySkirt', 'Frilly Skirt', ['legs'], 24, 'Makes opponents much less likely to target the wearer.', "you wouldn't hit someone in a frilly little skirt, would you?"),
	equipment('fullSuitOfArmor', 'Full Suit of Armor', ['head', 'legs', 'feet'], 15, '+6 [attuned: +7.5] toughness, -1.5 speed.', 'clank. clank. clank. clank'),
	equipment('jellyhat', 'Jellyhat', ['head'], 18, 'On hit taken: The attacker loses 10 HP.'),
	equipment('laserBlaster', 'Laser Blaster', ['hand'], 25, 'Ranged. Deals 40 [attuned: 50] damage. Cooldown 2s.'),
	equipment('rhinocerosBeetleHorn', 'Rhinoceros Beetle Horn', ['head'], 10, 'On hit dealt: Gain +1 [attuned: +1.5] strength.', 'the rhinoceros beetle is the strongest creature on earth'),
	equipment('rollerBlades', 'Roller Blades', ['feet'], 23, 'Melee. Deals 30 damage. Cooldown 4s. +2 [attuned: +3] speed.'),
	equipment('shield', 'Shield', ['hand'], 15, '+3 [attuned: +4] toughness.'),
	equipment('shiv', 'Shiv', ['hand'], 20, 'Melee. Deals 20 damage. Cooldown 2s [attuned: 1.5s].'),
	equipment('snowmanHead', 'Snowman Head', ['head'], 22, 'Ranged. Deals 10 damage. Cooldown 1s. On hit dealt: Freeze the target for 1s [attuned: 2s].', "the snowman's revenge"),
	equipment('sportsJersey', 'Sports Jersey', ['torso'], 9, '+2 [attuned: +3] to all stats for each other teammate wearing a Sports Jersey.', 'teamwork? i sure hope it does!'),
	equipment('vikingHelmet', 'Viking Helmet', ['head'], 11, '+1.5 [attuned: +2] strength and toughness.'),
	equipment('wandOfFlames', 'Wand of the Great Pyromaniac', ['hand'], 40, 'Ranged. Deals 40 [attuned: 50] damage to all enemies. Requires 2 charges. Cooldown 1s.', 'the Great Pyromaniac might have been a little *too* great'),
	equipment('zapHelmet', 'Zap Helmet', ['head'], 25, 'Every 3s, deals 15 [attuned: 20] damage to the nearest enemy fighter.')
];

export const EQUIPMENT: Record<string, EquipmentInfo> = Object.fromEntries(EQUIPMENT_LIST.map((e) => [e.key, e]));
export const EQUIPMENT_KEYS: string[] = EQUIPMENT_LIST.map((e) => e.key);

const ABILITY_LIST: AbilityInfo[] = [
	{ key: 'noAbilities', description: '', flavor: '' },
	{ key: 'extraDamageOnHit', description: 'On hit dealt: Target loses 5 extra HP.', flavor: 'just has a little more "oomph"' },
	{ key: 'gainStrengthOnHitTaken', description: 'On hit taken: Gain 1 strength.', flavor: '' },
	{ key: 'powerfulFists', description: 'Fists deal double damage.', flavor: '' },
	{ key: 'shorterCooldowns', description: 'All cooldowns are 0.2s shorter.', flavor: '' }
];

export const ABILITIES: Record<string, AbilityInfo> = Object.fromEntries(ABILITY_LIST.map((a) => [a.key, a]));
export const ABILITY_KEYS: string[] = ABILITY_LIST.map((a) => a.key);

export function slotsToString(slots: Slot[]): string {
	const joined = slots.join(', ');
	if (joined === '') return 'none';
	if (joined === 'hand, hand') return 'two-handed';
	return joined;
}
