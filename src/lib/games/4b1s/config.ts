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

// ── Colors ────────────────────────────────────────────────────────────────────
export const COLOR_BACKGROUND  = 0x334455;
export const COLOR_PLATFORM    = 0x000000;
export const COLOR_PLAYER      = 0x000000;
export const COLOR_SCONE       = 0x000000;
export const COLOR_TRAJECTORY  = 0xaaaaaa;
export const COLOR_TARGET      = 0x00cc00;
export const COLOR_LABEL       = 0x001100;
