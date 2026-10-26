// Display data for equipment and fighter abilities, shared by client and server.
// docs/mm-catalog-plain.txt is the source of truth: names, slots, prices and text here must match
// it exactly (`npm run check:mm-catalog` compares them). Battle behavior lives in
// src/server/games/mayhem-manager/sim/behaviors.ts, keyed the same way.
//
// Stat changes in descriptions are in stars; one star is 2 stat points. Charging equipment has a
// 1s cooldown unless its description says otherwise, as do all other actions without a cooldown.

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

/** Equipment without its own art yet, and whose images it borrows meanwhile (from items worn in the same slots). */
const PLACEHOLDER_ART: Record<string, string> = {
	castIronPan: 'battleAxe',
	rapier: 'diamondSword',
	taser: 'shiv',
	baseballBat: 'battleAxe',
	moneySword: 'diamondSword',
	torch: 'wandOfFlames',
	lasestBlaster: 'laserBlaster',
	sniperRifle: 'bow',
	tranquilizerGun: 'laserBlaster',
	rayGun: 'laserBlaster',
	flareGun: 'laserBlaster',
	invisibilityPotion: 'cornDog',
	flashbang: 'cornDog',
	leafBlower: 'battleAxe',
	cardboardCutout: 'foamFinger',
	bulletproofVest: 'shield',
	lightningRod: 'zapHelmet',
	bandolier: 'shirtOfManyBelts',
	batteryPack: 'tShirtOfTheFuture',
	sponsorPatch: 'sportsJersey',
	armbandOfSolidarity: 'foamFinger',
	antiStaticWristband: 'foamFinger'
};

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
	equipment('battleAxe', 'Battle Axe', ['hand', 'hand'], 42, 'Melee. Deals 70 [attuned: 90] damage. Cooldown 4.5s.', "learn this secret trick lumberjacks DON'T want you to know"),
	equipment('diamondSword', 'Diamond Sword', ['hand'], 40, 'Melee. Deals 50 [attuned: 65] damage. Cooldown 3s.', 'Durability: 858/1561; Bane of Arthropods IV'),
	equipment('castIronPan', 'Cast Iron Pan', ['hand', 'hand'], 20, "Melee. Deals 20 damage. On hit: Permanently increase this weapon's damage by 1. Cooldown 5s.", 'make sure to season after use'),
	equipment('rapier', 'Rapier', ['hand'], 24, 'Melee. Deals 40 [attuned: 50] damage. Damage scales with accuracy instead of strength. Cooldown 3s.'),
	equipment('rollerBlades', 'Roller Blades', ['feet'], 23, 'Melee. Deals 25 damage. Cooldown 4s. +2 [attuned: +3] speed.'),
	equipment('taser', 'Taser', ['hand'], 22, 'Melee. Deals 25 damage. Requires 1 charge. On hit: Target is stunned for 2s [attuned: 3s].'),
	equipment('baseballBat', 'Baseball Bat', ['hand', 'hand'], 21, 'Melee. Deals 30 [attuned: 35] damage. Cooldown 3.5s. On hit: Knock the target 20m away.', 'batter up!'),
	equipment('theRatioInator', 'The Ratio-Inator', ['hand'], 18, "Melee. All hits reduce the target's HP by 1/3 [attuned: 1/2]. Cooldown 2.5s.", 'hold this.'),
	equipment('headbuttersDelight', "Headbutter's Delight", ['head'], 10, 'Melee. Deals 20 [attuned: 25] damage. Damage scales with toughness instead of strength. Cooldown 3s.'),
	equipment('clawsForAlarm', 'Claws for Alarm', ['hand'], 13, 'Melee. Deals 12 damage. Cooldown 2s. On hit: Target is scared for 1s [attuned: 2s].'),
	equipment('shiv', 'Shiv', ['hand'], 14, 'Melee. Deals 16 damage. Cooldown 2s [attuned: 1.5s].'),
	equipment('torch', 'Torch', ['hand'], 15, 'Melee. Deals 12 [attuned: 16] damage. Cooldown 2.5s. On hit: Set the target on fire.'),
	equipment('moneySword', 'The Money Sword', ['hand'], 12, 'Melee. Deals 10 damage for every $8 [attuned: $6] your team has. Cooldown 3s.'),
	equipment('steelToedBoots', 'Steel-Toed Boots', ['feet'], 15, 'Melee. Deals 20 [attuned: 25] damage. Cooldown 3.5s. +1 toughness.'),
	// ranged weapons
	equipment('lasestBlaster', 'Lasest Blaster', ['hand'], 60, 'Ranged. Deals 70 [attuned: 80] damage. Cooldown 2s.'),
	equipment('wandOfFlames', 'Wand of the Great Pyromaniac', ['hand'], 31, 'Ranged. Deals 50 [attuned: 60] damage to all enemies and sets them on fire. Requires 3 charges.', 'the Great Pyromaniac might have been a little *too* great'),
	equipment('laserBlaster', 'Laser Blaster', ['hand'], 36, 'Ranged. Deals 40 [attuned: 50] damage. Cooldown 2s.'),
	equipment('sniperRifle', 'Sniper Rifle', ['hand', 'hand'], 26, 'Ranged. Deals 120 damage. Cooldown 2s. Must stand still for 4s before each shot.'),
	equipment('tranquilizerGun', 'Tranquilizer Gun', ['hand'], 24, 'Ranged. Deals 10 damage. Cooldown 4s. On hit: Target is stunned for 5s.'),
	equipment('rayGun', 'Ray Gun', ['hand'], 23, 'Ranged. Deals 70 [attuned: 85] damage. Requires 1 charge.'),
	equipment('flareGun', 'Flare Gun', ['hand'], 15, 'Ranged. Deals 20 [attuned: 30] damage. Cooldown 3s. On hit: Set all enemies within 10m of the target on fire.'),
	equipment('bow', 'Bow', ['hand', 'hand'], 12, 'Ranged. Deals 50 [attuned: 65] damage. Cooldown 5s.'),
	equipment('snowmanHead', 'Snowman Head', ['head'], 9, 'Ranged. Deals 12 damage. Cooldown 1.5s. On hit dealt: Freeze the target for 2s [attuned: 3s].'),
	// single-use
	equipment('halo', 'Halo', ['head'], 35, "When a teammate is KO'd, revive them at 30% HP. Remove Halo."),
	equipment('invisibilityPotion', 'Invisibility Potion', ['hand'], 20, 'Single-use. Turn invisible for 8s.'),
	equipment('flamingoFloaty', 'Flamingo Floaty', ['legs'], 21, 'On hit taken: Prevent all damage. Remove Flamingo Floaty.', '*pop!*'),
	equipment('flashbang', 'Flashbang', ['hand'], 11, 'Single-use. Ranged. On hit: Stun all enemies within 10m of the target for 5s.'),
	equipment('cornDog', 'Corn Dog', ['hand'], 10, 'Single-use. Heal 40 HP.', 'surprisingly nutritious'),
	// other actions
	equipment('flowerOfPower', 'Flower of Power', ['hand'], 17, 'Heal a teammate for 40 [attuned: 50] HP. Requires 1 charge.'),
	equipment('leafBlower', 'Leaf Blower', ['hand', 'hand'], 6, 'Blow all enemies within 10m back another 15m. Cooldown 2s.'),
	equipment('foamFinger', 'Foam Finger', ['hand'], 15, 'Make all teammates hyped for 6s [attuned: 8s]. Requires 1 charge.', 'rah rah rah! go team go'),
	// stat changes
	equipment('fullSuitOfArmor', 'Full Suit of Armor', ['head', 'torso', 'legs', 'feet'], 24, '+6 [attuned: +7.5] toughness, -1.5 speed.', 'clank. clank. clank. clank'),
	equipment('sportsJersey', 'Sports Jersey', ['torso'], 22, '+0.5 to all stats for each other teammate still standing.', 'teamwork? i sure hope it does!'),
	equipment('devilHorns', 'Devil Horns', ['head'], 28, '-3 toughness. +3 [attuned: +4] to all other stats.'),
	equipment('houseArrestAnkleBracelet', 'House Arrest Ankle Bracelet', ['feet'], 19, '+2 to all stats. Must stay within 5m of starting position.'),
	equipment('cardboardCutout', 'Cardboard Cutout', ['hand'], 27, 'When the fight starts, summon a decoy.'),
	equipment('vikingHelmet', 'Viking Helmet', ['head'], 11, '+1 toughness. +1 strength for every 25 [attuned: 15] HP missing.'),
	equipment('noveltyArrowHat', 'Novelty Arrow Hat', ['head'], 6, '+1.5 accuracy'),
	equipment('speedo', 'Speedo', ['legs'], 4, '+1 speed', "it's just so aerodynamic"),
	// passive effects
	equipment('shield', 'Shield', ['hand'], 30, '50% chance to block hits when facing the attacker.'),
	equipment('zapHelmet', 'Zap Helmet', ['head'], 13, 'On charge: Deal 30 [attuned: 40] damage to the nearest enemy fighter.'),
	equipment('frillySkirt', 'Frilly Skirt', ['legs'], 26, 'Makes opponents much less likely to target the wearer.', "you wouldn't hit someone in a frilly little skirt, would you?"),
	equipment('shirtOfManyBelts', 'Shirt of Many Belts', ['torso'], 19, 'On melee hit taken: Stun the attacker for 3s.', 'uh oh, your weapon seems to have become lodged in my many belts'),
	equipment('knifeShoes', 'Knife Shoes', ['feet'], 18, 'Whenever an opponent enters melee range, deal 8 [attuned: 10] damage to them.', "didn't expect to get hit from down there, did ya?"),
	equipment('fairyHat', 'Fairy Hat', ['head'], 17, 'On hit dealt: Freeze the target for 2s [attuned: 3s].'),
	equipment('jellyhat', 'Jellyhat', ['head'], 16, 'On melee hit taken: Deal 10 [attuned: 15] damage to the attacker.'),
	equipment('chainsawHeadband', 'Chainsaw Headband', ['head'], 15, 'Every second, deal 5 [attuned: 6] damage to all enemies in melee range.'),
	equipment('jortsOfPower', 'Jorts of Power', ['legs'], 12, 'Every 5s [attuned: 4s], gain +0.5 strength.'),
	equipment('bulletproofVest', 'Bulletproof Vest', ['hand'], 14, '50% chance to block ranged hits.'),
	equipment('shrapnel', 'Shrapnel', ['head'], 13, "When KO'd: Deal 40 damage to ALL fighters within 10m."),
	equipment('lightningRod', 'Lightning Rod', ['head'], 15, 'All opposing ranged attacks target the wearer. On hit taken: Gain 1 charge.'),
	equipment('bandolier', 'Bandolier', ['torso'], 12, 'Ranged cooldowns are 1s shorter.'),
	equipment('batteryPack', 'Battery Pack', ['torso'], 11, 'Start each fight with 2 [attuned: 3] charges.'),
	equipment('rhinocerosBeetleHorn', 'Rhinoceros Beetle Horn', ['head'], 11, 'On hit dealt: Gain +1 [attuned: +1.5] strength.', 'the rhinoceros beetle is the strongest creature on earth'),
	equipment('sponsorPatch', 'Sponsor Patch', ['torso'], 10, 'Team gains $1 for every 60 [attuned: 50] damage dealt.'),
	equipment('armbandOfSolidarity', 'Armband of Solidarity', ['hand'], 9, "When a teammate is KO'd: Become hyped for 3s [attuned: 5s]."),
	equipment('antiStaticWristband', 'Anti-Static Wristband', ['hand'], 8, 'On hit: Remove all charges from the target.'),
	equipment('eyepatch', 'Eyepatch', ['head'], 8, 'On KO: Loot $2 [attuned: $4] from the opponent.', "shouldn't have brought ye wallet into the arena!"),
	equipment('horriblePants', 'Horrible Pants', ['legs'], 10, 'Enemies within 10m [attuned: 20m] are taunted.', 'thrifted'),
	equipment('censoredBar', 'Censored Bar', ['legs'], 14, 'Wearer is immune to negative status effects.')
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
	ability('powerfulFists', 'Powerful Fists', 17, 'Fists deal double damage.'),
	ability('extraDamageOnHit', 'Oomph', 16, 'On hit dealt: Target loses 5 extra HP.', 'just has a little more "oomph"'),
	ability('bloodlust', 'Bloodlust', 14, 'On hit dealt: Gain 0.5 strength.'),
	ability('gainStrengthOnHitTaken', 'Enrage', 13, 'On hit taken: Gain 1 strength.'),
	ability('pepTalk', 'Pep Talk', 9, 'Teammates start each fight hyped for 3s.', 'delivers quite the pep talk'),
	ability('moneyOnKo', 'Brand Ambassador', 10, 'On KO: Team gains $3.', 'it\'s called being a "brand ambassador"'),
	ability('lastStand', 'Lone Wolf', 8, '+3 to all stats when all other teammates are downed.'),
	ability('shorterCooldowns', 'Shorter Cooldowns', 7, 'All cooldowns are 0.2s shorter.'),
	ability('lifesteal', 'Lifesteal', 7, 'On hit: Heal 20% of damage dealt.'),
	ability('taunt', 'Trash Talker', 6, 'All enemies within 10m are taunted.', '"is that the best you\'ve got?"'),
	ability('mentor', 'Mentor', 6, 'After each training camp, gives a younger teammate +0.5 stars to a random stat.'),
	ability('randomAbility', 'Random Ability', 4, 'Starts each fight with a random ability.'),
	ability('bully', 'Opportunist', 8, 'Deals double damage to targets with a negative status effect.'),
	ability('strongerSummons', 'Stronger Summons', 1, "This fighter's summons spawn with +50% HP."),
	ability('klutz', 'Klutz', -2, 'When hit: 10% chance to drop a handheld equipment.', 'bit of a klutz. teehee!'),
	ability('immuneToNegativeEffects', 'Status Immunity', 10, 'Immune to negative status effects.'),
	ability('cantAttune', 'No Attunement', -3, "Can't attune to equipment.", 'was held back a couple grades as well'),
	ability('refusesUnattuned', 'Picky', -9, 'Refuses to use unattuned weapons.'),
	ability('inattentive', 'Inattentive', -12, 'Starts each fight stunned for 4s.', "oh shoot, we're fighting already?"),
	ability('scaredWhenHit', 'Coward', -13, 'When hit: Becomes scared for 2s.', "don't act like you're any better")
];

export const ABILITIES: Record<string, AbilityInfo> = Object.fromEntries(ABILITY_LIST.map((a) => [a.key, a]));
export const ABILITY_KEYS: string[] = ABILITY_LIST.map((a) => a.key);

/** Weapons are equipment that attacks (whose description says it's melee or ranged). */
export function isWeapon(key: string): boolean {
	return /\b(Melee|Ranged)\./.test(EQUIPMENT[key]?.description ?? '');
}

export function slotsToString(slots: Slot[]): string {
	const joined = slots.join(', ');
	if (joined === '') return 'none';
	if (joined === 'hand, hand') return 'two-handed';
	return joined;
}
