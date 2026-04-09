import { Container, Graphics, Text } from 'pixi.js';
import type { Application } from 'pixi.js';
import {
	VIRTUAL_W,
	VIRTUAL_H,
	PLATFORM_W,
	PLATFORM_H,
	PLATFORM_Y,
	PLAYER_SIZE,
	GRAVITY_FREE,
	GRAVITY_HELD,
	JUMP_VELOCITY,
	MOVE_SPEED,
	SCONE_RADIUS,
	SCONE_GRAVITY,
	MAX_THROW_SPEED,
	TARGET_RADIUS,
	TARGET_SHRINK_RATE,
	TARGET_SPAWN_INTERVAL,
	HEALTH_MAX,
	HEALTH_DRAIN_RATE,
	HEALTH_DRAIN_RATE_SLOMO,
	HEALTH_FROM_BIRD,
	HEALTH_BAR_HEIGHT,
	SLOMO_FACTOR,
	BEE_SIZE,
	BEE_SPEED,
	BEE_SPAWN_INTERVAL,
	BEE_Y_MIN,
	BEE_Y_MAX,
	COLOR_PLATFORM,
	COLOR_PLAYER,
	COLOR_SCONE,
	COLOR_TRAJECTORY,
	COLOR_TARGET,
	COLOR_LABEL,
	COLOR_HEALTH_HIGH,
	COLOR_HEALTH_LOW,
	COLOR_BEE,
} from '../config.js';

const TRI_TOP_OFFSET    = (PLAYER_SIZE * 2) / 3;
const TRI_BOTTOM_OFFSET = PLAYER_SIZE / 3;

const PLATFORM_LEFT  = VIRTUAL_W / 2 - PLATFORM_W / 2;
const PLATFORM_RIGHT = VIRTUAL_W / 2 + PLATFORM_W / 2;

const PHASE2_TARGET_POSITIONS = [
	{ x: 480,  y: 480 },
	{ x: 960,  y: 320 },
	{ x: 1440, y: 480 },
];

const SHRINK_PER_FRAME             = TARGET_SHRINK_RATE / 60;
const HEALTH_DRAIN_PER_FRAME       = HEALTH_DRAIN_RATE / 60;
const HEALTH_DRAIN_SLOMO_PER_FRAME = HEALTH_DRAIN_RATE_SLOMO / 60;

function lerpColor(a: number, b: number, t: number): number {
	const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
	const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
	return (
		(Math.round(ar + (br - ar) * t) << 16) |
		(Math.round(ag + (bg - ag) * t) << 8) |
		 Math.round(ab + (bb - ab) * t)
	);
}

interface Scone {
	x: number;
	y: number;
	angle: number;
	speed: number;
	accGravity: number;
	hits: number;
	gfx: Graphics;
}

interface Target {
	x: number;
	y: number;
	rawRadius: number;
	displayRadius: number;
	shrinks: boolean;
	gfx: Graphics;
}

interface Bee {
	x: number;
	y: number;
	vx: number;
	gfx: Graphics;
}

export class Tutorial extends Container {
	private app: Application;
	private player: Graphics;
	private trajectoryGfx: Graphics;
	private healthBarGfx: Graphics;
	private label1: Text;
	private label2: Text;

	// Player state
	private px = 0;
	private py = 0;
	private vx = 0;
	private vy = 0;
	private jumps = 2;

	// Throwing/aiming — virtual coords for angle, raw client px for speed
	private aiming = false;
	private aimStartVX = 0;
	private aimStartVY = 0;
	private aimCurrentVX = 0;
	private aimCurrentVY = 0;
	private aimStartRawX = 0;
	private aimStartRawY = 0;
	private aimCurrentRawX = 0;
	private aimCurrentRawY = 0;
	private scones: Scone[] = [];
	private targets: Target[] = [];
	private bees: Bee[] = [];

