// Display data for equipment and fighter abilities, shared by client and server.
// docs/mm-catalog-plain.txt is the source of truth: names, slots, prices and text here must match
// it exactly (`npm run check:mm-catalog` compares them). Battle behavior lives in
// src/server/games/mayhem-manager/sim/behaviors.ts, keyed the same way.
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
	equipment('devilHorns', 'Devil Horns', ['head'], 20, '-2 toughness. +3 [attuned: +4] to all other stats.'),
	equipment('diamondSword', 'Diamond Sword', ['hand'], 30, 'Melee. Deals 50 [attuned: 65] damage. Cooldown 3s.', 'Durability: 858/1561; Bane of Arthropods IV'),
	equipment('fairyHat', 'Fairy Hat', ['head'], 17, 'On hit dealt: Freeze the target for 2s [attuned: 3s].'),
	equipment('flamingoFloaty', 'Flamingo Floaty', ['legs'], 5, 'On hit taken: Prevent all damage. Remove Flamingo Floaty.', '*pop!*'),
	equipment('frillySkirt', 'Frilly Skirt', ['legs'], 24, 'Makes opponents much less likely to target the wearer.', "you wouldn't hit someone in a frilly little skirt, would you?"),
	equipment('fullSuitOfArmor', 'Full Suit of Armor', ['head', 'torso', 'legs', 'feet'], 15, '+6 [attuned: +7.5] toughness, -1.5 speed.', 'clank. clank. clank. clank'),
	equipment('jellyhat', 'Jellyhat', ['head'], 13, 'On melee hit taken: The attacker loses 10 [attuned: 15] HP.'),
	equipment('laserBlaster', 'Laser Blaster', ['hand'], 25, 'Ranged. Deals 40 [attuned: 50] damage. Cooldown 2s.'),
	equipment('rhinocerosBeetleHorn', 'Rhinoceros Beetle Horn', ['head'], 10, 'On hit dealt: Gain +1 [attuned: +1.5] strength.', 'the rhinoceros beetle is the strongest creature on earth'),
	equipment('rollerBlades', 'Roller Blades', ['feet'], 23, 'Melee. Deals 30 damage. Cooldown 4s. +2 [attuned: +3] speed.'),
	equipment('shield', 'Shield', ['hand'], 25, '50% chance to block hits when facing the attacker.'),
	equipment('shiv', 'Shiv', ['hand'], 14, 'Melee. Deals 16 damage. Cooldown 2s [attuned: 1.5s].'),
	equipment('snowmanHead', 'Snowman Head', ['head'], 22, 'Ranged. Deals 10 damage. Cooldown 1.5s. On hit dealt: Freeze the target for 1s [attuned: 2s].'),
	equipment('sportsJersey', 'Sports Jersey', ['torso'], 16, '+0.5 to all stats for each other teammate still standing [attuned: including oneself].', 'teamwork? i sure hope it does!'),
	equipment('vikingHelmet', 'Viking Helmet', ['head'], 11, '+1 toughness. +1 strength for every 25 [attuned: 20] HP missing.'),
	equipment('wandOfFlames', 'Wand of the Great Pyromaniac', ['hand'], 40, 'Ranged. Deals 40 [attuned: 50] damage to all enemies and applies 4s of burning. Requires 3 charges. Cooldown 1s.', 'the Great Pyromaniac might have been a little *too* great'),
	equipment('zapHelmet', 'Zap Helmet', ['head'], 25, 'Every 3s, deals 15 [attuned: 20] damage to the nearest enemy fighter.'),
	equipment('headbuttersDelight', 'Headbutter’s Delight', ['head'], 18, 'Melee. Deals 20 [attuned: 25] damage. Damage scales with toughness instead of strength.'),
	equipment('chainsawHeadband', 'Chainsaw Headband', ['head'], 22, 'Every second, deal 4 [attuned: 5] damage to all enemies in melee range.'),
	equipment('moneySword', 'The Money Sword', ['hand'], 12, 'Deals 10 damage for every $8 [attuned: $6] your team has.'),
	equipment('halo', 'Halo', ['head'], 23, "When a teammate is KO'd, revive them at 40% [attuned: 50%] HP. Remove Halo."),
	equipment('eyepatch', 'Eyepatch', ['head'], 21, 'On KO: Loot $2 [attuned: $3] from the opponent.'),
	equipment('shrapnel', 'Shrapnel', ['head'], 19, "When KO'd: Deal 30 [attuned: 40] damage to ALL fighters within 10m."),
	equipment('knifeShoes', 'Knife Shoes', ['feet'], 8, 'Whenever an opponent enters melee range, deal 5 [attuned: 6] damage to them.'),
	equipment('censoredBar', 'Censored Bar', ['legs'], 7, 'Wearer is immune to status effects [attuned: only negative status effects].'),
	equipment('theRatioInator', 'The Ratio-Inator', ['hand'], 28, "Melee. All hits reduce the target's HP by 30% [attuned: 40%]. Cooldown 2.5s."),
	equipment('speedo', 'Speedo', ['legs'], 4, '+1 [attuned: 1.5] speed', "it's just so aerodynamic"),
	equipment('steelToedBoots', 'Steel-Toed Boots', ['feet'], 10, 'Melee. Deals 20 damage. Has triple [attuned: quintuple] knockback. Cooldown 4s.'),
	equipment('noveltyArrowHat', 'Novelty Arrow Hat', ['head'], 6, '+1 [attuned: 1.5] accuracy'),
	equipment('flowerOfPower', 'Flower of Power', ['hand'], 11, 'Heal a teammate for 15 [attuned: 20] HP. Requires 1 charge. Cooldown 1s.')
];

