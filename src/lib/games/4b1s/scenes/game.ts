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
	HEALTH_MAX,
	SLOMO_FACTOR,
	BEE_SIZE,
	COLOR_PLATFORM,
	COLOR_PLAYER,
	COLOR_SCONE,
	COLOR_TRAJECTORY,
	COLOR_TARGET,
	COLOR_HEALTH_HIGH,
	COLOR_HEALTH_LOW,
	COLOR_BEE,
} from '../config.js';

const TRI_TOP_OFFSET    = (PLAYER_SIZE * 2) / 3;
const TRI_BOTTOM_OFFSET = PLAYER_SIZE / 3;
const PLATFORM_LEFT     = VIRTUAL_W / 2 - PLATFORM_W / 2;
const PLATFORM_RIGHT    = VIRTUAL_W / 2 + PLATFORM_W / 2;
const SHRINK_PER_FRAME  = TARGET_SHRINK_RATE / 60;

// 2b1s game constants
const BASE_BEE_SPEED      = 20;           // px/frame at t≈0
const BEE_SPEED_GROWTH    = 1 / 8;        // additional px/frame per elapsed second
const BEE_SPAWN_Y_LOW     = 1000;         // half spawn at platform level (2b1s behaviour)
const BEE_SPAWN_Y_MIN     = 700;
const BEE_SPAWN_Y_MAX     = 1000;
const TARGET_FAR_DIST     = 800;          // px threshold for special (x2) targets
const COLOR_TARGET_SPECIAL = 0x006600;   // dark green

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
	x: number; y: number;
	angle: number; speed: number;
	accGravity: number;
	hits: number;
	gfx: Graphics;
}

interface Target {
	x: number; y: number;
	rawRadius: number; displayRadius: number;
	isSpecial: boolean;
	gfx: Graphics;
	label: Text | null;
}

interface Bee {
	x: number; y: number;
	vx: number;
	gfx: Graphics;
}

interface FloatText {
	gfx: Text;
	life: number;
	maxLife: number;
}

export class GameScene extends Container {
	private app: Application;
	private onExit: () => void;

	private player: Graphics;
	private trajectoryGfx: Graphics;
	private healthBarGfx: Graphics;
	private timerText: Text;
	private surviveText: Text;
	private fedText: Text;

	// Player state
	private px = 0;
	private py = 0;
	private vx = 0;
	private vy = 0;
	private jumps = 2;

	// Aiming
	private aiming = false;
	private aimStartVX = 0;  private aimStartVY = 0;
	private aimCurrentVX = 0; private aimCurrentVY = 0;
	private aimStartRawX = 0; private aimStartRawY = 0;
	private aimCurrentRawX = 0; private aimCurrentRawY = 0;

	// Game objects
	private scones: Scone[] = [];
	private targets: Target[] = [];
	private bees: Bee[] = [];
	private floatTexts: FloatText[] = [];

	// Time / state
	private timeScale = 1.0;
	private slomo = false;
	private elapsedSeconds = 0;
	private health = HEALTH_MAX;
	private score = 0;
	private dead = false;

	// Spawn timers (real frames)
	private beeSpawnTimer = 0;
	private birdSpawnTimer = 0;

	// Input
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

