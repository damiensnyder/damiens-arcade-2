import type { FightEvent, Fighter, FighterVisual, ItemTotals, TeamId } from '../../../../lib/games/mayhem-manager/types.js';
import type { Rng } from '../rng.js';
import { ARENA_SIZE, START_INSET, CROWDING_DISTANCE, MAX_FIGHT_SECONDS, OVERTIME_INTERVAL, OVERTIME_START, OVERTIME_TOUGHNESS_LOSS, TICK_LENGTH } from './constants.js';
import { roundStats } from '../public.js';
import { BattleFighter, round2, scaleVector, type BattleItem } from './fighter.js';

export interface Combatant {
	fighter: Fighter;
	/** Equipment catalog keys. */
	equipment: string[];
	/** The equipment's IDs, in the same order, to credit each item with what it does. */
	equipmentIds?: number[];
	/** Damage each piece has gained for good (see Equipment.growth), in the same order. */
	equipmentGrowth?: number[];
	team: TeamId;
}

export interface FighterOutcome {
	fighterId: number;
	name: string;
	team: TeamId;
	hp: number;
	standing: boolean;
	dmgDealt: number;
	dmgTaken: number;
	kos: number;
	kod: number;
}

export interface FightOutcome {
	/** Empty unless the fight was simulated with logging on. */
	ticks: FightEvent[][];
	winner: TeamId;
	standing: Map<TeamId, number>;
	fighters: FighterOutcome[];
	/** How much each team's money changed during the fight (from looting and the like). */
	moneyChange: Map<TeamId, number>;
	/** What each piece of equipment did, for those that did something. */
	items: (ItemTotals & { equipmentId: number })[];
	/** Damage each piece of equipment gained for good during the fight, for those that did. */
	growth: Map<number, number>;
}

export class Fight {
	readonly rng: Rng;
	readonly fighters: BattleFighter[] = [];
	readonly ticks: FightEvent[][] = [];
	private readonly logging: boolean;
	private tickCount = 0;
	/** Ticks since the fight started (after everyone spawned in). */
	private fightTicks = 0;
	private readonly money: Map<TeamId, number>;
	private readonly moneyChange = new Map<TeamId, number>();
	private readonly itemTotals = new Map<number, ItemTotals>();
	private readonly growth = new Map<number, number>();

	constructor(rng: Rng, combatants: Combatant[], logging: boolean, money = new Map<TeamId, number>()) {
		this.rng = rng;
		this.logging = logging;
		this.money = new Map(money);
		// alternate teams so neither side always spawns (and acts) first
		const byTeam = new Map<TeamId, Combatant[]>();
		for (const c of combatants) byTeam.set(c.team, [...(byTeam.get(c.team) ?? []), c]);
		const queues = [...byTeam.values()].map((q) => rng.shuffle(q.slice()));
		while (queues.some((q) => q.length > 0)) {
			for (const q of queues) {
				const c = q.shift();
				if (c) this.fighters.push(new BattleFighter(this, c.fighter, c.equipment, c.team, c.equipmentIds, null, c.equipmentGrowth));
			}
		}
		this.fighters.forEach((f, i) => (f.index = i));
	}

	simulate(): void {
		this.placeFighters();
		for (const f of this.fighters) {
			for (const item of f.items) {
				if (item.kind === 'equipment' || item.kind === 'ability') {
					const mods = item.behavior.statMods?.(item.attuned);
					if (mods) f.changeStats(mods);
				}
			}
		}
		for (const f of this.fighters) {
			for (const item of [...f.items]) item.behavior.onFightStart?.(item);
		}
		while (!this.isOver()) this.doTick();
	}

	private placeFighters(): void {
		const teams = [...new Set(this.fighters.map((f) => f.team))];
		for (const f of this.fighters) {
			const side = teams.indexOf(f.team);
			const squad = this.fighters.filter((g) => g.team === f.team);
			const slot = squad.indexOf(f);
			if (teams.length === 2) {
				// two lines facing each other
				f.x = side === 0 ? START_INSET : ARENA_SIZE - START_INSET;
				f.y = ((slot + 1) * ARENA_SIZE) / (squad.length + 1);
				f.facing = side === 0 ? -1 : 1;
			} else {
				const angle = (2 * Math.PI * f.index) / this.fighters.length;
				f.x = ARENA_SIZE / 2 - 35 * Math.cos(angle);
				f.y = ARENA_SIZE / 2 + 35 * Math.sin(angle);
			}
		}

		// spawn one at a time, then pause before the fight starts
		const gap = 1 + Math.floor(11 / this.fighters.length);
		for (const f of this.fighters) {
			this.newTick();
			this.log({ type: 'spawn', fighter: this.visualOf(f) });
			this.log({ type: 'particle', fighter: f.index, img: '/mm/charge.png' });
			for (let i = 0; i < gap; i++) this.newTick();
		}
		for (let i = 0; i < 4; i++) this.newTick();
	}

