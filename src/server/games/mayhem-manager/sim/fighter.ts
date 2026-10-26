import { EQUIPMENT } from '../../../../lib/games/mayhem-manager/catalog.js';
import type { FightEvent, Fighter, Look, Slot, Stats, TeamId, Tint } from '../../../../lib/games/mayhem-manager/types.js';
import { ABILITY_BEHAVIORS, EQUIPMENT_BEHAVIORS, FISTS, attackStats, type AttackSpec, type Behavior } from './behaviors.js';
import {
	ARENA_SIZE,
	CROWDING_DISTANCE,
	EPSILON,
	INITIAL_COOLDOWN,
	KNOCKBACK_ROTATION,
	MELEE_RANGE,
	Pose,
	TICK_LENGTH
} from './constants.js';
import type { Fight } from './fight.js';

export interface BattleItem {
	/** Equipment catalog key, ability key, or 'fists'. */
	key: string;
	kind: 'equipment' | 'ability' | 'fists';
	/** The team's equipment ID, so what the item does can be credited to it. */
	equipmentId?: number;
	behavior: Behavior;
	attuned: boolean;
	owner: BattleFighter;
	/** Scratch space for behaviors that need to remember things (like a timer). */
	state: Record<string, number>;
}

export interface StatusEffect {
	name: string;
	remaining: number;
	/** Whether it's bad for the fighter it's on (for immunities and the like). */
	negative: boolean;
	/** Applied when the effect starts and undone exactly when it ends. */
	mods: Partial<Stats>;
	/** Cooldowns tick at half speed. */
	slow?: boolean;
	/** Damage per second, before toughness. */
	burn?: number;
	/** Who caused it (for damage credit, or who a taunt points at). */
	source?: BattleFighter;
	/** The item that caused it, for crediting the item. */
	sourceItem?: BattleItem;
	tint: Tint;
	/** Seconds since the last burn. */
	timer?: number;
}

interface AttackOption {
	item: BattleItem;
	spec: AttackSpec;
	damage: number;
	cooldown: number;
	charges: number;
	knockback: number;
}

/**
 * Melee fighters back off while they'd still get back into range with more than this many seconds
 * to spare before their weapon is ready, and close in once they wouldn't. The lower the margin the
 * more they back off and the better they do; below zero they get stranded, so it's a little above.
 */
const MELEE_COMMIT_LEAD = 0.1;
/** How strongly retreating fighters are pulled toward the middle of the arena, against being pushed away from enemies. */
const RETREAT_CENTERING = 0.7;

export class BattleFighter {
	readonly fight: Fight;
	index = -1;
	readonly team: TeamId;
	readonly fighterId: number;
	readonly name: string;
	readonly look: Look;
	hp = 100;
	x = 0;
	y = 0;
	facing = 1;
	cooldown = INITIAL_COOLDOWN;
	charges = 0;
	/** Seconds since the fighter last moved, for weapons that need aiming. */
	stillTime = 0;
	/** Where the fighter has to stay near (from a house arrest ankle bracelet), if anywhere. */
	tether: { x: number; y: number; radius: number } | null = null;
	/** For a summon (like a decoy), who summoned it. Summons don't count as fighters standing. */
	readonly summoner: BattleFighter | null;
	stats: Stats;
	items: BattleItem[];
	effects: StatusEffect[] = [];
	/**
	 * What a point of damage is worth this tick, judged by the best attack: its priority over its
	 * damage per second. Lets item actions that boost damage compare themselves with attacking.
	 */
	valuePerDamage = 0;
	flash = 0;
	pose: number = Pose.Stationary1;

	// box score
	dmgDealt = 0;
	dmgTaken = 0;
	kos = 0;
	kod = 0;

