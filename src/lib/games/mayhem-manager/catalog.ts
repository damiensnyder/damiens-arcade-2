// Display data for equipment and fighter abilities, shared by client and server.
// docs/mm-catalog-plain.txt is the source of truth: names, slots, prices and text here must match
// it exactly (`npm run check:mm-catalog` compares them). Battle behavior lives in
// src/server/games/mayhem-manager/sim/behaviors.ts, keyed the same way.
//
// Stat changes in descriptions are in stars; one star is 2 stat points. Charging equipment has a
// 1s cooldown unless its description says otherwise.

import type { Slot } from './types.js';

export interface EquipmentInfo {
	key: string;
	name: string;
	slots: Slot[];
	price: number;
	description: string;
	flavor: string;
	/** Whether fighters can attune to it: only items whose description says what attuning does. */
	attunable: boolean;
}

export interface AbilityInfo {
	key: string;
	/** For referring to it in code and the catalog txt. Players only see the description. */
	name: string;
	/** What the ability adds to a fighter's price (see fighterPrice in rules.ts). */
	price: number;
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
	return { key, name, slots, price, description, flavor, attunable: description.includes('[attuned:') };
}

/** Equipment without its own art yet, and whose images it borrows meanwhile. */
const PLACEHOLDER_ART: Record<string, string> = { moneySword: 'diamondSword' };

/** Image file names match the catalog key in kebab case. */
export function equipmentImg(key: string): string {
	return `/mm/equipment/${kebab(PLACEHOLDER_ART[key] ?? key)}.png`;
}

export function equipmentIcon(key: string): string {
	return `/mm/icons/${kebab(PLACEHOLDER_ART[key] ?? key)}.png`;
}

