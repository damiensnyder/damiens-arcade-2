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
	stats: Stats;
	items: BattleItem[];
	effects: StatusEffect[] = [];
	flash = 0;
	pose: number = Pose.Stationary1;

	// box score
	dmgDealt = 0;
	dmgTaken = 0;
	kos = 0;
	kod = 0;

	constructor(fight: Fight, fighter: Fighter, equipmentKeys: string[], team: TeamId) {
		this.fight = fight;
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
		this.items = [item('fists', 'fists', FISTS)];
		const ability = ABILITY_BEHAVIORS[fighter.ability];
		if (ability && Object.keys(ability).length > 0) this.items.push(item(fighter.ability, 'ability', ability));
		for (const key of equipmentKeys) {
			const behavior = EQUIPMENT_BEHAVIORS[key];
			if (fighter.ability === 'refusesUnattuned' && !fighter.attunements.includes(key)) continue;
			if (behavior) this.items.push(item(key, 'equipment', behavior));
		}
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
		return Math.max(6 - 0.4 * this.stats.energy, 1);
	}

	damageTakenMultiplier(): number {
		return Math.max(1.25 - 0.05 * this.stats.toughness, 0.5);
	}

	effectiveHp(): number {
		return Math.max(this.hp, 0) / this.damageTakenMultiplier();
	}

	cooldownReduction(): number {
		return this.items.reduce((sum, i) => sum + (i.behavior.cooldownReduction ?? 0), 0);
	}

	targetWeight(): number {
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

	teammates(): BattleFighter[] {
		return this.fight.fighters.filter((f) => f.team === this.team && f.hp > 0);
	}

	enemies(): BattleFighter[] {
		return this.fight.fighters.filter((f) => f.team !== this.team && f.hp > 0);
	}

	nearestEnemy(): BattleFighter | null {
		let best: BattleFighter | null = null;
		for (const e of this.enemies()) {
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

	/** Seconds per use of an attack, including charging. */
	private cycleTime(option: AttackOption): number {
		return Math.max(option.cooldown - this.cooldownReduction(), TICK_LENGTH) + option.charges * this.timeToCharge();
	}

	/** Damage per second against one target, before the target's toughness. */
	private rawDps(option: AttackOption): number {
		const perUse =
			option.spec.kind === 'melee'
				? option.spec.fixed
					? option.damage
					: option.damage * this.meleeDamageMultiplier(option.spec.scalesWith)
				: option.spec.kind === 'ranged'
					? option.damage * this.rangedHitChance()
					: option.damage;
		return perUse / this.cycleTime(option);
	}

	/** Roughly how much damage per second this fighter threatens. */
	danger(): number {
		let best = 0;
		const enemyCount = Math.max(this.enemies().length, 1);
		for (const option of this.attackOptions()) {
			const dps = this.rawDps(option) * (option.spec.kind === 'aoe' ? enemyCount : 1);
			best = Math.max(best, dps);
		}
		let passive = 0;
		for (const item of this.items) passive += item.behavior.passiveDanger?.(item) ?? 0;
		return best + passive;
	}

	private prefersMelee(): boolean {
		let best: AttackOption | null = null;
		for (const option of this.attackOptions()) {
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
			(effect.source ?? this).dealDamage(this, Math.ceil(effect.burn * this.damageTakenMultiplier()));
		}
		const newTint = this.tint();
		if (statsChanged || newTint.some((x, i) => x !== oldTint[i])) {
			this.log({ type: 'animation', fighter: this.index, updates: { stats: this.stats, tint: newTint } });
		}

		this.cooldown -= this.effects.some((e) => e.slow) ? TICK_LENGTH / 2 : TICK_LENGTH;
		if (this.cooldown < EPSILON) this.cooldown = 0;

		if (this.hp <= 0 || this.enemies().length === 0) return;
		for (const item of [...this.items]) item.behavior.onTick?.(item);
	}

	act(): void {
		if (this.hp <= 0) return;
		const allEnemies = this.enemies();
		if (allEnemies.length === 0) return;
		const startX = this.x;
		const startY = this.y;

		if (this.effects.some((e) => e.name === 'scared')) {
			const nearest = this.nearestEnemy();
			if (nearest) this.moveAwayFrom(nearest);
			return;
		}
		// taunted fighters can only go after whoever taunted them (area attacks still hit everyone)
		const taunter = this.effects.find((e) => e.name === 'taunted')?.source;
		const enemies = taunter && taunter.hp > 0 ? [taunter] : allEnemies;

		let bestPriority = -Infinity;
		let bestAction: (() => void) | null = null;

		for (const option of this.attackOptions()) {
			const dps = this.rawDps(option);
			if (option.spec.kind === 'aoe') {
				const timeToFirst = this.timeUntilReady(option.charges);
				const priority = allEnemies.reduce((sum, e) => sum + this.valueOfAttacking(e, dps, timeToFirst), 0);
				if (priority > bestPriority) {
					bestPriority = priority;
					bestAction = () => this.aoeAttack(option);
				}
				continue;
			}
			for (const target of enemies) {
				const timeToFirst =
					option.spec.kind === 'melee'
						? Math.max(this.timeUntilReady(option.charges), this.timeToReach(target))
						: this.timeUntilReady(option.charges);
				const priority = this.valueOfAttacking(target, dps, timeToFirst);
				if (priority > bestPriority) {
					bestPriority = priority;
					bestAction =
						option.spec.kind === 'melee' ? () => this.meleeAttack(target, option) : () => this.rangedAttack(target, option);
				}
			}
		}

		for (const item of this.items) {
			const action = item.behavior.action;
			if (!action) continue;
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
		const lead = this.timeUntilReady(option.charges) - this.timeToReach(target);
		if (this.distanceTo(target) > MELEE_RANGE && lead < 0.7) {
			this.moveTowards(target);
		} else if (lead > 0.7 && this.distanceTo(target) < MELEE_RANGE * 2) {
			// no point standing next to someone you can't hit yet
			this.moveAwayFrom(target);
		}

		if (this.distanceTo(target) <= MELEE_RANGE && this.cooldown === 0 && this.charges >= option.charges) {
			this.charges -= option.charges;
			this.setCooldown(option.cooldown);
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
		if (this.cooldown === 0 && this.charges >= option.charges) {
			this.charges -= option.charges;
			this.setCooldown(option.cooldown);
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
		} else if (this.charges < option.charges && this.cooldown === 0) {
			this.charge();
		}
	}

	private aoeAttack(option: AttackOption): void {
		this.keepAwayFromMelee();
		if (this.cooldown === 0 && this.charges >= option.charges) {
			this.charges -= option.charges;
			this.setCooldown(option.cooldown);
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

	/** Back away from the closest melee fighter who'd reach us before we can act again. */
	private keepAwayFromMelee(): void {
		let threat: BattleFighter | null = null;
		for (const e of this.enemies()) {
			if (!e.prefersMelee() || e.timeToReach(this) >= this.cooldown) continue;
			if (threat === null || this.distanceTo(e) < this.distanceTo(threat)) threat = e;
		}
		if (threat) this.moveAwayFrom(threat);
	}

	charge(): void {
		this.charges += 1;
		this.setCooldown(this.timeToCharge());
		this.log({ type: 'particle', fighter: this.index, img: '/mm/charge.png' });
	}

	private swing(start: Pose, windup: Pose): void {
		this.log({ type: 'animation', fighter: this.index, updates: { rotation: start } }, 2);
		this.log({ type: 'animation', fighter: this.index, updates: { rotation: windup } }, 1);
		this.pose = Pose.ForwardSwing;
		this.log({ type: 'animation', fighter: this.index, updates: { rotation: this.pose } });
	}

	setCooldown(seconds: number): void {
		this.cooldown = Math.max(0, seconds - this.cooldownReduction());
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
			if (item.behavior.preventHit?.(item, this, damage)) return;
		}
		this.dealDamage(target, damage, true);
		if (target.hp > 0 && knockback > 0) {
			const [dx, dy] = scaleVector(target.x - this.x, target.y - this.y, knockback);
			const cos = Math.cos(KNOCKBACK_ROTATION);
			const sin = Math.sin(KNOCKBACK_ROTATION);
			target.moveByVector(dx * cos - dy * sin, dx * sin + dy * cos, false);
		}
		for (const item of [...target.items]) item.behavior.onHitTaken?.(item, this, damage, source);
		for (const item of [...this.items]) item.behavior.onHitDealt?.(item, target, damage, source);
	}

	/** Takes HP off a target and keeps the box score. Damage is not scaled by toughness here. */
	dealDamage(target: BattleFighter, amount: number, isHit = false): void {
		if (target.hp <= 0 || amount <= 0) return;
		const dealt = Math.min(amount, target.hp);
		target.hp -= amount;
		this.dmgDealt += dealt;
		target.dmgTaken += dealt;
		if (isHit) target.flash = 1;
		target.log({
			type: 'animation',
			fighter: target.index,
			updates: isHit ? { hp: target.hp, flash: target.flash } : { hp: target.hp }
		});
		target.log({ type: 'text', fighter: target.index, text: String(amount) });
		if (isHit) target.log({ type: 'particle', fighter: target.index, img: '/mm/damage.png' });
		if (target.hp <= 0) {
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
		if (this.items.some((i) => i.behavior.blocksEffect?.(i, effect))) return;
		const existing = this.effects.find((e) => e.name === effect.name);
		if (existing) {
			existing.remaining = Math.max(existing.remaining, effect.remaining);
			return;
		}
		this.applyMods(effect.mods, 1);
		this.effects.push(effect);
		this.log({ type: 'animation', fighter: this.index, updates: { stats: this.stats, tint: this.tint() } });
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

	private moveAwayFrom(target: BattleFighter): void {
		const [dx, dy] = scaleVector(this.x - target.x, this.y - target.y, this.metersPerSecond() * TICK_LENGTH);
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