	constructor(fight: Fight, fighter: Fighter, equipmentKeys: string[], team: TeamId, equipmentIds: number[] = [], summoner: BattleFighter | null = null) {
		this.fight = fight;
		this.summoner = summoner;
		this.team = team;
		this.fighterId = fighter.id;
		this.name = fighter.name;
		this.look = fighter.look;
		this.stats = { ...fighter.stats };
		const item = (key: string, kind: BattleItem['kind'], behavior: Behavior): BattleItem => ({
			key,
			kind,
			behavior,
			attuned: fighter.attunements.includes(key),
			owner: this,
			state: {}
		});
		// summons don't attack
		this.items = summoner ? [] : [item('fists', 'fists', FISTS)];
		const ability = ABILITY_BEHAVIORS[fighter.ability];
		if (ability && Object.keys(ability).length > 0) this.items.push(item(fighter.ability, 'ability', ability));
		equipmentKeys.forEach((key, i) => {
			const behavior = EQUIPMENT_BEHAVIORS[key];
			if (fighter.ability === 'refusesUnattuned' && behavior?.attack && !fighter.attunements.includes(key)) return;
			if (behavior) this.items.push({ ...item(key, 'equipment', behavior), equipmentId: equipmentIds[i] });
		});
	}

	/** Gives the fighter an ability mid-fight (it starts the fight as if they'd always had it). */
	addAbility(key: string, behavior: Behavior): void {
		const added: BattleItem = { key, kind: 'ability', behavior, attuned: false, owner: this, state: {} };
		this.items.push(added);
		const mods = behavior.statMods?.(false);
		if (mods) this.changeStats(mods);
		behavior.onFightStart?.(added);
	}

	slotsOf(item: BattleItem): Slot[] {
		return item.kind === 'equipment' ? (EQUIPMENT[item.key]?.slots ?? []) : [];
	}

	teamMoney(): number {
		return this.fight.moneyOf(this.team);
	}

	// ---- derived numbers ----

	meleeDamageMultiplier(stat: keyof Stats = 'strength'): number {
		return Math.max(0.5 + 0.1 * this.stats[stat], 0.25);
	}

	rangedHitChance(): number {
		return Math.max(0, Math.min(0.25 + 0.05 * this.stats.accuracy, 1));
	}

	metersPerSecond(): number {
		return Math.max(5 + this.stats.speed, 1);
	}

	timeToCharge(): number {
		return Math.max(4.8 - 0.32 * this.stats.energy, 0.8);
	}

	damageTakenMultiplier(): number {
		return Math.max(1.25 - 0.05 * this.stats.toughness, 0.5);
	}

	effectiveHp(): number {
		return Math.max(this.hp, 0) / this.damageTakenMultiplier();
	}

	/** Seconds off cooldowns, with ranged ones' extra reduction if `ranged`. */
	cooldownReduction(ranged = false): number {
		return this.items.reduce((sum, i) => sum + (i.behavior.cooldownReduction ?? 0) + (ranged ? (i.behavior.rangedCooldownReduction ?? 0) : 0), 0);
	}

	targetWeight(): number {
		if (this.summoner) return this.summoner.targetWeight();
		return this.items.reduce((w, i) => w * (i.behavior.targetWeight ?? 1), 1);
	}

	distanceTo(other: BattleFighter): number {
		return Math.hypot(this.x - other.x, this.y - other.y);
	}

	timeToReach(target: BattleFighter): number {
		return Math.max(this.distanceTo(target) - MELEE_RANGE, 0) / this.metersPerSecond();
	}

	timeUntilReady(chargesNeeded: number): number {
		return this.cooldown + this.timeToCharge() * Math.max(chargesNeeded - this.charges, 0);
	}

	/** Standing fighters on this team, not counting summons. */
	teammates(): BattleFighter[] {
		return this.fight.fighters.filter((f) => f.team === this.team && f.hp > 0 && !f.summoner);
	}

	/** Standing enemies, summons included. */
	enemies(): BattleFighter[] {
		return this.fight.fighters.filter((f) => f.team !== this.team && f.hp > 0);
	}

	/** Enemies that can be picked out to attack: not invisible. */
	targetableEnemies(): BattleFighter[] {
		return this.enemies().filter((e) => !e.isInvisible());
	}

	nearestEnemy(): BattleFighter | null {
		let best: BattleFighter | null = null;
		for (const e of this.targetableEnemies()) {
			if (best === null || this.distanceTo(e) < this.distanceTo(best)) best = e;
		}
		return best;
	}

	wornKeys(): string[] {
		return this.items.filter((i) => i.kind === 'equipment').map((i) => i.key);
	}

	private attackOptions(): AttackOption[] {
		const options: AttackOption[] = [];
		for (const item of this.items) {
			const spec = item.behavior.attack;
			if (spec) options.push({ item, spec, ...attackStats(spec, item.attuned) });
		}
		return options;
	}

