// Steps through a fight log tick by tick and interpolates between ticks for smooth playback.

import type { FightEvent, FighterVisual, Tint } from './types.js';

export const TICK_SECONDS = 0.2;

export type Particle =
	| { type: 'text'; x: number; y: number; text: string; color: string; opacity: number }
	| { type: 'projectile'; x: number; y: number; destX: number; destY: number; img: string; rotation: number }
	| { type: 'overlay'; fighter: number; img: string; opacity: number };

export interface Frame {
	fighters: FighterVisual[];
	particles: Particle[];
}

export class Replay {
	readonly ticks: FightEvent[][];
	tick = -1;
	private current: FighterVisual[] = [];
	private next: FighterVisual[] = [];
	private particles: Particle[] = [];
	private nextParticles: Particle[] = [];

	constructor(ticks: FightEvent[][]) {
		// linger a second after the last tick
		this.ticks = [...ticks, [], [], [], [], []];
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

		for (const event of this.ticks[this.tick]) {
			switch (event.type) {
				case 'spawn':
					this.current.push({ ...event.fighter });
					this.next.push({ ...event.fighter });
					break;
				case 'animation': {
					const f = this.next[event.fighter];
					if (f) this.next[event.fighter] = { ...f, ...event.updates };
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
				case 'particle':
					this.particles.push({ type: 'overlay', fighter: event.fighter, img: event.img, opacity: 1 });
					this.nextParticles.push({ type: 'overlay', fighter: event.fighter, img: event.img, opacity: 0.75 });
					break;
			}
		}
	}

	/** Jumps to a tick by replaying from the start. */
	seek(target: number): void {
		this.tick = -1;
		this.current = [];
		this.next = [];
		this.particles = [];
		this.nextParticles = [];
		while (this.tick < target && !this.done) this.step();
	}

	/** The scene `delta` (0–1) of the way from this tick to the next. */
	frame(delta: number): Frame {
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
		const particles: Particle[] = this.particles.map((p) => {
			if (p.type === 'projectile') return { ...p, x: lerp(p.x, p.destX, delta), y: lerp(p.y, p.destY, delta) };
			if (p.type === 'text') return { ...p, opacity: Math.max(0, p.opacity - 0.4 * delta), y: p.y - 1.5 * delta };
			return { ...p, opacity: Math.max(0, p.opacity - 0.25 * delta) };
		});
		return { fighters, particles };
	}
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}
