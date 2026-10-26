export const TICK_LENGTH = 0.2; // seconds
export const MAX_FIGHT_SECONDS = 120;
/** From this many seconds into a fight, everyone loses toughness every OVERTIME_INTERVAL seconds, so fights can't stall. */
export const OVERTIME_START = 30;
export const OVERTIME_INTERVAL = 5;
/** Toughness lost each time (stat points; 1 is half a star). */
export const OVERTIME_TOUGHNESS_LOSS = 1;
export const ARENA_SIZE = 100; // meters
export const CROWDING_DISTANCE = 3; // closer than this, fighters push apart
export const MELEE_RANGE = 4;
/** In a two-team fight, each side starts this far in from its edge of the arena. */
export const START_INSET = 22;
/** How long fights usually last, for estimating how much of one a fighter spends doing what. */
export const TYPICAL_FIGHT_SECONDS = 20;
/** About how much damage one hit does, before toughness, for estimating how many hits a fighter takes. */
export const TYPICAL_HIT = 25;
export const INITIAL_COOLDOWN = 3;
/** No attack or action's cooldown goes below this, however much it's shortened (charging up isn't a cooldown). */
export const MIN_COOLDOWN = 1;
export const KNOCKBACK_ROTATION = Math.PI / 12;
export const EPSILON = 0.00001;

export enum Pose {
	Stationary1 = 0,
	Stationary2 = 0.0001,
	WalkingStart1 = -8,
	Walking1 = -8.0001,
	WalkingStart2 = 8,
	Walking2 = 8.0001,
	BackswingStart = -11.0001,
	Backswing = -11,
	ForwardSwing = 30,
	AimStart = -5,
	Aim = -7
}