	private visualOf(f: BattleFighter): FighterVisual {
		return {
			name: f.name,
			fighterId: f.fighterId,
			team: f.team,
			look: f.look,
			equipment: f.wornKeys(),
			stats: { ...f.stats },
			hp: f.hp,
			x: round2(f.x),
			y: round2(f.y),
			facing: f.facing,
			rotation: f.pose,
			tint: [0, 0, 0, 0],
			flash: 0
		};
	}

	private doTick(): void {
		this.newTick();
		this.fightTicks++;
		this.overtime();
		for (const f of this.fighters) f.upkeep();
		for (const f of this.rng.shuffle(this.fighters.slice())) f.act();
	}

	/** Past OVERTIME_START, everyone standing loses some toughness every OVERTIME_INTERVAL seconds. */
	private overtime(): void {
		const seconds = this.fightTicks * TICK_LENGTH;
		const ticksPerInterval = Math.round(OVERTIME_INTERVAL / TICK_LENGTH);
		if (seconds < OVERTIME_START - 1e-6 || this.fightTicks % ticksPerInterval !== 0) return;
		for (const f of this.fighters) {
			if (f.hp > 0 && !f.summoner) f.changeStats({ toughness: -OVERTIME_TOUGHNESS_LOSS });
		}
	}

	/**
	 * Summons a decoy next to `owner`: a copy of them with no stats or equipment that doesn't move
	 * or attack, but that enemies take for the real thing.
	 */
	summonDecoy(owner: BattleFighter, hp: number): BattleFighter {
		const fighter: Fighter = {
			id: -1 - owner.fighterId,
			name: owner.name,
			age: 0,
			stats: { strength: 0, accuracy: 0, energy: 0, speed: 0, toughness: 0 },
			look: owner.look,
			ability: 'noAbilities',
			attunements: [],
			contractYears: 0
		};
		const decoy = new BattleFighter(this, fighter, [], owner.team, [], owner);
		decoy.index = this.fighters.length;
		decoy.hp = hp;
		decoy.x = owner.x;
		decoy.y = Math.min(owner.y + 2 * CROWDING_DISTANCE, ARENA_SIZE - CROWDING_DISTANCE);
		decoy.facing = owner.facing;
		this.fighters.push(decoy);
		this.uncrowd(decoy);
		this.log({ type: 'spawn', fighter: { ...this.visualOf(decoy), summon: true } });
		this.log({ type: 'particle', fighter: decoy.index, img: '/mm/charge.png' });
		return decoy;
	}

	private newTick(): void {
		this.tickCount++;
		if (this.logging) this.ticks.push([]);
	}

	private teamsStanding(): TeamId[] {
		return [...new Set(this.fighters.filter((f) => f.hp > 0 && !f.summoner).map((f) => f.team))];
	}

	private isOver(): boolean {
		return this.teamsStanding().length <= 1 || this.tickCount * TICK_LENGTH >= MAX_FIGHT_SECONDS;
	}

	moneyOf(team: TeamId): number {
		return this.money.get(team) ?? 0;
	}

	/** Moves up to `amount` dollars from one team (or from nowhere, if null) to another. Returns how much moved. */
	transferMoney(from: TeamId | null, to: TeamId, amount: number): number {
		const moved = from === null ? amount : Math.min(amount, this.moneyOf(from));
		if (moved <= 0) return 0;
		if (from !== null) {
			this.money.set(from, this.moneyOf(from) - moved);
			this.moneyChange.set(from, (this.moneyChange.get(from) ?? 0) - moved);
		}
		this.money.set(to, this.moneyOf(to) + moved);
		this.moneyChange.set(to, (this.moneyChange.get(to) ?? 0) + moved);
		return moved;
	}

	/** Adds to an item's totals, if it's a piece of the team's equipment. */
	credit(item: BattleItem | undefined, stat: keyof ItemTotals, amount: number): void {
		if (item?.equipmentId === undefined || amount <= 0) return;
		let totals = this.itemTotals.get(item.equipmentId);
		if (!totals) {
			totals = { dmgDealt: 0, hpHealed: 0, dmgPrevented: 0, moneyEarned: 0 };
			this.itemTotals.set(item.equipmentId, totals);
		}
		totals[stat] += amount;
	}