	// Time scale (slo-mo)
	private timeScale = 1.0;
	private slomo = false;
	private hasEverEnteredSlomo = false;

	// Health
	private health = HEALTH_MAX;

	// Phase progression
	private phase = 1;
	private hasDoubleJumped = false;
	private hasMovedLaterally = false;
	private multiBirdScone = false;
	private phase2Countdown:  number | null = null;
	private phase3Countdown:  number | null = null;
	private phase4Countdown:  number | null = null;
	private phase5Countdown:  number | null = null;
	private phase3SpawnTimer  = 0;
	private beeSpawnTimer     = 0;
	private phase5TextTimer:  number | null = null; // counts to 300 for "press E" text

	private keys = new Set<string>();
	private wJustPressed = false;
	private aTimestamp = 0;
	private dTimestamp = 0;

	private tickerFn: () => void;
	private keydownFn: (e: KeyboardEvent) => void;
	private keyupFn:   (e: KeyboardEvent) => void;
	private mousedownFn: (e: MouseEvent) => void;
	private mousemoveFn: (e: MouseEvent) => void;
	private mouseupFn:   (e: MouseEvent) => void;
	private contextmenuFn: (e: MouseEvent) => void;

	constructor(app: Application) {
		super();
		this.app = app;

		// ── Platform ─────────────────────────────────────────────────────────
		const platform = new Graphics();
		platform.rect(PLATFORM_LEFT, PLATFORM_Y, PLATFORM_W, PLATFORM_H).fill(COLOR_PLATFORM);
		this.addChild(platform);

		// ── Labels ───────────────────────────────────────────────────────────
		this.label1 = new Text({
			text: 'Use WASD to move',
			style: { fontFamily: 'Helvetica', fontSize: 60, fill: COLOR_LABEL },
		});
		this.label1.anchor.set(0.5, 0.5);
		this.label1.position.set(VIRTUAL_W / 2, VIRTUAL_H / 2 - 180);
		this.addChild(this.label1);

		this.label2 = new Text({
			text: 'Press W twice to double jump',
			style: { fontFamily: 'Helvetica', fontSize: 60, fill: COLOR_LABEL },
		});
		this.label2.anchor.set(0.5, 0.5);
		this.label2.position.set(VIRTUAL_W / 2, VIRTUAL_H / 2 - 100);
		this.addChild(this.label2);

		// ── Player triangle ───────────────────────────────────────────────────
		this.player = new Graphics();
		this.player
			.poly([
				0,                  -TRI_TOP_OFFSET,
				-PLAYER_SIZE / 2,    TRI_BOTTOM_OFFSET,
				 PLAYER_SIZE / 2,    TRI_BOTTOM_OFFSET,
			])
			.fill(COLOR_PLAYER);
		this.addChild(this.player);

		// ── Overlays (always on top) ──────────────────────────────────────────
		this.trajectoryGfx = new Graphics();
		this.addChild(this.trajectoryGfx);

		this.healthBarGfx = new Graphics();
		this.healthBarGfx.visible = false;
		this.addChild(this.healthBarGfx);

		// ── Input ─────────────────────────────────────────────────────────────
		this.keydownFn = (e) => {
			if (e.repeat) return;
			this.keys.add(e.code);
			if (e.code === 'KeyW') this.wJustPressed = true;
			if (e.code === 'KeyA') this.aTimestamp = performance.now();
			if (e.code === 'KeyD') this.dTimestamp = performance.now();
			// KeyE reserved for ending tutorial — wired up in a future scene
		};
		this.keyupFn = (e) => this.keys.delete(e.code);

		this.mousedownFn = (e) => {
			if (e.button === 0) {
				const pos = this.toVirtual(e.clientX, e.clientY);
				this.aimStartVX    = pos.x;
				this.aimStartVY    = pos.y;
				this.aimCurrentVX  = pos.x;
				this.aimCurrentVY  = pos.y;
				this.aimStartRawX  = e.clientX;
				this.aimStartRawY  = e.clientY;
				this.aimCurrentRawX = e.clientX;
				this.aimCurrentRawY = e.clientY;
				this.aiming = true;
			} else if (e.button === 2 && this.phase >= 4) {
				this.slomo = true;
				this.hasEverEnteredSlomo = true;
			}
		};
		this.mousemoveFn = (e) => {
			if (!this.aiming) return;
			const pos = this.toVirtual(e.clientX, e.clientY);
			this.aimCurrentVX  = pos.x;
			this.aimCurrentVY  = pos.y;
			this.aimCurrentRawX = e.clientX;
			this.aimCurrentRawY = e.clientY;
		};
		this.mouseupFn = (e) => {
			if (e.button === 0 && this.aiming) {
				this.aiming = false;
				this.fireScone();
			} else if (e.button === 2) {
				if (this.slomo && this.hasEverEnteredSlomo && this.phase === 4) {
					// First slo-mo release triggers phase 5 countdown
					if (this.phase5Countdown === null) this.phase5Countdown = 60;
				}
				this.slomo = false;
			}
		};
		this.contextmenuFn = (e) => e.preventDefault();

		window.addEventListener('keydown',     this.keydownFn);
		window.addEventListener('keyup',       this.keyupFn);
		window.addEventListener('mousedown',   this.mousedownFn);
		window.addEventListener('mousemove',   this.mousemoveFn);
		window.addEventListener('mouseup',     this.mouseupFn);
		window.addEventListener('contextmenu', this.contextmenuFn);

		this.spawn();
		this.tickerFn = () => this.tick();
		app.ticker.add(this.tickerFn);
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	private toVirtual(clientX: number, clientY: number): { x: number; y: number } {
		const rect = this.app.canvas.getBoundingClientRect();
		return {
			x: (clientX - rect.left) * (VIRTUAL_W / rect.width),
			y: (clientY - rect.top)  * (VIRTUAL_H / rect.height),
		};
	}

	private getAimParams(): { angle: number; speed: number } {
		const vdx = this.aimStartVX - this.aimCurrentVX;
		const vdy = this.aimStartVY - this.aimCurrentVY;
		const rdx = this.aimStartRawX - this.aimCurrentRawX;
		const rdy = this.aimStartRawY - this.aimCurrentRawY;
		return {
			angle: Math.atan2(-vdy, vdx),
			speed: Math.min(Math.sqrt(rdx * rdx + rdy * rdy) / 20, MAX_THROW_SPEED),
		};
	}

	// ── Spawning ──────────────────────────────────────────────────────────────

	private fireScone(): void {
		const { angle, speed } = this.getAimParams();
		if (speed < 1) return;
		const gfx = new Graphics();
		gfx.circle(0, 0, SCONE_RADIUS).fill(COLOR_SCONE);
		const scone: Scone = {
			x: this.px, y: this.py - TRI_TOP_OFFSET,
			angle, speed, accGravity: 0, hits: 0, gfx,
		};
		gfx.position.set(scone.x, scone.y);
		this.addChildAt(gfx, this.children.indexOf(this.trajectoryGfx));
		this.scones.push(scone);
	}

	private addTarget(x: number, y: number, shrinks: boolean): void {
		const gfx = new Graphics();
		gfx.circle(0, 0, TARGET_RADIUS).fill(COLOR_TARGET);
		gfx.position.set(x, y);
		this.addChildAt(gfx, this.children.indexOf(this.trajectoryGfx));
		this.targets.push({ x, y, rawRadius: TARGET_RADIUS, displayRadius: TARGET_RADIUS, shrinks, gfx });
	}

	private spawnBird(): void {
		const x = 200 + Math.random() * (VIRTUAL_W - 400);
		const y = 100 + Math.random() * 700;
		this.addTarget(x, y, true);
	}

	private spawnBee(): void {
		const fromLeft = Math.random() < 0.5;
		const x = fromLeft ? -BEE_SIZE : VIRTUAL_W + BEE_SIZE;
		const y = BEE_Y_MIN + Math.random() * (BEE_Y_MAX - BEE_Y_MIN);
		const vx = fromLeft ? BEE_SPEED : -BEE_SPEED;
		const gfx = new Graphics();
		gfx.rect(-BEE_SIZE / 2, -BEE_SIZE / 2, BEE_SIZE, BEE_SIZE).fill(COLOR_BEE);
		gfx.position.set(x, y);
		this.addChildAt(gfx, this.children.indexOf(this.trajectoryGfx));
		this.bees.push({ x, y, vx, gfx });
	}

	private spawn(): void {
		this.px = VIRTUAL_W / 2;
		this.py = PLATFORM_Y - TRI_BOTTOM_OFFSET;
		this.vx = 0;
		this.vy = 0;
		this.jumps = 2;
	}

	// ── Phase transitions ─────────────────────────────────────────────────────

	private startPhase2(): void {
		this.phase = 2;
		this.label1.text = 'Click and drag to throw scones to the birds';
		this.label2.visible = false;
		for (const pos of PHASE2_TARGET_POSITIONS) this.addTarget(pos.x, pos.y, false);
	}

	private startPhase3(): void {
		this.phase = 3;
		this.label1.text = 'You can feed many birds with 1 scone';
		this.phase3SpawnTimer = TARGET_SPAWN_INTERVAL;
	}

	private startPhase4(): void {
		this.phase = 4;
		this.health = HEALTH_MAX;
		this.label1.text = 'Feed birds to replenish your health';
		this.label2.text = 'Right click to enter slo-mo';
		this.label2.visible = true;
		this.healthBarGfx.visible = true;
		this.drawHealthBar();
	}

	private startPhase5(): void {
		this.phase = 5;
		this.label1.text = "Don't touch the bees!";
		this.label2.visible = false;
		this.beeSpawnTimer = BEE_SPAWN_INTERVAL;
		this.phase5TextTimer = 0;
	}

	// ── Main tick ─────────────────────────────────────────────────────────────

	private tick(): void {
		this.timeScale = this.slomo ? SLOMO_FACTOR : 1.0;
		const ts = this.timeScale;

		const w = this.keys.has('KeyW');
		const a = this.keys.has('KeyA');
		const d = this.keys.has('KeyD');

		// ── Lateral movement ──────────────────────────────────────────────────
		if      (a && !d) this.vx = -MOVE_SPEED;
		else if (d && !a) this.vx =  MOVE_SPEED;
		else if (a &&  d) this.vx = this.aTimestamp > this.dTimestamp ? -MOVE_SPEED : MOVE_SPEED;
		else              this.vx = 0;
		if (a || d) this.hasMovedLaterally = true;

		// ── Gravity & integration ─────────────────────────────────────────────
		this.vy += (w ? GRAVITY_HELD : GRAVITY_FREE) * ts;
		this.px += this.vx * ts;
		this.py += this.vy * ts;

		// ── Platform collision ────────────────────────────────────────────────
		const playerBottom = this.py + TRI_BOTTOM_OFFSET;
		const overPlatformX = this.px >= PLATFORM_LEFT && this.px <= PLATFORM_RIGHT;
		if (this.vy >= 0 && overPlatformX && playerBottom >= PLATFORM_Y) {
			this.py = PLATFORM_Y - TRI_BOTTOM_OFFSET;
			this.vy = 0;
			if (!w) this.jumps = 2;
		}

		// ── Jump ──────────────────────────────────────────────────────────────
		if (this.wJustPressed && this.jumps > 0) {
			if (this.jumps === 1) this.hasDoubleJumped = true;
			this.vy = JUMP_VELOCITY;
			this.jumps--;
		}
		this.wJustPressed = false;

		// ── Respawn ───────────────────────────────────────────────────────────
		if (this.py > VIRTUAL_H + 200) this.spawn();

		this.player.position.set(this.px, this.py);

		// ── Phase countdowns ──────────────────────────────────────────────────
		if (this.phase === 1 && this.hasDoubleJumped && this.hasMovedLaterally) {
			if (this.phase2Countdown === null) this.phase2Countdown = 120;
			else if (--this.phase2Countdown <= 0) this.startPhase2();
		}
		if (this.phase === 2 && this.targets.length === 0) {
			if (this.phase3Countdown === null) this.phase3Countdown = 60;
			else if (--this.phase3Countdown <= 0) this.startPhase3();
		}
		if (this.phase === 3 && this.multiBirdScone) {
			if (this.phase4Countdown === null) this.phase4Countdown = 60;
			else if (--this.phase4Countdown <= 0) this.startPhase4();
		}
		if (this.phase === 4 && this.phase5Countdown !== null) {
			if (--this.phase5Countdown <= 0) this.startPhase5();
		}

		// ── Periodic spawning ─────────────────────────────────────────────────
		if (this.phase >= 3) {
			if (++this.phase3SpawnTimer >= TARGET_SPAWN_INTERVAL) {
				this.phase3SpawnTimer = 0;
				this.spawnBird();
			}
		}
		if (this.phase >= 5) {
			if (++this.beeSpawnTimer >= BEE_SPAWN_INTERVAL) {
				this.beeSpawnTimer = 0;
				this.spawnBee();
			}
		}

		// ── Health drain ──────────────────────────────────────────────────────
		if (this.phase >= 4) {
			const drain = this.slomo ? HEALTH_DRAIN_SLOMO_PER_FRAME : HEALTH_DRAIN_PER_FRAME;
			this.health = Math.max(0, this.health - drain);
			if (this.health <= 0) this.resetHealth();
			this.drawHealthBar();
		}

		// ── Phase 5 "press E" text timer ──────────────────────────────────────
		if (this.phase === 5 && this.phase5TextTimer !== null) {
			if (++this.phase5TextTimer >= 300) {
				this.phase5TextTimer = null;
				this.label1.text = 'Press E to end the tutorial';
			}
		}

		// ── Update everything ─────────────────────────────────────────────────
		this.updateTargets(ts);
		this.updateScones(ts);
		this.updateBees(ts);
		this.drawTrajectory();
	}

	// ── Updates ───────────────────────────────────────────────────────────────

	private updateTargets(ts: number): void {
		const dead: Target[] = [];
		for (const target of this.targets) {
			if (target.shrinks) {
				target.rawRadius -= SHRINK_PER_FRAME * ts;
				target.displayRadius += (target.rawRadius - target.displayRadius) * 0.15;
				if (target.rawRadius <= 0) { dead.push(target); continue; }
				target.gfx.clear().circle(0, 0, target.displayRadius).fill(COLOR_TARGET);
			}
		}
		for (const t of dead) this.removeChild(t.gfx);
		this.targets = this.targets.filter(t => !dead.includes(t));
	}

	private updateScones(ts: number): void {
		const dead: Scone[] = [];
		for (const scone of this.scones) {
			scone.accGravity += SCONE_GRAVITY * ts;
			scone.x += Math.cos(scone.angle) * scone.speed * ts;
			scone.y += (-Math.sin(scone.angle) * scone.speed + scone.accGravity) * ts;
			scone.gfx.position.set(scone.x, scone.y);

			if (scone.x < -100 || scone.x > VIRTUAL_W + 100 || scone.y > VIRTUAL_H + 100) {
				dead.push(scone); continue;
			}
			for (const target of [...this.targets]) {
				const dx = scone.x - target.x, dy = scone.y - target.y;
				if (Math.sqrt(dx * dx + dy * dy) < SCONE_RADIUS + target.displayRadius) {
					scone.hits++;
					if (scone.hits >= 2) this.multiBirdScone = true;
					if (this.phase >= 4) this.health = Math.min(HEALTH_MAX, this.health + HEALTH_FROM_BIRD);
					this.removeChild(target.gfx);
					this.targets = this.targets.filter(t => t !== target);
				}
			}
		}
		for (const s of dead) this.removeChild(s.gfx);
		this.scones = this.scones.filter(s => !dead.includes(s));
	}

	private updateBees(ts: number): void {
		const dead: Bee[] = [];
		for (const bee of this.bees) {
			bee.x += bee.vx * ts;
			bee.gfx.position.set(bee.x, bee.y);

			if (bee.x < -BEE_SIZE * 2 || bee.x > VIRTUAL_W + BEE_SIZE * 2) {
				dead.push(bee); continue;
			}

			// AABB collision with player bounding box
			if (
				bee.x - BEE_SIZE / 2 < this.px + PLAYER_SIZE / 2 &&
				bee.x + BEE_SIZE / 2 > this.px - PLAYER_SIZE / 2 &&
				bee.y - BEE_SIZE / 2 < this.py + TRI_BOTTOM_OFFSET &&
				bee.y + BEE_SIZE / 2 > this.py - TRI_TOP_OFFSET
			) {
				this.health = Math.max(0, this.health / 2);
				dead.push(bee);
				if (this.health <= 0) this.resetHealth();
			}
		}
		for (const b of dead) this.removeChild(b.gfx);
		this.bees = this.bees.filter(b => !dead.includes(b));
	}

	private resetHealth(): void {
		for (const t of this.targets) this.removeChild(t.gfx);
		for (const s of this.scones)  this.removeChild(s.gfx);
		for (const b of this.bees)    this.removeChild(b.gfx);
		this.targets = [];
		this.scones  = [];
		this.bees    = [];
		this.health  = HEALTH_MAX;
		this.phase3SpawnTimer = TARGET_SPAWN_INTERVAL;
		this.beeSpawnTimer    = BEE_SPAWN_INTERVAL;
		this.spawn();
	}

	// ── Drawing ───────────────────────────────────────────────────────────────

	private drawHealthBar(): void {
		const ratio = this.health / HEALTH_MAX;
		const barW  = VIRTUAL_W * ratio;
		const barX  = (VIRTUAL_W - barW) / 2;
		const color = lerpColor(COLOR_HEALTH_LOW, COLOR_HEALTH_HIGH, ratio);
		this.healthBarGfx.clear().rect(barX, 0, barW, HEALTH_BAR_HEIGHT).fill(color);
	}

	private drawTrajectory(): void {
		this.trajectoryGfx.clear();
		if (!this.aiming) return;
		const { angle, speed } = this.getAimParams();
		if (speed < 1) return;
		const startX = this.px, startY = this.py - TRI_TOP_OFFSET;
		const tMax = speed * 3;
		for (let i = 0; i < 36; i++) {
			const t = (tMax * i) / 36;
			const x = startX + Math.cos(angle) * speed * t;
			const y = startY + (-Math.sin(angle) * speed * t + 0.5 * SCONE_GRAVITY * t * t);
			if (x >= 0 && x <= VIRTUAL_W && y >= 0 && y <= VIRTUAL_H) {
				this.trajectoryGfx.circle(x, y, 3).fill(COLOR_TRAJECTORY);
			}
		}
	}

	// ── Cleanup ───────────────────────────────────────────────────────────────

	cleanup(): void {
		this.app.ticker.remove(this.tickerFn);
		window.removeEventListener('keydown',     this.keydownFn);
		window.removeEventListener('keyup',       this.keyupFn);
		window.removeEventListener('mousedown',   this.mousedownFn);
		window.removeEventListener('mousemove',   this.mousemoveFn);
		window.removeEventListener('mouseup',     this.mouseupFn);
		window.removeEventListener('contextmenu', this.contextmenuFn);
	}
}
