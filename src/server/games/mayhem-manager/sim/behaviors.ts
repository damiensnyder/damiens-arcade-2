// Battle behavior for equipment and fighter abilities, keyed like the display catalog.
//
// Where possible, effects are declared as data (`attack`, `statMods`) rather than code, so
// the valuation in ../valuation.ts can reason about them without simulating a fight.
// Stats are on a 0–10 scale; descriptions count stars, which are 2 stat points each.
//
// Wording in the catalog maps to damage like this: "deals X damage" is reduced by the target's
// toughness (and, for melee attacks, scaled by the attacker's strength); "loses X HP" is not.

import type { Stats } from '../../../../lib/games/mayhem-manager/types.js';
import type { BattleFighter, BattleItem, StatusEffect } from './fighter.js';
import { MELEE_RANGE, TICK_LENGTH } from './constants.js';

export interface AttackSpec {
	kind: 'melee' | 'ranged' | 'aoe';
	/** [unattuned, attuned]. For attacks with `damageAt`, a typical value used for planning. */
	damage: [number, number];
	cooldown: [number, number];
	charges?: [number, number];
	/** Meters the target is pushed back. */
	knockback: number | [number, number];
	projectile?: string;
	/** Melee damage scales with this stat instead of strength. */
	scalesWith?: keyof Stats;
	/** Ignores the attacker's strength and the target's toughness. */
	fixed?: boolean;
	/** Works out the damage when the attack lands, for attacks that depend on the situation. */
	damageAt?: (item: BattleItem, target: BattleFighter) => number;
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
	/** Runs at the start of every tick while the wearer is standing. */
	onTick?: (item: BattleItem) => void;
	/** Return true to cancel the hit entirely. Runs before any damage is applied. */
	preventHit?: (item: BattleItem, attacker: BattleFighter, damage: number) => boolean;
	/** Multiplier on the damage of the wearer's hits. */
	damageMultiplier?: (item: BattleItem, target: BattleFighter) => number;
	onHitTaken?: (item: BattleItem, attacker: BattleFighter, damage: number, source: BattleItem) => void;
	onHitDealt?: (item: BattleItem, target: BattleFighter, damage: number, source: BattleItem) => void;
	/** The wearer knocked someone out. */
	onKo?: (item: BattleItem, victim: BattleFighter) => void;
	/** The wearer was knocked out. */
	onKnockedOut?: (item: BattleItem, by: BattleFighter) => void;
	/** A teammate (not the wearer) was knocked out. */
	onTeammateKnockedOut?: (item: BattleItem, teammate: BattleFighter) => void;
	/** Return true to keep a status effect from being applied to the wearer. */
	blocksEffect?: (item: BattleItem, effect: StatusEffect) => boolean;
	value?: ValueHints;
}

/** Cooldown for equipment that uses charges, unless its description says otherwise. */
const CHARGED_COOLDOWN = 1;

const at = <T>(item: BattleItem, pair: [T, T]): T => (item.attuned ? pair[1] : pair[0]);
const ALL_STATS = (n: number): Stats => ({ strength: n, accuracy: n, energy: n, speed: n, toughness: n });

// ---- status effects ----

function freeze(target: BattleFighter, seconds: number): void {
	target.addEffect({ name: 'frozen', remaining: seconds, negative: true, mods: { speed: -4 }, slow: true, tint: [0.5, 0.7, 1, 0.3] });
}

/** Burning deals 5 damage a second (before toughness) for as long as it lasts. */
function burn(target: BattleFighter, source: BattleFighter, seconds: number): void {
	target.addEffect({ name: 'burning', remaining: seconds, negative: true, mods: {}, burn: 5, source, tint: [1, 0.5, 0, 0.35] });
}

function hype(target: BattleFighter, seconds: number): void {
	target.addEffect({ name: 'hyped', remaining: seconds, negative: false, mods: { strength: 4, speed: 4, energy: 4 }, tint: [1, 0.9, 0.3, 0.25] });
}

/** Taunted fighters can only attack the taunter. */
function taunt(target: BattleFighter, source: BattleFighter): void {
	target.addEffect({ name: 'taunted', remaining: 1, negative: true, mods: {}, source, tint: [1, 0.2, 0.2, 0.3] });
}

/** Scared fighters run from the nearest enemy and don't attack or use items. */
function scare(target: BattleFighter, seconds: number): void {
	target.addEffect({ name: 'scared', remaining: seconds, negative: true, mods: {}, tint: [0.6, 0.3, 1, 0.3] });
}

// ---- helpers for effects that change as the fight goes on ----

/** Applies a bonus to all stats, adjusting by however much it changed since last time. */
function setAllStatsBonus(item: BattleItem, bonus: number): void {
	const diff = bonus - (item.state.applied ?? 0);
	if (diff === 0) return;
	item.state.applied = bonus;
	item.owner.changeStats(ALL_STATS(diff));
}