	/** Makes an item permanently stronger, if it's a piece of the team's equipment. */
	grow(item: BattleItem, amount: number): void {
		item.growth += amount;
		if (item.equipmentId !== undefined) this.growth.set(item.equipmentId, (this.growth.get(item.equipmentId) ?? 0) + amount);
	}

	/** Runs knockout effects: the victim's own (like shrapnel), the attacker's, then teammates' (like a halo). */
	knockedOut(victim: BattleFighter, by: BattleFighter): void {
		for (const item of [...victim.items]) item.behavior.onKnockedOut?.(item, by);
		if (by.team !== victim.team) {
			for (const item of [...by.items]) item.behavior.onKo?.(item, victim);
		}
		for (const mate of this.fighters) {
			if (mate === victim || mate.team !== victim.team || mate.hp <= 0 || mate.summoner) continue;
			for (const item of [...mate.items]) {
				if (victim.hp > 0) return;
				item.behavior.onTeammateKnockedOut?.(item, victim);
			}
		}
	}

	/** Records an event in the current tick (or an earlier one), merging animation updates per fighter. */
	log(event: FightEvent, ticksAgo = 0): void {
		if (!this.logging || this.ticks.length === 0) return;
		const tick = this.ticks[Math.max(this.ticks.length - 1 - ticksAgo, 0)];
		// fighters keep mutating, so store a snapshot rather than references to live objects
		const copy = JSON.parse(JSON.stringify(event)) as FightEvent;
		if (copy.type === 'spawn') copy.fighter.stats = roundStats(copy.fighter.stats);
		else if (copy.type === 'animation' && copy.updates.stats) copy.updates.stats = roundStats(copy.updates.stats);
		if (copy.type === 'animation') {
			const existing = tick.find((e) => e.type === 'animation' && e.fighter === copy.fighter);
			if (existing && existing.type === 'animation') {
				existing.updates = { ...existing.updates, ...copy.updates };
				return;
			}
		}
		tick.push(copy);
	}

	/** Pushes fighters apart when they get too close. */
	uncrowd(f: BattleFighter): void {
		for (const other of this.fighters) {
			if (other === f || other.hp <= 0) continue;
			const distance = f.distanceTo(other);
			if (distance > CROWDING_DISTANCE) continue;
			// crowding sideways looks worse than crowding vertically, so weight x more
			const [dx, dy] = scaleVector(2 * (f.x - other.x) || 0.01, f.y - other.y, CROWDING_DISTANCE - distance);
			f.x = Math.min(Math.max(f.x + dx, CROWDING_DISTANCE), ARENA_SIZE - CROWDING_DISTANCE);
			f.y = Math.min(Math.max(f.y + dy, CROWDING_DISTANCE), ARENA_SIZE - CROWDING_DISTANCE);
		}
	}

	outcome(): FightOutcome {
		const teams = [...new Set(this.fighters.map((f) => f.team))];
		const standing = new Map<TeamId, number>(teams.map((t) => [t, 0]));
		const hpLeft = new Map<TeamId, number>(teams.map((t) => [t, 0]));
		const fighters = this.fighters.filter((f) => !f.summoner);
		for (const f of fighters) {
			if (f.hp > 0) {
				standing.set(f.team, standing.get(f.team)! + 1);
				hpLeft.set(f.team, hpLeft.get(f.team)! + f.hp);
			}
		}
		// most fighters standing wins; then most HP left; then a coin flip
		const ranked = this.rng
			.shuffle(teams.slice())
			.sort((a, b) => standing.get(b)! - standing.get(a)! || hpLeft.get(b)! - hpLeft.get(a)!);
		return {
			ticks: this.ticks,
			moneyChange: this.moneyChange,
			growth: this.growth,
			items: [...this.itemTotals].map(([equipmentId, totals]) => ({ equipmentId, ...totals })),
			winner: ranked[0],
			standing,
			fighters: fighters.map((f) => ({
				fighterId: f.fighterId,
				name: f.name,
				team: f.team,
				hp: Math.max(f.hp, 0),
				standing: f.hp > 0,
				dmgDealt: f.dmgDealt,
				dmgTaken: f.dmgTaken,
				kos: f.kos,
				kod: f.kod
			}))
		};
	}
}

export function simulateFight(
	rng: Rng,
	combatants: Combatant[],
	logging = true,
	money?: Map<TeamId, number>
): FightOutcome {
	const fight = new Fight(rng, combatants, logging, money);
	fight.simulate();
	return fight.outcome();
}
