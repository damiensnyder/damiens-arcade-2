// ── Coordinate system ─────────────────────────────────────────────────────────
export const VIRTUAL_W = 1920;
export const VIRTUAL_H = 1080;

// ── Platform ──────────────────────────────────────────────────────────────────
export const PLATFORM_W = 960;
export const PLATFORM_H = 40;
export const PLATFORM_Y = 1040; // top edge Y of platform (platform is centered horizontally)

// ── Player (equilateral triangle) ─────────────────────────────────────────────
export const PLAYER_SIDE = 60;

// ── Physics (virtual pixels per frame, assuming 60 fps) ───────────────────────
export const GRAVITY           = 0.6;   // px/frame² downward acceleration
export const JUMP_VELOCITY     = -16;   // px/frame upward on W press
export const MOVE_ACCEL        = 0.7;   // px/frame² lateral acceleration (A/D)
export const MAX_LATERAL_SPEED = 12;    // px/frame lateral speed cap
export const FRICTION          = 0.97;  // velocity multiplier per frame while on platform
export const FRICTION_S        = 0.94;  // stronger friction when S held on platform
export const FALL_ACCEL        = 0.4;   // extra downward accel when S held (airborne)
export const FALL_DECEL        = 0.35;  // gravity reduction when W held (airborne)
