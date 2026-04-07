import { Container, Graphics } from 'pixi.js';
import type { Application } from 'pixi.js';
import {
	VIRTUAL_W,
	VIRTUAL_H,
	PLATFORM_W,
	PLATFORM_H,
	PLATFORM_Y,
	PLAYER_SIDE,
	GRAVITY,
	JUMP_VELOCITY,
	MOVE_ACCEL,
	MAX_LATERAL_SPEED,
	FRICTION,
	FRICTION_S,
	FALL_ACCEL,
	FALL_DECEL,
} from '../config.js';

// Height and centroid offsets of the equilateral triangle
const TRI_H = (PLAYER_SIDE * Math.sqrt(3)) / 2;
const TRI_BOTTOM_OFFSET = TRI_H / 3; // centroid to bottom vertex
const TRI_TOP_OFFSET    = (TRI_H * 2) / 3; // centroid to top vertex

const PLATFORM_LEFT  = VIRTUAL_W / 2 - PLATFORM_W / 2;
const PLATFORM_RIGHT = VIRTUAL_W / 2 + PLATFORM_W / 2;

export class Tutorial1 extends Container {
	private app: Application;
	private player: Graphics;

	// Player state (all in virtual px / virtual px per frame)
	private px = 0;
	private py = 0;
	private vx = 0;
	private vy = 0;
	private onGround = false;

	private keys = new Set<string>();
	private tickerFn: () => void;
	private keydownFn: (e: KeyboardEvent) => void;
	private keyupFn:   (e: KeyboardEvent) => void;

	constructor(app: Application) {
		super();
		this.app = app;

		// ── Platform ─────────────────────────────────────────────────────────
		const platform = new Graphics();
		platform
			.rect(PLATFORM_LEFT, PLATFORM_Y, PLATFORM_W, PLATFORM_H)
			.fill(0x000000);
		this.addChild(platform);

		// ── Player triangle ───────────────────────────────────────────────────
		// Equilateral triangle, origin at centroid, tip pointing up.
		// Vertices: top tip, bottom-left, bottom-right.
		this.player = new Graphics();
		this.player
			.poly([
				0,                  -TRI_TOP_OFFSET,
				-PLAYER_SIDE / 2,    TRI_BOTTOM_OFFSET,
				 PLAYER_SIDE / 2,    TRI_BOTTOM_OFFSET,
			])
			.fill(0x000000);
		this.addChild(this.player);

		// ── Input ─────────────────────────────────────────────────────────────
		this.keydownFn = (e) => this.keys.add(e.code);
		this.keyupFn   = (e) => this.keys.delete(e.code);
		window.addEventListener('keydown', this.keydownFn);
		window.addEventListener('keyup',   this.keyupFn);

		// ── Start ─────────────────────────────────────────────────────────────
		this.spawn();
		this.tickerFn = () => this.tick();
		app.ticker.add(this.tickerFn);
	}

	private spawn(): void {
		this.px = VIRTUAL_W / 2;
		this.py = PLATFORM_Y - TRI_BOTTOM_OFFSET;
		this.vx = 0;
		this.vy = 0;
		this.onGround = true;
	}

	private tick(): void {
		const w = this.keys.has('KeyW');
		const a = this.keys.has('KeyA');
		const s = this.keys.has('KeyS');
		const d = this.keys.has('KeyD');

		// ── Gravity (only when airborne) ──────────────────────────────────────
		if (!this.onGround) {
			let g = GRAVITY;
			if (s) g += FALL_ACCEL;
			if (w) g -= FALL_DECEL;
			this.vy += g;
		}

		// ── Lateral movement ──────────────────────────────────────────────────
		if (a) this.vx -= MOVE_ACCEL;
		if (d) this.vx += MOVE_ACCEL;
		this.vx = Math.max(-MAX_LATERAL_SPEED, Math.min(MAX_LATERAL_SPEED, this.vx));

		// ── Integrate ─────────────────────────────────────────────────────────
		this.px += this.vx;
		this.py += this.vy;

		// ── Platform collision ────────────────────────────────────────────────
		const playerBottom = this.py + TRI_BOTTOM_OFFSET;
		const overPlatformX = this.px >= PLATFORM_LEFT && this.px <= PLATFORM_RIGHT;

		if (this.vy >= 0 && overPlatformX && playerBottom >= PLATFORM_Y) {
			// Land on platform
			this.py = PLATFORM_Y - TRI_BOTTOM_OFFSET;
			this.vy = 0;
			this.onGround = true;
			this.vx *= s ? FRICTION_S : FRICTION;

			// Jump
			if (w) {
				this.vy = JUMP_VELOCITY;
				this.onGround = false;
			}
		} else {
			this.onGround = false;
		}

		// ── Respawn if fully off-screen below ─────────────────────────────────
		if (this.py > VIRTUAL_H + 200) {
			this.spawn();
		}

		// ── Sync sprite ───────────────────────────────────────────────────────
		this.player.position.set(this.px, this.py);
	}

	cleanup(): void {
		this.app.ticker.remove(this.tickerFn);
		window.removeEventListener('keydown', this.keydownFn);
		window.removeEventListener('keyup',   this.keyupFn);
	}
}