	constructor(app: Application, onExit: () => void) {
		super();
		this.app = app;
		this.onExit = onExit;

		// ── Platform ─────────────────────────────────────────────────────────
		const platform = new Graphics();
		platform.rect(PLATFORM_LEFT, PLATFORM_Y, PLATFORM_W, PLATFORM_H).fill(COLOR_PLATFORM);
		this.addChild(platform);

		// ── Player ────────────────────────────────────────────────────────────
		this.player = new Graphics();
		this.player
			.poly([0, -TRI_TOP_OFFSET, -PLAYER_SIZE / 2, TRI_BOTTOM_OFFSET, PLAYER_SIZE / 2, TRI_BOTTOM_OFFSET])
			.fill(COLOR_PLAYER);
		this.addChild(this.player);

		// ── Timer text ────────────────────────────────────────────────────────
		this.timerText = new Text({
			text: '0.0',
			style: { fontFamily: 'Helvetica', fontSize: 65, fill: 0x808080 },
		});
		this.timerText.anchor.set(0.5, 0);
		this.timerText.position.set(VIRTUAL_W / 2, 55);
		this.addChild(this.timerText);

		// ── Overlays (always on top) ──────────────────────────────────────────
		this.trajectoryGfx = new Graphics();
		this.addChild(this.trajectoryGfx);

		this.healthBarGfx = new Graphics();
		this.addChild(this.healthBarGfx);

		// ── Death screen text (hidden until death) ────────────────────────────
		this.surviveText = new Text({
			text: '',
			style: { fontFamily: 'Helvetica', fontSize: 80, fill: 0x000000 },
		});
		this.surviveText.anchor.set(0.5, 0.5);
		this.surviveText.position.set(VIRTUAL_W / 2, VIRTUAL_H / 2 - 100);
		this.surviveText.visible = false;
		this.addChild(this.surviveText);

		this.fedText = new Text({
			text: '',
			style: { fontFamily: 'Helvetica', fontSize: 60, fill: 0x000000 },
		});
		this.fedText.anchor.set(0.5, 0.5);
		this.fedText.position.set(VIRTUAL_W / 2, VIRTUAL_H / 2 + 20);
		this.fedText.visible = false;
		this.addChild(this.fedText);

		const restartText = new Text({
			text: 'PRESS R TO RESTART',
			style: { fontFamily: 'Helvetica', fontSize: 60, fill: 0x000000 },
		});
		restartText.anchor.set(0.5, 0.5);
		restartText.position.set(VIRTUAL_W / 2, VIRTUAL_H / 2 + 140);
		restartText.visible = false;
		this.addChild(restartText);

		const menuText = new Text({
			text: 'PRESS E FOR MENU',
			style: { fontFamily: 'Helvetica', fontSize: 60, fill: 0x000000 },
		});
		menuText.anchor.set(0.5, 0.5);
		menuText.position.set(VIRTUAL_W / 2, VIRTUAL_H / 2 + 220);
		menuText.visible = false;
		this.addChild(menuText);

		// Store refs so die() can show them
		const showOnDeath = [restartText, menuText];

		// ── Input ─────────────────────────────────────────────────────────────
		this.keydownFn = (e) => {
			if (e.repeat) return;
			this.keys.add(e.code);
			if (e.code === 'KeyW') this.wJustPressed = true;
			if (e.code === 'KeyA') this.aTimestamp = performance.now();
			if (e.code === 'KeyD') this.dTimestamp = performance.now();
			if (e.code === 'KeyR') this.reset();
			if (e.code === 'KeyE') this.onExit();
		};
		this.keyupFn = (e) => this.keys.delete(e.code);

		this.mousedownFn = (e) => {
			if (e.button === 0 && !this.dead) {
				const pos = this.toVirtual(e.clientX, e.clientY);
				this.aimStartVX    = pos.x; this.aimStartVY    = pos.y;
				this.aimCurrentVX  = pos.x; this.aimCurrentVY  = pos.y;
				this.aimStartRawX  = e.clientX; this.aimStartRawY  = e.clientY;
				this.aimCurrentRawX = e.clientX; this.aimCurrentRawY = e.clientY;
				this.aiming = true;
			} else if (e.button === 2 && !this.dead) {
				this.slomo = true;
			}
		};
		this.mousemoveFn = (e) => {
			if (!this.aiming) return;
			const pos = this.toVirtual(e.clientX, e.clientY);
			this.aimCurrentVX  = pos.x; this.aimCurrentVY  = pos.y;
			this.aimCurrentRawX = e.clientX; this.aimCurrentRawY = e.clientY;
		};
		this.mouseupFn = (e) => {
			if (e.button === 0 && this.aiming) {
				this.aiming = false;
				if (!this.dead) this.fireScone();
			} else if (e.button === 2) {
				this.slomo = false;
			}
		};
		this.contextmenuFn = (e) => e.preventDefault();

		// Expose showOnDeath to die() via closure
		this._showOnDeath = showOnDeath;

		window.addEventListener('keydown',     this.keydownFn);
		window.addEventListener('keyup',       this.keyupFn);
		window.addEventListener('mousedown',   this.mousedownFn);
		window.addEventListener('mousemove',   this.mousemoveFn);
		window.addEventListener('mouseup',     this.mouseupFn);
		window.addEventListener('contextmenu', this.contextmenuFn);

		this.spawn();
		this.drawHealthBar();

		this.tickerFn = () => this.tick();
		app.ticker.add(this.tickerFn);
	}

	private _showOnDeath: Text[] = [];

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

