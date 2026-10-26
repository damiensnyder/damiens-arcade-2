// Steps through a fight log tick by tick and interpolates between ticks for smooth playback.

import type { FightEvent, FighterVisual, TeamId, Tint } from './types.js';

export const TICK_SECONDS = 0.2;

/** Seconds a chunk of lost health stays red, then seconds it takes to fade. */
const LOST_HOLD = 0.4;
const LOST_FADE = 0.6;
/** Seconds a knocked-out fighter takes to fall over. */
const TOPPLE_SECONDS = 0.4;
const BURST_SECONDS = 0.2;
/** Seconds money takes to rise off a fighter and fly to their team's score. */
const MONEY_SECONDS = 1;

export type Particle =
	| { type: 'text'; x: number; y: number; text: string; color: string; opacity: number }
	| { type: 'projectile'; x: number; y: number; destX: number; destY: number; img: string; rotation: number }
	| { type: 'overlay'; fighter: number; img: string; opacity: number }
	/** Where a hit landed. `size` is about 1 for a typical hit; `progress` goes 0–1. */
	| { type: 'burst'; x: number; y: number; size: number; spin: number; progress: number }
	/** Money on its way to the team's score; `progress` goes 0–1. */
	| { type: 'money'; x: number; y: number; team: TeamId; amount: number; progress: number };

/** How a fighter looks beyond what the fight log says. */
export interface FighterFx {
	/** Health just lost, from `lo` to `hi` HP, fading out. */
	lost: { lo: number; hi: number; opacity: number }[];
	/** 0 while standing, then 0–1 as they fall over after a knockout. */
	down: number;
	/** 0–1: how high they are in the bounce of their step. */
	hop: number;
}

export interface Frame {
	fighters: FighterVisual[];
	fx: FighterFx[];
	particles: Particle[];
	/** How much each team's money has changed, counting money in the air once it lands. */
	money: Map<TeamId, number>;
}

/** Ticks are when things start, in ticks from the start of the replay (fractions allowed). */
interface Lost {
	lo: number;
	hi: number;
	tick: number;
}
interface Burst {
	x: number;
	y: number;
	size: number;
	spin: number;
	tick: number;
}
interface Money {
	x: number;
	y: number;
	team: TeamId;
	amount: number;
	tick: number;
}

export class Replay {
	readonly ticks: FightEvent[][];
	/** Ticks in which someone was knocked out, and who. */
	readonly knockouts: { tick: number; fighters: number[] }[] = [];
	/** The knockout that ended the fight, if one did (rather than the time running out). */
	readonly finalKnockout: number | null;
	tick = -1;
	private current: FighterVisual[] = [];
	private next: FighterVisual[] = [];
	private particles: Particle[] = [];
	private nextParticles: Particle[] = [];
	private lost: Lost[][] = [];
	private downAt: (number | null)[] = [];
	private bursts: Burst[] = [];
	private flying: Money[] = [];
	private money = new Map<TeamId, number>();

	constructor(ticks: FightEvent[][]) {
		// linger a second after the last tick
		this.ticks = [...ticks, [], [], [], [], []];

		// find the knockouts ahead of time, so playback can build up to them
		const hp: number[] = [];
		const teams: TeamId[] = [];
		ticks.forEach((events, tick) => {
			const before = hp.slice();
			for (const e of events) {
				if (e.type === 'spawn') {
					hp.push(e.fighter.hp);
					// summons don't keep a team in the fight
					teams.push(e.fighter.summon ? -1 : e.fighter.team);
				} else if (e.type === 'animation' && e.updates.hp !== undefined) {
					hp[e.fighter] = e.updates.hp;
				}
			}
			const fighters = hp.flatMap((h, i) => (h <= 0 && (before[i] ?? 1) > 0 ? [i] : []));
			if (fighters.length > 0) this.knockouts.push({ tick, fighters });
		});
		const teamsStanding = new Set(teams.filter((t, i) => t >= 0 && hp[i] > 0));
		this.finalKnockout = teamsStanding.size <= 1 ? (this.knockouts.at(-1)?.tick ?? null) : null;
	}