	/** Seconds per use of an attack, including charging (and aiming, which overlaps the cooldown). */
	private cycleTime(option: AttackOption): number {
		const cooldown = Math.max(option.cooldown - this.cooldownReduction(option.spec.kind !== 'melee'), TICK_LENGTH);
		return Math.max(cooldown, option.spec.aim ?? 0) + option.charges * this.timeToCharge();
	}

	/**
	 * Damage per second against one target (by default the nearest), before the target's toughness.
	 * Attacks whose damage depends on the situation are judged by what they'd deal to that target.
	 */
	private rawDps(option: AttackOption, target = this.nearestEnemy()): number {
		const damage = (target && option.spec.damageAt?.(option.item, target)) ?? option.damage;
		const scaled = option.spec.kind === 'melee' && !option.spec.fixed ? damage * this.meleeDamageMultiplier(option.spec.scalesWith) : damage;
		const extra = (option.spec.lingering ?? 0) + ((target && option.spec.effectValue?.(option.item, target)) ?? 0);
		const perUse = (scaled + extra) * (option.spec.kind === 'ranged' ? this.rangedHitChance() : 1);
		return perUse / this.cycleTime(option);
	}

	/** Seconds an item action takes: charging up to `chargesNeeded`, then its cooldown. */
	actionTime(chargesNeeded: number, cooldown: number): number {
		return this.timeToCharge() * Math.max(chargesNeeded - this.charges, 0) + Math.max(cooldown - this.cooldownReduction(), TICK_LENGTH);
	}

	/** Works something out as if this fighter's stats were changed by `mods`. */
	withMods<T>(mods: Partial<Stats>, fn: () => T): T {
		this.applyMods(mods, 1);
		const result = fn();
		this.applyMods(mods, -1);
		return result;
	}

	/** Roughly how much damage per second this fighter threatens. Decoys look as dangerous as whoever they copy. */
	danger(): number {
		if (this.summoner) return this.summoner.hp > 0 ? this.summoner.danger() : 0;
		let best = 0;
		const enemyCount = Math.max(this.enemies().length, 1);
		for (const option of this.attackOptions()) {
			if (option.spec.singleUse) continue;
			const dps = this.rawDps(option) * (option.spec.kind === 'aoe' ? enemyCount : 1);
			best = Math.max(best, dps);
		}
		let passive = 0;
		for (const item of this.items) passive += item.behavior.passiveDanger?.(item) ?? 0;
		return best + passive;
	}

	prefersMelee(): boolean {
		let best: AttackOption | null = null;
		for (const option of this.attackOptions()) {
			if (option.spec.singleUse) continue;
			if (best === null || this.rawDps(option) > this.rawDps(best)) best = option;
		}
		return best?.spec.kind === 'melee';
	}

	/** How good it is to attack this target: their danger over the time it'd take to knock them out. */
	private valueOfAttacking(target: BattleFighter, rawDps: number, timeToFirstHit: number): number {
		return (
			(target.danger() * target.targetWeight()) /
			(timeToFirstHit + target.effectiveHp() / Math.max(rawDps, EPSILON))
		);
	}

	// ---- acting ----

	/** Start-of-tick upkeep: effects wear off, cooldowns tick down, passive abilities trigger. */
	upkeep(): void {
		// a swing or shot shows for one tick, then the fighter stands back up (even if they don't move)
		if (this.hp > 0 && this.pose === Pose.ForwardSwing) {
			this.pose = Pose.Stationary1;
			this.log({ type: 'animation', fighter: this.index, updates: { rotation: this.pose } });
		}
		if (this.flash > 0) {
			this.flash = Math.max(this.flash - 0.75, 0);
			this.log({ type: 'animation', fighter: this.index, updates: { flash: this.flash } });
		}

		const oldTint = this.tint();
		let statsChanged = false;
		for (const effect of this.effects) {
			effect.remaining -= TICK_LENGTH;
			if (effect.remaining <= EPSILON) {
				this.applyMods(effect.mods, -1);
				statsChanged = true;
			}
		}
		this.effects = this.effects.filter((e) => e.remaining > EPSILON);
		for (const effect of this.effects) {
			if (!effect.burn || this.hp <= 0) continue;
			effect.timer = (effect.timer ?? 0) + TICK_LENGTH;
			if (effect.timer < 1 - EPSILON) continue;
			effect.timer = 0;
			(effect.source ?? this).dealDamage(this, Math.ceil(effect.burn * this.damageTakenMultiplier()), false, effect.sourceItem);
		}
		const newTint = this.tint();
		if (statsChanged || newTint.some((x, i) => x !== oldTint[i])) {
			this.log({ type: 'animation', fighter: this.index, updates: { stats: this.stats, tint: newTint, opacity: this.opacity() } });
		}

		this.cooldown -= this.effects.some((e) => e.slow) ? TICK_LENGTH / 2 : TICK_LENGTH;
		if (this.cooldown < EPSILON) this.cooldown = 0;
		this.stillTime += TICK_LENGTH;

		if (this.hp <= 0 || this.enemies().length === 0) return;
		for (const item of [...this.items]) item.behavior.onTick?.(item);
	}

