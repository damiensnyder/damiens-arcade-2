export abstract class GameLogicHandler {
	/** Sends an event to every viewer in the room. Set by the room. */
	emitEvent: (event: object) => void = () => {};
	/** Sends an event to a single viewer. Set by the room. */
	emitEventTo: (viewerId: number, event: object) => void = () => {};
	/** Re-sends viewpointOf() to one viewer, or to everyone if no ID is given. Set by the room. */
	sendGamestate: (viewerId?: number) => void = () => {};
	/**
	 * Runs a callback, closing the room instead of crashing the server if it throws.
	 * Set by the room; use setTimer() for anything scheduled.
	 */
	guard: (fn: () => void) => void = (fn) => fn();

	/** How long an empty room stays alive before it is deleted. */
	emptyRoomTtlMs = 5 * 60 * 1000;

	private timers = new Set<ReturnType<typeof setTimeout>>();

	abstract handleAction(viewerId: number, action: unknown, isHost: boolean): void;
	abstract handleDisconnect(viewerId: number): void;
	abstract viewpointOf(viewerId: number): unknown;

	/**
	 * Given remaining viewer IDs (insertion order = longest-present first),
	 * return the preferred new host, or null to fall back to candidates[0].
	 */
	getPreferredNewHost(_candidates: number[]): number | null {
		return null;
	}

	/** setTimeout that is error-guarded and cancelled when the room is disposed. */
	protected setTimer(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
		const timer = setTimeout(() => {
			this.timers.delete(timer);
			this.guard(fn);
		}, ms);
		this.timers.add(timer);
		return timer;
	}

	protected clearTimer(timer: ReturnType<typeof setTimeout> | null | undefined): void {
		if (timer == null) return;
		clearTimeout(timer);
		this.timers.delete(timer);
	}

	/** Called once when the room is deleted. Subclasses that override should call super. */
	dispose(): void {
		for (const timer of this.timers) clearTimeout(timer);
		this.timers.clear();
	}
}
