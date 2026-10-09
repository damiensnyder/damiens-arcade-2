// Battle behavior for equipment and fighter abilities, keyed like the display catalog.
//
// Where possible, effects are declared as data (`attack`, `statMods`) rather than code, so
// the valuation in ../valuation.ts can reason about them without simulating a fight.
// Stats are on a 0–10 scale; descriptions count stars, which are 2 stat points each.

import type { Stats } from '../../../../lib/games/mayhem-manager/types.js';
import type { BattleFighter, BattleItem } from './fighter.js';
import { TICK_LENGTH } from './constants.js';

export interface AttackSpec {
	kind: 'melee' | 'ranged' | 'aoe';
	/** [unattuned, attuned] */
	damage: [number, number];
	cooldown: [number, number];
	charges?: [number, number];
	/** Meters the target is pushed back. */
	knockback: number;
	projectile?: string;
}

/** Rough numbers the valuation uses for effects it can't read off an attack or stat mod. */
export interface ValueHints {
	/** Extra damage per second, given the wearer's attacks per second. */
	bonusDps?: (attuned: boolean, attacksPerSecond: number) => number;
	/** Multiplier on effective HP. */
	ehpMultiplier?: (attuned: boolean) => number;
	/** Multiplier on damage per second. */
	dpsMultiplier?: (attuned: boolean) => number;
}

export interface Behavior {
	attack?: AttackSpec;
	/** Stat changes applied when the fight starts. */
	statMods?: (attuned: boolean) => Partial<Stats>;
	/** Seconds taken off every cooldown the wearer starts. */
	cooldownReduction?: number;
	/** Multiplier on how attractive the wearer is as a target. */
	targetWeight?: number;
	/** Extra danger (≈ damage per second) enemies should account for. */
	passiveDanger?: (item: BattleItem) => number;
	/** A non-attack action, like eating a corn dog. Priority ≤ 0 means "not now". */
	action?: { priority: (item: BattleItem) => number; perform: (item: BattleItem) => void };
	onFightStart?: (item: BattleItem) => void;
	onTick?: (item: BattleItem) => void;
	/** Return true to cancel the hit entirely. Runs before any damage is applied. */
	preventHit?: (item: BattleItem, attacker: BattleFighter, damage: number) => boolean;
	onHitTaken?: (item: BattleItem, attacker: BattleFighter, damage: number, source: BattleItem) => void;
	onHitDealt?: (item: BattleItem, target: BattleFighter, damage: number, source: BattleItem) => void;
	value?: ValueHints;
}

const at = <T>(item: BattleItem, pair: [T, T]): T => (item.attuned ? pair[1] : pair[0]);

function freeze(target: BattleFighter, seconds: number): void {
	target.addEffect({
		name: 'frozen',
		remaining: seconds,
		mods: { speed: -4 },
		slow: true,
		tint: [0.5, 0.7, 1, 0.3]
	});
}

export const FISTS: Behavior = {
	attack: { kind: 'melee', damage: [12, 12], cooldown: [2.4, 2.4], knockback: 1 }
};