	act(): void {
		if (this.hp <= 0 || this.summoner) return;
		const allEnemies = this.targetableEnemies();
		if (this.enemies().length === 0) return;
		const startX = this.x;
		const startY = this.y;

		if (this.isStunned()) return;
		const scared = this.effects.find((e) => e.name === 'scared');
		if (scared) {
			this.retreat(scared.source && scared.source.hp > 0 ? [scared.source] : undefined);
			return;
		}
		// taunted fighters can only go after whoever taunted them (area attacks still hit everyone)
		const taunter = this.effects.find((e) => e.name === 'taunted')?.source;
		const enemies = taunter && taunter.hp > 0 && !taunter.isInvisible() ? [taunter] : allEnemies;
		// lightning rods draw all ranged attacks
		const rods = enemies.filter((e) => e.items.some((i) => i.behavior.drawsRanged));
		const rangedTargets = rods.length > 0 ? rods : enemies;

		let bestPriority = -Infinity;
		let bestAction: (() => void) | null = null;
		let bestDps = 0;

		for (const option of this.attackOptions()) {
			if (option.spec.kind === 'aoe') {
				const timeToFirst = this.timeUntilReady(option.charges);
				const dpsAgainst = (e: BattleFighter) => this.rawDps(option, e);
				const priority = allEnemies.reduce((sum, e) => sum + this.valueOfAttacking(e, dpsAgainst(e), timeToFirst), 0);
				if (priority > bestPriority) {
					bestPriority = priority;
					bestDps = allEnemies.reduce((sum, e) => sum + dpsAgainst(e), 0);
					bestAction = () => this.aoeAttack(option);
				}
				continue;
			}
			for (const target of option.spec.kind === 'ranged' ? rangedTargets : enemies) {
				const dps = this.rawDps(option, target);
				const timeToFirst =
					option.spec.kind === 'melee'
						? Math.max(this.timeUntilReady(option.charges), this.timeToReach(target))
						: Math.max(this.timeUntilReady(option.charges), (option.spec.aim ?? 0) - this.stillTime);
				const priority = this.valueOfAttacking(target, dps, timeToFirst);
				if (priority > bestPriority) {
					bestPriority = priority;
					bestDps = dps;
					bestAction =
						option.spec.kind === 'melee' ? () => this.meleeAttack(target, option) : () => this.rangedAttack(target, option);
				}
			}
		}

		this.valuePerDamage = bestDps > 0 ? Math.max(bestPriority, 0) / bestDps : 0;
		// item actions are judged on the same scale as attacks, and only once the fighter can act
		for (const item of this.items) {
			const action = item.behavior.action;
			if (!action || this.cooldown > 0) continue;
			const priority = action.priority(item);
			if (priority > 0 && priority > bestPriority) {
				bestPriority = priority;
				bestAction = () => action.perform(item);
			}
		}

		bestAction?.();

		if (this.x === startX && this.y === startY && this.isWalking()) {
			this.pose = Pose.Stationary1;
			this.log({ type: 'animation', fighter: this.index, updates: { rotation: this.pose } });
		}
	}

	private isWalking(): boolean {
		return [Pose.WalkingStart1, Pose.Walking1, Pose.WalkingStart2, Pose.Walking2, Pose.Stationary2].includes(this.pose);
	}