	private spawnBird(): void {
		const x = 200 + Math.random() * (VIRTUAL_W - 400);
		const y = 100 + Math.random() * 800;
		const dx = x - this.px, dy = y - this.py;
		const isSpecial = Math.sqrt(dx * dx + dy * dy) > TARGET_FAR_DIST && Math.random() < 0.67;

		const gfx = new Graphics();
		gfx.circle(0, 0, TARGET_RADIUS).fill(isSpecial ? COLOR_TARGET_SPECIAL : COLOR_TARGET);
		gfx.position.set(x, y);
		this.addChildAt(gfx, this.children.indexOf(this.trajectoryGfx));

		let label: Text | null = null;
		if (isSpecial) {
			label = new Text({
				text: 'x2',
				style: { fontFamily: 'Helvetica', fontSize: 36, fill: 0x003300 },
			});
			label.anchor.set(0.5, 0.5);
			label.position.set(x, y);
			this.addChildAt(label, this.children.indexOf(this.trajectoryGfx));
		}

		this.targets.push({ x, y, rawRadius: TARGET_RADIUS, displayRadius: TARGET_RADIUS, isSpecial, gfx, label });
	}

	private spawnBee(): void {
		const t = this.elapsedSeconds + 0.1;
		const speedMult = t * BEE_SPEED_GROWTH + BASE_BEE_SPEED;
		const fromLeft = Math.random() < 0.5;
		const x = fromLeft ? -BEE_SIZE : VIRTUAL_W + BEE_SIZE;
		const vx = fromLeft
			? (this.px / VIRTUAL_W) * speedMult
			: -((VIRTUAL_W - this.px) / VIRTUAL_W) * speedMult;
		const y = Math.random() < 0.5
			? BEE_SPAWN_Y_LOW
			: BEE_SPAWN_Y_MIN + Math.random() * (BEE_SPAWN_Y_MAX - BEE_SPAWN_Y_MIN);

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

	// ── Reset ─────────────────────────────────────────────────────────────────

	private reset(): void {
		for (const s of this.scones)  this.removeChild(s.gfx);
		for (const t of this.targets) { this.removeChild(t.gfx); if (t.label) this.removeChild(t.label); }
		for (const b of this.bees)    this.removeChild(b.gfx);
		for (const f of this.floatTexts) this.removeChild(f.gfx);

		this.scones = []; this.targets = []; this.bees = []; this.floatTexts = [];

		this.elapsedSeconds = 0;
		this.health = HEALTH_MAX;
		this.score = 0;
		this.dead = false;
		this.slomo = false;
		this.timeScale = 1.0;
		this.aiming = false;
		this.beeSpawnTimer = 0;
		this.birdSpawnTimer = 0;
		this.wJustPressed = false;

		this.timerText.text = '0.0';
		this.surviveText.visible = false;
		this.fedText.visible = false;
		for (const t of this._showOnDeath) t.visible = false;

		this.spawn();
		this.drawHealthBar();
	}

	// ── Die ───────────────────────────────────────────────────────────────────

	private die(): void {
		if (this.dead) return;
		this.dead = true;
		this.slomo = false;
		this.aiming = false;
		this.trajectoryGfx.clear();

		this.surviveText.text = `YOU SURVIVED ${this.elapsedSeconds.toFixed(1)} SECONDS`;
		this.fedText.text = `AND FED ${this.score} ${this.score === 1 ? 'BIRD' : 'BIRDS'} WITH SCONES`;
		this.surviveText.visible = true;
		this.fedText.visible = true;
		for (const t of this._showOnDeath) t.visible = true;
	}

	// ── Main tick ─────────────────────────────────────────────────────────────

	private tick(): void {
		if (this.dead) {
			this.updateFloatTexts();
			return;
		}

		this.timeScale = this.slomo ? SLOMO_FACTOR : 1.0;
		const dt = this.app.ticker.deltaTime;
		const ts = this.timeScale * dt;
		this.elapsedSeconds += ts / 60;
		const t = this.elapsedSeconds + 0.1; // offset matching 2b1s elapsed_seconds formula

		this.timerText.text = this.elapsedSeconds.toFixed(1);

		const w = this.keys.has('KeyW');
		const a = this.keys.has('KeyA');
		const d = this.keys.has('KeyD');

		// ── Lateral movement ──────────────────────────────────────────────────
		if      (a && !d) this.vx = -MOVE_SPEED;
		else if (d && !a) this.vx =  MOVE_SPEED;
		else if (a &&  d) this.vx = this.aTimestamp > this.dTimestamp ? -MOVE_SPEED : MOVE_SPEED;
		else              this.vx = 0;

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
			this.vy = JUMP_VELOCITY;
			this.jumps--;
		}
		this.wJustPressed = false;

		// ── Fall off → death ──────────────────────────────────────────────────
		if (this.py > VIRTUAL_H + 200) this.die();

		this.player.position.set(this.px, this.py);

		// ── Health drain (matches 2b1s formula) ───────────────────────────────
		// slo-mo:  (10 + elapsed/20) / 60  per real frame — no ts multiplier
		// normal:  (5  + elapsed/20) / 60  per real frame
		const drain = this.slomo
			? (10 + this.elapsedSeconds / 20) / 60 * dt
			: (5  + this.elapsedSeconds / 20) / 60 * dt;
		this.health = Math.max(0, this.health - drain);
		if (this.health <= 0) this.die();
		this.drawHealthBar();

		// ── Bee spawning (interval = 120 * t^-0.2 real frames) ───────────────
		const beeInterval = 120 * Math.pow(t, -0.2);
		if ((this.beeSpawnTimer += dt) >= beeInterval) {
			this.beeSpawnTimer = 0;
			this.spawnBee();
		}

		// ── Bird spawning (interval = 60 * t^-0.05 real frames) ──────────────
		const birdInterval = 60 * Math.pow(t, -0.05);
		if ((this.birdSpawnTimer += dt) >= birdInterval) {
			this.birdSpawnTimer = 0;
			this.spawnBird();
		}

		this.updateTargets(ts);
		this.updateScones(ts);
		this.updateBees(ts);
		this.updateFloatTexts();
		this.drawTrajectory();
	}