/** Runs `fn` once every `seconds`. */
function every(item: BattleItem, seconds: number, fn: () => void): void {
	item.state.timer = (item.state.timer ?? 0) + TICK_LENGTH;
	if (item.state.timer < seconds - 1e-6) return;
	item.state.timer = 0;
	fn();
}

function heal(target: BattleFighter, amount: number): number {
	const healed = Math.min(Math.round(amount), 100 - target.hp);
	if (healed <= 0) return 0;
	target.hp += healed;
	target.log({ type: 'text', fighter: target.index, text: '+' + healed, color: '#9e9' });
	target.log({ type: 'animation', fighter: target.index, updates: { hp: target.hp } });
	return healed;
}

/** Damage that's reduced by the target's toughness, outside of a regular hit. */
function zap(from: BattleFighter, target: BattleFighter, amount: number): void {
	from.dealDamage(target, Math.ceil(amount * target.damageTakenMultiplier()), true);
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
				const amount = 40;
				if (f.cooldown > 0 || f.hp >= 100 - amount / 2) return 0;
				// worth more the closer the fighter is to going down
				return (amount / 2 / f.damageTakenMultiplier()) * (f.hp < amount ? 1 : 0.25);
			},
			perform: (item) => {
				const f = item.owner;
				heal(f, 40);
				f.setCooldown(Math.max(f.cooldown, 2));
				f.removeItem(item);
				f.log({ type: 'animation', fighter: f.index, updates: { equipment: f.wornKeys() } });
			}
		},
		value: { ehpMultiplier: () => 1.4 }
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
		onHitTaken: (item, attacker, _damage, source) => {
			if (source.behavior.attack?.kind === 'melee') zap(item.owner, attacker, item.attuned ? 15 : 10);
		},
		value: { bonusDps: (attuned) => (attuned ? 3.5 : 2.5) }
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
	shield: {
		preventHit: (item, attacker) => {
			const f = item.owner;
			// facing -1 means looking toward +x
			const facingAttacker = attacker.x === f.x || attacker.x > f.x === (f.facing === -1);
			if (!facingAttacker || f.fight.rng.real() >= 0.5) return false;
			f.log({ type: 'text', fighter: f.index, text: 'blocked', color: '#aaa' });
			return true;
		},
		value: { ehpMultiplier: () => 1.4 }
	},
	shiv: { attack: { kind: 'melee', damage: [16, 16], cooldown: [2, 1.5], knockback: 1 } },
	snowmanHead: {
		attack: { kind: 'ranged', damage: [12, 12], cooldown: [1.5, 1.5], knockback: 0.5, projectile: '/mm/projectiles/snowball.png' },
		onHitDealt: (item, target, _damage, source) => {
			if (source === item) freeze(target, item.attuned ? 2 : 1);
		},
		value: { dpsMultiplier: (attuned) => (attuned ? 1.3 : 1.2) }
	},
	sportsJersey: {
		onTick: (item) => {
			const f = item.owner;
			const others = f.teammates().filter((t) => t !== f).length;
			setAllStatsBonus(item, others);
		},
		value: { dpsMultiplier: () => 1.12, ehpMultiplier: () => 1.08 }
	},
	vikingHelmet: {
		statMods: () => ({ toughness: 2 }),
		onTick: (item) => {
			const f = item.owner;
			const bonus = 2 * Math.floor(Math.max(100 - f.hp, 0) / (item.attuned ? 20 : 25));
			const diff = bonus - (item.state.applied ?? 0);
			if (diff === 0) return;
			item.state.applied = bonus;
			f.changeStats({ strength: diff });
		},
		value: { dpsMultiplier: (attuned) => (attuned ? 1.15 : 1.1) }
	},
	wandOfFlames: {
		attack: {
			kind: 'aoe',
			damage: [50, 60],
			cooldown: [CHARGED_COOLDOWN, CHARGED_COOLDOWN],
			charges: [3, 3],
			knockback: 1,
			projectile: '/mm/projectiles/fireball.png'
		},
		onHitDealt: (item, target, _damage, source) => {
			if (source === item) burn(target, item.owner, 5);
		},
		value: { bonusDps: (_attuned, attacksPerSecond) => 25 * 2 * attacksPerSecond }
	},
	zapHelmet: {
		passiveDanger: (item) => (item.attuned ? 20 : 15) / 3,
		onTick: (item) =>
			every(item, 3, () => {
				const f = item.owner;
				const target = f.nearestEnemy();
				if (!target) return;
				f.log({ type: 'projectile', fighter: f.index, target: target.index, img: '/mm/projectiles/laser.png' });
				zap(f, target, item.attuned ? 20 : 15);
			}),
		value: { bonusDps: (attuned) => (attuned ? 20 : 15) / 3 }
	},
	headbuttersDelight: {
		attack: { kind: 'melee', damage: [20, 25], cooldown: [3, 3], knockback: 1.5, scalesWith: 'toughness' }
	},
	chainsawHeadband: {
		passiveDanger: (item) => (item.attuned ? 5 : 4),
		onTick: (item) =>
			every(item, 1, () => {
				const f = item.owner;
				for (const e of f.enemies()) {
					if (f.distanceTo(e) <= MELEE_RANGE) zap(f, e, item.attuned ? 5 : 4);
				}
			}),
		value: { bonusDps: (attuned) => (attuned ? 4 : 3) }
	},
	moneySword: {
		attack: {
			kind: 'melee',
			// typical: a team with about $16 left during the season
			damage: [20, 25],
			cooldown: [3, 3],
			knockback: 2,
			damageAt: (item) => 10 * Math.floor(item.owner.teamMoney() / (item.attuned ? 6 : 8))
		}
	},
	halo: {
		onTeammateKnockedOut: (item, teammate) => {
			const f = item.owner;
			if (f.hp <= 0 || teammate.hp > 0) return;
			teammate.hp = 50;
			f.removeItem(item);
			f.log({ type: 'animation', fighter: f.index, updates: { equipment: f.wornKeys() } });
			teammate.log({ type: 'animation', fighter: teammate.index, updates: { hp: teammate.hp } });
			teammate.log({ type: 'text', fighter: teammate.index, text: 'revived!', color: '#eeb' });
		},
		value: { ehpMultiplier: () => 1.3 }
	},
	eyepatch: {
		onKo: (item, victim) => {
			const f = item.owner;
			const loot = f.fight.transferMoney(victim.team, f.team, item.attuned ? 4 : 2);
			if (loot > 0) f.log({ type: 'text', fighter: f.index, text: `+$${loot}`, color: '#eeb' });
		}
	},
	shrapnel: {
		onKnockedOut: (item) => {
			const f = item.owner;
			f.log({ type: 'particle', fighter: f.index, img: '/mm/damage.png' });
			for (const other of f.fight.fighters) {
				if (other !== f && other.hp > 0 && f.distanceTo(other) <= 10) zap(f, other, 40);
			}
		},
		value: { bonusDps: () => 2 }
	},
	knifeShoes: {
		onTick: (item) => {
			const f = item.owner;
			for (const e of f.enemies()) {
				const inRange = f.distanceTo(e) <= MELEE_RANGE ? 1 : 0;
				if (inRange && !item.state[e.index]) zap(f, e, item.attuned ? 6 : 5);
				item.state[e.index] = inRange;
			}
		},
		value: { bonusDps: (attuned) => (attuned ? 1.8 : 1.5) }
	},
	censoredBar: {
		blocksEffect: (_item, effect) => effect.negative,
		value: { ehpMultiplier: () => 1.08 }
	},
	theRatioInator: {
		attack: {
			kind: 'melee',
			// typical: 30% of a target at 60 HP
			damage: [18, 24],
			cooldown: [2.5, 2.5],
			knockback: 1,
			fixed: true,
			damageAt: (item, target) => Math.ceil(Math.max(target.hp, 0) * (item.attuned ? 0.4 : 0.3))
		}
	},
	speedo: { statMods: () => ({ speed: 2 }) },
	steelToedBoots: {
		attack: { kind: 'melee', damage: [20, 25], cooldown: [3.5, 3.5], knockback: 1 },
		statMods: () => ({ toughness: 2 })
	},
	noveltyArrowHat: { statMods: () => ({ accuracy: 3 }) },
	flowerOfPower: {
		action: {
			priority: (item) => {
				const f = item.owner;
				if (f.cooldown > 0) return 0;
				const amount = item.attuned ? 25 : 20;
				const target = mostHurtTeammate(f, amount);
				if (!target) return 0;
				return (amount / 8) * (target.hp < 40 ? 3 : 1);
			},
			perform: (item) => {
				const f = item.owner;
				if (f.charges < 1) {
					f.charge();
					return;
				}
				const amount = item.attuned ? 25 : 20;
				const target = mostHurtTeammate(f, amount);
				if (!target) return;
				f.charges -= 1;
				f.setCooldown(CHARGED_COOLDOWN);
				heal(target, amount);
			}
		},
		value: { ehpMultiplier: (attuned) => (attuned ? 1.25 : 1.2) }
	},
	foamFinger: {
		action: {
			priority: (item) => {
				const f = item.owner;
				if (f.cooldown > 0) return 0;
				return unhypedTeammates(f).length;
			},
			perform: (item) => {
				const f = item.owner;
				if (f.charges < 1) {
					f.charge();
					return;
				}
				f.charges -= 1;
				f.setCooldown(CHARGED_COOLDOWN);
				for (const t of f.teammates()) if (t !== f) hype(t, item.attuned ? 4 : 3);
			}
		},
		value: { dpsMultiplier: (attuned) => (attuned ? 1.2 : 1.15) }
	}
};