	private meleeAttack(target: BattleFighter, option: AttackOption): void {
		// back off for as long as there's still time to get back before the weapon is ready
		const lead = this.timeUntilReady(option.charges) - this.timeToReach(target);
		if (this.distanceTo(target) > MELEE_RANGE && lead < MELEE_COMMIT_LEAD) {
			this.moveTowards(target);
		} else if (lead > MELEE_COMMIT_LEAD) {
			this.retreat();
		}

		if (this.distanceTo(target) <= MELEE_RANGE && this.cooldown === 0 && this.charges >= option.charges) {
			this.charges -= option.charges;
			this.setCooldown(option.cooldown);
			this.used(option);
			this.swing(Pose.BackswingStart, Pose.Backswing);
			const base = option.spec.damageAt?.(option.item, target) ?? option.damage;
			const damage = option.spec.fixed ? base : base * this.meleeDamageMultiplier(option.spec.scalesWith);
			this.hit(target, option.item, damage, option.knockback, !option.spec.fixed);
		} else if (this.charges < option.charges && this.cooldown === 0) {
			this.charge();
		}
	}

	private rangedAttack(target: BattleFighter, option: AttackOption): void {
		this.keepAwayFromMelee();
		const aimed = this.stillTime >= (option.spec.aim ?? 0) - EPSILON;
		if (this.cooldown === 0 && this.charges >= option.charges && aimed) {
			this.charges -= option.charges;
			this.setCooldown(option.cooldown, true);
			this.stillTime = 0;
			this.swing(Pose.AimStart, Pose.Aim);
			this.faceTowards(target);
			if (option.spec.projectile) {
				this.log({ type: 'projectile', fighter: this.index, target: target.index, img: option.spec.projectile });
			}
			if (this.fight.rng.real() < this.rangedHitChance()) {
				this.hit(target, option.item, option.spec.damageAt?.(option.item, target) ?? option.damage, option.knockback);
			} else {
				this.log({ type: 'text', fighter: target.index, text: 'missed', color: '#aaa' });
			}
			this.used(option);
		} else if (this.charges < option.charges && this.cooldown === 0) {
			this.charge();
		}
	}

	private aoeAttack(option: AttackOption): void {
		this.keepAwayFromMelee();
		if (this.cooldown === 0 && this.charges >= option.charges) {
			this.charges -= option.charges;
			this.setCooldown(option.cooldown, true);
			this.swing(Pose.AimStart, Pose.Aim);
			for (const target of this.enemies()) {
				if (option.spec.projectile) {
					this.log({ type: 'projectile', fighter: this.index, target: target.index, img: option.spec.projectile });
				}
				this.hit(target, option.item, option.spec.damageAt?.(option.item, target) ?? option.damage, option.knockback);
			}
		} else if (this.charges < option.charges && this.cooldown === 0) {
			this.charge();
		}
	}

	/** Single-use attacks are used up once fired. */
	private used(option: AttackOption): void {
		if (!option.spec.singleUse) return;
		this.removeItem(option.item);
		this.log({ type: 'animation', fighter: this.index, updates: { equipment: this.wornKeys() } });
	}

	/** Back away from the closest melee fighter who'd reach us before we can act again. */
	private keepAwayFromMelee(): void {
		let threat: BattleFighter | null = null;
		for (const e of this.enemies()) {
			if (e.isStunned() || !e.prefersMelee() || e.timeToReach(this) >= this.cooldown) continue;
			if (threat === null || this.distanceTo(e) < this.distanceTo(threat)) threat = e;
		}
		if (threat) this.retreat();
	}

	charge(): void {
		this.charges += 1;
		this.setCooldown(this.timeToCharge());
		this.log({ type: 'particle', fighter: this.index, img: '/mm/charge.png' });
		for (const item of [...this.items]) item.behavior.onCharge?.(item);
	}

	private swing(start: Pose, windup: Pose): void {
		this.log({ type: 'animation', fighter: this.index, updates: { rotation: start } }, 2);
		this.log({ type: 'animation', fighter: this.index, updates: { rotation: windup } }, 1);
		this.pose = Pose.ForwardSwing;
		this.log({ type: 'animation', fighter: this.index, updates: { rotation: this.pose } });
	}

	setCooldown(seconds: number, ranged = false): void {
		this.cooldown = Math.max(0, seconds - this.cooldownReduction(ranged));
	}

	// ---- hits and damage ----

