// ── Coordinate system ─────────────────────────────────────────────────────────
export const VIRTUAL_W = 1920;
export const VIRTUAL_H = 1080;

// ── Platform ──────────────────────────────────────────────────────────────────
export const PLATFORM_W = 800;
export const PLATFORM_H = 30;
export const PLATFORM_Y = VIRTUAL_H - PLATFORM_H; // top edge Y (flush with bottom)

// ── Player ────────────────────────────────────────────────────────────────────
// Isosceles triangle with 60×60 bounding box (matching 2b1s.py)
export const PLAYER_SIZE = 60;

// ── Physics (virtual pixels per frame at 60 fps) ──────────────────────────────
export const GRAVITY_FREE  = 2.25;  // px/frame² when W is not held (GRAVITY * 3 from 2b1s)
export const GRAVITY_HELD  = 0.75;  // px/frame² when W is held
export const JUMP_VELOCITY = -22.5; // px/frame upward on W press
export const MOVE_SPEED    = 15;    // px/frame lateral speed (set directly, no acceleration)

// ── Scones (projectiles) ──────────────────────────────────────────────────────
export const SCONE_RADIUS    = 8;    // px
export const SCONE_GRAVITY   = 0.75; // px/frame² (same as base gravity in 2b1s)
export const MAX_THROW_SPEED = 28;   // px/frame cap — limits max height to ~half screen above player

// ── Targets (birds) ───────────────────────────────────────────────────────────
export const TARGET_RADIUS         = 50;  // px
export const TARGET_SHRINK_RATE    = 5;   // px radius per second (phase 3)
export const TARGET_SPAWN_INTERVAL = 60;  // frames between phase 3 spawns

// ── Health bar ────────────────────────────────────────────────────────────────
export const HEALTH_MAX              = 100;
export const HEALTH_DRAIN_RATE       = 5;    // per second during normal play
export const HEALTH_DRAIN_RATE_SLOMO = 15;   // per second while slo-mo is held
export const HEALTH_FROM_BIRD        = 20;   // restored per bird fed
export const HEALTH_BAR_HEIGHT       = 40;   // px (virtual)
export const SLOMO_FACTOR            = 0.45;  // time scale while right-click held

// ── Bees (enemies) ───────────────────────────────────────────────────────────
export const BEE_SIZE           = 30;   // px square
export const BEE_SPEED          = 8;    // px/frame base horizontal speed
export const BEE_SPAWN_INTERVAL = 120;  // frames between bee spawns (phase 5)
export const BEE_Y_MIN          = 300;  // virtual Y spawn range
export const BEE_Y_MAX          = 1000;

// ── Colors ────────────────────────────────────────────────────────────────────
export const COLOR_BACKGROUND  = 0x334455;
export const COLOR_PLATFORM    = 0x000000;
export const COLOR_PLAYER      = 0x000000;
export const COLOR_SCONE       = 0x000000;
export const COLOR_TRAJECTORY    = 0xaaaaaa;
export const COLOR_TARGET        = 0x00cc00;
export const COLOR_LABEL         = 0x001100;
export const COLOR_HEALTH_HIGH   = 0x00ffff; // cyan when full
export const COLOR_HEALTH_LOW    = 0xff0000; // red when empty
export const COLOR_BEE           = 0xff0000;
