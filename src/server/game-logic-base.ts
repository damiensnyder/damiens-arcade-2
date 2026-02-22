export abstract class GameLogicHandler {
	emitEvent: (event: object) => void = () => {};

	abstract handleAction(viewerId: number, action: unknown, isHost: boolean): void;
	abstract handleDisconnect(viewerId: number): void;
	abstract viewpointOf(viewerId: number): unknown;

	/**
	 * Given remaining viewer IDs (insertion order = longest-present first),
	 * return the preferred new host, or null to fall back to candidates[0].
	 */
	getPreferredNewHost(candidates: number[]): number | null {
		return null;
	}
}
