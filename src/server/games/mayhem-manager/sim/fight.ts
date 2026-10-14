import type { FightEvent, Fighter, FighterVisual, TeamId } from '../../../../lib/games/mayhem-manager/types.js';
import type { Rng } from '../rng.js';
import { ARENA_SIZE, CROWDING_DISTANCE, MAX_FIGHT_SECONDS, TICK_LENGTH } from './constants.js';
import { roundStats } from '../public.js';
import { BattleFighter, round2, scaleVector } from './fighter.js';

export interface Combatant {
	fighter: Fighter;
	/** Equipment catalog keys. */
	equipment: string[];
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
}

export class Fight {
	readonly rng: Rng;
	readonly fighters: BattleFighter[] = [];
	readonly ticks: FightEvent[][] = [];
	private readonly logging: boolean;
	private tickCount = 0;

	constructor(rng: Rng, combatants: Combatant[], logging: boolean) {
		this.rng = rng;
		this.logging = logging;
		// alternate teams so neither side always spawns (and acts) first
		const byTeam = new Map<TeamId, Combatant[]>();
		for (const c of combatants) byTeam.set(c.team, [...(byTeam.get(c.team) ?? []), c]);
		const queues = [...byTeam.values()].map((q) => rng.shuffle(q.slice()));
		while (queues.some((q) => q.length > 0)) {
			for (const q of queues) {
				const c = q.shift();
				if (c) this.fighters.push(new BattleFighter(this, c.fighter, c.equipment, c.team));
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
				f.x = side === 0 ? 22 : ARENA_SIZE - 22;
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
		for (const f of this.fighters) f.upkeep();
		for (const f of this.rng.shuffle(this.fighters.slice())) f.act();
	}

	private newTick(): void {
		this.tickCount++;
		if (this.logging) this.ticks.push([]);
	}

	private teamsStanding(): TeamId[] {
		return [...new Set(this.fighters.filter((f) => f.hp > 0).map((f) => f.team))];
	}

	private isOver(): boolean {
		return this.teamsStanding().length <= 1 || this.tickCount * TICK_LENGTH >= MAX_FIGHT_SECONDS;
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
		for (const f of this.fighters) {
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
			winner: ranked[0],
			standing,
			fighters: this.fighters.map((f) => ({
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

export function simulateFight(rng: Rng, combatants: Combatant[], logging = true): FightOutcome {
	const fight = new Fight(rng, combatants, logging);
	fight.simulate();
	return fight.outcome();
}