	/**
	 * Resolves one landed attack: prevention, damage, knockback, then on-hit effects.
	 * `scaled` false means the target's toughness doesn't reduce the damage.
	 */
	private hit(target: BattleFighter, source: BattleItem, rawDamage: number, knockback: number, scaled = true): void {
		for (const item of this.items) rawDamage *= item.behavior.damageMultiplier?.(item, target) ?? 1;
		const damage = Math.ceil(rawDamage * (scaled ? target.damageTakenMultiplier() : 1));
		for (const item of [...target.items]) {
			if (item.behavior.preventHit?.(item, this, damage, source)) {
				this.fight.credit(item, 'dmgPrevented', Math.min(damage, Math.max(target.hp, 0)));
				return;
			}
		}
		this.dealDamage(target, damage, true, source);
		if (target.hp > 0 && knockback > 0) {
			const [dx, dy] = scaleVector(target.x - this.x, target.y - this.y, knockback);
			const cos = Math.cos(KNOCKBACK_ROTATION);
			const sin = Math.sin(KNOCKBACK_ROTATION);
			target.moveByVector(dx * cos - dy * sin, dx * sin + dy * cos, false);
		}
		for (const item of [...target.items]) item.behavior.onHitTaken?.(item, this, damage, source);
		for (const item of [...this.items]) item.behavior.onHitDealt?.(item, target, damage, source);
	}

	/**
	 * Takes HP off a target and keeps the box score, crediting `item` (if it's equipment) with
	 * damage to enemies. Damage is not scaled by toughness here.
	 */
	dealDamage(target: BattleFighter, amount: number, isHit = false, item?: BattleItem): void {
		if (target.hp <= 0 || amount <= 0) return;
		const dealt = Math.min(amount, target.hp);
		target.hp -= amount;
		// damage to a decoy is wasted
		if (!target.summoner) {
			this.dmgDealt += dealt;
			target.dmgTaken += dealt;
			if (target.team !== this.team) this.fight.credit(item, 'dmgDealt', dealt);
		}
		if (isHit) target.flash = 1;
		target.log({
			type: 'animation',
			fighter: target.index,
			updates: isHit ? { hp: target.hp, flash: target.flash } : { hp: target.hp }
		});
		if (isHit) {
			target.log({ type: 'hit', fighter: target.index, by: this.index, damage: amount });
			target.log({ type: 'particle', fighter: target.index, img: '/mm/damage.png' });
		}
		if (target.hp <= 0 && target.summoner) {
			target.log({ type: 'text', fighter: target.index, text: 'decoy!', color: '#aaa' });
		} else if (target.hp <= 0) {
			if (target.team !== this.team) this.kos++;
			target.kod++;
			this.fight.knockedOut(target, this);
		}
	}

	changeStats(mods: Partial<Stats>): void {
		this.applyMods(mods, 1);
		this.log({ type: 'animation', fighter: this.index, updates: { stats: this.stats } });
	}

	private applyMods(mods: Partial<Stats>, sign: 1 | -1): void {
		for (const [stat, amount] of Object.entries(mods) as [keyof Stats, number][]) {
			this.stats[stat] += sign * amount;
		}
	}

	addEffect(effect: StatusEffect): void {
		if (this.hp <= 0) return;
		if (this.wouldBlock(effect)) return;
		const existing = this.effects.find((e) => e.name === effect.name);
		if (existing) {
			existing.remaining = Math.max(existing.remaining, effect.remaining);
			return;
		}
		this.applyMods(effect.mods, 1);
		this.effects.push(effect);
		this.log({ type: 'animation', fighter: this.index, updates: { stats: this.stats, tint: this.tint(), opacity: this.opacity() } });
	}

	removeEffect(name: string): void {
		const effect = this.effects.find((e) => e.name === name);
		if (!effect) return;
		this.effects = this.effects.filter((e) => e !== effect);
		this.applyMods(effect.mods, -1);
		this.log({ type: 'animation', fighter: this.index, updates: { stats: this.stats, tint: this.tint(), opacity: this.opacity() } });
	}

	isStunned(): boolean {
		return this.effects.some((e) => e.name === 'stunned');
	}

	isInvisible(): boolean {
		return this.effects.some((e) => e.name === 'invisible');
	}

	opacity(): number {
		return this.isInvisible() ? 0.3 : 1;
	}