	// ── Updates ───────────────────────────────────────────────────────────────

	private updateTargets(ts: number): void {
		const dead: Target[] = [];
		for (const target of this.targets) {
			target.rawRadius -= SHRINK_PER_FRAME * ts;
			target.displayRadius += (target.rawRadius - target.displayRadius) * 0.15;
			if (target.rawRadius <= 0) { dead.push(target); continue; }
			const color = target.isSpecial ? COLOR_TARGET_SPECIAL : COLOR_TARGET;
			target.gfx.clear().circle(0, 0, target.displayRadius).fill(color);
			if (target.label) target.label.scale.set(target.displayRadius / TARGET_RADIUS);
		}
		for (const t of dead) {
			this.removeChild(t.gfx);
			if (t.label) this.removeChild(t.label);
		}
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
					if (target.isSpecial) scone.hits++; // x2 bonus

					const healthGain = 5 * Math.pow(2, scone.hits - 1);
					this.health = Math.min(HEALTH_MAX, this.health + healthGain);
					this.score++;

					// Floating score text
					const label = scone.hits < 2 ? 'bird' : 'birds';
					const fontSize = Math.min(48 * scone.hits, 200);
					const ft = new Text({
						text: label,
						style: { fontFamily: 'Helvetica', fontSize, fill: 0x000000 },
					});
					ft.anchor.set(0.5, 0.5);
					ft.position.set(target.x, target.y);
					this.addChild(ft);
					this.floatTexts.push({ gfx: ft, life: 60, maxLife: 60 });

					this.removeChild(target.gfx);
					if (target.label) this.removeChild(target.label);
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

			// AABB with player
			if (
				bee.x - BEE_SIZE / 2 < this.px + PLAYER_SIZE / 2 &&
				bee.x + BEE_SIZE / 2 > this.px - PLAYER_SIZE / 2 &&
				bee.y - BEE_SIZE / 2 < this.py + TRI_BOTTOM_OFFSET &&
				bee.y + BEE_SIZE / 2 > this.py - TRI_TOP_OFFSET
			) {
				this.health = Math.max(0, this.health / 2);
				dead.push(bee);
				if (this.health <= 0) this.die();
			}
		}
		for (const b of dead) this.removeChild(b.gfx);
		this.bees = this.bees.filter(b => !dead.includes(b));
	}

	private updateFloatTexts(): void {
		const dead: FloatText[] = [];
		const dt = this.app.ticker.deltaTime;
		for (const ft of this.floatTexts) {
			ft.life -= dt;
			const progress = ft.life / ft.maxLife;
			ft.gfx.scale.set(progress);
			ft.gfx.alpha = progress;
			if (ft.life <= 0) dead.push(ft);
		}
		for (const ft of dead) this.removeChild(ft.gfx);
		this.floatTexts = this.floatTexts.filter(f => !dead.includes(f));
	}

	// ── Drawing ───────────────────────────────────────────────────────────────

	private drawHealthBar(): void {
		const ratio = this.health / HEALTH_MAX;
		const barW  = VIRTUAL_W * ratio;
		const barX  = (VIRTUAL_W - barW) / 2;
		const color = lerpColor(COLOR_HEALTH_LOW, COLOR_HEALTH_HIGH, ratio);
		this.healthBarGfx.clear().rect(barX, 0, barW, 40).fill(color);
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
