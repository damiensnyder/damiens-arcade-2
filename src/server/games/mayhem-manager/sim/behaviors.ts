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
import { MAX_FIGHT_SECONDS, MELEE_RANGE, TICK_LENGTH, TYPICAL_FIGHT_SECONDS, TYPICAL_HIT } from './constants.js';

export interface AttackSpec {
	kind: 'melee' | 'ranged' | 'aoe';
	/** [unattuned, attuned]. For attacks with `damageAt`, a typical value used for planning. */
	damage: [number, number];
	/** Damage each hit does later (like burning), for planning. Not scaled by strength. */
	lingering?: number;
	/** What a hit's side effects on this target are worth, in damage, for planning (like stunning them). */
	effectValue?: (item: BattleItem, target: BattleFighter) => number;
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
	/** For the valuation, damage worked out from what it knows (like the team's money), in place of `damage`. */
	planDamage?: (attuned: boolean, ctx: ValueContext) => number;
	/** Seconds the wearer has to stand still before each shot. */
	aim?: number;
	/** The item is used up once fired. */
	singleUse?: boolean;
}

/** What the valuation knows about the wearer and their fight, for hints that depend on it. */
export interface ValueContext {
	/** Hits the wearer's primary attack lands per second (0 for a weapon that isn't the one being used). */
	hitsPerSecond: number;
	/** Hits the wearer takes before going down, roughly. */
	hitsTaken: number;
	timeToCharge: number;
	/** Seconds before anyone can act. */
	startDelay: number;
	teammates: number;
	enemies: number;
	/** Immune to negative status effects. */
	immune: boolean;
	/** The team's money during its fights. */
	money: number;
	/** Whether the wearer's primary attack is melee. */
	melee: boolean;
	/** Charges the primary attack uses, and its damage per second. */
	primaryCharges: number;
	primaryDps: number;
}

/**
 * How the valuation (../valuation.ts) counts effects it can't read off an attack or stat mod, in
 * its own terms: output (damage or healing per second) and HP.
 */
export interface ValueHints {
	/** Extra damage per second. One-time damage counts spread over a typical fight. */
	dps?: (attuned: boolean, ctx: ValueContext) => number;
	/** Extra HP (one-time healing, a blocked hit). */
	hp?: (attuned: boolean, ctx: ValueContext) => number;
	/** Share of hits taken that do nothing. */
	blocked?: (attuned: boolean) => number;
	/** Stats gained on average over a fight. */
	stats?: (attuned: boolean, ctx: ValueContext) => Partial<Stats>;
	/** Multiplier on the wearer's output (for time lost to being scared and the like). */
	output?: (attuned: boolean, ctx: ValueContext) => number;
	/** Multiplier on how much enemies want to target the wearer (for the valuation; the sim uses targetWeight). */
	weight?: number;
	/** Brings back the first teammate to go down, with this share of their HP. */
	revive?: number;
	/** Share of the fight teammates spend hyped. */
	teamHype?: (attuned: boolean, ctx: ValueContext) => number;
	/**
	 * A support action the wearer can use instead of attacking: healing per second, the share of the
	 * fight teammates end up hyped, and the share of the wearer's time it takes.
	 */
	action?: (attuned: boolean, ctx: ValueContext) => { healing?: number; hype?: number; busy: number };
}