	get length(): number {
		return this.ticks.length;
	}

	get done(): boolean {
		return this.tick >= this.ticks.length - 1;
	}

	/** Advances one tick. */
	step(): void {
		if (this.done) return;
		this.current = this.next.map((f) => ({ ...f }));
		this.particles = this.nextParticles.slice();
		// fade out lingering particles
		const carried: Particle[] = [];
		for (const p of this.nextParticles) {
			if (p.type === 'text' && p.opacity > 0.4) carried.push({ ...p, opacity: p.opacity - 0.4, y: p.y - 1.5 });
			else if (p.type === 'overlay' && p.opacity > 0.25) carried.push({ ...p, opacity: p.opacity - 0.25 });
		}
		this.nextParticles = carried;
		this.tick++;
		this.prune();

		// hits from a projectile land when it arrives
		const shots = new Set<string>();
		for (const event of this.ticks[this.tick]) {
			switch (event.type) {
				case 'spawn':
					this.current.push({ ...event.fighter });
					this.next.push({ ...event.fighter });
					this.lost.push([]);
					this.downAt.push(null);
					break;
				case 'animation': {
					const f = this.next[event.fighter];
					if (!f) break;
					const hp = event.updates.hp;
					if (hp !== undefined) this.hpChanged(event.fighter, f.hp, hp);
					this.next[event.fighter] = { ...f, ...event.updates };
					break;
				}
				case 'text': {
					const f = this.next[event.fighter];
					if (f) {
						this.nextParticles.push({ type: 'text', text: event.text, color: event.color ?? '#eee', x: f.x, y: f.y - 9, opacity: 1 });
					}
					break;
				}
				case 'projectile': {
					const from = this.current[event.fighter];
					const to = this.next[event.target];
					if (from && to) {
						shots.add(`${event.fighter}>${event.target}`);
						this.particles.push({
							type: 'projectile',
							x: from.x,
							y: from.y,
							destX: to.x,
							destY: to.y,
							img: event.img,
							rotation: (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
						});
					}
					break;
				}
				case 'hit': {
					const target = this.current[event.fighter] ?? this.next[event.fighter];
					const by = this.current[event.by] ?? this.next[event.by];
					if (!target) break;
					const shot = shots.has(`${event.by}>${event.fighter}`);
					// on the target, toward whoever hit them
					const dx = by ? by.x - target.x : 0;
					const dy = by ? by.y - target.y : 0;
					const distance = Math.hypot(dx, dy);
					const reach = distance > 0 ? Math.min(shot ? 2 : 3, distance / 2) / distance : 0;
					this.bursts.push({
						x: target.x + dx * reach,
						y: target.y + dy * reach,
						size: 0.7 + (Math.min(event.damage, 80) / 80) * 0.8,
						spin: (this.tick * 37 + event.fighter * 61) % 360,
						// melee hits land partway through the swing
						tick: this.tick + (shot ? 0.9 : by && distance < 8 ? 0.5 : 0)
					});
					break;
				}
				case 'money': {
					const f = this.next[event.fighter];
					if (!f) break;
					this.flying.push({ x: f.x, y: f.y - 9, team: f.team, amount: event.amount, tick: this.tick });
					if (event.from !== null) this.money.set(event.from, (this.money.get(event.from) ?? 0) - event.amount);
					break;
				}
				case 'particle':
					this.particles.push({ type: 'overlay', fighter: event.fighter, img: event.img, opacity: 1 });
					this.nextParticles.push({ type: 'overlay', fighter: event.fighter, img: event.img, opacity: 0.75 });
					break;
			}
		}
	}

	private hpChanged(fighter: number, before: number, after: number): void {
		const lost = this.lost[fighter];
		if (after < before) {
			if (before > 0) lost.push({ lo: Math.max(after, 0), hi: before, tick: this.tick });
		} else if (after > before) {
			// healing covers up what was lost
			this.lost[fighter] = lost.map((l) => ({ ...l, lo: Math.max(l.lo, after) })).filter((l) => l.lo < l.hi);
		}
		if (after <= 0 && before > 0) this.downAt[fighter] = this.tick;
		else if (after > 0) this.downAt[fighter] = null;
	}

	/** Drops effects that have run their course. */
	private prune(): void {
		const age = (tick: number) => (this.tick - tick) * TICK_SECONDS;
		this.lost = this.lost.map((list) => list.filter((l) => age(l.tick) < LOST_HOLD + LOST_FADE));
		this.bursts = this.bursts.filter((b) => age(b.tick) < BURST_SECONDS);
		this.flying = this.flying.filter((m) => {
			if (age(m.tick) < MONEY_SECONDS) return true;
			this.money.set(m.team, (this.money.get(m.team) ?? 0) + m.amount);
			return false;
		});
	}

	/** Jumps to a tick by replaying from the start. */
	seek(target: number): void {
		this.tick = -1;
		this.current = [];
		this.next = [];
		this.particles = [];
		this.nextParticles = [];
		this.lost = [];
		this.downAt = [];
		this.bursts = [];
		this.flying = [];
		this.money = new Map();
		while (this.tick < target && !this.done) this.step();
	}

	/** The scene `delta` (0–1) of the way from this tick to the next. */
	frame(delta: number): Frame {
		const now = this.tick + delta;
		const age = (tick: number) => (now - tick) * TICK_SECONDS;
		const fighters = this.current.map((a, i) => {
			const b = this.next[i] ?? a;
			return {
				...a,
				hp: b.hp,
				stats: b.stats,
				equipment: b.equipment,
				x: lerp(a.x, b.x, delta),
				y: lerp(a.y, b.y, delta),
				facing: lerp(a.facing, b.facing, delta),
				rotation: lerp(a.rotation, b.rotation, delta),
				tint: a.tint.every((x) => x === 0) ? b.tint : (a.tint.map((x, j) => lerp(x, b.tint[j], delta)) as Tint),
				// flashes start suddenly and fade smoothly
				flash: lerp(a.flash, Math.min(a.flash, b.flash), delta)
			};
		});
		const fx: FighterFx[] = this.current.map((a, i) => {
			const b = this.next[i] ?? a;
			const downAt = this.downAt[i];
			const moving = b.hp > 0 && Math.abs(b.x - a.x) + Math.abs(b.y - a.y) > 0.05;
			return {
				lost: (this.lost[i] ?? []).map((l) => ({
					lo: l.lo,
					hi: l.hi,
					opacity: clamp01(1 - (age(l.tick) - LOST_HOLD) / LOST_FADE)
				})),
				down: downAt === null || downAt === undefined ? 0 : Math.max(clamp01(age(downAt) / TOPPLE_SECONDS), 0.001),
				hop: moving ? Math.sin(Math.PI * delta) : 0
			};
		});
		const particles: Particle[] = this.particles.map((p) => {
			if (p.type === 'projectile') return { ...p, x: lerp(p.x, p.destX, delta), y: lerp(p.y, p.destY, delta) };
			if (p.type === 'text') return { ...p, opacity: Math.max(0, p.opacity - 0.4 * delta), y: p.y - 1.5 * delta };
			if (p.type === 'overlay') return { ...p, opacity: Math.max(0, p.opacity - 0.25 * delta) };
			return p;
		});
		for (const b of this.bursts) {
			const progress = age(b.tick) / BURST_SECONDS;
			if (progress >= 0 && progress < 1) particles.push({ type: 'burst', x: b.x, y: b.y, size: b.size, spin: b.spin, progress });
		}
		const money = new Map(this.money);
		for (const m of this.flying) {
			const progress = age(m.tick) / MONEY_SECONDS;
			if (progress < 1) particles.push({ type: 'money', x: m.x, y: m.y, team: m.team, amount: m.amount, progress });
			else money.set(m.team, (money.get(m.team) ?? 0) + m.amount);
		}
		return { fighters, fx, particles, money };
	}
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function clamp01(x: number): number {
	return Math.max(0, Math.min(1, x));
}