export const EQUIPMENT_BEHAVIORS: Record<string, Behavior> = {
	battleAxe: { attack: { kind: 'melee', damage: [70, 90], cooldown: [4, 4], knockback: 3 } },
	bow: { attack: { kind: 'ranged', damage: [50, 65], cooldown: [5, 5], knockback: 1, projectile: '/mm/projectiles/arrow.png' } },
	cornDog: {
		action: {
			priority: (item) => {
				const f = item.owner;
				const heal = item.attuned ? 60 : 40;
				if (f.cooldown > 0 || f.hp >= 100 - heal / 2) return 0;
				// worth more the closer the fighter is to going down
				return (heal / 2 / f.damageTakenMultiplier()) * (f.hp < heal ? 1 : 0.25);
			},
			perform: (item) => {
				const f = item.owner;
				const heal = Math.min(item.attuned ? 60 : 40, 100 - f.hp);
				f.hp += heal;
				f.setCooldown(Math.max(f.cooldown, 2));
				f.removeItem(item);
				f.log({ type: 'text', fighter: f.index, text: '+' + heal, color: '#9e9' });
				f.log({ type: 'animation', fighter: f.index, updates: { hp: f.hp, equipment: f.wornKeys() } });
			}
		},
		value: { ehpMultiplier: (attuned) => (attuned ? 1.6 : 1.4) }
	},
	devilHorns: {
		statMods: (attuned) => {
			const bonus = attuned ? 8 : 6;
			return { strength: bonus, accuracy: bonus, energy: bonus, speed: bonus, toughness: -4 };
		}
	},
	diamondSword: { attack: { kind: 'melee', damage: [50, 65], cooldown: [3, 3], knockback: 2 } },
	fairyHat: {
		passiveDanger: () => 2,
		onHitDealt: (item, target) => freeze(target, item.attuned ? 3 : 2),
		value: { dpsMultiplier: (attuned) => (attuned ? 1.25 : 1.18) }
	},
	flamingoFloaty: {
		preventHit: (item) => {
			const f = item.owner;
			f.removeItem(item);
			f.log({ type: 'text', fighter: f.index, text: 'pop!', color: '#f9c' });
			f.log({ type: 'animation', fighter: f.index, updates: { equipment: f.wornKeys() } });
			return true;
		},
		value: { ehpMultiplier: () => 1.3 }
	},
	frillySkirt: { targetWeight: 0.02, value: { ehpMultiplier: () => 1.6 } },
	fullSuitOfArmor: { statMods: (attuned) => ({ toughness: attuned ? 15 : 12, speed: -3 }) },
	jellyhat: {
		onHitTaken: (item, attacker) => {
			item.owner.dealDamage(attacker, 10);
		},
		value: { bonusDps: () => 2.5 }
	},
	laserBlaster: {
		attack: { kind: 'ranged', damage: [40, 50], cooldown: [2, 2], knockback: 1, projectile: '/mm/projectiles/laser.png' }
	},
	rhinocerosBeetleHorn: {
		onHitDealt: (item) => item.owner.changeStats({ strength: item.attuned ? 3 : 2 }),
		value: { dpsMultiplier: () => 1.15 }
	},
	rollerBlades: {
		attack: { kind: 'melee', damage: [30, 30], cooldown: [4, 4], knockback: 2 },
		statMods: (attuned) => ({ speed: attuned ? 6 : 4 })
	},
	shield: { statMods: (attuned) => ({ toughness: attuned ? 8 : 6 }) },
	shiv: { attack: { kind: 'melee', damage: [20, 20], cooldown: [2, 1.5], knockback: 1 } },
	snowmanHead: {
		attack: { kind: 'ranged', damage: [10, 10], cooldown: [1, 1], knockback: 0.5, projectile: '/mm/projectiles/snowball.png' },
		onHitDealt: (item, target, _damage, source) => {
			if (source === item) freeze(target, item.attuned ? 2 : 1);
		},
		value: { dpsMultiplier: (attuned) => (attuned ? 1.3 : 1.2) }
	},
	sportsJersey: {
		onFightStart: (item) => {
			const f = item.owner;
			const others = f.teammates().filter((t) => t !== f && t.items.some((i) => i.key === 'sportsJersey')).length;
			const bonus = (item.attuned ? 6 : 4) * others;
			if (bonus > 0) {
				f.changeStats({ strength: bonus, accuracy: bonus, energy: bonus, speed: bonus, toughness: bonus });
			}
		},
		value: { dpsMultiplier: () => 1.1, ehpMultiplier: () => 1.1 }
	},
	vikingHelmet: { statMods: (attuned) => ({ strength: attuned ? 4 : 3, toughness: attuned ? 4 : 3 }) },
	wandOfFlames: {
		attack: {
			kind: 'aoe',
			damage: [40, 50],
			cooldown: [1, 1],
			charges: [2, 2],
			knockback: 1,
			projectile: '/mm/projectiles/fireball.png'
		}
	},
	zapHelmet: {
		passiveDanger: (item) => (item.attuned ? 20 : 15) / 3,
		onFightStart: (item) => {
			item.state.timer = 0;
		},
		onTick: (item) => {
			item.state.timer += TICK_LENGTH;
			if (item.state.timer < 3) return;
			item.state.timer = 0;
			const f = item.owner;
			const target = f.nearestEnemy();
			if (!target) return;
			f.log({ type: 'projectile', fighter: f.index, target: target.index, img: '/mm/projectiles/laser.png' });
			f.dealDamage(target, Math.ceil((item.attuned ? 20 : 15) * target.damageTakenMultiplier()), true);
		},
		value: { bonusDps: (attuned) => (attuned ? 20 : 15) / 3 }
	}
};

export const ABILITY_BEHAVIORS: Record<string, Behavior> = {
	noAbilities: {},
	extraDamageOnHit: {
		onHitDealt: (item, target) => item.owner.dealDamage(target, 5),
		value: { bonusDps: (_attuned, attacksPerSecond) => 5 * attacksPerSecond }
	},
	gainStrengthOnHitTaken: {
		onHitTaken: (item) => item.owner.changeStats({ strength: 2 }),
		value: { dpsMultiplier: () => 1.1 }
	},
	powerfulFists: {
		attack: { kind: 'melee', damage: [24, 24], cooldown: [2.4, 2.4], knockback: 1.5 }
	},
	shorterCooldowns: { cooldownReduction: 0.2, value: { dpsMultiplier: () => 1.07 } }
};

export function attackStats(spec: AttackSpec, attuned: boolean) {
	const pick = <T>(pair: [T, T]) => (attuned ? pair[1] : pair[0]);
	return { damage: pick(spec.damage), cooldown: pick(spec.cooldown), charges: spec.charges ? pick(spec.charges) : 0 };
}

export { at as attunedValue };
