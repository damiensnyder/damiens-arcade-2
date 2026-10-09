import type WebSocket from 'ws';
import type { GameLogicHandler } from './game-logic-base.js';

// How long a viewer whose sockets all closed keeps their seat, so a refresh or
// brief network drop doesn't count as leaving.
const RECONNECT_GRACE_MS = 15 * 1000;

type Room = {
	code: string;
	gameType: string;
	logic: GameLogicHandler;
	/** Live sockets per viewer. A viewer can have several (e.g. a reconnect racing the old socket). */
	viewers: Map<number, Set<WebSocket>>;
	/** Client-chosen ID → viewer ID, so reconnecting clients keep their identity. */
	clientIds: Map<string, number>;
	pendingLeaves: Map<number, ReturnType<typeof setTimeout>>;
	host: number | null;
	cleanupTimeout: ReturnType<typeof setTimeout> | null;
	closed: boolean;
};

const rooms = new Map<string, Room>();
let viewerIdCounter = 0;

function generateRoomCode(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	let code: string;
	do {
		code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
	} while (rooms.has(code));
	return code;
}

function send(ws: WebSocket, message: object): void {
	if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(room: Room, message: object): void {
	const data = JSON.stringify(message);
	for (const sockets of room.viewers.values()) {
		for (const ws of sockets) {
			if (ws.readyState === ws.OPEN) ws.send(data);
		}
	}
}

function sendTo(room: Room, viewerId: number, message: object): void {
	for (const ws of room.viewers.get(viewerId) ?? []) send(ws, message);
}

function sendGamestate(room: Room, viewerId?: number): void {
	const ids = viewerId === undefined ? [...room.viewers.keys()] : [viewerId];
	for (const id of ids) {
		sendTo(room, id, { type: 'gamestate', payload: room.logic.viewpointOf(id) });
	}
}

/** Runs game logic, closing the room (instead of crashing the server) if it throws. */
function guarded(room: Room, fn: () => void): void {
	if (room.closed) return;
	try {
		fn();
	} catch (e) {
		console.error(`Error in room ${room.code} (${room.gameType}):`, e);
		closeRoom(room, 'Something went wrong and this room had to be closed.');
	}
}

function closeRoom(room: Room, reason?: string): void {
	if (room.closed) return;
	room.closed = true;
	if (reason) broadcast(room, { type: 'error', message: reason });
	for (const timer of room.pendingLeaves.values()) clearTimeout(timer);
	if (room.cleanupTimeout !== null) clearTimeout(room.cleanupTimeout);
	try {
		room.logic.dispose();
	} catch (e) {
		console.error(`Error disposing room ${room.code}:`, e);
	}
	rooms.delete(room.code);
}

export function createRoom(gameType: string, logic: GameLogicHandler): string {
	const code = generateRoomCode();
	const room: Room = {
		code,
		gameType,
		logic,
		viewers: new Map(),
		clientIds: new Map(),
		pendingLeaves: new Map(),
		host: null,
		cleanupTimeout: null,
		closed: false
	};
	logic.emitEvent = (event) => broadcast(room, { type: 'event', payload: event });
	logic.emitEventTo = (viewerId, event) => sendTo(room, viewerId, { type: 'event', payload: event });
	logic.sendGamestate = (viewerId) => sendGamestate(room, viewerId);
	logic.guard = (fn) => guarded(room, fn);
	rooms.set(code, room);
	// a room nobody ever joins shouldn't live forever
	scheduleCleanupIfEmpty(room);
	return code;
}

export function getRoom(code: string): Room | undefined {
	return rooms.get(code);
}

function scheduleCleanupIfEmpty(room: Room): void {
	if (room.viewers.size > 0 || room.cleanupTimeout !== null) return;
	room.cleanupTimeout = setTimeout(() => closeRoom(room), room.logic.emptyRoomTtlMs);
}

/**
 * Adds a socket to the room and returns the viewer ID it should act as.
 * A known clientId gets its previous viewer ID back.
 */
export function joinRoom(code: string, clientId: string | null, ws: WebSocket): number | null {
	const room = rooms.get(code);
	if (!room) return null;
	if (room.cleanupTimeout !== null) {
		clearTimeout(room.cleanupTimeout);
		room.cleanupTimeout = null;
	}

	let viewerId = clientId !== null ? room.clientIds.get(clientId) : undefined;
	if (viewerId === undefined) {
		viewerId = ++viewerIdCounter;
		if (clientId !== null) room.clientIds.set(clientId, viewerId);
	}

	const pending = room.pendingLeaves.get(viewerId);
	if (pending !== undefined) {
		clearTimeout(pending);
		room.pendingLeaves.delete(viewerId);
	}

	const sockets = room.viewers.get(viewerId) ?? new Set();
	sockets.add(ws);
	room.viewers.set(viewerId, sockets);
	if (room.host === null) room.host = viewerId;
	return viewerId;
}

/** Removes one socket. The viewer only leaves once they've had no sockets for the grace period. */
export function leaveRoom(code: string, viewerId: number, ws: WebSocket): void {
	const room = rooms.get(code);
	if (!room) return;
	const sockets = room.viewers.get(viewerId);
	if (!sockets) return;
	sockets.delete(ws);
	if (sockets.size > 0 || room.pendingLeaves.has(viewerId)) return;

	room.pendingLeaves.set(
		viewerId,
		setTimeout(() => {
			room.pendingLeaves.delete(viewerId);
			finalizeLeave(room, viewerId);
		}, RECONNECT_GRACE_MS)
	);
}

function finalizeLeave(room: Room, viewerId: number): void {
	if (room.closed) return;
	room.viewers.delete(viewerId);
	guarded(room, () => room.logic.handleDisconnect(viewerId));
	if (room.closed) return;

	if (room.viewers.size === 0) {
		room.host = null;
		scheduleCleanupIfEmpty(room);
		return;
	}

	if (room.host === viewerId) {
		const candidates = [...room.viewers.keys()];
		let newHost = candidates[0];
		guarded(room, () => {
			newHost = room.logic.getPreferredNewHost(candidates) ?? candidates[0];
		});
		room.host = newHost;
		broadcast(room, { type: 'event', payload: { type: 'changeHost', host: room.host } });
	}
}

export function handleAction(code: string, viewerId: number, action: unknown): void {
	const room = rooms.get(code);
	if (!room || !room.viewers.has(viewerId)) return;
	const isHost = room.host === viewerId;
	guarded(room, () => room.logic.handleAction(viewerId, action, isHost));
}

/** Sends the joining viewer their room info and current viewpoint. */
export function sendWelcome(code: string, viewerId: number, ws: WebSocket): void {
	const room = rooms.get(code);
	if (!room) return;
	send(ws, { type: 'roomJoined', viewerId, host: room.host });
	guarded(room, () => send(ws, { type: 'gamestate', payload: room.logic.viewpointOf(viewerId) }));
}