/** Teammates (not the fighter themself) who aren't hyped, or whose hype is about to wear off. */
function unhypedTeammates(f: BattleFighter): BattleFighter[] {
	return f.teammates().filter((t) => t !== f && !t.effects.some((e) => e.name === 'hyped' && e.remaining > 1));
}

/** The standing teammate (or the fighter themself) missing the most HP, if anyone's missing enough. */
function mostHurtTeammate(f: BattleFighter, amount: number): BattleFighter | null {
	let best: BattleFighter | null = null;
	for (const t of f.teammates()) {
		if (100 - t.hp >= amount && (best === null || t.hp < best.hp)) best = t;
	}
	return best;
}

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
	shorterCooldowns: { cooldownReduction: 0.2, value: { dpsMultiplier: () => 1.07 } },
	moneyOnKo: {
		onKo: (item) => {
			const f = item.owner;
			f.fight.transferMoney(null, f.team, 3);
			f.log({ type: 'text', fighter: f.index, text: '+$3', color: '#eeb' });
		}
	},
	lifesteal: {
		onHitDealt: (item, _target, damage) => heal(item.owner, damage * 0.2),
		value: { ehpMultiplier: () => 1.15 }
	},
	pepTalk: {
		onFightStart: (item) => {
			for (const t of item.owner.teammates()) if (t !== item.owner) hype(t, 5);
		}
	},
	taunt: {
		onTick: (item) => {
			const f = item.owner;
			for (const e of f.enemies()) if (f.distanceTo(e) <= MELEE_RANGE) taunt(e, f);
		}
	},
	scaredWhenHit: {
		onHitTaken: (item) => scare(item.owner, 3),
		value: { dpsMultiplier: () => 0.85 }
	},
	// handled in the league after training camp
	mentor: {},
	bully: {
		damageMultiplier: (_item, target) => (target.effects.some((e) => e.negative) ? 2 : 1),
		value: { dpsMultiplier: () => 1.1 }
	},
	// nothing summons yet
	strongerSummons: {},
	lastStand: {
		onTick: (item) => {
			const f = item.owner;
			if (item.state.hadTeammates === undefined) {
				item.state.hadTeammates = f.fight.fighters.some((t) => t.team === f.team && t !== f) ? 1 : 0;
			}
			const alone = item.state.hadTeammates === 1 && f.teammates().every((t) => t === f);
			setAllStatsBonus(item, alone ? 6 : 0);
		},
		value: { dpsMultiplier: () => 1.05, ehpMultiplier: () => 1.05 }
	},
	randomAbility: {
		onFightStart: (item) => {
			const key = item.owner.fight.rng.pick(RANDOM_ABILITY_POOL);
			item.owner.addAbility(key, ABILITY_BEHAVIORS[key]);
		},
		value: { dpsMultiplier: () => 1.05 }
	},
	klutz: {
		onHitTaken: (item) => {
			const f = item.owner;
			if (f.fight.rng.real() >= 0.1) return;
			const handheld = f.items.filter((i) => i.kind === 'equipment' && f.slotsOf(i).includes('hand'));
			if (handheld.length === 0) return;
			f.removeItem(f.fight.rng.pick(handheld));
			f.log({ type: 'text', fighter: f.index, text: 'dropped it!', color: '#aaa' });
			f.log({ type: 'animation', fighter: f.index, updates: { equipment: f.wornKeys() } });
		},
		value: { dpsMultiplier: () => 0.92 }
	},
	// handled when the fighter is set up: unattuned equipment is left out
	refusesUnattuned: {},
	immuneToNegativeEffects: {
		blocksEffect: (_item, effect) => effect.negative,
		value: { ehpMultiplier: () => 1.05 }
	},
	// handled in training camp
	cantAttune: {}
};

/** Abilities a "random ability" fighter can roll: ones that do something during a fight. */
const RANDOM_ABILITY_POOL = Object.keys(ABILITY_BEHAVIORS).filter(
	(k) => !['noAbilities', 'randomAbility', 'mentor', 'strongerSummons', 'refusesUnattuned', 'cantAttune'].includes(k)
);

export function attackStats(spec: AttackSpec, attuned: boolean) {
	const pick = <T>(pair: [T, T]) => (attuned ? pair[1] : pair[0]);
	return {
		damage: pick(spec.damage),
		cooldown: pick(spec.cooldown),
		charges: spec.charges ? pick(spec.charges) : 0,
		knockback: typeof spec.knockback === 'number' ? spec.knockback : pick(spec.knockback)
	};
}

export { at as attunedValue };
