export const TICK_LENGTH = 0.2; // seconds
export const MAX_FIGHT_SECONDS = 300;
export const ARENA_SIZE = 100; // meters
export const CROWDING_DISTANCE = 3; // closer than this, fighters push apart
export const MELEE_RANGE = 4;
export const INITIAL_COOLDOWN = 3;
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