	/** Whether an effect like this one would be kept off the fighter (by an immunity). */
	wouldBlock(effect: StatusEffect): boolean {
		return this.items.some((i) => i.behavior.blocksEffect?.(i, effect));
	}

	/** All status effect tints blended together. */
	tint(): Tint {
		let result: Tint = [0, 0, 0, 0];
		for (const effect of this.effects) {
			if (result.every((x) => x === 0)) result = [...effect.tint];
			else result = result.map((x, i) => x / 2 + effect.tint[i] / 2) as Tint;
		}
		return result;
	}

	removeItem(item: BattleItem): void {
		this.items = this.items.filter((i) => i !== item);
	}

	// ---- movement ----

	moveByVector(dx: number, dy: number, turn = true): void {
		// bounce off the walls
		if (this.x + dx < CROWDING_DISTANCE) dx = Math.abs(dx);
		else if (this.x + dx > ARENA_SIZE - CROWDING_DISTANCE) dx = -Math.abs(dx);
		if (this.y + dy < CROWDING_DISTANCE) dy = Math.abs(dy);
		else if (this.y + dy > ARENA_SIZE - CROWDING_DISTANCE) dy = -Math.abs(dy);
		this.x += dx;
		this.y += dy;
		this.fight.uncrowd(this);
		this.keepTethered();
		this.stillTime = 0;

		const cycle = [Pose.Stationary1, Pose.WalkingStart1, Pose.Walking1, Pose.Stationary2, Pose.WalkingStart2, Pose.Walking2];
		const i = cycle.indexOf(this.pose);
		this.pose = cycle[(i + 1) % cycle.length];

		const updates: Partial<{ x: number; y: number; rotation: number; facing: number }> = {
			x: round2(this.x),
			y: round2(this.y),
			rotation: this.pose
		};
		if (turn && Math.abs(dx) > EPSILON) {
			this.facing = dx > 0 ? -1 : 1;
			updates.facing = this.facing;
		}
		this.log({ type: 'animation', fighter: this.index, updates });
	}

	/** Pulls the fighter back to the edge of where they're tethered to, if they've strayed. */
	keepTethered(): void {
		const t = this.tether;
		if (!t) return;
		const distance = Math.hypot(this.x - t.x, this.y - t.y);
		if (distance <= t.radius) return;
		this.x = t.x + ((this.x - t.x) * t.radius) / distance;
		this.y = t.y + ((this.y - t.y) * t.radius) / distance;
	}

	private faceTowards(target: BattleFighter): void {
		const facing = target.x > this.x ? -1 : 1;
		if (facing !== this.facing) {
			this.facing = facing;
			this.log({ type: 'animation', fighter: this.index, updates: { facing } });
		}
	}

	private moveTowards(target: BattleFighter): void {
		const distance = Math.max(
			Math.min(this.metersPerSecond() * TICK_LENGTH, this.distanceTo(target) - CROWDING_DISTANCE),
			0
		);
		if (distance <= 0) return;
		const [dx, dy] = scaleVector(target.x - this.x, target.y - this.y, distance);
		this.moveByVector(dx, dy);
	}

	/**
	 * Backs away from all enemies at once, or just `from` (closer ones count for more), drifting
	 * toward the middle of the arena so nobody gets pinned against a wall.
	 */
	private retreat(from = this.enemies()): void {
		let awayX = 0;
		let awayY = 0;
		for (const e of from) {
			const distance = Math.max(this.distanceTo(e), 1);
			awayX += (this.x - e.x) / (distance * distance);
			awayY += (this.y - e.y) / (distance * distance);
		}
		const [x, y] = scaleVector(awayX, awayY, 1);
		const middle = ARENA_SIZE / 2;
		const [dx, dy] = scaleVector(
			x + (RETREAT_CENTERING * (middle - this.x)) / middle,
			y + (RETREAT_CENTERING * (middle - this.y)) / middle,
			this.metersPerSecond() * TICK_LENGTH
		);
		this.moveByVector(dx, dy, false);
	}

	log(event: FightEvent, ticksAgo = 0): void {
		this.fight.log(event, ticksAgo);
	}
}

export function scaleVector(x: number, y: number, magnitude: number): [number, number] {
	const current = Math.max(Math.hypot(x, y), EPSILON);
	return [(x / current) * magnitude, (y / current) * magnitude];
}

export function round2(n: number): number {
	return Math.round(n * 100) / 100;
}