function kebab(key: string): string {
	return key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

const EQUIPMENT_LIST: EquipmentInfo[] = [
	// melee weapons
	equipment('battleAxe', 'Battle Axe', ['hand', 'hand'], 40, 'Melee. Deals 70 [attuned: 90] damage. Cooldown 4s.', "learn this secret trick lumberjacks DON'T want you to know"),
	equipment('diamondSword', 'Diamond Sword', ['hand'], 30, 'Melee. Deals 50 [attuned: 65] damage. Cooldown 3s.', 'Durability: 858/1561; Bane of Arthropods IV'),
	equipment('rollerBlades', 'Roller Blades', ['feet'], 23, 'Melee. Deals 30 damage. Cooldown 4s. +2 [attuned: +3] speed.'),
	equipment('theRatioInator', 'The Ratio-Inator', ['hand'], 20, "Melee. All hits reduce the target's HP by 30% [attuned: 40%]. Cooldown 2.5s."),
	equipment('headbuttersDelight', "Headbutter's Delight", ['head'], 16, 'Melee. Deals 20 [attuned: 25] damage. Damage scales with toughness instead of strength. Cooldown 3s.'),
	equipment('shiv', 'Shiv', ['hand'], 14, 'Melee. Deals 16 damage. Cooldown 2s [attuned: 1.5s].'),
	equipment('moneySword', 'The Money Sword', ['hand'], 12, 'Deals 10 damage for every $8 [attuned: $6] your team has. Cooldown 3s.'),
	equipment('steelToedBoots', 'Steel-Toed Boots', ['feet'], 10, 'Melee. Deals 20 [attuned: 25] damage. Cooldown 3.5s. +1 toughness.'),
	// ranged weapons
	equipment('wandOfFlames', 'Wand of the Great Pyromaniac', ['hand'], 40, 'Ranged. Deals 50 [attuned: 60] damage to all enemies and applies 5s of burning. Requires 3 charges.', 'the Great Pyromaniac might have been a little *too* great'),
	equipment('laserBlaster', 'Laser Blaster', ['hand'], 36, 'Ranged. Deals 40 [attuned: 50] damage. Cooldown 2s.'),
	equipment('bow', 'Bow', ['hand', 'hand'], 12, 'Ranged. Deals 50 [attuned: 65] damage. Cooldown 5s.'),
	equipment('snowmanHead', 'Snowman Head', ['head'], 9, 'Ranged. Deals 12 damage. Cooldown 1.5s. On hit dealt: Freeze the target for 1s [attuned: 2s].'),
	// single-use
	equipment('flamingoFloaty', 'Flamingo Floaty', ['legs'], 16, 'On hit taken: Prevent all damage. Remove Flamingo Floaty.', '*pop!*'),
	equipment('cornDog', 'Corn Dog', ['hand'], 12, 'Single-use. Heals 40 HP.', 'surprisingly nutritious'),
	// other actions
	equipment('flowerOfPower', 'Flower of Power', ['hand'], 11, 'Heal a teammate for 20 [attuned: 25] HP. Requires 1 charge.'),
	// stat changes
	equipment('fullSuitOfArmor', 'Full Suit of Armor', ['head', 'torso', 'legs', 'feet'], 24, '+6 [attuned: +7.5] toughness, -1.5 speed.', 'clank. clank. clank. clank'),
	equipment('sportsJersey', 'Sports Jersey', ['torso'], 22, '+0.5 to all stats for each other teammate still standing.', 'teamwork? i sure hope it does!'),
	equipment('devilHorns', 'Devil Horns', ['head'], 20, '-2 toughness. +3 [attuned: +4] to all other stats.'),
	equipment('vikingHelmet', 'Viking Helmet', ['head'], 11, '+1 toughness. +1 strength for every 25 [attuned: 20] HP missing.'),
	equipment('noveltyArrowHat', 'Novelty Arrow Hat', ['head'], 6, '+1.5 accuracy'),
	equipment('speedo', 'Speedo', ['legs'], 4, '+1 speed', "it's just so aerodynamic"),
	// passive effects
	equipment('halo', 'Halo', ['head'], 26, "When a teammate is KO'd, revive them at 50% HP. Remove Halo."),
	equipment('shield', 'Shield', ['hand'], 25, '50% chance to block hits when facing the attacker.'),
	equipment('zapHelmet', 'Zap Helmet', ['head'], 25, 'Every 3s, deals 15 [attuned: 20] damage to the nearest enemy fighter.'),
	equipment('frillySkirt', 'Frilly Skirt', ['legs'], 24, 'Makes opponents much less likely to target the wearer.', "you wouldn't hit someone in a frilly little skirt, would you?"),
	equipment('knifeShoes', 'Knife Shoes', ['feet'], 18, 'Whenever an opponent enters melee range, deal 5 [attuned: 6] damage to them.'),
	equipment('fairyHat', 'Fairy Hat', ['head'], 17, 'On hit dealt: Freeze the target for 2s [attuned: 3s].'),
	equipment('jellyhat', 'Jellyhat', ['head'], 16, 'On melee hit taken: Deal 10 [attuned: 15] damage to the attacker.'),
	equipment('chainsawHeadband', 'Chainsaw Headband', ['head'], 15, 'Every second, deal 4 [attuned: 5] damage to all enemies in melee range.'),
	equipment('shrapnel', 'Shrapnel', ['head'], 13, "When KO'd: Deal 40 damage to ALL fighters within 10m."),
	equipment('rhinocerosBeetleHorn', 'Rhinoceros Beetle Horn', ['head'], 10, 'On hit dealt: Gain +1 [attuned: +1.5] strength.', 'the rhinoceros beetle is the strongest creature on earth'),
	equipment('eyepatch', 'Eyepatch', ['head'], 9, 'On KO: Loot $2 [attuned: $4] from the opponent.'),
	equipment('censoredBar', 'Censored Bar', ['legs'], 4, 'Wearer is immune to negative status effects.')
];

export const EQUIPMENT: Record<string, EquipmentInfo> = Object.fromEntries(EQUIPMENT_LIST.map((e) => [e.key, e]));
export const EQUIPMENT_KEYS: string[] = EQUIPMENT_LIST.map((e) => e.key);

const ability = (key: string, name: string, price: number, description: string, flavor = ''): AbilityInfo => ({
	key,
	name,
	price,
	description,
	flavor
});

const ABILITY_LIST: AbilityInfo[] = [
	ability('noAbilities', '', 0, ''),
	ability('pepTalk', 'Pep Talk', 21, 'Teammates start each fight hyped for 5s.', 'delivers quite the pep talk'),
	ability('powerfulFists', 'Powerful Fists', 17, 'Fists deal double damage.'),
	ability('extraDamageOnHit', 'Oomph', 16, 'On hit dealt: Target loses 5 extra HP.', 'just has a little more "oomph"'),
	ability('gainStrengthOnHitTaken', 'Enrage', 13, 'On hit taken: Gain 1 strength.'),
	ability('moneyOnKo', 'Brand Ambassador', 10, 'On KO: Team gains $3.', 'it\'s called being a "brand ambassador"'),
	ability('lastStand', 'Lone Wolf', 8, '+3 to all stats when all other teammates are downed.'),
	ability('shorterCooldowns', 'Shorter Cooldowns', 7, 'All cooldowns are 0.2s shorter.'),
	ability('lifesteal', 'Lifesteal', 7, 'On hit: Heal 20% of damage dealt.'),
	ability('taunt', 'Trash Talker', 6, 'All enemies in melee range are taunted.', '"is that the best you\'ve got?"'),
	ability('mentor', 'Mentor', 6, 'After each training camp, gives a younger teammate +0.5 stars to a random stat.'),
	ability('randomAbility', 'Random Ability', 5, 'Starts each fight with a random ability.'),
	ability('bully', 'Opportunist', 1, 'Deals double damage to targets with a negative status effect.'),
	ability('strongerSummons', 'Stronger Summons', 1, "This fighter's summons spawn with +50% HP."),
	ability('klutz', 'Klutz', -2, 'When hit: 10% chance to drop a handheld equipment.', 'bit of a klutz. teehee!'),
	ability('immuneToNegativeEffects', 'Status Immunity', 1, 'Immune to negative status effects.'),
	ability('cantAttune', 'No Attunement', -3, "Can't attune to equipment.", 'was held back a couple grades as well'),
	ability('refusesUnattuned', 'Picky', -10, 'Refuses to use unattuned equipment.'),
	ability('scaredWhenHit', 'Coward', -13, 'When hit: Becomes scared for 3s.', "don't act like you're any better")
];

export const ABILITIES: Record<string, AbilityInfo> = Object.fromEntries(ABILITY_LIST.map((a) => [a.key, a]));
export const ABILITY_KEYS: string[] = ABILITY_LIST.map((a) => a.key);

export function slotsToString(slots: Slot[]): string {
	const joined = slots.join(', ');
	if (joined === '') return 'none';
	if (joined === 'hand, hand') return 'two-handed';
	return joined;
}
