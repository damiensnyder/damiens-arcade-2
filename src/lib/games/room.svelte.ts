import { WSClient, getWsUrl } from '$lib/ws/client.js';
import type { ServerMessage } from '$lib/ws/protocol.js';

/**
 * Per-tab ID sent when joining, so a refresh or reconnect keeps the same seat.
 * sessionStorage (not localStorage) so two tabs can play as two different people.
 */
function getClientId(): string | undefined {
	try {
		let id = sessionStorage.getItem('arcadeClientId');
		if (!id) {
			// crypto.randomUUID only exists in secure contexts (not plain-http LAN testing)
			id =
				typeof crypto.randomUUID === 'function'
					? crypto.randomUUID()
					: Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('');
			sessionStorage.setItem('arcadeClientId', id);
		}
		return id;
	} catch {
		return undefined;
	}
}

type EventHandler = (event: Record<string, unknown>) => void;
type GamestateHandler = (state: unknown) => void;

export class RoomState {
	roomCode = $state('');
	host = $state<number | null>(null);
	pov = $state<number | null>(null);
	connected = $state(false);
	errorMessage = $state<string | null>(null);

	private ws: WSClient | null = null;
	private eventHandlers = new Set<EventHandler>();
	private gamestateHandlers = new Set<GamestateHandler>();

	connect(roomCode: string): void {
		this.roomCode = roomCode;
		this.ws = new WSClient(getWsUrl());

		this.ws.onOpen(() => {
			this.ws!.send({ type: 'joinRoom', roomCode, clientId: getClientId() });
		});

		this.ws.addHandler((msg: ServerMessage) => this.handleMessage(msg));
	}

	private handleMessage(msg: ServerMessage): void {
		if (msg.type === 'roomJoined') {
			this.pov = msg.viewerId;
			this.host = msg.host;
			this.connected = true;
		} else if (msg.type === 'gamestate') {
			for (const h of this.gamestateHandlers) h(msg.payload);
		} else if (msg.type === 'event') {
			if (msg.payload.type === 'changeHost') {
				this.host = msg.payload.host as number;
			}
			for (const h of this.eventHandlers) h(msg.payload);
		} else if (msg.type === 'error') {
			this.errorMessage = msg.message;
		}
	}

	sendAction(action: unknown): void {
		this.ws?.send({ type: 'action', payload: action });
	}

	onEvent(handler: EventHandler): () => void {
		this.eventHandlers.add(handler);
		return () => this.eventHandlers.delete(handler);
	}

	onGamestate(handler: GamestateHandler): () => void {
		this.gamestateHandlers.add(handler);
		return () => this.gamestateHandlers.delete(handler);
	}

	disconnect(): void {
		this.ws?.close();
		this.ws = null;
		this.connected = false;
	}
}