export const EQUIPMENT: Record<string, EquipmentInfo> = Object.fromEntries(EQUIPMENT_LIST.map((e) => [e.key, e]));
export const EQUIPMENT_KEYS: string[] = EQUIPMENT_LIST.map((e) => e.key);

const ability = (key: string, description: string, flavor = ''): AbilityInfo => ({ key, description, flavor });

const ABILITY_LIST: AbilityInfo[] = [
	ability('noAbilities', ''),
	ability('extraDamageOnHit', 'On hit dealt: Target loses 5 extra HP.', 'just has a little more "oomph"'),
	ability('gainStrengthOnHitTaken', 'On hit taken: Gain 1 strength.'),
	ability('powerfulFists', 'Fists deal double damage.'),
	ability('shorterCooldowns', 'All cooldowns are 0.2s shorter.'),
	ability('moneyOnKo', 'On KO: Team gains $3.', 'it\'s called being a "brand ambassador"'),
	ability('lifesteal', 'On hit: Heal 20% of damage dealt.'),
	ability('pepTalk', 'Teammates start each fight hyped for 5s.', 'delivers quite the pep talk'),
	ability('taunt', 'All enemies in melee range are taunted.', '"is that the best you\'ve got?"'),
	ability('scaredWhenHit', 'When hit: Becomes scared for 3s.', "don't act like you're any better"),
	ability('mentor', 'After each training camp, gives a younger teammate +0.5 stars to a random stat.'),
	ability('bully', 'Deals double damage to targets with a negative status effect.'),
	ability('strongerSummons', "This fighter's summons spawn with +50% HP."),
	ability('lastStand', '+3 to all stats when all other teammates are downed.'),
	ability('randomAbility', 'Starts each fight with a random ability.'),
	ability('klutz', 'When hit: 10% chance to drop a handheld equipment.', 'bit of a klutz. teehee!'),
	ability('refusesUnattuned', 'Refuses to use unattuned equipment.'),
	ability('immuneToNegativeEffects', 'Immune to negative status effects.'),
	ability('cantAttune', "Can't attune to equipment.", 'was held back a couple grades as well')
];

export const ABILITIES: Record<string, AbilityInfo> = Object.fromEntries(ABILITY_LIST.map((a) => [a.key, a]));
export const ABILITY_KEYS: string[] = ABILITY_LIST.map((a) => a.key);

export function slotsToString(slots: Slot[]): string {
	const joined = slots.join(', ');
	if (joined === '') return 'none';
	if (joined === 'hand, hand') return 'two-handed';
	return joined;
}