export interface Behavior {
	attack?: AttackSpec;
	/** Stat changes applied when the fight starts. */
	statMods?: (attuned: boolean) => Partial<Stats>;
	/** Seconds taken off every cooldown the wearer starts. */
	cooldownReduction?: number;
	/** Seconds taken off the wearer's ranged attacks' cooldowns, on top of that. */
	rangedCooldownReduction?: number;
	/** Enemies' ranged attacks can only target the wearer (or others with this). */
	drawsRanged?: boolean;
	/** Multiplier on how attractive the wearer is as a target. */
	targetWeight?: number;
	/** Extra danger (≈ damage per second) enemies should account for. */
	passiveDanger?: (item: BattleItem) => number;
	/**
	 * A non-attack action, like eating a corn dog. Priority is on the same scale as attacking (see
	 * healValue and boostValue); the fighter does whichever is worth more. ≤ 0 means "not now".
	 */
	action?: { priority: (item: BattleItem) => number; perform: (item: BattleItem) => void };
	onFightStart?: (item: BattleItem) => void;
	/** The wearer charged up (gained a charge by spending time on it). */
	onCharge?: (item: BattleItem) => void;
	/** Runs at the start of every tick while the wearer is standing. */
	onTick?: (item: BattleItem) => void;
	/** Return true to cancel the hit entirely. Runs before any damage is applied. */
	preventHit?: (item: BattleItem, attacker: BattleFighter, damage: number, source: BattleItem) => boolean;
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

/** Cooldown for equipment that uses charges, and other actions, unless its description says otherwise. */
const CHARGED_COOLDOWN = 1;

const at = <T>(item: BattleItem, pair: [T, T]): T => (item.attuned ? pair[1] : pair[0]);
const ALL_STATS = (n: number): Stats => ({ strength: n, accuracy: n, energy: n, speed: n, toughness: n });

// ---- status effects ----

function freeze(target: BattleFighter, seconds: number): void {
	target.addEffect({ name: 'frozen', remaining: seconds, negative: true, mods: { speed: -4 }, slow: true, tint: [0.5, 0.7, 1, 0.3] });
}

/** Burning deals 5 damage a second (before toughness) for as long as it lasts. */
function burn(target: BattleFighter, item: BattleItem, seconds: number): void {
	target.addEffect({ name: 'burning', remaining: seconds, negative: true, mods: {}, burn: 5, source: item.owner, sourceItem: item, tint: [1, 0.5, 0, 0.35] });
}

export const HYPE_MODS: Partial<Stats> = ALL_STATS(6);

function hype(target: BattleFighter, seconds: number): void {
	target.addEffect({ name: 'hyped', remaining: seconds, negative: false, mods: HYPE_MODS, tint: [1, 0.9, 0.3, 0.25] });
}

/** Taunted fighters can only attack the taunter. */
function taunt(target: BattleFighter, source: BattleFighter): void {
	target.addEffect({ name: 'taunted', remaining: 1, negative: true, mods: {}, source, tint: [1, 0.2, 0.2, 0.3] });
}

/** Scared fighters run from whoever scared them and don't attack or use items. */
function scare(target: BattleFighter, seconds: number, source: BattleFighter): void {
	target.addEffect({ name: 'scared', remaining: seconds, negative: true, mods: {}, source, tint: [0.6, 0.3, 1, 0.3] });
}

const stunned = (seconds: number): StatusEffect => ({ name: 'stunned', remaining: seconds, negative: true, mods: {}, tint: [1, 1, 0.4, 0.35] });

/** Stunned fighters don't move or act until it wears off. */
function stun(target: BattleFighter, seconds: number): void {
	if (target.hp <= 0 || target.wouldBlock(stunned(seconds))) return;
	if (!target.isStunned()) target.log({ type: 'text', fighter: target.index, text: 'stunned', color: '#ee8' });
	target.addEffect(stunned(seconds));
}

function invisible(target: BattleFighter, seconds: number): void {
	target.addEffect({ name: 'invisible', remaining: seconds, negative: false, mods: {}, tint: [0, 0, 0, 0] });
}

/** Pushes `target` this many meters straight away from `from`. */
function push(from: BattleFighter, target: BattleFighter, meters: number): void {
	const dx = target.x - from.x;
	const dy = target.y - from.y;
	const d = Math.max(Math.hypot(dx, dy), 0.01);
	target.moveByVector((dx / d) * meters, (dy / d) * meters, false);
}

/**
 * Taking an enemy out of the fight for a while (stunning, scaring), for planning: like dealing
 * the share of their effective HP that this is of how long they'd otherwise go on fighting. Only
 * time beyond what's left of the same effect counts. Fitted with test fights: much higher and
 * fighters stun instead of hitting with a better weapon; much lower and they never stun.
 */
const DISABLE_PLANNING_SECONDS = 8;

function disablePlanning(target: BattleFighter, effect: string, seconds: number): number {
	// pushing someone away isn't a status effect, so immunity doesn't help
	if (target.summoner || (effect !== 'blown' && target.wouldBlock(stunned(seconds)))) return 0;
	const existing = target.effects.find((e) => e.name === effect)?.remaining ?? 0;
	return (target.effectiveHp() * Math.min(Math.max(seconds - existing, 0), DISABLE_PLANNING_SECONDS)) / DISABLE_PLANNING_SECONDS;
}

// ---- what item actions are worth ----
//
// Attacking a target is worth its danger divided by the time it'd take to knock them out: roughly
// its danger times the share of its health removed per second. Actions are scored the same way.

/** Healing: the teammate's danger times the share of their health restored, per second spent. */
function healValue(target: BattleFighter, amount: number, seconds: number): number {
	const healed = Math.min(amount, 100 - target.hp) / target.damageTakenMultiplier();
	if (healed <= 0 || target.hp <= 0) return 0;
	return (target.danger() * healed) / ((target.effectiveHp() + healed) * seconds);
}

/** Disabling enemies, as an action: their danger times the share of the fight they lose, per second spent. */
function disableValue(targets: BattleFighter[], effect: string, seconds: number, spent: number): number {
	return targets.reduce((sum, t) => sum + (t.danger() * disablePlanning(t, effect, seconds)) / Math.max(t.effectiveHp(), 1), 0) / spent;
}

/** Fighters land about half the damage danger() suggests (walking, waiting, missing), per test fights. */
const REALIZED_DAMAGE = 0.5;

/**
 * Giving fighters a status effect that changes their stats for a while, per second spent. It's
 * worth the extra damage it lets them deal, valued like the user's own damage, plus the damage it
 * saves them from taking, valued like healing. Only time beyond what's left of the same effect counts.
 */
function boostValue(f: BattleFighter, targets: BattleFighter[], effect: string, mods: Partial<Stats>, duration: number, seconds: number): number {
	const negated = Object.fromEntries(Object.entries(mods).map(([k, v]) => [k, -v]));
	// damage each of the user's team takes per second, roughly
	const incoming = (REALIZED_DAMAGE * f.enemies().reduce((sum, e) => sum + e.danger(), 0)) / Math.max(f.teammates().length, 1);
	let value = 0;
	for (const t of targets) {
		const existing = t.effects.find((e) => e.name === effect);
		const extra = Math.max(duration - (existing?.remaining ?? 0), 0);
		if (extra <= 0) continue;
		const [without, withIt] = existing ? [t.withMods(negated, () => stateOf(t)), stateOf(t)] : [stateOf(t), t.withMods(mods, () => stateOf(t))];
		value += (withIt.danger - without.danger) * extra * REALIZED_DAMAGE * f.valuePerDamage;
		const saved = (incoming * extra * (1 - withIt.taken / without.taken)) / without.taken;
		if (saved > 0) value += (t.danger() * saved) / (t.effectiveHp() + saved);
	}
	return value / seconds;
}

function stateOf(t: BattleFighter): { danger: number; taken: number } {
	return { danger: t.danger(), taken: t.damageTakenMultiplier() };
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

/** Heals the target, crediting `item` (if it's equipment). */
function heal(target: BattleFighter, amount: number, item?: BattleItem): number {
	const healed = Math.min(Math.round(amount), 100 - target.hp);
	if (healed <= 0) return 0;
	target.hp += healed;
	target.fight.credit(item, 'hpHealed', healed);
	target.log({ type: 'text', fighter: target.index, text: '+' + healed, color: '#9e9' });
	target.log({ type: 'animation', fighter: target.index, updates: { hp: target.hp } });
	return healed;
}

/** Damage from an item that's reduced by the target's toughness, outside of a regular hit. */
function zap(item: BattleItem, target: BattleFighter, amount: number): void {
	item.owner.dealDamage(target, Math.ceil(amount * target.damageTakenMultiplier()), true, item);
}

// ---- what effects amount to, for the valuation ----

/** How often a shield's wearer is facing whoever hits them. */
const FACING_ATTACKER = 0.7;
/** How much of a fight a melee fighter spends with an enemy in reach. */
const IN_MELEE = 0.5;

/** Damage per second of a typical enemy. */
const TYPICAL_DPS = 10;

/** Not being frozen, stunned, scared or set on fire, against a typical league's gear, per test fights. */
const IMMUNITY_OUTPUT = 1.15;

/** Stopping the target from acting for this long on each hit. */
function stunValue(seconds: number, ctx: ValueContext): number {
	return TYPICAL_DPS * Math.min(1, seconds * ctx.hitsPerSecond);
}

/** Share of enemies' hits that are ranged. */
const RANGED_SHARE = 0.4;

/** Freezing a target on each hit: it attacks at half speed while frozen. */
function freezeValue(seconds: number, ctx: ValueContext): number {
	return 0.5 * TYPICAL_DPS * Math.min(1, seconds * ctx.hitsPerSecond);
}

/**
 * Hyping teammates for `seconds` per charge. Fighters recast once the hype wears off (only time
 * beyond what's left counts), so each cast is followed by charging up again.
 */
function hypeAction(seconds: number, ctx: ValueContext): { hype: number; busy: number } {
	const cycle = ctx.timeToCharge + CHARGED_COOLDOWN;
	const started = Math.max(1 - (ctx.startDelay + ctx.timeToCharge) / TYPICAL_FIGHT_SECONDS, 0);
	// test fights put it at about half of that: hype often lands on teammates with no one in reach
	return { hype: 0.5 * (seconds / (seconds + cycle)) * started, busy: cycle / (seconds + cycle) };
}

/** What a cast iron pan's hit is worth beyond its damage, for planning: the damage it adds to later fights. */
const PAN_SEASONING_VALUE = 10;

export const FISTS: Behavior = {
	attack: { kind: 'melee', damage: [12, 12], cooldown: [2.4, 2.4], knockback: 1 }
};

export const EQUIPMENT_BEHAVIORS: Record<string, Behavior> = {
	battleAxe: { attack: { kind: 'melee', damage: [70, 90], cooldown: [4.5, 4.5], knockback: 3 } },
	bow: { attack: { kind: 'ranged', damage: [50, 65], cooldown: [5, 5], knockback: 1, projectile: '/mm/projectiles/arrow.png' } },
	torch: {
		// burning doesn't stack, so hitting every 2.5s keeps it going: about half its 25 damage per hit
		attack: { kind: 'melee', damage: [12, 16], cooldown: [2.5, 2.5], knockback: 1, lingering: 12.5 },
		onHitDealt: (item, target, _damage, source) => {
			if (source === item) burn(target, item, 5);
		}
	},
	tranquilizerGun: {
		attack: {
			kind: 'ranged',
			damage: [10, 10],
			cooldown: [4, 4],
			knockback: 0.5,
			projectile: '/mm/projectiles/bullet.png',
			effectValue: (_item, target) => disablePlanning(target, 'stunned', 5)
		},
		onHitDealt: (item, target, _damage, source) => {
			if (source === item) stun(target, 5);
		},
		value: { dps: (_attuned, ctx) => stunValue(5, ctx) }
	},
	flareGun: {
		// the target's burning, plus whoever's near them
		attack: { kind: 'ranged', damage: [20, 30], cooldown: [3, 3], knockback: 1, projectile: '/mm/projectiles/fireball.png', lingering: 20 },
		onHitDealt: (item, target, _damage, source) => {
			if (source !== item) return;
			for (const e of item.owner.enemies()) if (e === target || e.distanceTo(target) <= 10) burn(e, item, 5);
		}
	},
	cornDog: {
		action: {
			priority: (item) => healValue(item.owner, 40, item.owner.actionTime(0, CHARGED_COOLDOWN)),
			perform: (item) => {
				const f = item.owner;
				heal(f, 40, item);
				f.setCooldown(Math.max(f.cooldown, CHARGED_COOLDOWN));
				f.removeItem(item);
				f.log({ type: 'animation', fighter: f.index, updates: { equipment: f.wornKeys() } });
			}
		},
		// often eaten when it can't heal all 40, or too late to matter
		value: { hp: () => 20 }
	},
	devilHorns: {
		statMods: (attuned) => {
			const bonus = attuned ? 8 : 6;
			return { strength: bonus, accuracy: bonus, energy: bonus, speed: bonus, toughness: -6 };
		}
	},
	diamondSword: { attack: { kind: 'melee', damage: [50, 65], cooldown: [3, 3], knockback: 2 } },
	fairyHat: {
		passiveDanger: () => 2,
		onHitDealt: (item, target) => freeze(target, item.attuned ? 3 : 2),
		value: { dps: (attuned, ctx) => freezeValue(attuned ? 3 : 2, ctx) }
	},
	flamingoFloaty: {
		preventHit: (item) => {
			const f = item.owner;
			f.removeItem(item);
			f.log({ type: 'text', fighter: f.index, text: 'pop!', color: '#f9c' });
			f.log({ type: 'animation', fighter: f.index, updates: { equipment: f.wornKeys() } });
			return true;
		},
		value: { hp: () => TYPICAL_HIT }
	},
	frillySkirt: { targetWeight: 0.02 },
	fullSuitOfArmor: { statMods: (attuned) => ({ toughness: attuned ? 15 : 12, speed: -3 }) },
	jellyhat: {
		onHitTaken: (item, attacker, _damage, source) => {
			if (source.behavior.attack?.kind === 'melee') zap(item, attacker, item.attuned ? 15 : 10);
		},
		value: { dps: (attuned, ctx) => ((attuned ? 15 : 10) * ctx.hitsTaken) / TYPICAL_FIGHT_SECONDS }
	},
	laserBlaster: {
		attack: { kind: 'ranged', damage: [40, 50], cooldown: [2, 2], knockback: 1, projectile: '/mm/projectiles/laser.png' }
	},
	rhinocerosBeetleHorn: {
		onHitDealt: (item) => item.owner.changeStats({ strength: item.attuned ? 3 : 2 }),
		value: { stats: (attuned, ctx) => ({ strength: ((attuned ? 3 : 2) * ctx.hitsPerSecond * TYPICAL_FIGHT_SECONDS) / 2 }) }
	},
	rollerBlades: {
		attack: { kind: 'melee', damage: [25, 25], cooldown: [4, 4], knockback: 2 },
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
		value: { blocked: () => 0.5 * FACING_ATTACKER }
	},
	shiv: { attack: { kind: 'melee', damage: [16, 16], cooldown: [2, 1.5], knockback: 1 } },
	snowmanHead: {
		attack: { kind: 'ranged', damage: [12, 12], cooldown: [1.5, 1.5], knockback: 0.5, projectile: '/mm/projectiles/snowball.png' },
		onHitDealt: (item, target, _damage, source) => {
			if (source === item) freeze(target, item.attuned ? 3 : 2);
		},
		value: { dps: (attuned, ctx) => freezeValue(attuned ? 3 : 2, ctx) }
	},
	sportsJersey: {
		onTick: (item) => {
			const f = item.owner;
			const others = f.teammates().filter((t) => t !== f).length;
			setAllStatsBonus(item, others);
		},
		value: { stats: (_attuned, ctx) => ALL_STATS(ctx.teammates / 2) }
	},
	vikingHelmet: {
		statMods: () => ({ toughness: 2 }),
		onTick: (item) => {
			const f = item.owner;
			const bonus = 2 * Math.floor(Math.max(100 - f.hp, 0) / (item.attuned ? 15 : 25));
			const diff = bonus - (item.state.applied ?? 0);
			if (diff === 0) return;
			item.state.applied = bonus;
			f.changeStats({ strength: diff });
		},
		value: { stats: (attuned) => ({ strength: attuned ? 6 : 4 }) }
	},
	wandOfFlames: {
		attack: {
			kind: 'aoe',
			damage: [50, 60],
			cooldown: [CHARGED_COOLDOWN, CHARGED_COOLDOWN],
			charges: [3, 3],
			knockback: 1,
			projectile: '/mm/projectiles/fireball.png',
			// 5s of burning
			lingering: 25
		},
		onHitDealt: (item, target, _damage, source) => {
			if (source === item) burn(target, item, 5);
		}
	},
	zapHelmet: {
		passiveDanger: (item) => (usesCharges(item.owner) ? (item.attuned ? 40 : 30) / (item.owner.timeToCharge() + CHARGED_COOLDOWN) : 0),
		onCharge: (item) => {
			const f = item.owner;
			const target = f.nearestEnemy();
			if (!target) return;
			f.log({ type: 'projectile', fighter: f.index, target: target.index, img: '/mm/projectiles/laser.png' });
			zap(item, target, item.attuned ? 40 : 30);
		},
		// about one charge per charge-up and use
		value: { dps: (attuned, ctx) => (ctx.primaryCharges > 0 ? (attuned ? 40 : 30) / (ctx.timeToCharge + CHARGED_COOLDOWN / ctx.primaryCharges) : 0) }
	},
	headbuttersDelight: {
		attack: { kind: 'melee', damage: [20, 25], cooldown: [3, 3], knockback: 1.5, scalesWith: 'toughness' }
	},
	chainsawHeadband: {
		passiveDanger: (item) => (item.attuned ? 6 : 5),
		onTick: (item) =>
			every(item, 1, () => {
				const f = item.owner;
				for (const e of f.enemies()) {
					if (f.distanceTo(e) <= MELEE_RANGE) zap(item, e, item.attuned ? 6 : 5);
				}
			}),
		value: { dps: (attuned) => (attuned ? 6 : 5) * IN_MELEE }
	},
	moneySword: {
		attack: {
			kind: 'melee',
			// typical: teams keep about $6 into the season, so it mostly whiffs unattuned (call it 5 a hit) and deals 10 attuned
			damage: [5, 10],
			cooldown: [3, 3],
			knockback: 2,
			damageAt: (item) => moneySwordDamage(item.attuned, item.owner.teamMoney()),
			planDamage: (attuned, ctx) => moneySwordDamage(attuned, ctx.money)
		}
	},
	halo: {
		onTeammateKnockedOut: (item, teammate) => {
			const f = item.owner;
			if (f.hp <= 0 || teammate.hp > 0) return;
			teammate.hp = 30;
			f.fight.credit(item, 'hpHealed', 30);
			f.removeItem(item);
			f.log({ type: 'animation', fighter: f.index, updates: { equipment: f.wornKeys() } });
			teammate.log({ type: 'animation', fighter: teammate.index, updates: { hp: teammate.hp } });
			teammate.log({ type: 'text', fighter: teammate.index, text: 'revived!', color: '#eeb' });
		},
		value: { revive: 0.3 }
	},
	eyepatch: {
		onKo: (item, victim) => {
			const f = item.owner;
			const loot = f.fight.transferMoney(victim.team, f.team, item.attuned ? 4 : 2);
			f.fight.credit(item, 'moneyEarned', loot);
			if (loot > 0) f.log({ type: 'money', fighter: f.index, amount: loot, from: victim.team });
		}
	},
	shrapnel: {
		onKnockedOut: (item) => {
			const f = item.owner;
			f.log({ type: 'particle', fighter: f.index, img: '/mm/damage.png' });
			for (const other of f.fight.fighters) {
				if (other !== f && other.hp > 0 && f.distanceTo(other) <= 10) zap(item, other, 40);
			}
		},
		value: { dps: (_attuned, ctx) => (40 * Math.min(ctx.enemies, 2)) / TYPICAL_FIGHT_SECONDS }
	},
	knifeShoes: {
		onTick: (item) => {
			const f = item.owner;
			for (const e of f.enemies()) {
				const inRange = f.distanceTo(e) <= MELEE_RANGE ? 1 : 0;
				if (inRange && !item.state[e.index]) zap(item, e, item.attuned ? 10 : 8);
				item.state[e.index] = inRange;
			}
		},
		value: { dps: (attuned, ctx) => ((attuned ? 10 : 8) * 2 * ctx.enemies) / TYPICAL_FIGHT_SECONDS }
	},
	censoredBar: {
		blocksEffect: (_item, effect) => effect.negative,
		value: { output: () => IMMUNITY_OUTPUT }
	},
	theRatioInator: {
		attack: {
			kind: 'melee',
			// typical: a share of a target at 80 HP
			damage: [27, 40],
			cooldown: [2.5, 2.5],
			knockback: 1,
			fixed: true,
			damageAt: (item, target) => Math.ceil(Math.max(target.hp, 0) * (item.attuned ? 1 / 2 : 1 / 3))
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
			priority: (item) => bestHeal(item.owner, item.attuned ? 50 : 40).value,
			perform: (item) => {
				const f = item.owner;
				if (f.charges < 1) {
					f.charge();
					return;
				}
				const amount = item.attuned ? 50 : 40;
				const { target } = bestHeal(f, amount);
				if (!target) return;
				f.charges -= 1;
				f.setCooldown(CHARGED_COOLDOWN);
				heal(target, amount, item);
			}
		},
		value: { action: (attuned, ctx) => ({ healing: (attuned ? 50 : 40) / (ctx.timeToCharge + CHARGED_COOLDOWN), busy: 1 }) }
	},
	foamFinger: {
		action: {
			priority: (item) =>
				boostValue(item.owner, item.owner.teammates().filter((t) => t !== item.owner), 'hyped', HYPE_MODS, item.attuned ? 8 : 6, item.owner.actionTime(1, CHARGED_COOLDOWN)),
			perform: (item) => {
				const f = item.owner;
				if (f.charges < 1) {
					f.charge();
					return;
				}
				f.charges -= 1;
				f.setCooldown(CHARGED_COOLDOWN);
				for (const t of f.teammates()) if (t !== f) hype(t, item.attuned ? 8 : 6);
			}
		},
		value: { action: (attuned, ctx) => hypeAction(attuned ? 8 : 6, ctx) }
	},
	castIronPan: {
		attack: {
			kind: 'melee',
			// typical: it's had some seasoning
			damage: [25, 25],
			cooldown: [5, 5],
			knockback: 2,
			damageAt: (item) => 20 + item.growth,
			// each hit makes it better for good, so it's worth swinging even when fists would do as well
			effectValue: () => PAN_SEASONING_VALUE
		},
		onHitDealt: (item, _target, _damage, source) => {
			if (source === item) item.owner.fight.grow(item, 1);
		}
	},
	rapier: { attack: { kind: 'melee', damage: [40, 50], cooldown: [3, 3], knockback: 1.5, scalesWith: 'accuracy' } },
	taser: {
		attack: {
			kind: 'melee',
			damage: [25, 25],
			cooldown: [CHARGED_COOLDOWN, CHARGED_COOLDOWN],
			charges: [1, 1],
			knockback: 0.5,
			effectValue: (item, target) => disablePlanning(target, 'stunned', item.attuned ? 3 : 2)
		},
		onHitDealt: (item, target, _damage, source) => {
			if (source === item) stun(target, item.attuned ? 3 : 2);
		},
		value: { dps: (attuned, ctx) => stunValue(attuned ? 3 : 2, ctx) }
	},
	baseballBat: {
		attack: { kind: 'melee', damage: [30, 35], cooldown: [3.5, 3.5], knockback: 20 },
		// melee enemies spend a few seconds walking back
		value: { dps: (_attuned, ctx) => (1 - RANGED_SHARE) * stunValue(3, ctx) }
	},
	clawsForAlarm: {
		attack: {
			kind: 'melee',
			damage: [12, 12],
			cooldown: [2, 2],
			knockback: 1,
			effectValue: (item, target) => disablePlanning(target, 'scared', item.attuned ? 2 : 1)
		},
		onHitDealt: (item, target, _damage, source) => {
			if (source === item) scare(target, item.attuned ? 2 : 1, item.owner);
		},
		value: { dps: (attuned, ctx) => stunValue(attuned ? 2 : 1, ctx) }
	},
	lasestBlaster: {
		attack: { kind: 'ranged', damage: [70, 80], cooldown: [2, 2], knockback: 1.5, projectile: '/mm/projectiles/laser.png' }
	},
	sniperRifle: {
		attack: { kind: 'ranged', damage: [120, 120], cooldown: [2, 2], knockback: 3, aim: 4, projectile: '/mm/projectiles/bullet.png' }
	},
	rayGun: {
		attack: {
			kind: 'ranged',
			damage: [70, 85],
			cooldown: [CHARGED_COOLDOWN, CHARGED_COOLDOWN],
			charges: [1, 1],
			knockback: 1.5,
			projectile: '/mm/projectiles/laser.png'
		}
	},
	invisibilityPotion: {
		action: {
			// like healing for the damage it'd save, so it's saved for when the wearer is hurt
			priority: (item) => {
				const f = item.owner;
				if (f.isInvisible()) return 0;
				const incoming = (REALIZED_DAMAGE * f.enemies().reduce((sum, e) => sum + e.danger(), 0) * 8) / Math.max(f.teammates().length, 1);
				return healValue(f, incoming, f.actionTime(0, CHARGED_COOLDOWN));
			},
			perform: (item) => {
				const f = item.owner;
				invisible(f, 8);
				f.log({ type: 'text', fighter: f.index, text: 'vanished', color: '#ccf' });
				f.setCooldown(Math.max(f.cooldown, CHARGED_COOLDOWN));
				f.removeItem(item);
				f.log({ type: 'animation', fighter: f.index, updates: { equipment: f.wornKeys() } });
			}
		},
		value: { hp: () => 30 }
	},
	flashbang: {
		attack: {
			kind: 'ranged',
			damage: [0, 0],
			cooldown: [CHARGED_COOLDOWN, CHARGED_COOLDOWN],
			knockback: 0,
			singleUse: true,
			projectile: '/mm/projectiles/fireball.png',
			effectValue: (item, target) =>
				item.owner
					.enemies()
					.filter((e) => e.distanceTo(target) <= 10)
					.reduce((sum, e) => sum + disablePlanning(e, 'stunned', 5), 0)
		},
		onHitDealt: (item, target, _damage, source) => {
			if (source !== item) return;
			for (const e of item.owner.enemies()) if (e.distanceTo(target) <= 10) stun(e, 5);
		},
		// one 5s stun of a couple of enemies, spread over the fight
		value: { dps: (_attuned, ctx) => (0.6 * TYPICAL_DPS * 5 * Math.min(ctx.enemies, 2)) / TYPICAL_FIGHT_SECONDS }
	},
	leafBlower: {
		action: {
			priority: (item) => {
				const f = item.owner;
				const close = f.enemies().filter((e) => f.distanceTo(e) <= 10 && e.prefersMelee() && !e.isStunned());
				// they're out of the fight for as long as it takes them to walk back, and to line up again
				return close.reduce((sum, e) => sum + disableValue([e], 'blown', 15 / e.metersPerSecond() + 1, f.actionTime(0, 2)), 0);
			},
			perform: (item) => {
				const f = item.owner;
				f.setCooldown(2);
				f.log({ type: 'text', fighter: f.index, text: 'whoosh', color: '#cec' });
				for (const e of f.enemies()) if (f.distanceTo(e) <= 10) push(f, e, 15);
			}
		},
		value: { hp: () => 25 }
	},
	houseArrestAnkleBracelet: {
		statMods: () => ALL_STATS(4),
		onFightStart: (item) => {
			const f = item.owner;
			f.tether = { x: f.x, y: f.y, radius: 5 };
		},
		// melee fighters can only hit whoever comes to them, and nobody can back away
		value: { output: (_attuned, ctx) => (ctx.melee ? 0.4 : 0.8) }
	},
	cardboardCutout: {
		onFightStart: (item) => {
			const f = item.owner;
			const stronger = f.items.some((i) => i.key === 'strongerSummons');
			item.owner.fight.summonDecoy(f, stronger ? 38 : 25);
		},
		// it soaks more than its 25 HP: enemies spend time walking to it, and overkill it
		value: { hp: () => 45 }
	},
	jortsOfPower: {
		onTick: (item) => every(item, item.attuned ? 4 : 5, () => item.owner.changeStats({ strength: 1 })),
		value: { stats: (attuned) => ({ strength: TYPICAL_FIGHT_SECONDS / (attuned ? 4 : 5) / 2 }) }
	},
	bulletproofVest: {
		preventHit: (item, _attacker, _damage, source) => {
			const f = item.owner;
			if (source.behavior.attack?.kind === 'melee' || f.fight.rng.real() >= 0.5) return false;
			f.log({ type: 'text', fighter: f.index, text: 'blocked', color: '#aaa' });
			return true;
		},
		value: { blocked: () => 0.5 * RANGED_SHARE }
	},
	lightningRod: {
		drawsRanged: true,
		onHitTaken: (item) => {
			const f = item.owner;
			f.charges += 1;
			f.log({ type: 'particle', fighter: f.index, img: '/mm/charge.png' });
		},
		value: {
			dps: (_attuned, ctx) =>
				ctx.primaryCharges > 0 ? ctx.primaryDps * Math.min(1, (ctx.hitsTaken * ctx.timeToCharge) / ctx.primaryCharges / TYPICAL_FIGHT_SECONDS) : 0
		}
	},
	bandolier: { rangedCooldownReduction: 1 },
	batteryPack: {
		onFightStart: (item) => {
			item.owner.charges += item.attuned ? 3 : 2;
		},
		// charging time saved
		value: {
			dps: (attuned, ctx) =>
				ctx.primaryCharges > 0 ? ctx.primaryDps * Math.min(1, ((attuned ? 3 : 2) * ctx.timeToCharge) / TYPICAL_FIGHT_SECONDS) : 0
		}
	},
	sponsorPatch: {
		onTick: (item) => {
			const f = item.owner;
			const earned = Math.floor(f.dmgDealt / (item.attuned ? 50 : 60));
			if (earned <= (item.state.paid ?? 0)) return;
			const amount = earned - (item.state.paid ?? 0);
			item.state.paid = earned;
			f.fight.transferMoney(null, f.team, amount);
			f.fight.credit(item, 'moneyEarned', amount);
			f.log({ type: 'money', fighter: f.index, amount, from: null });
		}
	},
	armbandOfSolidarity: {
		onTeammateKnockedOut: (item) => hype(item.owner, item.attuned ? 5 : 3),
		value: { stats: (attuned, ctx) => ALL_STATS((6 * (attuned ? 5 : 3) * Math.min(ctx.teammates, 1)) / 2 / TYPICAL_FIGHT_SECONDS) }
	},
	antiStaticWristband: {
		onHitDealt: (_item, target) => {
			target.charges = 0;
		},
		value: { dps: (_attuned, ctx) => 2 * ctx.hitsPerSecond }
	},
	horriblePants: {
		onTick: (item) => {
			const f = item.owner;
			for (const e of f.enemies()) if (f.distanceTo(e) <= (item.attuned ? 20 : 10)) taunt(e, f);
		},
		value: { weight: 2 }
	},
	shirtOfManyBelts: {
		onHitTaken: (_item, attacker, _damage, source) => {
			if (source.behavior.attack?.kind === 'melee') stun(attacker, 3);
		},
		// stunned attackers' teammates keep hitting, so about half of that, per test fights
		value: { dps: (_attuned, ctx) => 0.5 * TYPICAL_DPS * Math.min(0.8, (3 * (1 - RANGED_SHARE) * ctx.hitsTaken) / TYPICAL_FIGHT_SECONDS) }
	}
};

/** Whether a fighter has anything that needs charges, so they spend time charging up. */
function usesCharges(f: BattleFighter): boolean {
	return f.items.some((i) => (i.behavior.attack?.charges?.[i.attuned ? 1 : 0] ?? 0) > 0 || i.key === 'flowerOfPower' || i.key === 'foamFinger');
}

function moneySwordDamage(attuned: boolean, money: number): number {
	return 10 * Math.floor(Math.max(money, 0) / (attuned ? 6 : 8));
}

/** The standing teammate (or the fighter themself) it's worth most to heal. */
function bestHeal(f: BattleFighter, amount: number): { target: BattleFighter | null; value: number } {
	const seconds = f.actionTime(1, CHARGED_COOLDOWN);
	let best: { target: BattleFighter | null; value: number } = { target: null, value: 0 };
	for (const t of f.teammates()) {
		const value = healValue(t, amount, seconds);
		if (value > best.value) best = { target: t, value };
	}
	return best;
}

export const ABILITY_BEHAVIORS: Record<string, Behavior> = {
	noAbilities: {},
	extraDamageOnHit: {
		onHitDealt: (item, target) => item.owner.dealDamage(target, 5),
		value: { dps: (_attuned, ctx) => 5 * ctx.hitsPerSecond }
	},
	bloodlust: {
		onHitDealt: (item) => item.owner.changeStats({ strength: 1 }),
		value: { stats: (_attuned, ctx) => ({ strength: (ctx.hitsPerSecond * TYPICAL_FIGHT_SECONDS) / 2 }) }
	},
	inattentive: {
		onFightStart: (item) => stun(item.owner, 4),
		// nobody can act for the first 3s anyway; after that, 1s more of not fighting
		value: { output: (_attuned, ctx) => (ctx.immune ? 1 : 1 - 1 / TYPICAL_FIGHT_SECONDS - 0.03) }
	},
	gainStrengthOnHitTaken: {
		onHitTaken: (item) => item.owner.changeStats({ strength: 2 }),
		value: { stats: (_attuned, ctx) => ({ strength: ctx.hitsTaken }) }
	},
	powerfulFists: {
		attack: { kind: 'melee', damage: [24, 24], cooldown: [2.4, 2.4], knockback: 1.5 }
	},
	shorterCooldowns: { cooldownReduction: 0.2 },
	moneyOnKo: {
		onKo: (item) => {
			const f = item.owner;
			f.fight.transferMoney(null, f.team, 3);
			f.log({ type: 'money', fighter: f.index, amount: 3, from: null });
		}
	},
	lifesteal: {
		onHitDealt: (item, _target, damage) => heal(item.owner, damage * 0.2),
		value: { output: () => 1.2 }
	},
	pepTalk: {
		onFightStart: (item) => {
			for (const t of item.owner.teammates()) if (t !== item.owner) hype(t, 3);
		},
		value: { teamHype: () => 3 / TYPICAL_FIGHT_SECONDS }
	},
	taunt: {
		onTick: (item) => {
			const f = item.owner;
			for (const e of f.enemies()) if (f.distanceTo(e) <= 10) taunt(e, f);
		},
		value: { weight: 2 }
	},
	scaredWhenHit: {
		onHitTaken: (item, attacker) => scare(item.owner, 2, attacker),
		// scared fighters run, so they take about half as many hits as they otherwise would
		value: { output: (_attuned, ctx) => (ctx.immune ? 1 : 1 - Math.min(0.8, (2 * ctx.hitsTaken) / 2 / TYPICAL_FIGHT_SECONDS)) }
	},
	// handled in the league after training camp
	mentor: {},
	bully: {
		damageMultiplier: (_item, target) => (target.effects.some((e) => e.negative) ? 2 : 1)
	},
	// see cardboardCutout
	strongerSummons: {},
	lastStand: {
		onTick: (item) => {
			const f = item.owner;
			if (item.state.hadTeammates === undefined) {
				item.state.hadTeammates = f.fight.fighters.some((t) => t.team === f.team && t !== f && !t.summoner) ? 1 : 0;
			}
			const alone = item.state.hadTeammates === 1 && f.teammates().every((t) => t === f);
			setAllStatsBonus(item, alone ? 6 : 0);
		},
		value: { stats: (_attuned, ctx) => ALL_STATS(6 / (2 * (ctx.teammates + 1))) }
	},
	randomAbility: {
		onFightStart: (item) => {
			const key = item.owner.fight.rng.pick(RANDOM_ABILITY_POOL);
			item.owner.addAbility(key, ABILITY_BEHAVIORS[key]);
		}
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
		}
	},
	// handled when the fighter is set up: unattuned equipment is left out
	refusesUnattuned: {},
	immuneToNegativeEffects: {
		blocksEffect: (_item, effect) => effect.negative,
		value: { output: () => IMMUNITY_OUTPUT }
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
